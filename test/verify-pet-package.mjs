import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { apply } from '../packages/pet-link/lib/index.js';
import { createSubpackageHost } from '../lib/subpackage-boot.js';
const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('packages/pet-link/package.json', root), 'utf8'));
assert.equal(pkg.name, 'dsh-plugin-wallpaper-engine-pet-link');
assert.ok(!Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }).includes('dsh-pet'));
assert.equal(pkg.exports['./install'], undefined, '不再发布改写官方文件的安装入口');
assert.equal(existsSync(new URL('packages/pet/package.json', root)), false, '不携带内置副本');
for (const path of ['lib/index.js', 'lib/routes/official-pet.js', 'lib/official-provider.js',
  'lib/prepared.js', 'src/official-pet.js', 'src/pet-link.js', 'src/pet-link-tuner.js']) {
  assert.ok(existsSync(new URL('packages/pet-link/' + path, root)), path);
}
const routes = new Map(); let cleanup;
const off = apply({ wallpaperEngineHost: createSubpackageHost(),
  webServer: { port: 49123, register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } },
  effect(fn) { cleanup = fn(); } }, { linkEnabled: false });
try {
  assert.equal(routes.size, 2);
  let body;
  await routes.get('/wallpaper-engine/pet-link/official').handler({ method: 'GET' }, {
    setHeader() {}, end(value) { body = JSON.parse(value); },
  });
  assert.deepEqual(body, { ok: false, reason: 'bridge-disabled' });
} finally { off(); cleanup(); }
assert.equal(routes.size, 0);
const side = readFileSync(new URL('src/sidebar-right.js', root), 'utf8');
const sideEnd = side.indexOf('// 定时器一律走 window.');
const calls = [];
const native = new Function('drawer', side.slice(0, sideEnd) + ';ropeDrawerControl=drawer;return [wallSidebarOpen(),wallSidebarClose(),wallSidebarToggle()];')({
  open() { calls.push('open'); }, close() { calls.push('close'); }, toggle() { calls.push('toggle'); },
});
assert.deepEqual(native, [true, true, true]);
assert.deepEqual(calls, ['open', 'close', 'toggle']);
console.log('PASS 外置官方 pet：无硬依赖、无私有安装入口、禁用无请求、壁纸回退与卸载');
