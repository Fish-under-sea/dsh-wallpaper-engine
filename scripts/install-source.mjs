import { existsSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSubpackages } from './dev-link-subpackages.mjs';
import { ROOT, assertNodeVersion, runTool, resolveDshCli } from './deploy-tools.mjs';

export function sourcePlan(options) {
  assertNodeVersion();
  if (!options.home || !/^[a-zA-Z0-9_-]+$/.test(options.profile || '')) {
    throw new Error('Specify --dsh-home <directory> and --profile <name> explicitly.');
  }
  const root = resolve(options.root || ROOT);
  const home = resolve(options.home);
  const profileDir = join(home, 'profiles', options.profile);
  const main = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const subs = collectSubpackages(root);
  if (!subs.length || subs.some((p) => !p.name)) throw new Error('Incomplete source checkout: invalid subpackage manifests.');
  return { root, home, profileDir, main, subs,
    specs: [root, ...subs.map((p) => p.target)].map((p) => 'link:' + p) };
}

export function retainMainBundle(manifest, plan) {
  const children = new Set(plan.subs.map((p) => p.name));
  const selected = manifest.dsh?.profile?.bundles || [];
  manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile,
    bundles: selected.filter((name) => !children.has(name)) } };
  return manifest;
}

export function installSource(options, run = runTool) {
  const plan = sourcePlan(options);
  if (options.dryRun) return plan;
  if (!options.appClosed) throw new Error('Completely close the target DSH application, then pass --app-closed.');
  const env = { DSH_HOME: plan.home, DSH_PROFILE: options.profile, DSH_PROFILE_DIR: plan.profileDir };
  const manifestPath = join(plan.profileDir, 'package.json');
  if (existsSync(manifestPath)) {
    copyFileSync(manifestPath, manifestPath + '.wallpaper-backup-' + Date.now());
  }
  if (!options.skipDeps) run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: plan.root });
  run(process.execPath, [join(plan.root, 'scripts', 'build-client.mjs')], { cwd: plan.root });
  const args = ['plugin', '--profile', options.profile, 'add', ...plan.specs];
  const cli = resolveDshCli(options.cli);
  run(cli ? process.execPath : 'dsh', cli ? [cli, ...args] : args, { cwd: plan.root, env });
  // All packages are durable dependencies, but only the main patch owns the family rows.
  const manifest = retainMainBundle(JSON.parse(readFileSync(manifestPath, 'utf8')), plan);
  const temp = manifestPath + '.wallpaper-tmp';
  writeFileSync(temp, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  renameSync(temp, manifestPath);
  const hostRequire = createRequire(join(plan.profileDir, 'cordis.yml'));
  for (const name of [plan.main.name, ...plan.subs.map((p) => p.name)]) {
    if (!manifest.dependencies?.[name]) throw new Error('Missing persistent dependency: ' + name);
    hostRequire.resolve(name);
    const pkg = JSON.parse(readFileSync(hostRequire.resolve(name + '/package.json'), 'utf8'));
    if (pkg.dsh?.client) hostRequire.resolve(name + '/client');
  }
  console.log('Source deployment verified: main package + ' + plan.subs.length + ' subpackages. Restart the target DSH host.');
  return plan;
}

function main(args) {
  const values = new Map();
  const flags = new Set(['--app-closed', '--dry-run', '--skip-deps']);
  const names = new Set(['--profile', '--dsh-home', '--dsh-cli']);
  for (let i = 0; i < args.length; i++) {
    if (flags.has(args[i])) values.set(args[i], true);
    else if (names.has(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) values.set(args[i], args[++i]);
    else throw new Error('Unknown or incomplete argument: ' + args[i]);
  }
  const plan = installSource({ profile: values.get('--profile'), home: values.get('--dsh-home'),
    cli: values.get('--dsh-cli'), appClosed: values.has('--app-closed'), dryRun: values.has('--dry-run'), skipDeps: values.has('--skip-deps') });
  if (values.has('--dry-run')) console.log(JSON.stringify({ profileDir: plan.profileDir, specs: plan.specs }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
