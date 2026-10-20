import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyImpl } from '../packages/pet-link/lib/index.js';
import { httpView } from '../lib/subpackage-boot.js';
import { clientEntryFixture } from './tools/official-performer.mjs';

const root = new URL('../', import.meta.url);
const built = readFileSync(new URL('packages/pet-link/lib/client.pet-link.js', root), 'utf8');
assert.doesNotMatch(built, /\n\s*exports\.apply = \(\) => undefined;/, '构建不得覆盖官方桥接的 apply');
const manifest = JSON.parse(readFileSync(new URL('packages/pet-link/package.json', root), 'utf8'));
assert.deepEqual(manifest.dsh.client.inject, ['@deepseek-ai/dsh-client-runtime'], '包依赖仍由客户端清单声明');
const { plugin: clientEntry, bridge, listeners } = clientEntryFixture(built);
assert.deepEqual(clientEntry.inject, [], '包名不是 Cordis 服务；可选官方服务不得阻塞客户端激活');
const services = new Map(), cleanups = [];
const page = {
  get(name) { return services.get(name); },
  provide(name, value) { services.set(name, value); },
  effect(setup) { cleanups.push(setup()); },
};
clientEntry.apply(page);
try {
  assert.equal(await bridge.warmup(), false, '未安装官方 pet 时客户端仍激活并正常降级');
  page.provide('petApi7340', { pose: () => ({ x: 0.4, y: 0.6, facing: 'left' }), progress: () => null });
  assert.equal(await bridge.warmup(), true, '激活后仍能读取同页后到的官方服务');
  assert.equal(listeners.size, 1, '调参入口只安装一次');
} finally { for (const cleanup of cleanups.reverse()) cleanup(); }
assert.equal(listeners.size, 0, '卸载后清理客户端监听器');
const routes = new Map();
const dispose = applyImpl({ webServer: { port: 7341, register(route) {
  routes.set(route.path, route); return () => routes.delete(route.path);
} } }, {}, { base: '/wallpaper-engine', http: httpView });
try {
  assert.ok(routes.has('/wallpaper-engine/pet-link/official'), '默认联动必须直接注册官方控制，不再留内置或预览开关');
  assert.ok(!routes.has('/wallpaper-engine/pet-link/capability'), '不再签发内置资格');
} finally { dispose(); }
assert.equal(routes.size, 0, '正式路由退出后全部归还');

const source = readFileSync(new URL('packages/pet-link/src/official-pet.js', root), 'utf8')
  + '\n' + readFileSync(new URL('packages/pet-link/src/pet-link.js', root), 'utf8');
const create = new Function(source + ';return createOfficialPetPerformer;')();
const calls = [];
let clock = 0, serial = 0, playback = null, serviceOn = true;
const nodes = [];
const document = { createElement() { return { style: {}, setAttribute() {}, appendChild() {}, remove() {} }; },
  body: { appendChild(node) { nodes.push(node); } } };
const service = { pose: () => ({ x: 0.4, y: 0.6, facing: 'left' }), progress() {
  return playback && { ...playback, currentTime: (clock - playback.at) / 1000, duration: 0.15, paused: false, buffering: false };
} };
const sidebar = { open() { calls.push('open'); return true; }, close() { return true; },
  toggle() { calls.push('toggle'); return true; }, beginPull() { calls.push('pull'); },
  edgeX: () => 700, isOpen: () => false, commit() { calls.push('commit'); } };
const api = create({ getContext: () => ({ get: () => serviceOn ? service : null }),
  document, viewport: () => ({ width: 1000, height: 800 }), storage: null,
  now: () => clock, wait: async ms => { clock += Math.max(40, ms); },
  requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {},
  fetchTargets: async () => ({ ok: true, pets: [{ id: 'main', size: 180, display: 'web' }, { id: 'second', size: 120, display: 'web' }] }),
  request: async input => {
    calls.push(input);
    if (input.op === 'start') return { ok: true, petId: input.petId, pageId: input.pageId, runId: 'run-' + ++serial };
    if (input.action?.kind === 'anim') {
      playback = { playbackId: 'play-' + ++serial, at: clock };
      return { ok: true, playbackId: playback.playbackId };
    }
    return { ok: true };
  }, bubbleUrl: index => '/m' + index + '.png', fallback: () => sidebar.toggle() });
api.mascot.registerSidebar(sidebar);
assert.equal(await api.warmup(), true);
for (const logic of ['sidebar', 'mascot', 'egg1', 'egg2']) {
  const result = await api.tuner.run(logic);
  assert.equal(result.phase, 'done', logic + ' 必须经过正式官方排播完成');
  assert.ok(calls.some(call => call.op === 'command' && call.action.kind === 'anim'));
  assert.equal(api.mascot.snapshot().busy, false);
}
assert.ok(calls.some(call => call.op === 'command' && call.action.kind === 'position'), '走位必须下发官方位置指令');
assert.ok(calls.some(call => call.op === 'command' && call.action.kind === 'throw'), '弹飞必须下发官方抛掷');
assert.ok(calls.every(call => typeof call !== 'object' || !['broadcast', 'bubble/clear'].includes(call.op)), '不接管官方气泡');
assert.equal(api.tuner.setTarget('second'), true);
await api.tuner.run('egg2');
assert.equal(calls.filter(call => call.op === 'start').at(-1).petId, 'second', '选择按 petId 生效，不猜 DOM 顺序');
assert.equal(api.tuner.setTarget('missing'), true);
assert.equal((await api.mascot.tap()).logic, 'disabled', '目标缺失不能回退到另一只宠物');
assert.equal(calls.at(-1), 'toggle', '无目标仍能原样操作壁纸侧栏');
serviceOn = false;
assert.equal(await api.warmup(), false);
api.dispose();
console.log('PASS 正式官方桥接：默认路由、四排播、原生位置/抛掷、目标选择、缺席回退、退出');
