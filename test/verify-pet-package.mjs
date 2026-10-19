import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('packages/pet-link/package.json', root), 'utf8'));
assert.equal(pkg.name, 'dsh-plugin-wallpaper-engine-pet-link');
assert.ok(!Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }).includes('dsh-pet'));
for (const path of ['lib/index.js', 'lib/routes/pet-link.js', 'lib/prepared.js', 'tools/install-bridge.mjs', 'tools/patch-data/dsh-pet-0.3.6-index.txt', 'tools/patch-data/LICENSE.dsh-pet', 'src/pet-link.js', 'src/pet-link-tuner.js']) {
  assert.ok(existsSync(new URL('packages/pet-link/' + path, root)), path);
}
const mod = await import('../packages/pet-link/lib/index.js');
assert.deepEqual(mod.inject, ['webServer', 'wallpaperEngineHost']);
const routes = new Map(); let cleanup;
const { createSubpackageHost } = await import('../lib/subpackage-boot.js');
const off = mod.apply({ wallpaperEngineHost: createSubpackageHost(), webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } }, effect(fn) { cleanup = fn(); } }, { linkEnabled: false });
assert.equal(routes.size, 1);
let body;
routes.values().next().value.handler({ method: 'GET' }, { setHeader() {}, end(value) { body = JSON.parse(value); } });
assert.equal(body.available, false);
assert.equal(body.linkEnabled, false);
off(); cleanup(); assert.equal(routes.size, 0);
const side = readFileSync(new URL('src/sidebar-right.js', root), 'utf8');
const sideEnd = side.indexOf('// 定时器一律走 window.');
const drawerCalls = [];
const native = new Function('drawer', side.slice(0, sideEnd) + ';ropeDrawerControl=drawer;return [wallSidebarOpen(),wallSidebarClose(),wallSidebarToggle()];')({
  open() { drawerCalls.push('open'); }, close() { drawerCalls.push('close'); }, toggle() { drawerCalls.push('toggle'); },
});
assert.deepEqual(native, [true, true, true], '无桌宠时必须保留上游抽屉回退');
assert.deepEqual(drawerCalls, ['open', 'close', 'toggle']);
console.log('PASS 完整子包可独立加载、无dsh-pet硬依赖、禁用回退及幂等卸载');

const cache = new URL('.test-cache/', root);
mkdirSync(cache, { recursive: true });
const cleanCwd = mkdtempSync(fileURLToPath(new URL('pet-clean-', cache)));
assert.equal(existsSync(join(cleanCwd, '.artifacts')), false, '新目录不得预建产物目录');
const hostTest = spawnSync(process.execPath, [fileURLToPath(new URL('test/verify-pet-hotplug-host.mjs', root))], {
  cwd: cleanCwd, stdio: 'inherit',
});
assert.ifError(hostTest.error);
assert.equal(hostTest.status, 0, '热插拔宿主测试必须在无产物目录的干净环境独立通过');
console.log('PASS 干净工作目录无需预存.artifacts即可运行宿主测试');

// ── compatibility.js 公开 API 的行为断言（GUARD-MAP 真实覆盖，revision4 验收 7）────────
// 该模块是安装兼容层的唯一版本判据与补丁摘要来源：断言的是**行为**（拒绝形态、下界语义、
// 摘要公式、防篡改），不是"文件存在"。sha() 是模块私有 ⇒ 期望值按同一公式在测试内独立重算。
const compat = await import('../packages/pet-link/lib/compatibility.js');

// 版本判据：只接受 >=0.3.6 的稳定 SemVer，构建元数据不参与排序。
assert.equal(compat.MIN_PET_VERSION, '0.3.6', 'MIN_PET_VERSION 下界常量');
assert.equal(compat.isSupportedPetVersion('0.3.6'), true, '下界本身（0.3.6）必须被接受');
assert.equal(compat.isSupportedPetVersion('0.3.7'), true, '下界之上的稳定版本被接受');
assert.equal(compat.isSupportedPetVersion('1.0.0'), true, '更高 major 稳定版本被接受（无版本上限）');
assert.equal(compat.isSupportedPetVersion('0.3.6+build.7'), true, '构建元数据不影响接受判定');
assert.equal(compat.isSupportedPetVersion('0.3.5'), false, '下界之下拒绝');
assert.equal(compat.isSupportedPetVersion('0.4.0-rc.1'), false, '预发行（-rc.1）一律拒绝');
assert.equal(compat.isSupportedPetVersion('0.3.6-dev'), false, '预发行（-dev）一律拒绝');
assert.equal(compat.isSupportedPetVersion('v0.3.6'), false, '非 SemVer 前缀（v 前缀）拒绝');
assert.equal(compat.isSupportedPetVersion('01.3.6'), false, 'SemVer 禁止前导零');
assert.equal(compat.isSupportedPetVersion('0.3'), false, '两段版本拒绝');
assert.equal(compat.isSupportedPetVersion(''), false, '空串拒绝');
assert.equal(compat.isSupportedPetVersion(null), false, 'null 拒绝（不抛）');
assert.equal(compat.isSupportedPetVersion(0.36), false, '数字输入拒绝');
assert.equal(compat.isSupportedPetVersion('0.3.6'.repeat(50)), false, '超长输入（>128 字符）拒绝');
assert.throws(() => compat.assertPetVersion('0.3.5'), /需要 >=0\.3\.6/, 'assertPetVersion 对不支持版本抛出');
assert.doesNotThrow(() => compat.assertPetVersion('0.3.6'), 'assertPetVersion 对受支持版本不抛');

// 补丁摘要：seal 追加「来源 + kind 标记 + sha256(来源)」；期望值独立重算，不引模块内部。
const sealSha = (source) => createHash('sha256').update(source).digest('hex');
const sample = 'module.exports = { wallpaper: true };\n';
for (const kind of ['index', 'sidebar', 'tuner']) {
  const sealed = compat.sealPetPatch(sample, kind);
  assert.ok(sealed.startsWith(sample), 'sealPetPatch 保留原始来源原文');
  assert.equal(
    sealed,
    sample + '\n// pet-link-' + kind + '-v1 sha256:' + sealSha(sample) + '\n',
    'sealPetPatch(' + kind + ') 摘要公式：source + 换行 + kind 标记 + sha256(source)',
  );
}
// hasSealed：未盖章 ⇒ false；盖章正确 ⇒ true（幂等可重复安装）；
// kind 不匹配 ⇒ false（前缀按 kind 拼接找不到，不算盖章也不误报）；
// 章存在但内容被篡改 ⇒ throw 不放行。
assert.equal(compat.hasSealedPetPatch(sample, 'index'), false, '未盖章来源 ⇒ false（不抛）');
assert.equal(compat.hasSealedPetPatch(compat.sealPetPatch(sample, 'index'), 'index'), true, '正确盖章 ⇒ true');
assert.equal(
  compat.hasSealedPetPatch(compat.sealPetPatch(sample, 'index'), 'sidebar'),
  false,
  'kind 不匹配（对 sidebar 判 index 章）⇒ false（前缀按 kind 拼接，找不到不算盖章）',
);
const tampered = compat.sealPetPatch(sample, 'index').replace('wallpaper: true', 'wallpaper: false');
assert.throws(
  () => compat.hasSealedPetPatch(tampered, 'index'),
  /摘要不匹配/,
  '盖章后正文被篡改 ⇒ throw（本地完整性判据，保留现有代码）',
);
console.log('PASS compatibility 版本下界/预发行拒绝/补丁摘要与篡改防护');
