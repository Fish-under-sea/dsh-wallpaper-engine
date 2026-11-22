/**
 * verify-release-set.mjs —— **发布集字节**守卫（`npm run verify` 硬档）。
 *
 * 与相邻几条的分工：
 *   · `verify-package-files` 判仓库里的打包元数据（files 覆盖、入口在位、依赖无死声明）；
 *   · `verify-package-publish` 判"装到用户机器上会不会坏 / 多带东西"（按 `files` 语义复刻的集合）；
 *   · `verify-deployment` 判 `releaseManifest` / `releaseSetMatches` 的**纯函数**行为，`--pack` 时才
 *     真打一次包、且只核名字与顺序（不在默认链里跑）；
 *   · 本条判**真正要发出去的那整套 tarball 的字节**：主包清单声明的全部子包是不是"精确版本、
 *     与发布集里的 tarball 一一对应"，以及每个子包 tarball 里是不是真有它自己 `exports['./client']`
 *     指向的浏览器半边。
 *
 * 为什么它值得一条硬档：用户在 DSH 里执行 `pnpm add dsh-plugin-wallpaper-engine` 时，主包的八条
 * 精确依赖只要有一条在 registry 上找不到，安装就在**用户机器上**以
 * `ERR_PNPM_FETCH_404 … This error happened while installing the dependencies of
 * dsh-plugin-wallpaper-engine@<v>` 失败并整体回滚 —— 这是"只拿到母包、其他包都找不到"的唯一形态，
 * 而主包与全部子包的对应关系此前只写在 README/CONTRIBUTING 的散文里。
 *
 * 判据全部作用在同一个 `collect(release)` 上（负对照喂变异过的 release 模型，同一条判据重跑）：
 *   ① 发布集 = 主包 + 仓库里每个子包各一个 tarball，名字与版本与源码清单逐字相等；
 *   ② 主包 tarball 里 `dependencies` 的全部子包值 = 子包真实版本，且**不带范围前缀**；
 *   ③ 主包 tarball 不带开发面目录（`packages/` `src/` `test/` `scripts/` `docs/`）；
 *   ④ 每个子包 tarball 都有 `lib/index.js`、`cordis.patch.yml`，声明 `dsh.client` 的还必须有
 *      `exports['./client']` 指向的那个文件。
 *
 * Usage:  node test/verify-release-set.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { collectSubpackages } from '../scripts/dev-link-subpackages.mjs';
import { packRelease, releaseSetMatches } from '../scripts/pack-release.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) console.log('  ✓ ' + name + (detail ? ' — ' + detail : ''));
  else { console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); failed++; }
};
const section = (title) => console.log('\n' + title);

/** 解一个 npm tarball：返回 `path → Buffer`（只读头，不依赖 tar 工具）。 */
function readTarball(file) {
  const raw = gunzipSync(readFileSync(file));
  const entries = new Map();
  for (let offset = 0; offset + 512 <= raw.length;) {
    const header = raw.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0[\s\S]*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0[\s\S]*$/, '');
    const sizeText = header.subarray(124, 136).toString('utf8').replace(/\0[\s\S]*$/, '').trim();
    const size = sizeText ? parseInt(sizeText, 8) : 0;
    const path = prefix ? prefix + '/' + name : name;
    if (!path.endsWith('/')) entries.set(path, raw.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

const entryOf = (target) => 'package/' + String(target).replace(/^\.\//, '');

/** 判据本身：`release` = { packages, files, manifests }，返回违规说明数组（空 = 通过）。 */
function violations(release) {
  const problems = [];
  const main = release.packages.at(-1);
  const children = release.packages.slice(0, -1);
  const mainManifest = release.manifests.get(main.file);
  const expected = release.expected;
  if (release.packages.length !== expected.length) {
    problems.push('发布集应含 ' + expected.length + ' 个包，实际 ' + release.packages.length);
  }
  for (const want of expected) {
    const got = release.packages.find((pkg) => pkg.name === want.name);
    if (!got) problems.push('发布集缺少 ' + want.name);
    else if (got.version !== want.version) problems.push(want.name + ' 版本 ' + got.version + ' ≠ 源码 ' + want.version);
  }
  const declared = mainManifest?.dependencies ?? {};
  for (const child of children) {
    const value = declared[child.name];
    if (value === undefined) problems.push('主包清单缺少运行依赖 ' + child.name);
    else if (value !== child.version) problems.push(child.name + ' 声明为 ' + value + '，应为精确 ' + child.version);
  }
  const extra = Object.keys(declared).filter((name) => !children.some((child) => child.name === name)
    && name !== 'webwallgl' && name !== 'x11');
  if (extra.length) problems.push('主包清单多出未在发布集里的运行依赖: ' + extra.join(', '));
  if (mainManifest?.devDependencies !== undefined) problems.push('主包清单仍带 devDependencies');
  if (mainManifest?.scripts !== undefined) problems.push('主包清单仍带 scripts（安装期会跑仓库脚本）');
  const mainEntries = release.files.get(main.file) ?? new Map();
  for (const needed of ['package.json', 'lib/index.js', 'lib/subpackage-boot.js', 'cordis.patch.yml']) {
    if (!mainEntries.has('package/' + needed)) problems.push('主包 tarball 缺少 ' + needed);
  }
  for (const dir of ['packages/', 'src/', 'test/', 'scripts/', 'docs/', 'node_modules/']) {
    const leaked = [...mainEntries.keys()].filter((path) => path.startsWith('package/' + dir));
    if (leaked.length) problems.push('主包 tarball 混入开发面目录 ' + dir + '（' + leaked.length + ' 个文件）');
  }
  for (const child of children) {
    const manifest = release.manifests.get(child.file);
    const entries = release.files.get(child.file) ?? new Map();
    if (manifest?.dependencies && Object.keys(manifest.dependencies).length) {
      problems.push(child.name + ' 不应声明运行依赖: ' + Object.keys(manifest.dependencies).join(', '));
    }
    for (const needed of ['package.json', 'lib/index.js', 'cordis.patch.yml']) {
      if (!entries.has('package/' + needed)) problems.push(child.name + ' 的 tarball 缺少 ' + needed);
    }
    const clientEntry = manifest?.exports?.['./client'];
    if (manifest?.dsh?.client !== undefined) {
      if (typeof clientEntry !== 'string') problems.push(child.name + ' 声明了 dsh.client 却没有 exports["./client"]');
      else if (!entries.has(entryOf(clientEntry))) problems.push(child.name + ' 缺客户端入口 ' + entryOf(clientEntry));
    } else if (typeof clientEntry === 'string' && !entries.has(entryOf(clientEntry))) {
      problems.push(child.name + ' 的 exports["./client"] 指向不存在的文件 ' + entryOf(clientEntry));
    }
  }
  return problems;
}

/** 从真发布集读出一个完整的 release 模型（主包清单 + 每个 tarball 的条目表 + 期待清单）。 */
function collect(release, expected) {
  const files = new Map();
  const manifests = new Map();
  for (const pkg of release.packages) {
    const entries = readTarball(join(release.dir, pkg.file));
    files.set(pkg.file, entries);
    const manifest = entries.get('package/package.json');
    if (manifest) manifests.set(pkg.file, JSON.parse(manifest.toString('utf8')));
  }
  return { packages: release.packages, files, manifests, expected };
}

function mutate(model, change) {
  const copy = { ...model, packages: model.packages.map((pkg) => ({ ...pkg })),
    files: new Map(model.files), manifests: new Map(model.manifests) };
  change(copy);
  return copy;
}

section('发布集（packRelease 真打一次包）');
const mainManifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const subs = collectSubpackages(ROOT);
const expected = [...subs.map((pkg) => ({ name: pkg.name, version: JSON.parse(readFileSync(pkg.manifest, 'utf8')).version })),
  { name: mainManifest.name, version: mainManifest.version }];
const release = packRelease();
check('tarball 数量 = 主包 + 子包', release.packages.length === expected.length,
  release.packages.length + ' 个，目录 ' + release.dir);
check('releaseSetMatches 通过', releaseSetMatches(release.packages, { main: mainManifest, subs }) === true);
check('publishOrder 先把全部子包、最后主包',
  release.packages.at(-1).name === mainManifest.name
  && release.packages.slice(0, -1).every((pkg) => pkg.name.startsWith(mainManifest.name + '-')));

section('发布集字节（判据与五条负对照共用 violations()）');
const model = collect(release, expected);
const real = violations(model);
check('真发布集无违规', real.length === 0, real.join('; ') || '0 条');

const negatives = [
  ['主包少声明一个子包', (m) => {
    const mainFile = m.packages.at(-1).file;
    const manifest = JSON.parse(JSON.stringify(m.manifests.get(mainFile)));
    delete manifest.dependencies[m.packages[0].name];
    m.manifests.set(mainFile, manifest);
  }],
  ['子包版本写成范围', (m) => {
    const mainFile = m.packages.at(-1).file;
    const manifest = JSON.parse(JSON.stringify(m.manifests.get(mainFile)));
    manifest.dependencies[m.packages[0].name] = '^' + m.packages[0].version;
    m.manifests.set(mainFile, manifest);
  }],
  ['子包 tarball 缺客户端入口', (m) => {
    const child = m.packages.find((pkg) => m.manifests.get(pkg.file)?.dsh?.client);
    const entries = new Map(m.files.get(child.file));
    const target = entryOf(m.manifests.get(child.file).exports['./client']);
    entries.delete(target);
    m.files.set(child.file, entries);
  }],
  ['主包 tarball 混入 packages/', (m) => {
    const mainFile = m.packages.at(-1).file;
    const entries = new Map(m.files.get(mainFile));
    entries.set('package/packages/fx/package.json', Buffer.from('{}'));
    m.files.set(mainFile, entries);
  }],
  ['发布集少一个 tarball', (m) => { m.packages = m.packages.slice(0, -1); }],
];
for (const [label, change] of negatives) {
  const found = violations(mutate(model, change));
  check('负对照判红：' + label, found.length > 0, found.join('; '));
}

console.log('\n' + (failed ? 'FAIL ' + failed + ' 条' : 'PASS 发布集字节自洽'));
process.exitCode = failed ? 1 : 0;
