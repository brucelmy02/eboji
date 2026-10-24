import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { AppError, validateProfile, validatePlan } from './lib/plan.mjs';
import { codexStatus, findCodex, generatePlan } from './lib/codex.mjs';
import { analyzeFeedback, validateFeedback, validateAnalysis } from './lib/feedback.mjs';
import { createStore, emptyState } from './lib/store.mjs';
import { exerciseIllustrations } from './public/exercise-library.js';
import { exerciseCatalog } from './public/exercise-catalog.js';
import { preparePreset } from './lib/presets.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/motion.js', ['motion.js', 'text/javascript; charset=utf-8']],
  ['/motion.css', ['motion.css', 'text/css; charset=utf-8']],
  ['/exercise-library.js', ['exercise-library.js', 'text/javascript; charset=utf-8']],
  ['/exercise-catalog.js', ['exercise-catalog.js', 'text/javascript; charset=utf-8']],
  ['/exercise-animation.js', ['exercise-animation.js', 'text/javascript; charset=utf-8']],
  ['/exercise-poster.js', ['exercise-poster.js', 'text/javascript; charset=utf-8']],
  ['/exercise-poses.js', ['exercise-poses.js', 'text/javascript; charset=utf-8']],
  ['/exercise-poses-3d.js', ['exercise-poses-3d.js', 'text/javascript; charset=utf-8']],
  ['/exercise-renderer-3d.js', ['exercise-renderer-3d.js', 'text/javascript; charset=utf-8']],
  ['/vendor/three.module.js', ['vendor/three.module.js', 'text/javascript; charset=utf-8']],
  ['/vendor/three.core.js', ['vendor/three.core.js', 'text/javascript; charset=utf-8']],
  ['/vendor/THREE-LICENSE.txt', ['vendor/THREE-LICENSE.txt', 'text/plain; charset=utf-8']],
  ['/exercise-catalog.css', ['exercise-catalog.css', 'text/css; charset=utf-8']],
  ['/preset-plans.js', ['preset-plans.js', 'text/javascript; charset=utf-8']],
  ['/presets.css', ['presets.css', 'text/css; charset=utf-8']],
  ['/welcome.css', ['welcome.css', 'text/css; charset=utf-8']],
  ['/onboarding.css', ['onboarding.css', 'text/css; charset=utf-8']],
  ['/workout-deck.css', ['workout-deck.css', 'text/css; charset=utf-8']],
  ['/workout-deck.js', ['workout-deck.js', 'text/javascript; charset=utf-8']],
  ['/workout-progress.js', ['workout-progress.js', 'text/javascript; charset=utf-8']],
  ['/workout-activity.js', ['workout-activity.js', 'text/javascript; charset=utf-8']],
  ['/training-calendar.js', ['training-calendar.js', 'text/javascript; charset=utf-8']],
  ['/training-calendar-data.js', ['training-calendar-data.js', 'text/javascript; charset=utf-8']],
  ['/training-calendar.css', ['training-calendar.css', 'text/css; charset=utf-8']],
  ['/brand/eboji-logo-v1.png', ['brand/eboji-logo-v1.png', 'image/png']],
  ['/brand/eboji-mark-v1.png', ['brand/eboji-mark-v1.png', 'image/png']],
  ['/brand/eboji-logo-blue-v2.png', ['brand/eboji-logo-blue-v2.png', 'image/png']],
  ['/brand/eboji-mark-blue-v2.png', ['brand/eboji-mark-blue-v2.png', 'image/png']],
  ['/favicon.ico', ['brand/eboji-mark-blue-v2.png', 'image/png']],
  ['/exercises/ATTRIBUTION.md', ['exercises/ATTRIBUTION.md', 'text/plain; charset=utf-8']],
  ...exerciseIllustrations.flatMap((exercise) => exercise.frames.map(({ src }) => [src, [src.slice(1), 'image/svg+xml; charset=utf-8']])),
  ...exerciseCatalog.map(({ id }) => [`/exercise-posters/${id}.webp`, [`exercise-posters/${id}.webp`, 'image/webp']]),
]);

