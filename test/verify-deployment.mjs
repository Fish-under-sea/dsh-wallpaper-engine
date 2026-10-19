import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { sourcePlan, retainMainBundle, installSource } from '../scripts/install-source.mjs';
import { releaseManifest, packRelease } from '../scripts/pack-release.mjs';
import { assertNodeVersion, ROOT, runTool } from '../scripts/deploy-tools.mjs';

const cache = join(ROOT, '.test-cache', 'deployment');
mkdirSync(cache, { recursive: true });
const home = mkdtempSync(join(cache, 'home-'));
const plan = sourcePlan({ home, profile: 'web' });
assert.equal(plan.subs.length, 8);
assert.equal(plan.specs.length, 9);
assert.throws(() => sourcePlan({ profile: 'web' }), /Specify/);
assert.throws(() => sourcePlan({ home, profile: '../desktop' }), /Specify/);
assert.throws(() => assertNodeVersion('22.11.0'), /22.12/);
assert.doesNotThrow(() => assertNodeVersion('22.12.0'));
assert.throws(() => installSource({ home, profile: 'web', skipDeps: true }), /app-closed/);
assert.equal(installSource({ home, profile: 'web', dryRun: true }).profileDir, plan.profileDir);
const implicitHome = spawnSync(process.execPath, [join(ROOT, 'scripts', 'install-source.mjs'), '--profile', 'web', '--dry-run'], {
  env: { ...process.env, DSH_HOME: home }, stdio: 'ignore' });
if (implicitHome.error) throw implicitHome.error;
assert.equal(implicitHome.status, 1, 'CLI must require explicit --dsh-home even when DSH_HOME is set');
const missingProfile = spawnSync(process.execPath, [join(ROOT, 'scripts', 'dev-link-subpackages.mjs'),
  '--dsh-home', home, '--profile', 'missing', '--dry-run'], { stdio: 'ignore' });
if (missingProfile.error) throw missingProfile.error;
assert.equal(missingProfile.status, 1, 'A nonexistent target profile must not report successful linking');
const retained = retainMainBundle({ dependencies: { unrelated: '1.0.0' },
  dsh: { other: 1, profile: { other: 2, bundles: ['unrelated', plan.main.name, ...plan.subs.map((p) => p.name)] } } }, plan);
assert.deepEqual(retained.dsh.profile.bundles, ['unrelated', plan.main.name]);
assert.equal(retained.dsh.other, 1);
assert.equal(retained.dsh.profile.other, 2);
assert.equal(retained.dependencies.unrelated, '1.0.0');
const children = plan.subs.map((p) => JSON.parse(readFileSync(p.manifest, 'utf8')));
const manifest = releaseManifest(plan.main, children);
assert.equal(manifest.dependencies['dsh-we-pet-builtin'], '0.3.7');
assert.equal(manifest.devDependencies, undefined);
assert.equal(manifest.scripts, undefined);
for (const child of children) assert.equal(manifest.dependencies[child.name], child.version);
assert(plan.main.devDependencies['dsh-we-pet-builtin'].startsWith('file:'));
console.log('Deployment unit checks passed: explicit target, 9 packages, bundle ownership, real child versions.');

if (process.argv.includes('--live')) {
  const cliAt = process.argv.indexOf('--dsh-cli');
  if (cliAt < 0 || !process.argv[cliAt + 1]) throw new Error('--live requires --dsh-cli <lib/bin.js>');
  const cli = resolve(process.argv[cliAt + 1]);
  const options = { home, profile: 'web', cli, appClosed: true, skipDeps: true };
  installSource(options);
  // A package-manager reinstall used to delete the hand-created subpackage junctions.
  runTool(process.execPath, [cli, 'plugin', '--profile', 'web', 'install', '--ignore-scripts'], {
    env: { DSH_HOME: home, DSH_PROFILE: 'web', DSH_PROFILE_DIR: plan.profileDir } });
  const requireHost = createRequire(join(plan.profileDir, 'cordis.yml'));
  for (const name of [plan.main.name, ...plan.subs.map((p) => p.name)]) requireHost.resolve(name);
  installSource(options);
  const installed = JSON.parse(readFileSync(join(plan.profileDir, 'package.json'), 'utf8'));
  assert(installed.dsh.profile.bundles.includes(plan.main.name));
  assert(!installed.dsh.profile.bundles.some((n) => plan.subs.some((p) => p.name === n)));
  console.log('Live DSH source install/reinstall/update passed: ' + home);
}

if (process.argv.includes('--pack')) {
  const result = packRelease();
  assert.equal(result.packages.length, 9);
  assert.equal(result.packages.at(-1).name, plan.main.name);
  writeFileSync(join(cache, 'last-release.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('Nine-tarball release set verified: ' + result.dir);
}
