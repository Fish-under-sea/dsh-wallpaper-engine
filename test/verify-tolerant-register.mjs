#!/usr/bin/env node
/**
 * verify-tolerant-register.mjs —— 注册面容错契约（issue #267：1.3.3 → 1.4.0 原地升级撞
 * `duplicate exact route`，整条 apply 抛错 ⇒ bundle 不激活 ⇒ 市场更新回滚）。
 *
 * 被测对象：`lib/host-boot.js` 的 `tolerantWebServer(webServer, onStale)`。
 * 语义只允许窄口子：
 *   · 本插件命名空间内的冲突 ⇒ 跳过该条注册（返回 no-op），其余路由照常激活，并回调 onStale。
 *     命名空间 = `BASE` 路径段 + 两条**不带 BASE 前缀**的自有根路径（`/diag`、`/api/local-assets`；
 *     二者 1.3.3 就注册了，原地升级残留同样会撞 duplicate）；白名单是逐字路径，不是宽匹配。
 *   · 其它任何错误（含命名空间外的路由冲突）⇒ 原样抛出，不吞真缺陷；形近路径的负对照
 *     （`/other-plugin/diag`、`/api/local-assets-x`、`/wallpaper-engine-foo/...`）必须判红。
 *   · 代理对非 register 属性透明（方法仍以原对象为 this）。
 * 另钉接线：门面与 5 个带路由的子包入口都必须走这个代理，且门面调用点首参仍是 webServer
 * （静态路由索引器按这个形态抽调用点，改成别的名字会让 ROUTE-INDEX 静默掉路由）。
 */
import { readFileSync } from 'node:fs';
import { createCheck } from './tools/assert-harness.mjs';
import { tolerantWebServer } from '../lib/host-boot.js';

const { check, stats } = createCheck();
const BASE = '/wallpaper-engine';

/** 一个会按 table 判重复的假 webserver（table: Set<kind + ' ' + path>）。 */
function makeServer({ throwOn }) {
  const table = new Set();
  const calls = [];
  const server = {
    table,
    calls,
    thisMark: 'original',
    tapIndex() { return this.thisMark; },
    register(route) {
      calls.push(route);
      if (throwOn) throw throwOn;
      const key = route.kind + ' ' + route.path;
      if (table.has(key)) {
        throw new Error('webserver: duplicate exact route "' + route.path + '"');
      }
      table.add(key);
      return () => { table.delete(key); };
    },
  };
  return server;
}

// ① 残留重复（命名空间内）⇒ 跳过该条、不抛、返回可调用 no-op，并回调告警。
{
  const server = makeServer({});
  const stale = { kind: 'GET', path: BASE + '/inventory' };
  server.table.add('GET ' + stale.path); // 1.3.3 残留
  const staleReports = [];
  const proxied = tolerantWebServer(server, (route, err) => staleReports.push([route.path, String(err.message)]));
  let threw = false;
  let dispose = null;
  try { dispose = proxied.register(stale); } catch { threw = true; }
  check('T1 duplicate route inside BASE is skipped instead of failing the whole apply',
    threw === false && typeof dispose === 'function' && staleReports.length === 1
      && staleReports[0][0] === stale.path && /duplicate/.test(staleReports[0][1]));
  const fresh = { kind: 'GET', path: BASE + '/fresh' };
  const ok = proxied.register(fresh);
  check('T2 the rest of the registration surface still activates after a stale skip',
    typeof ok === 'function' && server.table.has('GET ' + fresh.path));
}

// ② 非重复错误照抛（不吞真缺陷）。
{
  const server = makeServer({ throwOn: new Error('webserver: boom') });
  const proxied = tolerantWebServer(server, () => { throw new Error('onStale must not fire'); });
  let message = '';
  try { proxied.register({ kind: 'GET', path: BASE + '/x' }); } catch (err) { message = String(err.message); }
  check('T3 non-duplicate errors are re-thrown unchanged', /boom/.test(message));
}

// ③ 命名空间外的重复路由不归本代理管 ⇒ 照抛（我们没有资格替别的插件容错）。
{
  const server = makeServer({});
  const foreign = { kind: 'GET', path: '/some-other-plugin/thing' };
  server.table.add('GET ' + foreign.path);
  const proxied = tolerantWebServer(server, () => {});
  let message = '';
  try { proxied.register(foreign); } catch (err) { message = String(err.message); }
  check('T4 duplicate routes outside BASE are still thrown', /duplicate/.test(message));
}

