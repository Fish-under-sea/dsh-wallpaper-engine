import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Resolve npm-managed CLIs without executing Windows command shims through a shell. */
export function toolLaunch(tool, args, options = {}) {
  const env = { ...process.env, ...options.env };
  if (process.platform === 'win32') {
    const pathKey = Object.keys(options.env || {}).find((key) => key.toUpperCase() === 'PATH');
    if (pathKey) {
      const path = options.env[pathKey];
      for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key];
      env.PATH = path;
    }
  }
  const candidates = [];
  if (tool === 'npm' && env.npm_execpath && /\.[cm]?js$/i.test(env.npm_execpath)) {
    candidates.push(env.npm_execpath);
  }
  if (tool === 'dsh') {
    if (options.cli) return { command: process.execPath, args: [resolve(options.cli), ...args], env };
    const cli = resolveDshCli();
    if (cli) candidates.push(cli);
  }
  if (tool === 'npm' || tool === 'dsh') {
    const entry = tool === 'npm' ? ['npm', 'bin', 'npm-cli.js'] : ['@deepseek-ai', 'dsh', 'lib', 'bin.js'];
    candidates.push(join(dirname(process.execPath), 'node_modules', ...entry));
    if (process.platform === 'win32') {
      const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH');
      for (const raw of String(pathKey ? env[pathKey] : '').split(delimiter)) {
        const dir = raw.replace(/^"|"$/g, '');
        if (dir) candidates.push(join(dir, 'node_modules', ...entry));
      }
    }
    const cli = candidates.find((path) => existsSync(path));
    if (cli) return { command: process.execPath, args: [cli, ...args], env };
    if (process.platform === 'win32') {
      throw new Error(`Cannot locate ${tool} JavaScript CLI; install its npm package${tool === 'dsh' ? ' or pass --dsh-cli <lib/bin.js>' : ''}.`);
    }
  }
  return { command: tool, args, env };
}

/** Run fixed tool names with data-only arguments. */
export function runTool(tool, args, options = {}) {
  const launch = toolLaunch(tool, args, options);
  const result = spawnSync(launch.command, launch.args, { cwd: options.cwd || ROOT, env: launch.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${tool} exited with ${result.status ?? result.signal}`);
}

export function assertNodeVersion(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Node.js >=22.12.0 is required.');
}

export function resolveDshCli(cli) {
  if (cli) return resolve(cli);
  try { return createRequire(import.meta.url).resolve('@deepseek-ai/dsh/lib/bin.js'); }
  catch { return null; }
}
