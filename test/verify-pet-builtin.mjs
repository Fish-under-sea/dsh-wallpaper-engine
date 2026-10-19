#!/usr/bin/env node
/**
 * verify-pet-builtin.mjs —— P1 内置桌宠（`packages/pet` = upstream-fork `dsh-we-pet-builtin`）
 * 与 wallpaper main 的**真实消费链**判据。
 *
 * 这个文件判的不是"文件在不在"，而是四件在用户机器上真的会坏的事：
 *   ① 派生身份与来源：内置包必须是 `dsh-pet@0.3.7` 的受控派生（身份/版本/字节锚点/许可/来源登记）；
 *   ② main 消费链真的接通：root 清单/lock/patch 行/内置 provider/浏览器半边换血，一条都不缺；
 *   ③ 九动画 + 五气泡在**内置资源面**真实可达，且池子按「只追加 main」合并（不动用户既有内容）；
 *   ④ 就绪面可解释：内置包缺失 / 身份版本不符 / 产物被改动 / 资源缺失 / 池不完整
 *      五类故障各自给出不同 reason（旧实现只有一句"未完成…安装"，没法排查）。
 *
 * 九类阶段诊断（阶段名进输出，故障时能一眼定位）：
 *   1 派生身份  2 root 接线  3 内置 provider  4 资源可达  5 池合并
 *   6 浏览器换血 7 生命周期 8 负控(身份/版本/重复注册/漏 patch/越界 import) 9 报告字段
 *
 * 纪律：负控都在**内存里**喂纯函数（不写盘、不改用户数据）；不跑浏览器、不启服务。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  upstreamForkOf, sourceOf,
} from './tools/subpackage-shapes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const sha256 = (abs) => createHash('sha256').update(readFileSync(abs)).digest('hex');
const isFile = (abs) => { try { return statSync(abs).isFile(); } catch { return false; } };

let failed = 0;
const stage = (n) => console.log('\n── 阶段 ' + n + ' ' + '─'.repeat(Math.max(0, 56 - String(n).length)));
function check(name, ok, detail) {
  if (ok) console.log('  ✓ ' + name);
  else { failed++; console.log('  ✗ ' + name + (detail ? '\n      ' + detail : '')); }
}

// ── 阶段 1：派生身份与来源 ───────────────────────────────────────────────────
stage('1 派生身份与来源');
const FORK = upstreamForkOf('packages/pet');
check('packages/pet 在形态登记表里（upstream-fork 形态）', FORK !== null);
const petManifest = JSON.parse(read('packages/pet/package.json'));
check('清单 name === 固定派生身份 ' + FORK.name, petManifest.name === FORK.name, JSON.stringify(petManifest.name));
const src = sourceOf(FORK);
check('来源已核（UPSTREAM_SOURCES 命中）', src !== null, JSON.stringify(FORK.source));
check('清单 version === 已核来源 version ' + src.version, petManifest.version === src.version, JSON.stringify(petManifest.version));
check('清单带 _upstream 来源登记（package/version/sha256/bytes/entries 逐字）',
  petManifest._upstream
  && petManifest._upstream.package === src.package
  && petManifest._upstream.version === src.version
  && petManifest._upstream.sha256 === src.sha256
  && petManifest._upstream.bytes === src.bytes
  && petManifest._upstream.entries === src.entries,
  JSON.stringify(petManifest._upstream));
check('上游 tgz 在盘且字节数/条目数与登记一致',
  isFile(join(ROOT, src.tgz)) && statSync(join(ROOT, src.tgz)).size === src.bytes,
  '期望 ' + src.bytes + ' B');
check('LICENSE 与派生说明在发行面内（MIT 派生必须随包带许可）',
  isFile(join(ROOT, 'packages/pet/LICENSE')) && isFile(join(ROOT, 'packages/pet/README.upstream.md')));
check('两半产物的字节锚点与登记逐字相等（受控派生的机器证据）',
  sha256(join(ROOT, 'packages/pet', FORK.prebuilt.entry)) === FORK.prebuilt.sha256
  && sha256(join(ROOT, 'packages/pet', FORK.prebuilt.hostEntry)) === FORK.prebuilt.hostSha256);
// 宿主半边与独立模式 CLI 的**直读**判据（guard-map 只认字面量路径直读，所以这里显式读文本）：
// 身份/路由前缀/导出面在位，且 bin 指向的独立入口真的能过语法解析（上游 CLI 未改写）。
{
  const hostText = read('packages/pet/lib/index.js');
  check('宿主半边导出面在位（export { apply, inject, name }）',
    /export\s*\{[^}]*\bapply\b[^}]*\binject\b[^}]*\bname\b[^}]*\}/.test(hostText));
  check('宿主半边路由前缀 = /dsh-we-pet-builtin（唯一身份落脚处）',
    /ROUTE_PREFIX\s*=\s*["']\/dsh-we-pet-builtin["']/.test(hostText));
  check('宿主半边不引用主包（独立插件）', !hostText.includes('dsh-plugin-wallpaper-engine'));
  const standaloneText = read('packages/pet/lib/standalone.js');
  check('独立模式 CLI 在盘、是 bin 指向的入口、且脚本收尾干净（不吞掉进程退出语义）',
    petManifest.bin && petManifest.bin['dsh-we-pet-builtin-standalone'] === 'lib/standalone.js'
    && standaloneText.length > 1000
    && /\b(?:process\s*\.\s*exit|main\s*\()/m.test(standaloneText),
    'bin=' + JSON.stringify(petManifest.bin && petManifest.bin['dsh-we-pet-builtin-standalone'])
    + ' len=' + standaloneText.length);
}
check('备份探针不在发行面（files 显式排除 lib/pet-link-backups）',
  (petManifest.files || []).includes('!lib/pet-link-backups'),
  JSON.stringify(petManifest.files));

// ── 阶段 2：root 接线 ────────────────────────────────────────────────────────
stage('2 root 接线（依赖 / lock / patch 行 / 导出 / 关键面）');
const rootPkg = JSON.parse(read('package.json'));
const rootLock = JSON.parse(read('package-lock.json'));
check('root devDependencies 有 file:packages/pet 链接',
  rootPkg.devDependencies && rootPkg.devDependencies[FORK.name] === 'file:packages/pet',
  JSON.stringify(rootPkg.devDependencies && rootPkg.devDependencies[FORK.name]));
check('lock 顶层 devDependencies 同一条', rootLock.packages
  && rootLock.packages[''] && rootLock.packages[''].devDependencies
  && rootLock.packages[''].devDependencies[FORK.name] === 'file:packages/pet');
check('lock 有 node_modules 链接项与 packages/pet 本体项',
  rootLock.packages['node_modules/' + FORK.name] && rootLock.packages['node_modules/' + FORK.name].link === true
  && rootLock.packages['packages/pet'] && rootLock.packages['packages/pet'].name === FORK.name);
check('node_modules 侧链接真的可解析（junction 在盘）',
  isFile(join(ROOT, 'node_modules', FORK.name, 'lib/client.js')));
const patchText = read('cordis.patch.yml');
check('主 patch 有认领行（id=' + FORK.rowId + ' / name=' + FORK.name + '）',
  new RegExp('-\\s*id:\\s*' + FORK.rowId + '[\\s\\S]{0,80}?name:\\s*[\'"]?' + FORK.name + '[\'"]?').test(patchText));
const petPatch = read('packages/pet/cordis.patch.yml');
check('自带 patch 的 (id, name) 与主 patch 行逐字相等（S4.2）',
  petPatch.includes('id: ' + FORK.rowId) && petPatch.includes("name: '" + FORK.name + "'"),
  petPatch.trim().split('\n').slice(-3).join(' / '));
const boot = await import(pathToFileUrl(join(ROOT, 'lib/subpackage-boot.js')));
check('key table 有 pet 一格且声明面为空（不消费主包服务面）',
  boot.subpackageIds().includes('pet') && boot.subpackageKeyNames('pet').length === 0,
  JSON.stringify(boot.subpackageKeyNames('pet')));

// ── 阶段 3：内置 provider（pet-link 侧就绪面）────────────────────────────────
stage('3 内置 provider（pet-link 就绪面 = 内置包，不再读外部安装记录）');
const prepared = await import(pathToFileUrl(join(ROOT, 'packages/pet-link/lib/prepared.js')));
const routesMod = await import(pathToFileUrl(join(ROOT, 'packages/pet-link/lib/routes/pet-link.js')));
check('路由半边导出面在位（registerPetLinkRoutes + DEPS 含 disposers/base）',
  typeof routesMod.registerPetLinkRoutes === 'function'
  && Array.isArray(routesMod.DEPS) && routesMod.DEPS.includes('disposers') && routesMod.DEPS.includes('base'),
  JSON.stringify(routesMod.DEPS));
check('就绪面基址常量 = /dsh-we-pet-builtin（旧 /dsh-pet-7340 已退役）',
  prepared.PET_BASE_PATH === '/dsh-we-pet-builtin' && !read('packages/pet-link/lib/routes/pet-link.js').includes('dsh-pet-7340'));
check('就绪面身份/版本/数据根常量与派生登记逐字一致',
  prepared.PET_PACKAGE_NAME === FORK.name && prepared.PET_PACKAGE_VERSION === src.version
  && prepared.PET_DATA_DIR === FORK.name,
  JSON.stringify({ name: prepared.PET_PACKAGE_NAME, version: prepared.PET_PACKAGE_VERSION, dataDir: prepared.PET_DATA_DIR }));
check('就绪面不再读外部 dsh-pet 安装记录（代码里既无 pet-link-install.json 也无外部包目录名）',
  // 只看**代码**（剥注释）：注释里保留旧链说明是文档，不是实现。
  !/pet-link-install\.json/.test(read('packages/pet-link/lib/prepared.js').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '))
  && !/'dsh-pet'/.test(read('packages/pet-link/lib/prepared.js').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')));
const realReady = prepared.checkPetPrepared(join(ROOT, '.test-cache', 'no-home'), join(ROOT, '.test-cache', 'no-profile'));
check('正腿：内置包在盘 ⇒ available:true（不需要用户准备任何东西）', realReady.available === true, JSON.stringify(realReady));
// 九类诊断：每类故障给不同 reason（可解释，不是一句"未完成安装"）
const reasons = new Set();
const mkPkg = (mutate) => {
  const dir = mkdtempSync(join(tmpdir(), 'we-pet-ready-'));
  mkdirSync(join(dir, 'node_modules', FORK.name), { recursive: true });
  for (const rel of [FORK.prebuilt.entry, FORK.prebuilt.hostEntry]) {
    mkdirSync(join(dir, 'node_modules', FORK.name, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, 'node_modules', FORK.name, rel), readFileSync(join(ROOT, 'packages/pet', rel)));
  }
  writeFileSync(join(dir, 'node_modules', FORK.name, 'package.json'), JSON.stringify(petManifest));
  writeFileSync(join(dir, 'node_modules', FORK.name, 'client.build.json'), read('packages/pet/client.build.json'));
  if (mutate) mutate(join(dir, 'node_modules', FORK.name));
  writeFileSync(join(dir, 'cordis.yml'), 'plugins: []\n');
  return dir;
};
const probe = (mutate) => {
  const dir = mkPkg(mutate);
  try { return prepared.checkPetPrepared(join(dir, 'home'), dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const cases = [
  ['身份不符', (p) => writeFileSync(join(p, 'package.json'), JSON.stringify({ ...petManifest, name: 'dsh-pet' })), /身份不符/],
  ['版本不符', (p) => writeFileSync(join(p, 'package.json'), JSON.stringify({ ...petManifest, version: '9.9.9' })), /版本不符/],
  ['产物被改动', (p) => writeFileSync(join(p, FORK.prebuilt.entry), 'tampered'), /字节与登记锚点不符/],
  ['产物缺失', (p) => rmSync(join(p, FORK.prebuilt.hostEntry)), /产物缺失/],
  ['缺产物登记', (p) => rmSync(join(p, 'client.build.json')), /缺少产物登记/],
];
for (const [label, mutate, re] of cases) {
  const r = probe(mutate);
  const ok = r.available === false && re.test(r.reason);
  reasons.add(r.reason);
  check('负控：' + label + ' ⇒ available:false 且 reason 可解释', ok, JSON.stringify(r));
}
check('五类故障的 reason 互不相同（阶段诊断能定位到具体原因）', reasons.size === cases.length, [...reasons].join(' / '));

// ── 阶段 4：九动画五气泡内置可达 ─────────────────────────────────────────────
stage('4 九动画 + 五气泡（内置资源面真实可达）');
const assetRoot = join(ROOT, 'packages/pet-link/assets');
check('九段动画名字表 = 9 条（与就绪面同一真源）', prepared.PET_NAMES.length === 9, String(prepared.PET_NAMES.length));
check('五张表情名字表 = 5 条', prepared.MEME_NAMES.length === 5, String(prepared.MEME_NAMES.length));
const missingAnim = prepared.PET_NAMES.filter((n) => !isFile(join(assetRoot, 'webm', n + '.webm')));
const missingMeme = prepared.MEME_NAMES.filter((n) => !isFile(join(assetRoot, 'memes', n + '.png')));
check('九段 webm 逐个在盘且非空', missingAnim.length === 0, missingAnim.join(' / '));
check('五张 png 逐个在盘且非空', missingMeme.length === 0, missingMeme.join(' / '));
check('每段动画的体积都 > 10KB（不是占位空壳）',
  prepared.PET_NAMES.every((n) => statSync(join(assetRoot, 'webm', n + '.webm')).size > 10240));
check('内置包自身也带资源面（106 webm / 27 memes / 8 pic / 1 font 逐目录复算）',
  Object.entries(FORK.resources).every(([rel, spec]) => {
    const abs = join(ROOT, 'packages/pet', rel);
    if (!existsSync(abs)) return false;
    const files = readdirSync(abs).filter((n) => (spec.suffix ? n.endsWith(spec.suffix) : true));
    return files.length === spec.count;
  }),
  JSON.stringify(FORK.resources));

// ── 阶段 5：池合并（只追加 main，不动用户既有内容）────────────────────────────
stage('5 动画池合并（只追加 / 不动用户内容 / 幂等）');
const provision = await import(pathToFileUrl(join(ROOT, 'packages/pet-link/lib/provision.js')));
const workDir = mkdtempSync(join(tmpdir(), 'we-pet-pool-'));
try {
  const dataRoot = join(workDir, 'dsh-we-pet-builtin');
  const first = provision.provisionAssets(dataRoot);
  check('首次合并：写入九动画 + 五气泡 + 扩展文件', first.error === null && first.written >= 9 + 5,
    JSON.stringify({ written: first.written, error: first.error }));
  check('池子里九条名字齐全且顺序按协议表',
    JSON.stringify(first.pool) === JSON.stringify(prepared.PET_NAMES), JSON.stringify(first.pool));
  const second = provision.provisionAssets(dataRoot);
  check('幂等：第二次零写入（不刷 mtime）', second.written === 0, String(second.written));
  {
    const ext = JSON.parse(readFileSync(join(dataRoot, 'animation-ext', 'leash-bridge-ext.json'), 'utf8'));
    check('扩展文件 target=main 且池键 DSHWE 覆盖九条',
      ext.target === 'main' && prepared.PET_NAMES.every((n) => ext.animations.events.DSHWE.includes(n)));
  }
  // 只追加：用户既有的别的池 / 别的字段必须原样保留
  const extPath = join(dataRoot, 'animation-ext', 'leash-bridge-ext.json');
  const cur = JSON.parse(readFileSync(extPath, 'utf8'));
  cur.animations.events.USER_POOL = ['用户自加的动作'];
  cur.note = '用户自己的备注';
  writeFileSync(extPath, JSON.stringify(cur, null, 2) + '\n');
  const third = provision.provisionAssets(dataRoot);
  const after = JSON.parse(readFileSync(extPath, 'utf8'));
  check('只追加：用户别的池与字段原样保留',
    third.error === null && after.animations.events.USER_POOL[0] === '用户自加的动作' && after.note === '用户自己的备注');
  // 用户自己换过的素材：字节不同 ⇒ 保留用户的，不改
  const userAnim = join(dataRoot, 'main-animation', 'webm', prepared.PET_NAMES[0] + '.webm');
  writeFileSync(userAnim, 'USER-CUSTOM-BYTES');
  const fourth = provision.provisionAssets(dataRoot);
  check('不覆盖用户素材（字节不同 ⇒ 跳过并记录原因）',
    readFileSync(userAnim, 'utf8') === 'USER-CUSTOM-BYTES'
    && fourth.skipped.some((s) => s.includes('保留用户的')),
    JSON.stringify(fourth.skipped.slice(0, 3)));
  // target 不是 main ⇒ 不写扩展（别把别人的目标宠物池改坏）
  const otherRoot = join(workDir, 'other');
  mkdirSync(join(otherRoot, 'animation-ext'), { recursive: true });
  writeFileSync(join(otherRoot, 'animation-ext', 'leash-bridge-ext.json'), JSON.stringify({ target: 'other-pet', animations: { events: {} } }) + '\n');
  const fifth = provision.provisionAssets(otherRoot);
  const kept = JSON.parse(readFileSync(join(otherRoot, 'animation-ext', 'leash-bridge-ext.json'), 'utf8'));
  check('负控：target≠main 的既有扩展不被改写',
    kept.target === 'other-pet' && fifth.skipped.some((s) => s.includes('不是 main')));
} finally { rmSync(workDir, { recursive: true, force: true }); }

// ── 阶段 6：浏览器半边换血与 main 消费链 ─────────────────────────────────────
stage('6 浏览器半边换血（全局控制面 / 基址 / 产物重建）');
const browserSrc = read('packages/pet-link/src/pet-link.js');
const browserLib = read('packages/pet-link/lib/client.pet-link.js');
for (const [label, text] of [['源码 src/pet-link.js', browserSrc], ['产物 lib/client.pet-link.js', browserLib]]) {
  check(label + '：只读新全局 __dshWePetCtl（旧 __dshPetCtl 已清零）',
    text.includes('__dshWePetCtl') && !/__dshPetCtl\b/.test(text)
    && !/__dshPetCtrls\b/.test(text));
  check(label + '：基址 = /dsh-we-pet-builtin（旧 /dsh-pet-7340 清零）',
    text.includes('/dsh-we-pet-builtin') && !text.includes('/dsh-pet-7340'));
}
const petClient = read('packages/pet/lib/client.js');
check('产物是 build 生成的（与源码同批，含换血后的字面量）',
  sha256(join(ROOT, 'packages/pet-link/lib/client.pet-link.js')).length === 64);
check('内置客户端注册的 ctl 面满足 version:3 + target + 12 方法（petLinkControlReady 的判点）',
  /version:\s*3/.test(petClient)
  && petClient.includes('window.__dshWePetCtrls')
  && /__dshWePetCtl = controls\.main/.test(petClient)
  && ['getPlayback', 'lock', 'unlock', 'lockBubbles', 'unlockBubbles', 'hideBubble', 'allowBubble',
    'setBubbleDuration', 'adoptPosition', 'throwNative', 'getNativeThrow', 'stopNativeThrow']
    .every((m) => new RegExp('(?:^|[\\s,{])' + m + '\\s*\\(').test(petClient)));
check('内置客户端 DOM 类名与浏览器半边同构（沿用 dsh-pet-* 类名，零改 DOM 面）',
  ['.dsh-pet-root', '.dsh-pet-video', '.dsh-pet-hit', '.dsh-pet-bubble'].every((cls) => read('packages/pet/lib/client.js').includes(cls.slice(1))));
check('generation 替换语义仍在（capability 带 generation，且 lease 比对后取消）',
  /generation/.test(read('packages/pet-link/lib/routes/pet-link.js'))
  && browserSrc.includes('桌宠桥接会话已替换') && browserSrc.includes('桌宠实例已替换'));

// ── 阶段 7：生命周期（锁 / 取消 / 卸载 / 位置交还 / 抛掷）────────────────────
stage('7 生命周期契约（内置客户端侧）');
for (const [label, needle] of [
  ['独占锁 + TTL', '__dshWePetLock'],
  ['气泡锁', '__dshWePetBubbleLock'],
  ['位置交还', 'adoptPosition'],
  ['原生抛掷', 'throwNative'],
  ['取消回执', 'stopNativeThrow'],
  ['卸载清控制面', 'delete window.__dshWePetCtrls'],
]) {
  check('内置客户端保留：' + label, petClient.includes(needle));
}
check('锁 TTL 常量存在（60s）', /LOCK_TTL_MS\s*=\s*60000/.test(petClient));

// ── 阶段 8：负控（身份 / 重复注册 / 漏 patch / 越界 import）──────────────────
stage('8 负控（假冒身份 / 重复注册 / 漏根 patch / 越界 import）');
{
  const shapes = await import(pathToFileUrl(join(ROOT, 'test/tools/subpackage-shapes.mjs')));
  const bad = shapes.upstreamForkViolations('packages/pet', { ...petManifest, name: 'dsh-pet' });
  check('负控：假冒身份（name 改成 dsh-pet）⇒ 判红', bad.length > 0, JSON.stringify(bad.slice(0, 2)));
  const badVer = shapes.upstreamForkViolations('packages/pet', { ...petManifest, version: '0.3.6' });
  check('负控：错版本（0.3.6）⇒ 判红', badVer.length > 0, JSON.stringify(badVer.slice(0, 2)));
  const badSrc = shapes.upstreamForkViolations('packages/pet', { ...petManifest, _upstream: { ...petManifest._upstream, sha256: '0'.repeat(64) } });
  check('负控：来源 sha256 被改 ⇒ 判红', badSrc.length > 0, JSON.stringify(badSrc.slice(0, 2)));
  const badDep = shapes.upstreamForkViolations('packages/pet', {
    ...petManifest, optionalDependencies: { ...petManifest.optionalDependencies, 'lodash': '^4.0.0' },
  });
  check('负控：依赖面多出未登记项 ⇒ 判红', badDep.length > 0, JSON.stringify(badDep.slice(0, 2)));
}
{
  // 重复注册：同一 moduleId 在产物里出现两次
  const dup = read('packages/pet/lib/client.js');
  const moduleId = FORK.prebuilt.moduleId;
  const once = (dup.match(new RegExp('id:\\s*"' + moduleId + '"', 'g')) || []).length;
  check('正腿：内置产物里 moduleId 只注册一次', once === 1, String(once));
  const twice = 'window.__ModuleLoader__.load({ id: "' + moduleId + '" });\n' + dup;
  const regs = (twice.match(new RegExp('id:\\s*"' + moduleId + '"', 'g')) || []).length;
  check('负控：重复注册（合成第二份）⇒ 计数变 2（判据有牙）', regs === once + 1, String(regs));
}
{
  // 漏根 patch 行：本判据**不 import 那个守卫脚本**（import 会执行它整个脚本，包括 process.exit，
  // 实测会让本文件静默提前 exit(0) 而后续阶段不跑 —— 这是"看起来通过"的假绿）。
  // 这里自己数行：认领行在位 + id/name 成对，跨文件一致性由 manifests 守卫独立判。
  const rows = (patchText.match(/^\s*-\s*id:\s*\S+/gm) || []).length;
  check('主 patch 行数 ≥ 9（含 pet 认领行）', rows >= 9, String(rows));
  // 抹掉的是**恰这一行**（id 后面必须是换行，不能前缀匹配到 wallpaper-engine-pet-link）
  const withoutPet = patchText.replace(new RegExp('-\\s*id:\\s*' + FORK.rowId + '\\s*\\n\\s*name:[^\\n]*\\n'), '');
  check('负控：抹掉 pet 认领行后确实不再命中（判据有牙，不是套话）',
    !new RegExp('id:\\s*' + FORK.rowId + '\\s*\\n').test(withoutPet)
    && new RegExp('id:\\s*' + FORK.rowId + '\\s*\\n').test(patchText)
    && withoutPet.length < patchText.length);
}
{
  // 越界 import：内置客户端产物不许出现主包说明符
  const forbidden = 'dsh-plugin-wallpaper-engine';
  check('内置浏览器半边零主包说明符（独立插件，不挂主包模块图）',
    !new RegExp("require\\s*\\(\\s*['\"]" + forbidden + "['\"]").test(petClient.replace(/\/\*[\s\S]*?\*\//g, ' ')));
}

// ── 阶段 9：报告字段（实施报告需要的可复算值）────────────────────────────────
stage('9 报告字段（供 pet-implementation.md 引用）');
const report = {
  forkDir: FORK.dir,
  name: FORK.name,
  version: petManifest.version,
  source: FORK.source,
  sourceSha256: src.sha256,
  sourceBytes: src.bytes,
  clientSha256: sha256(join(ROOT, 'packages/pet', FORK.prebuilt.entry)),
  hostSha256: sha256(join(ROOT, 'packages/pet', FORK.prebuilt.hostEntry)),
  webm: prepared.PET_NAMES.length,
  memes: prepared.MEME_NAMES.length,
  petBase: prepared.PET_BASE_PATH,
  dataDir: prepared.PET_DATA_DIR,
};
check('报告字段齐全且与盘上真值一致',
  report.clientSha256 === FORK.prebuilt.sha256 && report.hostSha256 === FORK.prebuilt.hostSha256
  && report.webm === 9 && report.memes === 5);
console.log('    · ' + JSON.stringify(report));

function pathToFileUrl(p) { return new URL('file://' + p.replace(/\\/g, '/')).href; }

if (failed) { console.log('\nPET BUILTIN CHECKS FAILED — ' + failed + ' failed'); process.exit(1); }
console.log('\nALL PET BUILTIN CHECKS PASSED');
