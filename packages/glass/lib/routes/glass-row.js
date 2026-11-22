/**
 * glass-row 路由族 —— 玻璃行**启用状态信号**（ADR-0016 行级开关的「即时生效」通道）。
 *
 * 为什么这条路由是承重的：行级开关在浏览器侧的既有语义是「客户端图 prune + 客户端重载」，
 * 但桌面宿主（desktop-next）的运行中页面**不会**自动重载 ⇒ 停用玻璃行后，已加载的玻璃
 * 浏览器半边（样式表 + 行为层）会一直留在内存里，直到重启。这条路由给了玻璃包一个
 * **自观测通道**：`GET <base>/glass-row-state` 的存在性 = 本行启用。
 *   · 200 `{ enabled: true }` —— 行启用（fiber 活着，路由才注册得上）；
 *   · 404 —— 行被停用（fiber 已被宿主 prune，路由随 fiber 消失）⇒ 浏览器半边据此
 *     **自行中性化**（撤样式表 + 跑 dispose + 设置节停渲染），无需重启。
 * 路由的存在性即信号，与 about-notice「停行 ⇒ 路由整族 404」是同一条宿主语义。
 *
 * 纪律（ADR-0014 S5.1/S5.2，判据 verify-subpackage-purity）：零主包说明符，宿主能力
 * 一律经 `ctx.wallpaperEngineHost` 的键视图；`sendJson` 经 `http` 面注入。
 */

export const DEPS = ['disposers', 'base', 'http'];

export function registerGlassRowRoutes(webServer, c) {
  // ⚠️ 解构名必须是 `BASE`（大写）：host-route-index 的路径抽取只认 `path: \`${BASE}/…\`` 形态，
  // 小写 `${base}` 会被判成动态路径 ⇒ 运行时对账「注册路径必须都在索引里」当场红。
  const { disposers, base: BASE, http } = c;
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/glass-row-state`,
    handler: async (req, res) => {
      const reply = (body) => http.sendJson(res, 200, body);
      if ((req.method || 'GET').toUpperCase() !== 'GET') { res.statusCode = 405; res.end(); return; }
      // 能应答 = 本行 fiber 活着 = 启用。停用时路由随 fiber 消失，客户端按 404 判停用。
      reply({ row: 'glass', enabled: true });
    },
  }));
}
