import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createOfficialPetCoordinator } from '../official-provider.js';
import { PET_NAMES, MEME_NAMES } from '../prepared.js';

export const DEPS = ['disposers', 'base', 'http'];

/** 正式官方桥接；端口来自宿主服务，不能把页面请求变成任意 URL 代理。 */
export function registerOfficialPetRoutes(webServer, c, options = {}) {
  const { disposers, base, http } = c;
  const BASE = base;
  const origin = () => {
    const port = webServer.port;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('官方桌宠宿主端口尚未就绪');
    return `http://127.0.0.1:${port}`;
  };
  const streams = new Set();
  const assets = new Map();
  for (const [index, name] of PET_NAMES.entries()) {
    assets.set(name, { path: `${BASE}/pet-link/official/assets/a${index}.webm`,
      file: fileURLToPath(new URL(`../../assets/webm/${name}.webm`, import.meta.url)), type: 'video/webm' });
  }
  const images = MEME_NAMES.map((name, index) => ({ path: `${BASE}/pet-link/official/assets/m${index}.png`,
    file: fileURLToPath(new URL(`../../assets/memes/${name}.png`, import.meta.url)), type: 'image/png' }));
  const request = options.request || (async (path, args) => {
    const url = new URL(`/dsh-pet-7340/${path}`, origin());
    for (const [key, value] of Object.entries(args.query || {})) url.searchParams.set(key, value);
    const method = args.method || 'POST';
    const response = await fetch(url, { method, redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(2500), headers: { 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(args.body) }) });
    if (!response.ok) throw new Error('官方接口请求失败');
    return response.json();
  });
  const coordinator = createOfficialPetCoordinator({ request,
    assetUrl: name => assets.has(name) ? origin() + assets.get(name).path : null });
  let active = true;
  const timer = setInterval(() => { void coordinator.sweep(); }, 1000);
  timer.unref?.();
  disposers.push(() => {
    active = false;
    clearInterval(timer);
    for (const stream of streams) stream.destroy();
    streams.clear();
    void coordinator.dispose();
  });
  const send = (res, status, value) => http.sendJson(res, status, value);
  const enabled = () => active && (!options.isLinkEnabled || options.isLinkEnabled());
  disposers.push(webServer.register({ kind: 'exact', path: `${BASE}/pet-link/official`,
    handler: async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { ok: false, reason: 'method-not-allowed' });
      if (!enabled()) return send(res, 200, { ok: false, reason: 'bridge-disabled' });
      if (req.method === 'GET') return send(res, 200, await coordinator.targets());
      // 本地 API 没有认证，仍拒绝浏览器的跨站写入；不信任 Host 头构造上游地址。
      let sameOrigin = true;
      if (req.headers?.origin) {
        try {
          const from = new URL(req.headers.origin);
          sameOrigin = from.protocol === 'http:' && Number(from.port || 80) === webServer.port
            && ['127.0.0.1', 'localhost', '[::1]'].includes(from.hostname);
        } catch { sameOrigin = false; }
      }
      if (!sameOrigin || req.headers?.['sec-fetch-site'] === 'cross-site') {
        return send(res, 403, { ok: false, reason: 'cross-site-request' });
      }
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > 8192) return send(res, 413, { ok: false, reason: 'body-too-large' });
          chunks.push(Buffer.from(chunk));
        }
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!enabled()) return send(res, 200, { ok: false, reason: 'bridge-disabled' });
        const methods = { start: coordinator.start, heartbeat: coordinator.heartbeat,
          command: coordinator.command, finish: coordinator.finish };
        if (!Object.hasOwn(methods, input?.op)) return send(res, 400, { ok: false, reason: 'bad-request' });
        return send(res, 200, await methods[input.op](input));
      } catch { return send(res, 400, { ok: false, reason: 'bad-request' }); }
    } }));
  const assetPaths = new Map([...assets.values(), ...images].map(asset => [asset.path, asset]));
  disposers.push(webServer.register({ kind: 'prefix', path: `${BASE}/pet-link/official/assets/`, handler: (req, res) => {
       const asset = assetPaths.get(new URL(req.url, 'http://localhost').pathname);
       if (!asset) { res.statusCode = 404; res.end(); return; }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end(); return; }
      if (!active) { res.statusCode = 410; res.end(); return; }
      try {
        const { size } = statSync(asset.file);
        const range = req.headers?.range;
        let start = 0;
        let end = size - 1;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (match && (match[1] || match[2])) {
            if (match[1]) { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end; }
            else start = Math.max(0, size - Number(match[2]));
          } else start = -1;
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
            res.statusCode = 416; res.setHeader('Content-Range', `bytes */${size}`); res.end(); return;
          }
        }
        res.statusCode = range ? 206 : 200;
        res.setHeader('Content-Type', asset.type);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', end - start + 1);
        if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        if (req.method === 'HEAD') { res.end(); return; }
        const stream = createReadStream(asset.file, { start, end });
        streams.add(stream);
        stream.on('error', () => res.destroy());
        stream.on('close', () => streams.delete(stream));
        res.on('close', () => stream.destroy());
        stream.pipe(res);
      } catch { res.statusCode = 404; res.end(); }
     } }));
  return coordinator;
}
