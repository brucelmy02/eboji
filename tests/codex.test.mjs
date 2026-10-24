import test from 'node:test';
import assert from 'node:assert/strict';
import { access, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runCodexJson } from '../lib/codex.mjs';

const schema = {
  type: 'object', properties: { answer: { type: 'string' } },
  required: ['answer'], additionalProperties: false,
};

async function mockCodex(t, mode = 'success', log = '') {
  const directory = await mkdtemp(join(tmpdir(), 'eboji-codex-test-'));
  // A literal space and semicolon also exercise shell-free executable invocation.
  const binary = join(directory, 'mock codex ; literal.mjs');
  const tracePath = join(directory, 'trace.json');
  const termPath = join(directory, 'terminated');
  const script = `#!/usr/bin/env node
import { readFileSync, realpathSync, writeFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
const mode = ${JSON.stringify(mode)};
const args = process.argv.slice(2);
const argument = (flag) => args[args.indexOf(flag) + 1];
const tracePath = ${JSON.stringify(tracePath)};
const termPath = ${JSON.stringify(termPath)};
if (['waiting', 'stubborn', 'output-limit'].includes(mode)) {
  setInterval(() => {}, 1000);
  process.on('SIGTERM', () => {
    writeFileSync(termPath, 'SIGTERM');
    if (mode !== 'stubborn') process.exit(0);
  });
}
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk.toString();
const schemaPath = argument('--output-schema');
writeFileSync(tracePath, JSON.stringify({
  pid: process.pid, cwd: process.cwd(), args, prompt,
  schema: JSON.parse(readFileSync(schemaPath, 'utf8')),
  schemaMode: statSync(schemaPath).mode & 0o777,
  schemaDirectory: realpathSync(dirname(schemaPath)),
  resultDirectory: realpathSync(dirname(argument('--output-last-message'))),
}));
if (mode === 'success') {
  writeFileSync(argument('--output-last-message'), JSON.stringify({ answer: '计划完成', echo: prompt }));
} else if (mode === 'invalid') {
  writeFileSync(argument('--output-last-message'), '{"answer":');
} else if (mode === 'failure') {
  process.stderr.write(${JSON.stringify(log)});
  process.exitCode = 1;
} else if (mode === 'output-limit') {
  process.stdout.write('x'.repeat(1024 * 1024 + 65536));
}
`;
  await writeFile(binary, script, { mode: 0o700 });
  await chmod(binary, 0o700);
  t.after(async () => {
    // Clean up this fixture's process if a failing assertion interrupted a test.
    try {
      const trace = JSON.parse(await readFile(tracePath, 'utf8'));
      try { process.kill(trace.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      await rm(trace.cwd, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await rm(directory, { recursive: true, force: true });
  });
  return {
    binary, termPath,
    async trace() { return JSON.parse(await readFile(tracePath, 'utf8')); },
    async waitUntilStarted() {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        try { return JSON.parse(await readFile(tracePath, 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
        await delay(10);
      }
      assert.fail('mock Codex did not start');
    },
    async assertCleaned() {
      const trace = JSON.parse(await readFile(tracePath, 'utf8'));
      await assert.rejects(access(trace.cwd), { code: 'ENOENT' }, 'the request workspace must be removed');
      assert.throws(() => process.kill(trace.pid, 0), { code: 'ESRCH' }, 'the child must exit before the request settles');
    },
  };
}

test('Codex JSON runner passes data through stdin in an isolated workspace and removes it after success', async (t) => {
  const mock = await mockCodex(t);
  const prompt = '用户反馈：第三组很难。 $(touch should-not-exist); `echo literal`';
  const result = await runCodexJson(prompt, schema, { binary: mock.binary });
  assert.deepEqual(result, { answer: '计划完成', echo: prompt });
  const trace = await mock.trace();
  assert.equal(trace.prompt, prompt);
  assert.deepEqual(trace.schema, schema);
  assert.equal(trace.schemaMode, 0o600);
  assert.notEqual(trace.cwd, process.cwd());
  for (const flag of ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check']) {
    assert.ok(trace.args.includes(flag), `missing isolation flag ${flag}`);
  }
  assert.equal(trace.args[trace.args.indexOf('--sandbox') + 1], 'read-only');
  const disabled = trace.args.flatMap((argument, index) => argument === '--disable' ? [trace.args[index + 1]] : []);
  for (const feature of ['shell_tool', 'apps', 'plugins', 'multi_agent', 'hooks', 'browser_use', 'computer_use']) {
    assert.ok(disabled.includes(feature), `${feature} must be disabled`);
  }
  assert.ok(trace.args.includes('web_search="disabled"'));
  assert.equal(trace.args.at(-1), '-');
  assert.equal(trace.schemaDirectory, trace.cwd);
  assert.equal(trace.resultDirectory, trace.cwd);
  assert.equal(basename(trace.args[trace.args.indexOf('--output-schema') + 1]), 'schema.json');
  assert.equal(basename(trace.args[trace.args.indexOf('--output-last-message') + 1]), 'result.json');
  await mock.assertCleaned();
});

test('nonzero Codex exits map to useful errors and clean up their workspaces', async (t) => {
  for (const [log, status, code] of [
    ['usage limit reached: secret diagnostic', 429, 'CODEX_LIMIT'],
    ['401 authentication expired: secret diagnostic', 503, 'CODEX_AUTH'],
    ['network connection failed: secret diagnostic', 502, 'CODEX_NETWORK'],
    ['unexpected internal problem: secret diagnostic', 502, 'CODEX_FAILED'],
  ]) {
    await t.test(code, async (subtest) => {
      const mock = await mockCodex(subtest, 'failure', log);
      await assert.rejects(runCodexJson('feedback', schema, { binary: mock.binary }), (error) => {
        assert.equal(error.status, status);
        assert.equal(error.code, code);
        assert.doesNotMatch(error.message, /secret diagnostic/);
        return true;
      });
      await mock.assertCleaned();
    });
  }
});

test('invalid or missing JSON is rejected and its workspace is removed', async (t) => {
  for (const mode of ['invalid', 'missing']) {
    await t.test(mode, async (subtest) => {
      const mock = await mockCodex(subtest, mode);
      await assert.rejects(runCodexJson('feedback', schema, { binary: mock.binary }), { status: 502, code: 'INVALID_PLAN' });
      await mock.assertCleaned();
    });
  }
});

test('an already cancelled request never launches the executable', async (t) => {
  const mock = await mockCodex(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runCodexJson('feedback', schema, { binary: mock.binary, signal: controller.signal }), { status: 499, code: 'CANCELLED' });
  await assert.rejects(mock.trace(), { code: 'ENOENT' });
});

test('cancelling a running request terminates the child, removes listeners, and cleans up', async (t) => {
  const mock = await mockCodex(t, 'waiting');
  const controller = new AbortController();
  const { getEventListeners } = await import('node:events');
  const rejection = assert.rejects(runCodexJson('feedback', schema, { binary: mock.binary, signal: controller.signal }), { status: 499, code: 'CANCELLED' });
  await mock.waitUntilStarted();
  controller.abort();
  await rejection;
  assert.equal(await readFile(mock.termPath, 'utf8'), 'SIGTERM');
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  await mock.assertCleaned();
});

test('a timed out request is terminated and cleaned up before rejection', async (t) => {
  const mock = await mockCodex(t, 'waiting');
  await assert.rejects(runCodexJson('feedback', schema, { binary: mock.binary, timeoutMs: 1000 }), { status: 504, code: 'CODEX_TIMEOUT' });
  assert.equal(await readFile(mock.termPath, 'utf8'), 'SIGTERM');
  await mock.assertCleaned();
});

test('a child that ignores SIGTERM is killed before timeout cleanup completes', { timeout: 7000 }, async (t) => {
  const mock = await mockCodex(t, 'stubborn');
  await assert.rejects(runCodexJson('feedback', schema, { binary: mock.binary, timeoutMs: 1000 }), { status: 504, code: 'CODEX_TIMEOUT' });
  assert.equal(await readFile(mock.termPath, 'utf8'), 'SIGTERM');
  await mock.assertCleaned();
});

test('excessive process output stops the child and cleans up the workspace', async (t) => {
  const mock = await mockCodex(t, 'output-limit');
  await assert.rejects(runCodexJson('feedback', schema, { binary: mock.binary }), { status: 502, code: 'CODEX_OUTPUT_LIMIT' });
  await mock.assertCleaned();
});

test('a missing executable rejects promptly without an unhandled stdin error', async () => {
  await assert.rejects(runCodexJson('feedback', schema, { binary: '/path/that/does/not/exist/eboji-codex', timeoutMs: 1000 }), { status: 503, code: 'CODEX_UNAVAILABLE' });
});
