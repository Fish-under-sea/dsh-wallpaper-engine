import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSubpackages } from './dev-link-subpackages.mjs';
import { ROOT, assertNodeVersion, runTool } from './deploy-tools.mjs';

export function releaseManifest(main, children) {
  const manifest = structuredClone(main);
  manifest.dependencies = { ...manifest.dependencies };
  for (const child of children) {
    if (!child.name || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(child.version || '')) throw new Error('Invalid child version: ' + child.name);
    manifest.dependencies[child.name] = child.version;
  }
  delete manifest.devDependencies;
  delete manifest.scripts;
  return manifest;
}

export function releaseSetMatches(packages, plan) {
  const expected = [...plan.subs.map((p) => JSON.parse(readFileSync(p.manifest, 'utf8'))), plan.main];
  return Array.isArray(packages) && packages.length === expected.length
    && packages.every((pkg, i) => pkg && pkg.name === expected[i].name && pkg.version === expected[i].version
      && pkg.file === expected[i].name.replace(/^@/, '').replaceAll('/', '-') + '-' + expected[i].version + '.tgz');
}

export function packRelease(options = {}, run = runTool) {
  assertNodeVersion();
  const root = resolve(options.root || ROOT);
  const main = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const subs = collectSubpackages(root);
  if (!subs.length || subs.some((p) => !p.name)) throw new Error('Missing subpackages.');
  const children = subs.map((p) => JSON.parse(readFileSync(p.manifest, 'utf8')));
  run(process.execPath, [join(root, 'scripts', 'build-client.mjs')], { cwd: root });
  const output = resolve(options.output || join(root, '.test-cache', 'release'));
  mkdirSync(output, { recursive: true });
  const dir = mkdtempSync(join(output, 'set-'));
  const stage = join(dir, 'main');
  mkdirSync(stage);
  for (const item of [...main.files, 'LICENSE', 'README.md', 'README.en.md', 'README.beginner.md']) {
    const source = resolve(root, item);
    if (relative(root, source).startsWith('..')) throw new Error('Package path escapes checkout: ' + item);
    if (!existsSync(source)) throw new Error('Missing package file: ' + item);
    cpSync(source, join(stage, item), { recursive: true });
  }
  const manifest = releaseManifest(main, children);
  writeFileSync(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  const packages = [];
  for (const [index, p] of subs.entries()) {
    run('npm', ['pack', '--ignore-scripts', '--pack-destination', dir], { cwd: p.target });
    packages.push({ name: p.name, version: children[index].version,
      file: p.name.replace(/^@/, '').replaceAll('/', '-') + '-' + children[index].version + '.tgz' });
  }
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', dir], { cwd: stage });
  packages.push({ name: main.name, version: main.version, file: main.name + '-' + main.version + '.tgz' });
  for (const pkg of packages) if (!existsSync(join(dir, pkg.file))) throw new Error('Missing tarball: ' + pkg.file);
  writeFileSync(join(dir, 'release-set.json'), JSON.stringify({ packages, publishOrder: packages.map((p) => p.file) }, null, 2) + '\n');
  console.log('Release set prepared (not published): ' + dir);
  return { dir, manifest, packages };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--output')) throw new Error('Usage: node scripts/pack-release.mjs [--output <directory>]');
    packRelease({ output: args[1] });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
