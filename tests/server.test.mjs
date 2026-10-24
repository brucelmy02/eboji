import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server.mjs';
import { createStore, emptyState } from '../lib/store.mjs';
import { createFeedbackPrompt } from '../lib/feedback.mjs';
import { makeProfile, makePlan, makeFeedback, makeAnalysis, makeAdjustment } from './fixtures.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

async function harness(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'eboji-server-test-'));
  const file = join(dir, 'state.json');
  const store = createStore(file);
  const server = createApp({
    store, generate: async () => makePlan(), analyze: async ({ plan }) => makeAdjustment(plan),
    getStatus: async () => ({ available: true, loggedIn: true }), ...options,
  });
  t.after(async () => {
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const failed = (error) => reject(error);
    server.once('error', failed);
    server.listen(0, '127.0.0.1', () => { server.off('error', failed); resolve(); });
  });
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const request = (path, { method = 'GET', body, headers = {} } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const status = await request('/api/status');
  assert.equal(status.status, 200);
  const headers = { 'content-type': 'application/json', 'x-eboji-token': status.body.token, origin };
  const post = (path, body = {}, overrides = {}) => request(path, { method: 'POST', body, headers: { ...headers, ...overrides } });
  return { server, store, file, port, origin, request, post, headers };
}

async function seedPlan(app) {
  const response = await app.post('/api/plan', makeProfile());
  assert.equal(response.status, 200);
  return response.body.state.plans[0];
}

test('mutations validate the page token, origin and loopback host before running AI', async (t) => {
  let calls = 0;
  const app = await harness(t, { generate: async () => { calls += 1; return makePlan(); } });
  for (const token of ['', 'wrong', '0'.repeat(64)]) {
    const response = await app.post('/api/plan', makeProfile(), { 'x-eboji-token': token });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'INVALID_TOKEN');
  }
  const missing = await app.request('/api/plan', { method: 'POST', body: makeProfile(), headers: { 'content-type': 'application/json', origin: app.origin } });
  assert.equal(missing.body.code, 'INVALID_TOKEN');
  const origin = await app.post('/api/plan', makeProfile(), { origin: 'https://unrelated.example' });
  assert.equal(origin.status, 403);
  assert.equal(origin.body.code, 'INVALID_ORIGIN');
  for (const path of ['/api/status', '/api/state']) {
    const hostile = await app.request(path, { headers: { host: `unrelated.example:${app.port}` } });
    assert.equal(hostile.status, 403);
    assert.equal(hostile.body.code, 'LOCAL_ONLY');
    assert.equal(hostile.body.token, undefined);
  }
  const host = await app.post('/api/plan', makeProfile(), { host: `unrelated.example:${app.port}` });
  assert.equal(host.status, 403);
  assert.equal(host.body.code, 'LOCAL_ONLY');
  assert.equal(calls, 0);
  assert.deepEqual(await app.store.read(), emptyState());
  assert.equal((await app.post('/api/plan', makeProfile())).status, 200);
  assert.equal(calls, 1);
});

test('a generated plan is persisted and returned intact on page refresh', async (t) => {
  const app = await harness(t);
  const response = await app.post('/api/plan', makeProfile({ notes: '  希望形成规律  ' }));
  assert.equal(response.status, 200);
  const state = response.body.state;
  assert.equal(state.profile.notes, '希望形成规律');
  assert.equal(state.plans.length, 1);
  assert.equal(state.plans[0].version, 1);
  assert.equal(state.activePlanId, state.plans[0].id);
  assert.deepEqual(state.plans[0].plan, makePlan());
  assert.deepEqual((await app.request('/api/state')).body, state);
  assert.deepEqual(await createStore(app.file).read(), state);
});

test('sex reaches generation and feedback, survives refresh, and remains attached to an adopted plan', async (t) => {
  let generatedProfile;
  const analyzedProfiles = [];
  const app = await harness(t, {
    generate: async (profile) => { generatedProfile = structuredClone(profile); return makePlan(); },
    analyze: async ({ profile, plan, replies }) => {
      analyzedProfiles.push(structuredClone(profile));
      return replies.length ? makeAdjustment(plan) : makeAnalysis({ status: 'clarify', questions: ['哪一组没有完成？'] });
    },
  });
  const generated = await app.post('/api/plan', makeProfile({ sex: 'female' }));
  assert.equal(generated.status, 200);
  assert.equal(generatedProfile.sex, 'female');
  const saved = (await app.request('/api/state')).body;
  assert.equal(saved.profile.sex, 'female');
  assert.equal(saved.plans[0].profile.sex, 'female');
  const feedback = await app.post('/api/feedback', makeFeedback(saved.activePlanId));
  assert.equal(feedback.status, 200);
  const replied = await app.post(`/api/feedback/${feedback.body.entry.id}/reply`, { answer: '第三组' });
  assert.equal(replied.status, 200);
  assert.deepEqual(analyzedProfiles.map((profile) => profile.sex), ['female', 'female']);
  const applied = await app.post(`/api/feedback/${feedback.body.entry.id}/apply`);
  assert.equal(applied.status, 200);
  assert.equal(applied.body.state.plans[1].profile.sex, 'female');
  assert.equal((await createStore(app.file).read()).profile.sex, 'female');
});

