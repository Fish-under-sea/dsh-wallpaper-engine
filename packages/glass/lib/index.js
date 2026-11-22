/**
 * packages/glass/lib/index.js —— 「液态玻璃」子包的**宿主半边**（ADR-0016 四刀全部落地）。
 *
 * 四刀出户（每刀独立可验收，全部落地）：
 *   第一刀：host-only 空壳 —— 行、键表、宿主自检登记；
 *   第二刀：设置面板节（glass-panel.js）随包走 —— `exports['./client']` + `client.build.json`
 *     + 主包 HOST_BRIDGE_BINDINGS 玻璃段（pet-link 收口先例）；
 *   第三刀：玻璃运行时（glass.js / glass-surfaces.js / glass-extra.js / glass-layer.js）随包走
 *     （registerLayerHooks 行为层 + registerGlassStatus 状态回传）；
 *   第四刀：玻璃 CSS（glass-css.js）随包走 ⇒ 停用本行 = 玻璃样式表与行为层整体退场，
 *     宿主回到原生外观（ADR-0010 D2 的 wallpaper-only 状态转正为行级开关）。
 *
 * 宿主半边现在有**一件实事**：注册 `glass-row` 状态路由族（`GET <base>/glass-row-state`）。
 * 行级开关在桌面宿主的运行中页面不触发客户端重载 ⇒ 已加载的玻璃浏览器半边需要一条
 * **自观测通道**才能即时中性化：路由的存在性 = 本行启用（行停用 ⇒ fiber prune ⇒ 路由 404），
 * 浏览器半边每 3 秒探测一次，按结果自行挂载 / 中性化（行级开关即时生效，无需重启宿主）。
 * 形态 = pet-link 同款（inject webServer + runComponent + handOffTeardown + 自带路由族）。
 *
 * ⚠️ **跨包纪律（ADR-0014 S5.1/S5.2，判据 verify-subpackage-purity）**：零主包说明符、
 * 零相对路径逃出本包；宿主能力一律经 `ctx.wallpaperEngineHost` 的键视图取。
 * ⚠️ **取服务姿势**：`inject` 必须先声明（webServer + wallpaperEngineHost）再读 `ctx.<服务>`——
 * cordis 的 reflect get 对「未声明 inject 就取的服务属性」当场抛。
 * ⚠️ **teardown 得交两份**：apply 是函数声明 ⇒ cordis 走 new 分支、返回值被丢弃 ⇒ 一律经
 * `keys.handOffTeardown(ctx, …)` 把同一份 disposer 交给 `ctx.effect`（否则关掉再开会撞重复路由）。
 * ⚠️ **注册期必须包 try**（P2-4）：路由注册抛错时已推进的 disposer 必须被收走，
 * 否则 teardown 永远交不回宿主，下一次启用撞 `duplicate route`。
 * ⚠️ 模块作用域只放声明/常量（P2-1b：不得在求值期读别的模块的绑定并调用它）。
 */
import { registerGlassRowRoutes } from './routes/glass-row.js';

export const name = 'dsh-plugin-wallpaper-engine-glass';

/**
 * 硬依赖 web 服务 + 主包宿主服务：状态路由挂在宿主 webServer 上，Loader 保证
 * 「服务就绪才激活」，`ctx.webServer` / `ctx.wallpaperEngineHost` 才读得到。
 */
export const inject = ['webServer', 'wallpaperEngineHost'];

/** 独立 plugin 入口：宿主按 patch 行加载本子包时走这里。 */
export function apply(ctx, config) {
  // 这个字面形态是**承重**的（verify-inject-contracts 按 `const <host> = ctx.<服务名>` 认冻结表，
  // 据此把调用点的 `...keys` 展开成叶子冻结表；写成守卫形式就认不出表 ⇒ 整包调用点判 dynamic）。
  const host = ctx.wallpaperEngineHost;
  if (!host) {
    throw new Error('[wallpaper-engine] glass 没拿到 wallpaperEngineHost 服务'
      + '（inject 声明与宿主装载顺序不匹配）');
  }
  const keys = host.keys('glass', ctx);
  if (keys === null || typeof keys !== 'object' || Array.isArray(keys)) {
    throw new Error('[wallpaper-engine-glass] host.keys("glass") 没有返回键集对象（ADR-0014 S5.1 / S5.4 服务面显式键集契约）');
  }
  const deps = Object.freeze({ ...keys, http: host.http });
  return keys.handOffTeardown(ctx, keys.runComponent('glass', ctx, config || {}, deps, applyImpl));
}

/** 组件实现（第三形参 = 冻结键视图 `c`，与 lib/kernel/host-session.js 同一约定）。 */
export function applyImpl(ctx, config = {}, c) {
  const { webServer } = ctx;
  const { base, http } = c;
  const disposers = [];
  let active = true;
  const dispose = () => {
    if (!active) return;
    active = false;
    for (const off of disposers.splice(0).reverse()) {
      try { off(); } catch { /* 继续归还其余注册。 */ }
    }
  };
  try {
    // 能注册上 = 本行 fiber 活着 = 启用。行停用时 fiber 被宿主 prune，路由随之 404，
    // 浏览器半边的轮询据此即时中性化（packages/glass/src/client.js 的行状态机）。
    registerGlassRowRoutes(webServer, { disposers, base, http });
  } catch (error) { dispose(); throw error; }
  return dispose;
}

export default { name, inject, apply };
