#!/usr/bin/env node
/**
 * verify-lazy-engine-dir.mjs —— 运行期依赖的目录必须**按请求惰性解析**（issue #218 / PR #245）。
 *
 * 真机形态：用户在宿主已启动后才 `npm install webwallgl`（或插件的 node_modules 先被裁掉），
 * 旧的加载期快照会让 `/scene-live/engine/*` 永远 404「webwallgl-not-installed」，面板只能报
 * 一句笼统的首帧超时；必须重启宿主才恢复。本守卫钉住：
 *   ① `webwallglPkgDir()` 是函数、每次现解析；宿主内核面不再有 `WEBWALLGL_PKG_DIR` 快照键；
 *   ② shim 读取在「上次取空」后会重试（依赖补齐后同一进程内即生效）；
 *   ③ scene-serve 路由在**请求期**解析目录：先 404 not-installed，依赖出现后同一个 handler
 *      立刻能供出 engine 文件；
 *   ④ 变异体（改回常量快照 / 去掉重试）必须让同一判据判红。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCheck } from './tools/assert-harness.mjs';
import { hostKernel } from '../lib/host-boot.js';
import { createShimSeedKit } from '../lib/shim-seed.js';
import { registerSceneServeRoutes } from '../packages/media-bridge/lib/routes/scene-serve.js';

const { check, stats } = createCheck();
const BASE = '/wallpaper-engine';
const iso = mkdtempSync(join(tmpdir(), 'we-lazy-engine-'));
const engineDir = join(iso, 'webwallgl');
mkdirSync(engineDir, { recursive: true });
writeFileSync(join(engineDir, 'webwallgl.mjs'), 'const shimSource = `hello-shim`;\n');
writeFileSync(join(engineDir, 'engine-file.js'), 'export const x = 1;\n');

try {
  // ① 内核面：函数 + 无快照键。
  check('L1 hostKernel exposes webwallglPkgDir as a function and no cached WEBWALLGL_PKG_DIR key',
    typeof hostKernel.webwallglPkgDir === 'function' && !('WEBWALLGL_PKG_DIR' in hostKernel));

  // ② shim：取空后重试（依赖补齐后同一进程内生效）。
  {
    let dir = null;
    const kit = createShimSeedKit({ webwallglPkgDir: () => dir, WEBWALLGL_DIR: engineDir, readSettings: () => ({}) });
    const first = kit.readWebShim();
    dir = engineDir;
    const second = kit.readWebShim();
    check('L2 shim read retries after an empty read (dependency installed later is picked up)',
      first === '' && second === 'hello-shim', JSON.stringify({ first, second }));
    // 负对照：常量快照（null）永远取不到 —— 证明 L2 不是恒真。
    const frozen = createShimSeedKit({ webwallglPkgDir: null, WEBWALLGL_DIR: engineDir, readSettings: () => ({}) });
    check('L3 negative control: a frozen null snapshot never recovers (the old bug)', frozen.readWebShim() === '');
  }

  // ③ scene-serve：请求期解析（先 404，依赖出现后同 handler 直接供出 engine 文件）。
  {
    let dir = null;
    const routes = new Map();
    const webServer = {
      register(route) { routes.set(route.path, route.handler); return () => {}; },
      tapIndex() { return () => {}; },
    };
    const served = [];
    const mkRes = () => ({
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(body) { this.body = body; },
    });
    registerSceneServeRoutes(webServer, {
      disposers: [], base: BASE, WEBWALLGL_DIR: engineDir, webwallglPkgDir: () => dir,
      appendDiagLine() {}, traceRequests() {}, serveFile(abs) { served.push(abs); },
      handleSceneFiles() {}, mediaOriginInfo: {}, payloadProgress() { return {}; },
      log: { warn() {}, tag() { return this; } },
    });
    const handler = routes.get(`${BASE}/scene-live`);
    const mkReq = (rel) => ({ method: 'GET', url: `${BASE}/scene-live/${rel}`, headers: {} });
    const res1 = mkRes();
    handler(mkReq('engine/engine-file.js'), res1);
    dir = engineDir;
    const res2 = mkRes();
    handler(mkReq('engine/engine-file.js'), res2);
    check('L4 scene-serve resolves the engine dir per request (404 first, served after install)',
      res1.statusCode === 404 && /webwallgl-not-installed/.test(String(res1.body))
        && served.length === 1 && served[0] === join(engineDir, 'engine-file.js'),
      JSON.stringify({ first: res1.statusCode, served }));
    // 负对照：把目录固定 null（旧快照形态）⇒ 第二次仍 404。
    const routes2 = new Map();
    const webServer2 = { register(route) { routes2.set(route.path, route.handler); return () => {}; }, tapIndex() { return () => {}; } };
    registerSceneServeRoutes(webServer2, {
      disposers: [], base: BASE, WEBWALLGL_DIR: engineDir, webwallglPkgDir: null,
      appendDiagLine() {}, traceRequests() {}, serveFile() {},
      handleSceneFiles() {}, mediaOriginInfo: {}, payloadProgress() { return {}; },
      log: { warn() {}, tag() { return this; } },
    });
    const res3 = mkRes();
    routes2.get(`${BASE}/scene-live`)(mkReq('engine/engine-file.js'), res3);
    check('L5 negative control: a frozen directory keeps answering not-installed', res3.statusCode === 404);
  }

  // ④ 静态契约：源码里没有加载期快照键；key 表/路由声明用惰性键名。
  {
    const kernel = readFileSync(new URL('../lib/kernel/host-kernel.js', import.meta.url), 'utf8');
    const route = readFileSync(new URL('../packages/media-bridge/lib/routes/scene-serve.js', import.meta.url), 'utf8');
    const boot = readFileSync(new URL('../lib/subpackage-boot.js', import.meta.url), 'utf8');
    const violations = [];
    if (/const\s+WEBWALLGL_PKG_DIR\s*=/.test(kernel)) violations.push('host-kernel 仍有加载期快照常量');
    if (!/function\s+webwallglPkgDir\s*\(/.test(kernel)) violations.push('host-kernel 缺 webwallglPkgDir 函数');
    if (!/typeof\s+webwallglPkgDir\s*===\s*'function'/.test(route)) violations.push('scene-serve 没有请求期解析');
    if (!/webwallglPkgDir:\s*'kernel:webwallglPkgDir'/.test(boot)) violations.push('key 表未登记 kernel:webwallglPkgDir');
    check('L6 source contract holds (lazy resolve / no snapshot constant / key-table wired)',
      violations.length === 0, violations.join('；'));
    check('L7 negative control: re-introducing the snapshot constant is flagged',
      (/const\s+WEBWALLGL_PKG_DIR\s*=/.test(kernel.replace('function webwallglPkgDir()', 'const WEBWALLGL_PKG_DIR = (() => null)();\nfunction webwallglPkgDir()'))));
  }
} finally {
  rmSync(iso, { recursive: true, force: true });
}

if (stats.failed) {
  console.error('LAZY ENGINE DIR CHECKS FAILED — ' + stats.failed + ' failed, ' + stats.passed + ' passed');
  process.exitCode = 1;
} else {
  console.log('ALL LAZY ENGINE DIR CHECKS PASSED (' + stats.passed + ')');
}