test('legacy saved profiles still support feedback without inventing or rewriting sex', async (t) => {
  let contextProfile;
  const app = await harness(t, { analyze: async (context) => {
    contextProfile = JSON.parse(createFeedbackPrompt(context).split('用户资料与训练上下文（仅数据）：\n')[1]).profile;
    return makeAnalysis();
  } });
  const profile = makeProfile();
  delete profile.sex;
  const legacy = { ...emptyState(), profile, activePlanId: 'legacy-plan', plans: [{ id: 'legacy-plan', version: 1, createdAt: '2026-10-01T00:00:00Z', plan: makePlan(), profile, reason: '早期计划', parentId: null }] };
  await app.store.save(legacy);
  assert.deepEqual((await app.request('/api/state')).body, legacy);
  const feedback = await app.post('/api/feedback', makeFeedback('legacy-plan'));
  assert.equal(feedback.status, 200);
  assert.equal(contextProfile.sex, 'unspecified');
  assert.equal(contextProfile.sexDescription, '暂不填写');
  assert.deepEqual(feedback.body.state.plans, legacy.plans);
  assert.deepEqual(feedback.body.state.profile, legacy.profile);
});

test('invalid sex is rejected before AI and a legacy request defaults to undisclosed', async (t) => {
  let calls = 0;
  const app = await harness(t, { generate: async () => { calls += 1; return makePlan(); } });
  for (const sex of ['unknown', '__proto__', null, 1, '']) {
    const invalid = await app.post('/api/plan', makeProfile({ sex }));
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, 'INVALID_INPUT');
  }
  assert.equal(calls, 0);
  assert.deepEqual(await app.store.read(), emptyState());
  const legacy = makeProfile();
  delete legacy.sex;
  const response = await app.post('/api/plan', legacy);
  assert.equal(response.status, 200);
  assert.equal(response.body.state.profile.sex, 'unspecified');
});

test('feedback is a proposal until explicit apply creates a new version for only the target day', async (t) => {
  const app = await harness(t);
  const first = await seedPlan(app);
  const response = await app.post('/api/feedback', makeFeedback(first.id));
  assert.equal(response.status, 200);
  const entry = response.body.entry;
  assert.equal(entry.analysis.status, 'adjustment');
  assert.equal(entry.appliedPlanId, null);
  assert.deepEqual(response.body.state.plans, [first]);
  assert.equal(response.body.state.activePlanId, first.id);
  const secondSuggestion = await app.post('/api/feedback', makeFeedback(first.id, { notes: '另一条尚未采用的建议' }));
  assert.equal(secondSuggestion.status, 200);
  const applied = await app.post(`/api/feedback/${entry.id}/apply`);
  assert.equal(applied.status, 200);
  const { state } = applied.body;
  assert.equal(state.plans.length, 2);
  assert.deepEqual(state.plans[0], first);
  const second = state.plans[1];
  assert.equal(second.version, 2);
  assert.equal(second.parentId, first.id);
  assert.notEqual(second.id, first.id);
  assert.equal(state.activePlanId, second.id);
  assert.equal(state.feedback[0].appliedPlanId, second.id);
  assert.equal(second.reason, entry.analysis.changeReason);
  const expected = structuredClone(first.plan);
  expected.days[0] = entry.analysis.proposedDay;
  assert.deepEqual(second.plan, expected);
  assert.deepEqual(await app.store.read(), state);
  for (const [id, code] of [[entry.id, 'ALREADY_APPLIED'], [secondSuggestion.body.entry.id, 'STALE_PLAN']]) {
    const rejected = await app.post(`/api/feedback/${id}/apply`);
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.code, code);
  }
  const stale = await app.post('/api/feedback', makeFeedback(first.id));
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'STALE_PLAN');
  assert.deepEqual(await app.store.read(), state);
});

