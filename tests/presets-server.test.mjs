import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server.mjs';
import { createStore, emptyState } from '../lib/store.mjs';
import { preparePreset } from '../lib/presets.mjs';
import { validateProfile } from '../lib/plan.mjs';
import { createFeedbackPrompt } from '../lib/feedback.mjs';
import { presetPlans, findPresetPlan } from '../public/preset-plans.js';
import { makeProfile, makePlan, makeFeedback, makeAnalysis } from './fixtures.mjs';

const selection = (overrides = {}) => ({ presetId: 'gentle-bodyweight', experience: 'beginner', eligibilityConfirmed: true, ...overrides });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

async function harness(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'eboji-preset-test-'));
  const file = join(dir, 'state.json');
  const store = createStore(file);
  const calls = { status: 0, generate: 0, analyze: 0 };
  const server = createApp({
    store,
    getStatus: async () => { calls.status += 1; throw new Error('Codex is unavailable in preset tests'); },
    generate: async () => { calls.generate += 1; throw new Error('Must not generate a preset'); },
    analyze: async () => { calls.analyze += 1; throw new Error('Must not analyze a preset selection'); },
    ...options,
  });
  t.after(async () => {
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const request = (path, { method = 'GET', body, headers = {} } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, headers: res.headers, body: res.headers['content-type']?.includes('application/json') ? JSON.parse(text) : text }); }
        catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const session = await request('/api/session');
  assert.equal(session.status, 200);
  assert.match(session.body.token, /^[a-f0-9]{64}$/);
  assert.equal(session.body.busy, false);
  const headers = { 'content-type': 'application/json', 'x-eboji-token': session.body.token, origin };
  const post = (path, body = {}, overrides = {}) => request(path, { method: 'POST', body, headers: { ...headers, ...overrides } });
  return { store, file, port, request, post, calls };
}

test('every preset starts and persists without Codex status, generation or analysis', async (t) => {
  const app = await harness(t);
  for (const [index, preset] of presetPlans.entries()) {
    const result = await app.post('/api/preset', selection({ presetId: preset.id }));
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const state = result.body.state;
    const record = state.plans.at(-1);
    assert.equal(record.version, index + 1);
    assert.equal(record.source, 'preset');
    assert.equal(record.presetId, preset.id);
    assert.equal(record.parentId, index ? state.plans[index - 1].id : null);
    assert.equal(state.activePlanId, record.id);
    assert.deepEqual(record.plan, preset.plan);
    assert.deepEqual(await createStore(app.file).read(), state);
    assert.deepEqual((await app.request('/api/state')).body, state);
  }
  assert.deepEqual(app.calls, { status: 0, generate: 0, analyze: 0 });
});

test('preset profiles retain actual experience without invented measurements', async (t) => {
  const app = await harness(t);
  for (const experience of ['beginner', 'returning', 'regular']) {
    const result = await app.post('/api/preset', selection({ experience }));
    assert.equal(result.status, 200);
    const profile = result.body.state.profile;
    assert.equal(profile.experience, experience);
    assert.equal(profile.age, null);
    assert.equal(profile.height, null);
    assert.equal(profile.weight, null);
    assert.equal(profile.sex, 'unspecified');
    assert.equal(profile.health, 'none');
    assert.equal(profile.notes, '');
    assert.equal(profile.adultConfirmed, true);
    assert.throws(() => validateProfile(profile), { code: 'INVALID_INPUT' });
  }
});

test('selecting a preset keeps historical versions and known personal context intact', async (t) => {
  const app = await harness(t);
  const profile = makeProfile({ sex: 'female', experience: 'regular', notes: '偏好早上训练；避免跳跃' });
  const old = { id: 'saved-plan', version: 1, profile, plan: makePlan(), reason: '原计划', parentId: null };
  const before = { ...emptyState(), profile, plans: [old], activePlanId: old.id };
  await app.store.save(before);
  const result = await app.post('/api/preset', selection({ presetId: 'dumbbell-foundation', experience: 'returning' }));
  assert.equal(result.status, 200);
  const state = result.body.state;
  assert.deepEqual(state.plans[0], old);
  assert.equal(state.plans[1].parentId, old.id);
  for (const key of ['age', 'height', 'weight', 'sex', 'notes']) assert.equal(state.profile[key], profile[key]);
  assert.equal(state.profile.experience, 'returning');
  assert.equal(state.profile.equipment, 'dumbbells');
  assert.equal(state.plans[1].profile.notes, profile.notes);
});

test('prepared plans are isolated clones and invalid saved measurements stay unknown', () => {
  const template = findPresetPlan('gentle-bodyweight');
  const original = structuredClone(template);
  const first = preparePreset(selection(), { age: 17, height: '170', weight: NaN, sex: 'unknown' });
  first.plan.days[0].exercises[0].reps = 'client mutation';
  const second = preparePreset(selection());
  assert.deepEqual(template, original);
  assert.deepEqual(second.plan, original.plan);
  assert.notEqual(first.plan, second.plan);
  for (const key of ['age', 'height', 'weight']) assert.equal(first.profile[key], null);
  assert.equal(first.profile.sex, 'unspecified');
});

