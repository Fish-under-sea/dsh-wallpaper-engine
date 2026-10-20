import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { PET_NAMES } from '../../packages/pet-link/lib/prepared.js';
import { sendJson } from '../../lib/json-response.js';

export async function verifyOfficialPet({ createOfficialPetCoordinator, registerOfficialPetRoutes, clientSource }) {
  let time = 1000;
  let sequence = 0;
  const calls = [];
  const locks = new Map();
  let delayLock = null;
  let failedAction = null;
  let omitPlayback = false;
  const request = async (path, args) => {
    calls.push({ path, ...args });
    const petId = args.query?.pet;
    if (path === 'config') return { main: { pets: [
      { id: 'main', name: '主宠', display: 'both', size: 180 },
      { id: 'other.pet', display: 'web', size: 150 }, { id: 'hidden', display: 'none' },
    ] } };
    if (path === 'lock') {
      if (delayLock) await delayLock;
      const prior = locks.get(petId);
      if (prior && prior.expiresAt <= time) locks.delete(petId);
      const current = locks.get(petId);
      if (args.body.lockId && current?.lockId !== args.body.lockId) return { ok: false, reason: 'lock-lost' };
      if (!args.body.lockId && current) return { ok: false, reason: 'locked' };
      const lock = { ok: true, petId, lockId: current?.lockId || `lock-${++sequence}`, expiresAt: time + args.body.ttl };
      locks.set(petId, lock);
      return lock;
    }
    if (path === 'lock/release') {
      if (locks.get(petId)?.lockId === args.body.lockId) locks.delete(petId);
      return { ok: true };
    }
    if (locks.get(petId)?.lockId !== args.query.lock) return { ok: false, reason: 'lock-lost' };
    if (failedAction) return { ok: false, reason: failedAction };
    return path === 'anim' && !omitPlayback ? { ok: true, playbackId: `pb-${++sequence}` } : { ok: true };
  };
  const make = () => createOfficialPetCoordinator({ request, now: () => time,
    assetUrl: name => PET_NAMES.includes(name) ? `http://127.0.0.1:12345/a/${encodeURIComponent(name)}` : null });
  let ctl = make();
  assert.equal((await ctl.start({ petId: 'missing', pageId: 'a' })).reason, 'unknown-pet');
  assert.equal((await ctl.start({ petId: 'hidden', pageId: 'a' })).reason, 'pet-not-displayed');
  assert.equal(calls.filter(call => call.path === 'lock').length, 0, '探测不得取锁或播放');
  const [a, b] = await Promise.all([ctl.start({ petId: 'main', pageId: 'a' }), ctl.start({ petId: 'main', pageId: 'b' })]);
  assert.equal(a.ok, true); assert.equal(b.reason, 'busy');
  assert.equal('lockId' in a, false, '官方凭证不能交给页面');
  const other = await ctl.start({ petId: 'other.pet', pageId: 'b' });
  assert.equal(other.ok, true, '另一目标可并行');
  assert.equal((await ctl.command({ ...a, pageId: 'b', action: { kind: 'throw', angle: 0, power: 1 } })).reason, 'run-lost');
  const played = await ctl.command({ ...a, action: { kind: 'anim', name: PET_NAMES[0], facing: 'left' } });
  assert.ok(played.playbackId);
  const anim = calls.find(call => call.path === 'anim');
  assert.deepEqual(anim.query, { pet: 'main', surface: 'web', lock: locks.get('main').lockId });
  assert.equal(anim.body.facing, 'left');
  assert.ok(anim.body.url.includes(encodeURIComponent(PET_NAMES[0])));
  const before = calls.length;
  assert.equal((await ctl.command({ ...a, action: { kind: 'anim', name: 'https://evil.invalid/x', facing: 'left' } })).reason, 'bad-request');
  assert.equal((await ctl.command({ ...a, action: { kind: 'position', x: NaN, y: 0, mode: 'instant' } })).reason, 'bad-request');
  assert.equal(calls.length, before, '未知素材和非法位置不能转发');
  await ctl.command({ ...other, action: { kind: 'position', x: 0.2, y: 0.8, mode: 'line', duration: 1000 } });
  await ctl.command({ ...other, action: { kind: 'throw', angle: 180, power: 0.5 } });
  assert.equal(calls.find(call => call.path === 'throw').query.pet, 'other.pet');
  time += 1000;
  const renewed = await ctl.heartbeat(a);
  assert.equal(renewed.ok, true); assert.ok(renewed.expiresAt > a.expiresAt);
  await ctl.finish(a);
  const newer = await ctl.start({ petId: 'main', pageId: 'new' });
  const lockId = locks.get('main').lockId;
  assert.equal((await ctl.finish(a)).reason, 'run-lost');
  assert.equal(locks.get('main').lockId, lockId, '旧 finally 不得清新运行');
  locks.delete('main');
  assert.equal((await ctl.heartbeat(newer)).reason, 'lock-lost');
  const count = calls.length;
  assert.equal((await ctl.command({ ...newer, action: { kind: 'throw', angle: 0, power: 1 } })).reason, 'run-lost');
  assert.equal(calls.length, count, '失锁后不得继续写');
  time += 6000; await ctl.sweep();
  assert.equal(locks.size, 0, '页面失联清理按目标释放');
  await ctl.dispose();
  assert.equal((await ctl.start({ petId: 'main', pageId: 'a' })).reason, 'bridge-disposed');

  ctl = make();
  let resolveLock;
  delayLock = new Promise(resolve => { resolveLock = resolve; });
  const late = ctl.start({ petId: 'main', pageId: 'late' });
  // 等到真实进入取锁，而不是按墙钟猜异步调度。
  while (!calls.at(-1)?.body?.ttl || calls.at(-1).path !== 'lock') await Promise.resolve();
  const disposing = ctl.dispose();
  resolveLock(); delayLock = null;
  assert.equal((await late).ok, false);
  await disposing;
  assert.equal(locks.size, 0, '卸载中迟到的取锁必须归还');
  ctl = make();
  const noId = await ctl.start({ petId: 'main', pageId: 'a' });
  omitPlayback = true;
  assert.equal((await ctl.command({ ...noId, action: { kind: 'anim', name: PET_NAMES[0], facing: 'right' } })).reason, 'missing-playback-id');
  assert.equal(locks.size, 0); omitPlayback = false;
  const bad = await ctl.start({ petId: 'main', pageId: 'a' });
  failedAction = 'load-failed';
  assert.equal((await ctl.command({ ...bad, action: { kind: 'throw', angle: 0, power: 1 } })).reason, 'load-failed');
  assert.equal(locks.size, 0); failedAction = null;
  await ctl.dispose();
  console.log('PASS 官方控制：多目标、两页面互斥、短租期、失锁、迟到与旧清理');

  const useWallClock = () => { time = Date.now(); };
  useWallClock();
  const routes = new Map();
  const disposers = [];
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const route = routes.get(pathname) || [...routes.values()].find(item => item.kind === 'prefix' && pathname.startsWith(item.path));
    if (route) Promise.resolve(route.handler(req, res)).catch(() => res.destroy());
    else { res.statusCode = 404; res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const web = { get port() { return server.address().port; }, register(route) {
    routes.set(route.path, route); return () => routes.delete(route.path);
  } };
  try {
    registerOfficialPetRoutes(web, { base: '/wall', disposers, http: { sendJson } }, { request });
    const url = origin + '/wall/pet-link/official';
    assert.equal((await fetch(url, { method: 'PUT' })).status, 405);
    assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'https://evil.invalid' }, body: '{}' })).status, 403);
    assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'http://127.0.0.1:1' }, body: '{}' })).status, 403);
    assert.equal((await fetch(url, { method: 'POST', body: '{' })).status, 400);
    assert.equal((await fetch(url, { method: 'POST', body: 'x'.repeat(8193) })).status, 413);
    const started = await (await fetch(url, { method: 'POST', body: JSON.stringify({ op: 'start', petId: 'main', pageId: 'http' }) })).json();
    assert.equal(started.ok, true);
    await fetch(url, { method: 'POST', body: JSON.stringify({ ...started, op: 'finish' }) });
    const media = origin + '/wall/pet-link/official/assets/a0.webm';
    const ranged = await fetch(media, { headers: { Range: 'bytes=0-3' } });
    assert.equal(ranged.status, 206);
    assert.equal((await ranged.arrayBuffer()).byteLength, 4);
    assert.equal((await fetch(media, { method: 'HEAD' })).headers.get('content-type'), 'video/webm');
    assert.equal((await fetch(media, { headers: { Range: 'bytes=99999999999999-' } })).status, 416);
    assert.equal((await fetch(origin + '/wall/pet-link/official/assets/not-a-file')).status, 404);
    const targets = await fetch(origin + '/wall/pet-link/official');
    assert.equal(targets.status, 200);
    assert.equal(targets.headers.get('cache-control'), 'no-store');
    assert.equal(targets.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal((await targets.json()).ok, true);
  } finally {
    disposers.splice(0).reverse().forEach(off => off());
    server.closeAllConnections();
    await new Promise(resolve => { server.close(resolve); });
  }
  assert.equal(routes.size, 0);
  console.log('PASS 官方预览真实 HTTP：限长 JSON、资源白名单、视频 Range、生命周期');
  await verifyOfficialPetClient(clientSource);
}