// ③b 本插件**不带 BASE 前缀**的自有根路径：1.3.3 原地升级时同样会留下残留路由，只按
// `startsWith(BASE)` 判会漏掉这两条 ⇒ 旧实现整条 apply 在 duplicate 上失败（issue #267）。
// 必须真被吞掉，且必须留下 stale 告警 —— 只“不抛”不算数（那等于把真冲突也吞了）。
{
  for (const c of [
    { route: { kind: 'exact', path: '/diag' }, key: 'exact /diag',
      label: 'T5 own root route `/diag` (diag panel reports to the media-origin root; 1.3.3 registered it too) is skipped as stale' },
    { route: { kind: 'prefix', path: '/api/local-assets' }, key: 'prefix /api/local-assets',
      label: 'T6 own root route `/api/local-assets` (media-bridge local-assets contract; 1.3.3 registered it too) is skipped as stale' },
  ]) {
    const server = makeServer({});
    server.table.add(c.key); // 1.3.3 残留
    const staleReports = [];
    const proxied = tolerantWebServer(server, (route, err) => staleReports.push([route.path, String(err.message)]));
    let threw = false;
    let dispose = null;
    try { dispose = proxied.register(c.route); } catch { threw = true; }
    check(c.label,
      threw === false && typeof dispose === 'function' && staleReports.length === 1
        && staleReports[0][0] === c.route.path && /duplicate/.test(staleReports[0][1]));
  }
}

// ③c 负对照：上面的“吞”必须是**逐字白名单**的结果，不能是宽匹配的副作用。
// 形近路径（后缀 / 前缀 / 裸字符串前缀）必须照抛，否则判据会因实现放宽而假绿。
{
  for (const c of [
    { id: 'T7', path: '/other-plugin/diag', detail: '`/diag` 只能逐字命中，不能按后缀匹配' },
    { id: 'T8', path: '/api/local-assets-x', detail: '`/api/local-assets` 只能逐字命中，不能按子串/前缀匹配' },
    { id: 'T9', path: BASE + '-foo/thing', detail: 'BASE 只能按路径段匹配（`/wallpaper-engine-foo` 属于别的插件）' },
  ]) {
    const server = makeServer({});
    server.table.add('GET ' + c.path);
    const proxied = tolerantWebServer(server, () => { throw new Error('onStale must not fire for ' + c.path); });
    let message = '';
    try { proxied.register({ kind: 'GET', path: c.path }); } catch (err) { message = String(err.message); }
    check(c.id + ' negative control: ' + c.detail, /duplicate/.test(message), 'path=' + c.path);
  }
}

// ④ 代理透明：非 register 属性/方法照旧可用，且 this 仍是原对象。
{
  const server = makeServer({});
  const proxied = tolerantWebServer(server, () => {});
  check('T10 proxy is transparent for non-register members (method keeps original this)',
    proxied.table === server.table && proxied.tapIndex() === 'original' && proxied.thisMark === 'original');
}

// ⑤ 负对照：不做代理时同一份残留会真的抛（证明被测缺陷真实存在、T1 不是恒真）。
{
  const server = makeServer({});
  const stale = { kind: 'GET', path: BASE + '/inventory' };
  server.table.add('GET ' + stale.path);
  let message = '';
  try { server.register(stale); } catch (err) { message = String(err.message); }
  check('T11 negative control: the raw webserver really throws on the stale route', /duplicate/.test(message));
}

// ⑥ 接线契约：门面 + 5 个带路由的子包入口都走代理；门面调用点首参保持 webServer。
{
  const facade = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8');
  const entries = ['about-notice', 'mascot-avatar', 'media-bridge', 'pet-link', 'fonts']
    .map((pkg) => readFileSync(new URL('../packages/' + pkg + '/lib/index.js', import.meta.url), 'utf8'));
  const facadeCallSites = ['registerDiagRoutes(webServer,', 'registerGlassPresetsRoutes(webServer,',
    'registerSettingsRoutes(webServer,', 'registerCacheDirRoutes(webServer,'].filter((s) => facade.includes(s));
  check('T12 facade wraps ctx.webServer once and keeps the four registrar call sites static-analyzable',
    facade.includes('const webServer = tolerantWebServer(ctx.webServer,')
      && facadeCallSites.length === 4
      && !facade.includes('routeWebServer'));
  check('T13 all five route-bearing subpackage entries wrap their webServer',
    entries.every((t) => t.includes('tolerantWebServer')));
  const boot = readFileSync(new URL('../lib/subpackage-boot.js', import.meta.url), 'utf8');
  const tables = ["'about-notice'", "'mascot-avatar'", "'pet-link'", "'media-bridge'", 'fonts'];
  const declared = tables.filter((t) => {
    const at = boot.indexOf(t + ': Object.freeze({');
    if (at < 0) return false;
    const end = boot.indexOf('}),', at);
    return boot.slice(at, end).includes("tolerantWebServer: 'boot:tolerantWebServer'");
  });
  check('T14 every route-bearing package key table declares the boot:tolerantWebServer key',
    declared.length === tables.length, 'declared=' + declared.length + '/' + tables.length);
}

if (stats.failed) {
  console.error('TOLERANT REGISTER CHECKS FAILED — ' + stats.failed + ' failed, ' + stats.passed + ' passed');
  process.exitCode = 1;
} else {
  console.log('ALL TOLERANT REGISTER CHECKS PASSED (' + stats.passed + ')');
}
