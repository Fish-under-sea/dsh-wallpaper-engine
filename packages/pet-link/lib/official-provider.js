import { randomUUID } from 'node:crypto';

const validId = value => typeof value === 'string' && value.trim() === value
  && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f]/.test(value);
const failure = reason => ({ ok: false, reason });

/** 宿主独占指令流；官方锁凭证不交给页面，旧轮只能释放自己的凭证。 */
export function createOfficialPetCoordinator({ request, assetUrl, now = Date.now, leaseMs = 5000 }) {
  const generation = randomUUID();
  const runs = new Map();
  let active = true;
  async function call(path, options) {
    try { return await request(path, options); }
    catch { return failure('official-unavailable'); }
  }
  const current = run => active && runs.get(run.petId) === run && now() < run.expiresAt;
  const ticket = run => ({ ok: true, generation, petId: run.petId, pageId: run.pageId,
    runId: run.runId, expiresAt: run.expiresAt });
  function find(input) {
    const run = runs.get(input?.petId);
    return run && input.generation === generation && input.runId === run.runId
      && input.pageId === run.pageId && current(run) ? run : null;
  }
  async function close(run) {
    if (runs.get(run.petId) === run) runs.delete(run.petId);
    await run.queue;
    if (run.lockId) return call('lock/release', { query: { pet: run.petId }, body: { lockId: run.lockId } });
    return { ok: true };
  }
  function serial(run, fn) {
    const next = run.queue.then(async () => {
      if (!current(run)) return failure('run-lost');
      return fn();
    });
    run.queue = next.then(() => undefined, () => undefined);
    return next;
  }
  async function targets() {
    if (!active) return failure('bridge-disposed');
    const config = await call('config', { method: 'GET' });
    if (!config || typeof config !== 'object' || config.ok === false) return failure('official-unavailable');
    const pets = [];
    const ids = new Set();
    for (const group of Object.values(config)) {
      if (!Array.isArray(group?.pets)) continue;
      for (const pet of group.pets) {
        if (!validId(pet?.id) || ids.has(pet.id)) return failure('invalid-pet-config');
        ids.add(pet.id);
        pets.push({ id: pet.id, name: typeof pet.name === 'string' ? pet.name : pet.id,
          display: pet.display, size: pet.size });
      }
    }
    return { ok: true, pets };
  }
  async function sweep() {
    await Promise.all([...runs.values()].filter(run => !current(run)).map(close));
  }
  async function start(input) {
    if (!active) return failure('bridge-disposed');
    if (!validId(input?.petId) || !validId(input?.pageId)) return failure('bad-request');
    await sweep();
    const listed = await targets();
    if (!listed.ok) return listed;
    const pet = listed.pets.find(item => item.id === input.petId);
    if (!pet) return failure('unknown-pet');
    if (pet.display !== 'web' && pet.display !== 'both') return failure('pet-not-displayed');
    // 查询配置后再次检查，两个并发 start 不能同时越过这道门。
    if (!active) return failure('bridge-disposed');
    if (runs.has(input.petId)) return failure('busy');
    if (runs.size >= 32) return failure('bridge-busy');
    const run = { petId: input.petId, pageId: input.pageId, runId: randomUUID(),
      expiresAt: now() + leaseMs, lockId: '', queue: Promise.resolve() };
    runs.set(run.petId, run);
    const pending = call('lock', { query: { pet: run.petId, surface: 'web' }, body: { ttl: leaseMs } });
    run.queue = pending.then(() => undefined);
    const result = await pending;
    if (result?.ok === true && validId(result.lockId)) run.lockId = result.lockId;
    if (!current(run) || !run.lockId || result.petId !== run.petId
      || !Number.isFinite(result.expiresAt) || result.expiresAt <= now()) {
      await close(run);
      return failure(result?.ok === false ? result.reason : 'run-lost');
    }
    run.expiresAt = Math.min(run.expiresAt, result.expiresAt);
    return ticket(run);
  }
  async function heartbeat(input) {
    const run = find(input);
    if (!run) return failure('run-lost');
    const result = await serial(run, async () => {
      const renewed = await call('lock', { query: { pet: run.petId, surface: 'web' },
        body: { lockId: run.lockId, ttl: leaseMs } });
      if (!current(run)) return failure('run-lost');
      if (renewed?.ok !== true || renewed.lockId !== run.lockId || renewed.petId !== run.petId
        || !Number.isFinite(renewed.expiresAt) || renewed.expiresAt <= now()) {
        return failure(renewed?.ok === false ? renewed.reason : 'invalid-lock-response');
      }
      run.expiresAt = Math.min(now() + leaseMs, renewed.expiresAt);
      return ticket(run);
    });
    if (!result.ok) await close(run);
    return result;
  }
  function commandBody(input) {
    const action = input?.action;
    if (action?.kind === 'anim') {
      const url = assetUrl(action.name);
      if (!url || !['left', 'right'].includes(action.facing)) return null;
      return { path: 'anim', body: { url, facing: action.facing } };
    }
    if (action?.kind === 'position') {
      if (![action.x, action.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)
        || !['instant', 'line', 'spring'].includes(action.mode)) return null;
      if (action.mode === 'line' && (!Number.isFinite(action.duration) || action.duration < 0
        || action.duration > 180000)) return null;
      return { path: 'position', body: { x: action.x, y: action.y, mode: action.mode,
        ...(action.mode === 'line' ? { duration: action.duration } : {}) } };
    }
    if (action?.kind === 'throw' && Number.isFinite(action.angle)
      && Number.isFinite(action.power) && action.power > 0 && action.power <= 10) {
      return { path: 'throw', body: { angle: action.angle, power: action.power } };
    }
    return null;
  }
  async function command(input) {
    const run = find(input);
    if (!run) return failure('run-lost');
    const action = commandBody(input);
    if (!action) return failure('bad-request');
    const result = await serial(run, async () => {
      const response = await call(action.path, { query: { pet: run.petId, surface: 'web', lock: run.lockId },
        body: action.body });
      if (!current(run)) return failure('run-lost');
      if (response?.ok !== true) return failure(response?.reason || 'invalid-action-response');
      if (action.path === 'anim' && !validId(response.playbackId)) return failure('missing-playback-id');
      return { ok: true, ...(action.path === 'anim' ? { playbackId: response.playbackId } : {}) };
    });
    if (!result.ok) await close(run);
    return result;
  }
  async function finish(input) {
    const run = find(input);
    if (!run) return failure('run-lost');
    const released = await close(run);
    return released?.ok === true ? { ok: true } : failure(released?.reason || 'release-failed');
  }
  async function dispose() {
    active = false;
    await Promise.all([...runs.values()].map(close));
  }
  return { generation, targets, start, heartbeat, command, finish, sweep, dispose };
}