export function createApp({ binary = 'codex', generate = generatePlan, analyze = analyzeFeedback, getStatus = codexStatus, store = createStore(join(root, '.eboji', 'state.json')) } = {}) {
  const token = randomBytes(32).toString('hex');
  let busy = false;
  const server = http.createServer(async (req, res) => {
    const headers = {
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    };
    const json = (status, data) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    try {
      const port = server.address()?.port;
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) throw new AppError('此服务仅接受本机访问。', 403, 'LOCAL_ONLY');
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && assets.has(pathname)) {
        const [file, type] = assets.get(pathname);
        const content = await readFile(join(root, 'public', file));
        res.writeHead(200, { ...headers, 'Content-Type': type });
        res.end(content);
        return;
      }
      if (req.method === 'GET' && pathname === '/api/session') {
        json(200, { token, busy });
        return;
      }
      if (req.method === 'GET' && pathname === '/api/status') {
        json(200, { ...(await getStatus(binary)), token, busy });
        return;
      }
      if (req.method === 'GET' && pathname === '/api/state') {
        json(200, await store.read());
        return;
      }
      const match = pathname.match(/^\/api\/feedback\/([a-f0-9-]{36})\/(reply|apply)$/);
      if (req.method !== 'POST' || !(['/api/plan', '/api/preset', '/api/feedback', '/api/reset'].includes(pathname) || match)) throw new AppError('未找到这个页面或接口。', 404, 'NOT_FOUND');
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`) throw new AppError('请从 eboji 本机页面提交。', 403, 'INVALID_ORIGIN');
      const supplied = req.headers['x-eboji-token'];
      if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) throw new AppError('页面连接已更新，请刷新后重试。', 403, 'INVALID_TOKEN');
      if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError('需要 JSON 格式的请求。', 415);
      if (busy) throw new AppError('AI 正在处理一项请求，请完成或取消后再试。', 429, 'BUSY');
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) throw new AppError('填写内容过长，请精简后重试。', 413);
        chunks.push(chunk);
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString()); }
      catch { throw new AppError('提交的数据格式不正确。'); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError('提交的数据格式不正确。');
      // Recheck after the async body read to prevent overlapping mutations.
      if (busy) throw new AppError('已有一项请求正在处理，请稍后再试。', 429, 'BUSY');
      busy = true;
      const controller = new AbortController();
      const cancel = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close', cancel);
      const assertConnected = () => { if (controller.signal.aborted || res.destroyed) throw new AppError('已取消，原记录未修改。', 499, 'CANCELLED'); };
      try {
        const state = await store.read();
        const active = state.plans.find((p) => p.id === state.activePlanId);
        const options = { binary, signal: controller.signal };
        const history = state.feedback.slice(-5).map((entry) => ({ input: entry.input, analysis: entry.analysis, applied: Boolean(entry.appliedPlanId), replies: entry.replies }));
        let response;
        if (pathname === '/api/plan') {
          const profile = validateProfile(data);
          const plan = validatePlan(await generate(profile, options), profile);
          assertConnected();
          const record = { id: randomUUID(), version: state.plans.length + 1, createdAt: new Date().toISOString(), plan, profile, source: 'ai', reason: '根据当前资料制定计划', parentId: null };
          state.profile = profile;
          state.plans.push(record);
          state.activePlanId = record.id;
          response = { state };
        } else if (pathname === '/api/preset') {
          if (active?.profile?.health === 'needs_review' || active?.plan?.status === 'needs_review') throw new AppError('当前计划记录了需要确认的运动限制，预设方案暂不适用。', 409, 'PRESET_NEEDS_REVIEW');
          const { presetId, title, profile, plan } = preparePreset(data, state.profile || active?.profile);
          assertConnected();
          const record = { id: randomUUID(), version: state.plans.length + 1, createdAt: new Date().toISOString(), plan, profile, source: 'preset', presetId, parentId: active?.id || null, reason: `选用预设方案：${title}` };
          state.profile = profile;
          state.plans.push(record);
          state.activePlanId = record.id;
          response = { state };
        } else if (pathname === '/api/feedback') {
          if (!active || active.plan.status !== 'ready') throw new AppError('请先生成一份可执行的训练计划。', 409, 'NO_PLAN');
          if (data.planId !== active.id) throw new AppError('计划已更新，请刷新后对当前计划反馈。', 409, 'STALE_PLAN');
          const input = validateFeedback(data, active.plan);
          const analysis = validateAnalysis(await analyze({ profile: active.profile || state.profile, plan: active.plan, feedback: input, history, replies: [] }, options), active.profile || state.profile, active.plan, input);
          assertConnected();
          const entry = { id: randomUUID(), planId: active.id, input, analysis, replies: [], createdAt: new Date().toISOString(), appliedPlanId: null, analysisHistory: [] };
          state.feedback.push(entry);
          response = { entry, state };
        } else if (pathname === '/api/reset') {
          assertConnected();
          const cleared = emptyState();
          await store.save(cleared);
          json(200, { state: cleared });
          return;
        } else if (match) {
          const entry = state.feedback.find((f) => f.id === match[1]);
          if (!entry) throw new AppError('没有找到这条反馈。', 404, 'NOT_FOUND');
          if (entry.appliedPlanId) throw new AppError('这条建议已经采用，请对新计划提交反馈。', 409, 'ALREADY_APPLIED');
          if (!active || entry.planId !== active.id) throw new AppError('这条建议来自旧计划。请针对当前计划重新反馈。', 409, 'STALE_PLAN');
          if (match[2] === 'reply') {
            if (typeof data.answer !== 'string' || !data.answer.trim() || data.answer.length > 1500) throw new AppError('请填写 1–1500 字的补充说明。');
            if (entry.replies.length >= 8) throw new AppError('这次反馈已补充多次，请整理后提交一条新反馈。');
            const replies = [...entry.replies, { answer: data.answer.trim(), createdAt: new Date().toISOString() }];
            const previousContext = [...history.filter((h) => h.input !== entry.input), { input: entry.input, analysis: entry.analysis, applied: false, replies: entry.replies }];
            const analysis = validateAnalysis(await analyze({ profile: active.profile || state.profile, plan: active.plan, feedback: entry.input, history: previousContext, replies }, options), active.profile || state.profile, active.plan, entry.input);
            assertConnected();
            entry.analysisHistory.push({ analysis: entry.analysis, at: new Date().toISOString() });
            entry.analysis = analysis;
            entry.replies = replies;
            response = { entry, state };
          } else {
            const analysis = validateAnalysis(entry.analysis, active.profile || state.profile, active.plan, entry.input);
            if (analysis.status !== 'adjustment' || !analysis.proposedDay) throw new AppError('这条反馈没有可以采用的计划修改。', 409, 'NO_ADJUSTMENT');
            const updated = structuredClone(active.plan);
            updated.days[entry.input.day - 1] = analysis.proposedDay;
            validatePlan(updated, active.profile || state.profile);
            const record = { id: randomUUID(), version: state.plans.length + 1, createdAt: new Date().toISOString(), plan: updated, profile: active.profile || state.profile, source: 'ai-adjusted', parentId: active.id, reason: analysis.changeReason };
            state.plans.push(record);
            state.activePlanId = record.id;
            entry.appliedPlanId = record.id;
            response = { state };
          }
        }
        assertConnected();
        await store.save(state);
        json(200, response);
      } finally {
        res.off('close', cancel);
        busy = false;
      }
    } catch (error) {
      const known = error instanceof AppError;
      if (!known) console.error('[eboji] Unexpected request error:', error.name);
      json(known ? error.status : 500, { error: known ? error.message : '本机服务出现问题。请查看终端；原记录不会被自动覆盖。', code: known ? error.code : 'SERVER_ERROR' });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const binary = await findCodex();
  const port = Number(process.env.PORT || 3000);
  const server = createApp({ binary });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已占用，可运行 PORT=3001 npm start。` : `无法启动服务：${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    console.log(`eboji 已启动：${url}\n仅本机访问 · 通过已登录的 Codex CLI 生成计划\n记录保存在项目 .eboji/state.json\n关闭此终端或按 Ctrl+C 停止服务。`);
    if (process.argv.includes('--open') && process.platform === 'darwin') {
      const opener = spawn('open', [url], { stdio: 'ignore' });
      opener.on('error', () => console.log(`请在浏览器打开 ${url}`));
    }
  });
}
