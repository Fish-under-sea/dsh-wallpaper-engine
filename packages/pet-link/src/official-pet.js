/** 官方桥接客户端；独立气泡不占用、不清理官方原生气泡。 */
function createOfficialPetClient(ctx, options) {
  const doc = options.document || document;
  const raf = options.requestAnimationFrame || requestAnimationFrame;
  const caf = options.cancelAnimationFrame || cancelAnimationFrame;
  const later = options.setTimeout || setTimeout;
  const clear = options.clearTimeout || clearTimeout;
  const viewport = options.viewport || (() => ({ width: window.innerWidth, height: window.innerHeight }));
  const pageId = options.pageId || crypto.randomUUID();
  let disposed = false;
  let generation = 0;
  let run = null;
  let bubble = null;
  let heartbeat = null;
  let playbackId = null;
  const service = () => {
    try { return ctx.get('petApi7340') || null; } catch { return null; }
  };
  const rpc = async input => {
    try { return await options.request(input); } catch { return { ok: false, reason: 'transport-error' }; }
  };
  const hideBubble = () => {
    if (!bubble) return;
    const own = bubble; bubble = null;
    clear(own.timer); caf(own.frame); own.node.remove();
  };
  const finish = async () => {
    generation++;
    const own = run; run = null; playbackId = null;
    clear(heartbeat); heartbeat = null;
    return own ? rpc({ ...own.ticket, op: 'finish' }) : { ok: true };
  };
  const stop = () => { hideBubble(); return finish(); };
  const armHeartbeat = own => {
    heartbeat = later(async () => {
      if (disposed || run !== own) return;
      const result = await rpc({ ...own.ticket, op: 'heartbeat' });
      if (run !== own) return;
      if (!result?.ok || service() !== own.service) { await stop(); return; }
      armHeartbeat(own);
    }, 1000);
  };
  const command = async action => {
    const own = run;
    if (!own || disposed) return { ok: false, reason: 'run-lost' };
    if (service() !== own.service) { await stop(); return { ok: false, reason: 'service-lost' }; }
    const result = await rpc({ ...own.ticket, op: 'command', action });
    if (run !== own) return { ok: false, reason: 'run-lost' };
    if (!result?.ok) await stop();
    return result;
  };
  const client = {
    async begin(petId) {
      hideBubble();
      const finishing = finish();
      const epoch = generation;
      await finishing;
      if (disposed) return { ok: false, reason: 'client-disposed' };
      if (epoch !== generation) return { ok: false, reason: 'run-lost' };
      const api = service();
      if (!api || typeof api.pose !== 'function' || typeof api.progress !== 'function' || !api.pose(petId)) {
        return { ok: false, reason: 'client-service-unavailable' };
      }
      const ticket = await rpc({ op: 'start', petId, pageId });
      if (!ticket?.ok) return ticket;
      if (disposed || epoch !== generation || api !== service()) {
        await rpc({ ...ticket, op: 'finish' });
        return { ok: false, reason: 'client-disposed' };
      }
      run = { ticket, service: api }; armHeartbeat(run);
      return ticket;
    },
    async play(name, facing) {
      const own = run;
      const result = await command({ kind: 'anim', name, facing });
      if (result?.ok && run === own) playbackId = result.playbackId;
      return result;
    },
    position(x, y, mode, duration) { return command({ kind: 'position', x, y, mode, duration }); },
    throwPet(angle, power) { return command({ kind: 'throw', angle, power }); },
    progress() {
      if (!run || service() !== run.service || !playbackId) return null;
      const value = run.service.progress(run.ticket.petId);
      return value?.playbackId === playbackId ? value : null;
    },
    showBubble({ text = '', image = null, duration = 5000 }) {
      if (!run || disposed || !Number.isFinite(duration) || duration <= 0 || duration > 180000) return false;
      if (image !== null && (!Number.isInteger(image) || image < 0 || image > 4 || !options.bubbleUrl)) return false;
      if (typeof text !== 'string' || text.length > 2000) return false;
      const ownRun = run;
      const size = Number(options.sizeOf(ownRun.ticket.petId));
      if (!Number.isFinite(size) || size <= 0 || size > 1000) return false;
      hideBubble();
      const node = doc.createElement('div');
      node.setAttribute('data-we-official-pet-bubble', ownRun.ticket.runId);
      Object.assign(node.style, { position: 'fixed', pointerEvents: 'none', zIndex: '50',
        width: 'min(240px, calc(100vw - 16px))', boxSizing: 'border-box', overflowWrap: 'anywhere',
        padding: '8px', borderRadius: '8px', background: 'Canvas', color: 'CanvasText',
        border: '1px solid GrayText', transform: 'translate(-50%, -100%)' });
      node.textContent = text;
      if (image !== null) {
        const picture = doc.createElement('img');
        picture.src = options.bubbleUrl(image); picture.alt = '';
        Object.assign(picture.style, { display: 'block', width: '180px', maxWidth: '100%', height: '180px', objectFit: 'contain' });
        node.appendChild(picture);
      }
      const own = { node, timer: null, frame: null };
      const render = () => {
        if (bubble !== own) return;
        const pose = service() === ownRun.service ? ownRun.service.pose(ownRun.ticket.petId) : null;
        if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.y)) { stop(); return; }
        const view = viewport();
        const box = node.getBoundingClientRect?.() || { width: Math.min(240, view.width - 16), height: 80 };
        if (box.height > view.height - 16) { hideBubble(); return; }
        node.style.left = `${Math.max(box.width / 2 + 8, Math.min(view.width - box.width / 2 - 8, pose.x * view.width))}px`;
        node.style.top = `${Math.max(box.height + 8, Math.min(view.height - 8, pose.y * view.height - size / 2 - 8))}px`;
        own.frame = raf(render);
      };
      bubble = own; doc.body.appendChild(node); render();
      if (bubble !== own) return false;
      own.timer = later(() => { if (bubble === own) hideBubble(); }, duration);
      return bubble === own;
    },
    hideBubble,
    finish,
    dispose() { if (!disposed) { disposed = true; stop(); } },
  };
  if (typeof ctx.effect === 'function') ctx.effect(() => () => client.dispose());
  return client;
}
