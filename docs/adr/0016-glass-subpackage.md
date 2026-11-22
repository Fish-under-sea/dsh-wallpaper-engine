# ADR-0016：玻璃子包抽离与「仅壁纸」态转正（Glass Subpackage）

- **Date**: 2026-10-27
- **Status**: Accepted（四刀全部落地：骨架 → 面板 → 运行时 → CSS；「仅壁纸」态闭环）
- **Deciders**: 用户批准「仓库内子包 + 完整抽离」方向（形态与深度二选一均经确认）
- **Amends**: ADR-0010 D2（wallpaper-only 总开关从「未实现」转正为行级开关）；沿用 ADR-0014 全部条款（S1–S10），本决策不放宽其中任何一条
- **编号与版本备注**: 本决策占 0016（code-is-truth 决策顺延为 [ADR-0017](./0017-code-is-truth-docs-reference-source.md)）；并入本整合线后仓内版本号暂维持 `1.4.0`（发布号由主线统筹），决策内容不变。

## Context

玻璃（液态玻璃）自 ADR-0008 起住在主包：参数解析（`src/glass.js`）、表面管理器（`src/glass-surfaces.js`）、
额外霜层（`src/glass-extra.js`）、设置面板（`src/glass-panel.js`）与散布在八个样式域模板里的玻璃配方
（含 152/183 条 `--dsw-*` 门控改写）全部内联在主包浏览器半边，**始终开启、无行级开关**。
ADR-0010 D2 当时把「仅壁纸（wallpaper-only）」状态记为未实现；用户随后明确提出要把玻璃抽离成独立插件，
且经二选一确认：**仓库内子包**（不做独立新插件）+ **完整抽离**（不止搬设置界面）。

仓库已有成熟的子包契约（ADR-0014，七包在册）与两条出户先例：fonts（P-C，渲染器随包、键留主包）与
pet-link（P5，收口成一般形态）。本决策是同一族模式的第八次应用，不发明新机制。

## Decision

### D1：四刀出户，每刀独立可验收

1. **第一刀（骨架）**：`packages/glass` 以 host-only 空壳上线 —— 行、键表、宿主自检全部登记，
   浏览器半边仍在主包内联，用户观感零变化；
2. **第二刀（面板）**：外观页签「玻璃」设置节（`glass-panel.js`）随包走（`exports['./client']` +
   `client.build.json`，pet-link 收口先例）；
3. **第三刀（运行时）**：玻璃运行时三文件与 `effects.js` 的玻璃段随包走（层钩子 + 状态回传），
   `effects.js` 只留壁纸段与非玻璃效果；
4. **第四刀（CSS）**：玻璃 CSS 随包走（`glass-css.js` 自有 `<style>` 通道），「仅壁纸」态闭环。
   （实施时运行时与 CSS 分两刀落地——CSS 是最大单体，独立成刀让每步保持 verify 全绿。）

每刀单独过 `verify` 全链，判据**只重定向、不删减**，条数对照第一刀前的基线守恒。

### D2：行停用 = 宿主原生外观（ADR-0010 D2 转正）

停用 `wallpaper-engine-glass` 行：全部 `data-we-glass-*` 门控属性与 `--we-*` 玻璃变量写入随包消失，
`--dsw-*` 门控改写不再注入 ⇒ 宿主回到原生主题。为使该状态**真正成立**（而不是坏样式）：

- 主包保留样式**必须**为玻璃 JS 写入的每个变量带原生回退默认值（`var(--we-x, 默认)`，默认值取软渲染
  回退块已编码的值）——「主包样式不得裸引用玻璃写入变量」立为**常驻判据**；
- 玻璃设置键持久化不丢：行停用只是不应用，键、预设全档案快照与主题偏好原样保留，复行后逐字节恢复
  （`verify-subpackage-toggle-roundtrip` 增玻璃行用例）。

### D3：键、预设、i18n 域表留主包（fonts 先例逐条沿用）

- 设置键 / 默认值 / 消毒 / 迁移留在 `lib/settings-schema.js`（ADR-0002 单一真源；`onGlass*` 写路径
  处理器同留主包，子包岛只渲染）；
- 预设是全档案快照（ADR-0011），`/glass-presets` 路由族与 `preset-store` 留主包，面板预设卡片由
  主包 `glassPresetCtx()` 组装后经 ctx 传入；
- 英文域表留主包（「域表归主包」先例）。

### D4：行为经既有层钩子节拍，跨包求值顺序不是契约

玻璃运行时经 `registerLayerHooks('glass', { sync, dispose })` 挂载；`sync` **幂等**（迟到注册由
`weLayerAttacher` 立刻补接对时）；层描述符显式 `order`，先后关系不靠 bundle 求值顺序。
`effects.js` 的玻璃量写入段进 `sync`、对应清理段进 `dispose`；壁纸段（`--we-wallpaper-*`、淡入底
watch）留主包。

### D5：行 id 与级联语义

行 id `wallpaper-engine-glass` 按 ADR-0014 S4.3 终身冻结；行默认启用（既有用户升级后观感零变化）；
主包行停用 ⇒ 玻璃行级联停靠（S7.2 既有语义，非新风险）。

## Consequences

- 发布集 8→9 包（`publishOrder` 子包先行、主包殿后不变）；版本九包同号（首带玻璃行的发布号由主线统筹；仓内暂维持 1.4.0）。
- 玻璃守卫族（`verify-glass-*`、`verify-token-contract`、`verify-softrender`、`verify-readability`）的
  取证点改为「主包产物 + 玻璃包产物」双工件；`--dsw-*` 令牌账本出现跨包边（改写随玻璃包、消费方在
  主包与第三方），TOKEN-CONTRACT 重算时逐条标注。
- CSS 手术是最大单体：八模板逐个迁、每步过该域守卫 + token-contract + 浏览器守卫（10 视口 × 双主题）。
- 第三方共存（better-sidebar 消费 `--dsw-alias-bg-layer-1`、parallax 复用同一 DOM 锚点）行为不变：
  行开 = 现状逐字节；行关 = 它们读到宿主原生值（这本来就是无玻璃时的宿主默认）。

## 重新考虑的触发线

- 宿主提供稳定的材质 / 层叠协议，玻璃包的绘制后端可整体替换时（同 ADR-0015 触发线）；
- 玻璃需要自有宿主路由（如玻璃预设独立存储）时，再评估把 `/glass-presets` 是否随包走；
- 玻璃与主包的桥接键集增长到失去枚举意义（>30 键）时，重新评估边界画法。
