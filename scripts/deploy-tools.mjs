import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Run fixed tool names with data-only arguments, including Windows .cmd shims. */
export function runTool(tool, args, options = {}) {
  let command = tool;
  let argv = args;
  const env = { ...process.env, ...options.env };
  if (tool === 'npm' && process.env.npm_execpath) {
    command = process.execPath;
    argv = [process.env.npm_execpath, ...args];
  } else if (process.platform === 'win32' && ['npm', 'dsh'].includes(tool)) {
    command = 'pwsh';
    env.DSH_WE_DEPLOY_ARGS = JSON.stringify(args);
    argv = ['-NoProfile', '-NonInteractive', '-Command',
      `$a = @($env:DSH_WE_DEPLOY_ARGS | ConvertFrom-Json); & ${tool} @a; exit $LASTEXITCODE`];
  }
  const result = spawnSync(command, argv, { cwd: options.cwd || ROOT, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${tool} exited with ${result.status ?? result.signal}`);
}

export function assertNodeVersion(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Node.js >=22.12.0 is required (including the built-in pet).');
}

export function resolveDshCli(cli) {
  if (cli) return resolve(cli);
  try { return createRequire(import.meta.url).resolve('@deepseek-ai/dsh/lib/bin.js'); }
  catch { return null; }
}