test('invalid selectors, missing confirmation and client plan overrides never change saved state', async (t) => {
  const app = await harness(t);
  const seeded = await app.post('/api/preset', selection());
  const before = seeded.body.state;
  const missing = selection();
  delete missing.eligibilityConfirmed;
  for (const body of [
    missing, selection({ presetId: 'unknown' }), selection({ presetId: 'gentle-bodyweight ' }),
    selection({ presetId: '__proto__' }), selection({ presetId: 1 }), selection({ experience: '__proto__' }),
    selection({ experience: null }), selection({ eligibilityConfirmed: false }), selection({ eligibilityConfirmed: 'true' }),
    selection({ plan: makePlan() }), selection({ profile: makeProfile() }),
  ]) {
    const result = await app.post('/api/preset', body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.deepEqual(await app.store.read(), before);
  }
  assert.deepEqual(app.calls, { status: 0, generate: 0, analyze: 0 });
});

test('existing review restrictions cannot be bypassed by confirming a preset', async (t) => {
  const app = await harness(t);
  for (const location of ['profile', 'active', 'plan-status']) {
    const review = makeProfile({ health: 'needs_review', notes: '已知运动限制' });
    const activeProfile = location === 'active' ? review : makeProfile();
    const plan = location === 'plan-status' ? { ...makePlan(), status: 'needs_review', days: [] } : makePlan();
    const record = { id: 'review-plan', version: 1, profile: activeProfile, plan };
    const before = { ...emptyState(), profile: location === 'profile' ? review : makeProfile(), plans: [record], activePlanId: record.id };
    await app.store.save(before);
    const result = await app.post('/api/preset', selection());
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'PRESET_NEEDS_REVIEW');
    assert.deepEqual(await app.store.read(), before);
  }
  assert.deepEqual(app.calls, { status: 0, generate: 0, analyze: 0 });
});

test('preset mutations and session discovery enforce local host, page token and origin', async (t) => {
  const app = await harness(t);
  for (const token of ['', 'bad', '0'.repeat(64)]) {
    const result = await app.post('/api/preset', selection(), { 'x-eboji-token': token });
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'INVALID_TOKEN');
  }
  const foreign = await app.post('/api/preset', selection(), { origin: 'https://unrelated.example' });
  assert.equal(foreign.body.code, 'INVALID_ORIGIN');
  const hostile = await app.request('/api/session', { headers: { host: `unrelated.example:${app.port}` } });
  assert.equal(hostile.status, 403);
  assert.equal(hostile.body.code, 'LOCAL_ONLY');
  assert.equal(hostile.body.token, undefined);
  const wrongType = await app.post('/api/preset', selection(), { 'content-type': 'text/plain' });
  assert.equal(wrongType.status, 415);
  assert.deepEqual(await app.store.read(), emptyState());
  assert.deepEqual(app.calls, { status: 0, generate: 0, analyze: 0 });
});

test('the shared mutation lock prevents overlapping preset saves', async (t) => {
  const entered = deferred();
  const release = deferred();
  let memory = emptyState();
  let readCount = 0;
  const store = {
    async read() {
      readCount += 1;
      if (readCount === 1) { entered.resolve(); await release.promise; }
      return structuredClone(memory);
    },
    async save(state) { memory = structuredClone(state); },
  };
  t.after(() => release.resolve());
  const app = await harness(t, { store });
  const first = app.post('/api/preset', selection());
  await entered.promise;
  assert.equal((await app.request('/api/session')).body.busy, true);
  const overlap = await app.post('/api/preset', selection({ presetId: 'dumbbell-foundation' }));
  assert.equal(overlap.status, 429);
  assert.equal(overlap.body.code, 'BUSY');
  release.resolve();
  assert.equal((await first).status, 200);
  assert.equal((await app.request('/api/session')).body.busy, false);
  assert.equal(memory.plans.length, 1);
  assert.deepEqual(app.calls, { status: 0, generate: 0, analyze: 0 });
});

test('preset profiles can receive and apply AI feedback without fabricating missing information', async (t) => {
  const contexts = [];
  const app = await harness(t, { analyze: async (context) => {
    const prompt = createFeedbackPrompt(context);
    assert.match(prompt, /为 null.*表示未知，不得补造数值/);
    contexts.push(JSON.parse(prompt.split('用户资料与训练上下文（仅数据）：\n')[1]));
    const proposedDay = structuredClone(context.plan.days[0]);
    proposedDay.exercises[0].reps = '4 次';
    return makeAnalysis({ status: 'adjustment', proposedDay, changeReason: '按实际反馈减少首个动作的次数。' });
  } });
  const selected = await app.post('/api/preset', selection({ experience: 'returning' }));
  const first = selected.body.state.plans[0];
  const feedback = await app.post('/api/feedback', makeFeedback(first.id));
  assert.equal(feedback.status, 200, JSON.stringify(feedback.body));
  const context = contexts[0].profile;
  assert.deepEqual(context.missingMeasurements, ['age', 'height', 'weight']);
  assert.equal(context.experience, 'returning');
  for (const key of ['age', 'height', 'weight']) assert.equal(context[key], null);
  assert.deepEqual(feedback.body.state.plans, [first]);
  const applied = await app.post(`/api/feedback/${feedback.body.entry.id}/apply`);
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const record = applied.body.state.plans[1];
  assert.deepEqual(applied.body.state.plans[0], first);
  assert.equal(record.source, 'ai-adjusted');
  assert.equal(record.parentId, first.id);
  assert.deepEqual(record.profile, first.profile);
  assert.equal(record.plan.days[0].exercises[0].reps, '4 次');
  assert.deepEqual(record.plan.days.slice(1), first.plan.days.slice(1));
  assert.deepEqual(await app.store.read(), applied.body.state);
  assert.deepEqual(app.calls, { status: 0, generate: 0, analyze: 0 });
});