async function verifyOfficialPetClient(source) {
  const create = new Function(source + ';return createOfficialPetClient;')();
  let serial = 0;
  let service = { pose: id => id === 'main' ? { x: 0.4, y: 0.6, facing: 'left' } : null,
    progress: () => ({ playbackId: 'play-1', currentTime: 0.4, duration: 1, paused: false, buffering: false }) };
  const rpcCalls = [];
  const nodes = [];
  const timers = new Map();
  const frames = new Map();
  const document = { createElement(tag) {
    const node = { tag, style: {}, children: [], setAttribute() {},
      appendChild(child) { this.children.push(child); },
      remove() { const at = nodes.indexOf(this); if (at >= 0) nodes.splice(at, 1); } };
    return node;
  }, body: { appendChild(node) { nodes.push(node); } } };
  const request = async value => {
    rpcCalls.push(value);
    if (value.op === 'start') return { ok: true, petId: value.petId, pageId: value.pageId, runId: `r-${++serial}` };
    return value.action?.kind === 'anim' ? { ok: true, playbackId: 'play-1' } : { ok: true };
  };
  const client = create({ get: () => service }, { request, document, sizeOf: () => 180,
    viewport: () => ({ width: 1000, height: 800 }),
    requestAnimationFrame(fn) { const id = ++serial; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); }, pageId: 'page' });
  assert.equal((await client.begin('main')).ok, true);
  assert.equal(client.showBubble({ text: '第一张', duration: 500 }), true);
  assert.equal(nodes.length, 1, '桥接自己的DOM必须真的出现');
  const staleClose = [...timers.values()].find(timer => timer.ms === 500).fn;
  assert.equal(client.showBubble({ text: '<b>第二张</b>', duration: 900 }), true);
  staleClose();
  assert.equal(nodes.length, 1, '旧气泡计时器不能关掉新气泡');
  assert.equal(nodes[0].textContent, '<b>第二张</b>', '文案只走textContent');
  await client.play('DSHWE_ARM_UP', 'left');
  assert.equal(client.progress().playbackId, 'play-1');
  const count = rpcCalls.length;
  await client.finish();
  assert.equal(rpcCalls.length, count + 1);
  assert.equal(nodes.length, 1, '动作解锁后桥接气泡继续留存');
  assert.equal(rpcCalls.some(call => /bubble|broadcast/.test(call.op)), false, '不清理或占用官方气泡');
  const readMissing = service;
  service = null;
  const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn());
  assert.equal(nodes.length, 0, '目标服务消失必须收回自有DOM');
  service = readMissing;
  await client.begin('main');
  client.showBubble({ text: '收尾', duration: 900 });
  client.dispose();
  assert.equal(nodes.length, 0);
  assert.equal(timers.size, 0);
  assert.equal(frames.size, 0);
  assert.equal((await client.begin('main')).reason, 'client-disposed');
  console.log('PASS 官方客户端：独立气泡、旧计时器隔离、先解动作后收气泡、服务卸载');
}
