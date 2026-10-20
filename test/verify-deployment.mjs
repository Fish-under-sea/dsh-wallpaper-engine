import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join, resolve } from 'node:path';
import { sourcePlan, retainMainBundle, installSource } from '../scripts/install-source.mjs';
import { releaseManifest, releaseSetMatches, packRelease } from '../scripts/pack-release.mjs';
import { assertNodeVersion, ROOT, runTool, toolLaunch } from '../scripts/deploy-tools.mjs';

const cache = join(ROOT, '.test-cache', 'deployment');
mkdirSync(cache, { recursive: true });
const home = mkdtempSync(join(cache, 'home-'));
const plan = sourcePlan({ home, profile: 'web' });
assert.equal(plan.subs.length, 7);
assert.equal(plan.specs.length, 8);
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
for (const name of ['dsh-we-pet-builtin', 'dsh-pet', 'electron', '@electron/get']) {
  assert.equal(manifest.dependencies[name], undefined);
  assert.equal(plan.main.devDependencies[name], undefined);
}
const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
assert.ok(!Object.keys(lock.packages).some(path => /(?:^|\/)(?:electron|@electron\/get|dsh-we-pet-builtin)$/.test(path)));
assert.equal(manifest.devDependencies, undefined);
assert.equal(manifest.scripts, undefined);
for (const child of children) assert.equal(manifest.dependencies[child.name], child.version);
const releasePackages = [...children, plan.main].map((pkg) => ({ name: pkg.name, version: pkg.version,
  file: pkg.name.replace(/^@/, '').replaceAll('/', '-') + '-' + pkg.version + '.tgz' }));
assert.equal(releaseSetMatches(releasePackages, plan), true);
assert.equal(releaseSetMatches(releasePackages.slice(1), plan), false);
assert.equal(releaseSetMatches([...releasePackages, releasePackages[0]], plan), false);
assert.equal(releaseSetMatches(releasePackages.map((pkg, i) => i === 0 ? releasePackages[1] : pkg), plan), false);
assert.equal(releaseSetMatches(releasePackages.map((pkg, i) => i === 0 ? { ...pkg, name: 'wrong-package' } : pkg), plan), false);
assert.equal(releaseSetMatches(releasePackages.map((pkg, i) => i === 0 ? { ...pkg, version: '0.0.0' } : pkg), plan), false);
assert.equal(releaseSetMatches(releasePackages.map((pkg, i) => i === 0 ? { ...pkg, file: '../wrong.tgz' } : pkg), plan), false);
assert.equal(releaseSetMatches([...releasePackages].reverse(), plan), false);
assert.equal(releaseSetMatches([releasePackages.at(-1), ...releasePackages.slice(0, -1)], plan), false);
assert.equal(releaseSetMatches(null, plan), false);
const compatSource = readFileSync(join(ROOT, 'test', 'compat-harness-live.mjs'), 'utf8');
assert.match(compatSource, /releaseSetMatches\(release\.packages, plan\)/);
assert.doesNotMatch(compatSource, /specs\.length === 9|spawn\('pwsh'/);
console.log('Deployment unit checks passed: explicit target, actual release package identities/order, bundle ownership.');

const tools = mkdtempSync(join(cache, 'cli with spaces-'));
const cliFixture = join(tools, 'fixture-cli.mjs');
const cliOutput = join(tools, 'received.json');
writeFileSync(cliFixture, `import { writeFileSync } from 'node:fs';
writeFileSync(process.env.DSH_WE_CLI_OUTPUT, JSON.stringify({ args: process.argv.slice(2), home: process.env.DSH_HOME }));
if (process.argv.includes('--fail')) process.exitCode = 7;
`);
const cliArgs = ['space value', '中文 参数', '"quoted"', "single'quote", 'a&b|c;d', '%PATH%', '$value', 'trailing\\'];
const cliEnv = { npm_execpath: cliFixture, DSH_WE_CLI_OUTPUT: cliOutput, DSH_HOME: home, HOME: home, USERPROFILE: home };
runTool('npm', cliArgs, { env: cliEnv });
assert.deepEqual(JSON.parse(readFileSync(cliOutput, 'utf8')), { args: cliArgs, home });
runTool('dsh', cliArgs, { env: { ...cliEnv, npm_execpath: '' }, cli: cliFixture });
assert.deepEqual(JSON.parse(readFileSync(cliOutput, 'utf8')), { args: cliArgs, home });
const missingCli = join(tools, 'missing-dsh.mjs');
const missingLaunch = toolLaunch('dsh', [], { cli: missingCli });
assert.equal(missingLaunch.args[0], missingCli);
assert.equal(spawnSync(missingLaunch.command, missingLaunch.args, { stdio: 'ignore' }).status, 1);
assert.throws(() => runTool('npm', ['--fail'], { env: cliEnv }), /exited with 7/);
const npmFallback = toolLaunch('npm', ['--version'], { env: { npm_execpath: '' } });
if (process.platform === 'win32') {
  const stockPath = [...new Set([dirname(process.execPath), resolve(dirname(npmFallback.args[0]), '../../..')])].join(delimiter);
  const stockEnv = { npm_execpath: '', Path: stockPath, DSH_HOME: home, HOME: home, USERPROFILE: home };
  const fallback = toolLaunch('npm', ['--version'], { env: stockEnv });
  assert.equal(fallback.command, process.execPath);
  assert.equal(fallback.args[0], npmFallback.args[0]);
  assert.equal(fallback.env.PATH, stockPath);
  assert(!Object.keys(fallback.env).some((key) => key !== 'PATH' && key.toUpperCase() === 'PATH'));
  const npmVersion = spawnSync(fallback.command, fallback.args, { env: fallback.env, encoding: 'utf8' });
  if (npmVersion.error) throw npmVersion.error;
  assert.equal(npmVersion.status, 0, npmVersion.stderr);
  assert.match(npmVersion.stdout.trim(), /^\d+\.\d+\.\d+/);
  const fallbackFromCmd = toolLaunch('npm', [], { env: { ...stockEnv, npm_execpath: join(tools, 'npm.cmd') } });
  assert.equal(fallbackFromCmd.args[0], fallback.args[0]);
  const globalDsh = join(tools, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  mkdirSync(dirname(globalDsh), { recursive: true });
  writeFileSync(globalDsh, 'require("node:fs").writeFileSync(process.env.DSH_WE_CLI_OUTPUT, JSON.stringify(process.argv.slice(2)));');
  writeFileSync(join(tools, 'dsh.cmd'), '@exit /b 99\r\n');
  const pathLaunch = toolLaunch('dsh', cliArgs, { env: { ...cliEnv, npm_execpath: '', Path: tools } });
  if (pathLaunch.args[0] === globalDsh) {
    runTool('dsh', cliArgs, { env: { ...cliEnv, npm_execpath: '', Path: tools } });
    assert.deepEqual(JSON.parse(readFileSync(cliOutput, 'utf8')), cliArgs);
  } else {
    console.log('NOTE dsh PATH fixture superseded by installed local CLI: ' + pathLaunch.args[0]);
  }
  console.log('Windows stock PATH npm version passed without pwsh: ' + npmVersion.stdout.trim());
} else {
  assert(npmFallback.command === process.execPath || npmFallback.command === 'npm');
}
console.log('Deployment CLI checks passed: effective environment, direct JS launch, literal arguments and exit errors.');

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
  assert.equal(releaseSetMatches(result.packages, plan), true);
  assert.equal(result.packages.at(-1).name, plan.main.name);
  writeFileSync(join(cache, 'last-release.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('Release set verified (' + result.packages.length + ' tarballs): ' + result.dir);
}
