import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppError, createPrompt, planSchema, validatePlan } from './plan.mjs';

const execFileAsync = promisify(execFile);
export async function findCodex() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  try { await execFileAsync('codex', ['--version'], { timeout: 5000 }); return 'codex'; } catch { /* Try desktop bundles. */ }
  for (const path of [
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
    '/Applications/Codex.app/Contents/Resources/codex',
  ]) {
    try { await access(path); return path; } catch { /* Continue. */ }
  }
  return 'codex';
}

export async function codexStatus(binary) {
  try {
    const { stdout, stderr } = await execFileAsync(binary, ['login', 'status'], { timeout: 8000, maxBuffer: 65536 });
    const loggedIn = /logged in/i.test(`${stdout}\n${stderr}`);
    return { ready: loggedIn, message: loggedIn ? 'Codex 已连接' : '请先在终端运行 codex login' };
  } catch (error) {
    return { ready: false, message: error.code === 'ENOENT' ? '未找到 Codex CLI，请安装或设置 CODEX_BIN' : 'Codex 尚未就绪，请运行 codex login 检查登录' };
  }
}

function describeFailure(log) {
  if (/quota|usage limit|rate limit|429|credits/i.test(log)) return new AppError('Codex 使用额度暂时不足或请求过于频繁，请稍后重试。', 429, 'CODEX_LIMIT');
  if (/401|unauthorized|not logged|refresh.token|authentication/i.test(log)) return new AppError('Codex 登录已失效，请在终端运行 codex login 后重试。', 503, 'CODEX_AUTH');
  if (/network|connect|dns|timed out|stream disconnected/i.test(log)) return new AppError('无法连接 Codex 服务，请检查网络后重试。', 502, 'CODEX_NETWORK');
  return new AppError('Codex 未能完成生成，请重试；也可在终端检查 codex login status。', 502, 'CODEX_FAILED');
}

export async function runCodexJson(prompt, schema, { binary, signal, timeoutMs = 240000 } = {}) {
  if (signal?.aborted) throw new AppError('已取消生成。', 499, 'CANCELLED');
  const directory = await mkdtemp(join(tmpdir(), 'eboji-'));
  const schemaPath = join(directory, 'schema.json');
  const resultPath = join(directory, 'result.json');
  try {
    await writeFile(schemaPath, JSON.stringify(schema), { mode: 0o600 });
    const args = ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
      '--disable', 'shell_tool', '--disable', 'apps', '--disable', 'plugins', '--disable', 'multi_agent',
      '--disable', 'hooks', '--disable', 'browser_use', '--disable', 'computer_use',
      '-c', 'web_search="disabled"', '-c', 'model_reasoning_effort="low"',
      '--output-schema', schemaPath, '--output-last-message', resultPath, '--color', 'never', '-'];
    if (process.env.CODEX_MODEL) args.splice(1, 0, '--model', process.env.CODEX_MODEL);
    await new Promise((resolve, reject) => {
      const child = spawn(binary || 'codex', args, { cwd: directory, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
      let log = '';
      let failure;
      let killTimer;
      const stop = (error) => {
        if (failure) return;
        failure = error;
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), 2000);
        killTimer.unref();
      };
      const abort = () => stop(new AppError('已取消生成。', 499, 'CANCELLED'));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      const timer = setTimeout(() => stop(new AppError('这次生成超过 4 分钟，请稍后重试。', 504, 'CODEX_TIMEOUT')), timeoutMs);
      const collect = (data) => {
        if (failure) return;
        const remaining = 1024 * 1024 - log.length;
        const chunk = data.toString();
        log += chunk.slice(0, remaining);
        if (chunk.length > remaining) stop(new AppError('Codex 返回内容过多，请重试。', 502, 'CODEX_OUTPUT_LIMIT'));
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.stdin.on('error', () => {});
      child.on('error', (error) => { failure = new AppError(error.code === 'ENOENT' ? '找不到 Codex CLI，请安装或设置 CODEX_BIN。' : '无法启动 Codex，请检查本机运行权限。', 503, 'CODEX_UNAVAILABLE'); });
      child.on('close', (code) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        signal?.removeEventListener('abort', abort);
        if (failure) reject(failure);
        else if (code !== 0) reject(describeFailure(log));
        else resolve();
      });
      child.stdin.end(prompt);
    });
    let plan;
    try { plan = JSON.parse(await readFile(resultPath, 'utf8')); }
    catch { throw new AppError('Codex 没有返回完整的计划数据，请重新生成。', 502, 'INVALID_PLAN'); }
    return plan;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function generatePlan(profile, options = {}) {
  return validatePlan(await runCodexJson(createPrompt(profile), planSchema, options), profile);
}