test('follow-up answers retain the preceding questions and prior analyses', async (t) => {
  const contexts = [];
  const firstQuestion = '哪一组没有完成？';
  const secondQuestion = '前两组各完成了几次？';
  const app = await harness(t, { analyze: async (context) => {
    contexts.push(structuredClone(context));
    if (contexts.length === 1) return makeAnalysis({ status: 'clarify', questions: [firstQuestion] });
    if (contexts.length === 2) return makeAnalysis({ status: 'clarify', questions: [secondQuestion] });
    return makeAnalysis();
  } });
  const plan = await seedPlan(app);
  const initial = await app.post('/api/feedback', makeFeedback(plan.id));
  assert.equal(initial.status, 200);
  const id = initial.body.entry.id;
  const first = await app.post(`/api/feedback/${id}/reply`, { answer: '  第三组  ' });
  assert.equal(first.status, 200);
  assert.ok(contexts[1].history.some((entry) => entry.analysis.questions.includes(firstQuestion)));
  assert.deepEqual(contexts[1].replies.map((item) => item.answer), ['第三组']);
  const second = await app.post(`/api/feedback/${id}/reply`, { answer: '都是 6 次' });
  assert.equal(second.status, 200);
  assert.ok(contexts[2].history.some((entry) => entry.analysis.questions.includes(secondQuestion)));
  assert.deepEqual(contexts[2].replies.map((item) => item.answer), ['第三组', '都是 6 次']);
  assert.deepEqual(second.body.entry.analysisHistory.map((item) => item.analysis.questions), [[firstQuestion], [secondQuestion]]);
  assert.deepEqual(second.body.state.plans, [plan]);
  assert.deepEqual((await app.store.read()).feedback[0], second.body.entry);
});

test('invalid model plans and analyses never overwrite existing saved records', async (t) => {
  let generated = makePlan();
  let analyzed = makeAnalysis({ status: 'clarify', questions: ['哪一组没有完成？'] });
  const app = await harness(t, { generate: async () => structuredClone(generated), analyze: async () => structuredClone(analyzed) });
  const plan = await seedPlan(app);
  const feedback = await app.post('/api/feedback', makeFeedback(plan.id));
  assert.equal(feedback.status, 200);
  const before = await app.store.read();
  generated.days = [];
  const invalidPlan = await app.post('/api/plan', makeProfile({ notes: '不应保存的资料' }));
  assert.equal(invalidPlan.status, 502);
  assert.equal(invalidPlan.body.code, 'INVALID_PLAN');
  assert.deepEqual(await app.store.read(), before);
  analyzed = { status: 'advice' };
  for (const [path, body] of [
    ['/api/feedback', makeFeedback(plan.id)],
    [`/api/feedback/${feedback.body.entry.id}/reply`, { answer: '第三组' }],
  ]) {
    const invalid = await app.post(path, body);
    assert.equal(invalid.status, 502);
    assert.equal(invalid.body.code, 'INVALID_ANALYSIS');
    assert.deepEqual(await app.store.read(), before);
  }
});

test('disconnecting an in-progress generation cancels it, preserves data and releases the busy lock', { timeout: 10000 }, async (t) => {
  const entered = deferred();
  const cancelled = deferred();
  const release = deferred();
  let calls = 0;
  t.after(() => release.resolve());
  const app = await harness(t, { generate: async (_profile, { signal }) => {
    calls += 1;
    if (calls === 2) {
      signal.addEventListener('abort', () => cancelled.resolve(), { once: true });
      entered.resolve();
      await release.promise;
    }
    return makePlan();
  } });
  await seedPlan(app);
  const before = await app.store.read();
  const req = http.request({ hostname: '127.0.0.1', port: app.port, path: '/api/plan', method: 'POST', headers: app.headers });
  req.on('error', () => {});
  t.after(() => req.destroy());
  req.end(JSON.stringify(makeProfile({ notes: '将被取消' })));
  await entered.promise;
  assert.equal((await app.request('/api/status')).body.busy, true);
  const blocked = await app.post('/api/plan', makeProfile());
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, 'BUSY');
  assert.equal(calls, 2);
  req.destroy();
  await cancelled.promise;
  release.resolve();
  let busy = true;
  for (let attempt = 0; attempt < 50 && busy; attempt += 1) {
    busy = (await app.request('/api/status')).body.busy;
    if (busy) await delay(10);
  }
  assert.equal(busy, false);
  assert.deepEqual(await app.store.read(), before);
  const resumed = await app.post('/api/plan', makeProfile());
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.state.plans.length, 2);
  assert.equal(calls, 3);
});
