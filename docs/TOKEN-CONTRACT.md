# `--dsw-*` 令牌契约（自动生成，勿手改）

> 生成：`node test/tools/token-contract.mjs --write`；核对：`node test/verify-token-contract.mjs`
> （守卫在契约与代码不一致时失败 —— 令牌集合因此不会烂掉）。
>
> **口径**：只计 `src/styles.js` CSS 模板里**属性位**的 `--dsw-*` 声明（值里的
> `var(--dsw-…)` 是读不是写，不计）；门控归属按花括号栈上的**选择器链**判定。
> **玻璃** = 链上有 `[data-we-glass-*]`；**壁纸** = 只有 `[data-we-wallpaper]`；
> **无门控** = 两者都不挂（共存审计 M1 的全部暴露面 —— 白名单见下表，新增一条守卫即红）。
> JS 侧的令牌写入（`src/font/apply.js` 的 label 族等）不在本契约口径内，见 `docs/DSH-UI-INTERFACES.md`。

共 **173** 条声明 / **59** 个不同令牌。门控归属：
玻璃 **142** 条 · 壁纸 **12** 条 · 无门控 **19** 条。

## 无门控声明（白名单 —— M1 的全部暴露面）

除下列两处封闭白名单外，**任何新的无门控 `--dsw-*` 声明都会让 `verify-token-contract` 变红**
（按宿主规范消费 token 的第三方插件无法区分「玻璃开/关」，只能拿到配方本身 —— 见 `docs/COEXISTENCE.md`）。

| 令牌 | 行 | 选择器链 | 归属 |
|---|---|---|---|
| `--dsw-alias-bg-layer-1` | styles.js:96 | `.we-layer` | .we-layer（插件自有元素，卸载即消失） |
| `--dsw-specific-bubble` | styles.js:1072 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-block` | styles.js:1073 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-block-banner` | styles.js:1074 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-inline-code` | styles.js:1075 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-tag` | styles.js:1076 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-segment-unselected` | styles.js:1077 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-segment-selected` | styles.js:1078 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-citation` | styles.js:1079 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-placeholder` | styles.js:1080 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-specific-bubble` | styles.js:1086 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-block` | styles.js:1087 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-block-banner` | styles.js:1088 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-inline-code` | styles.js:1089 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-tag` | styles.js:1090 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-segment-unselected` | styles.js:1091 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-segment-selected` | styles.js:1092 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-citation` | styles.js:1093 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-placeholder` | styles.js:1094 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |

## 全量令牌表

| 令牌 | 条数 | 门控 | 行号 | 消费者注记 |
|---|---|---|---|---|
| `--dsw-alias-bg-base` | 2 | 壁纸(2) | 222, 343 | 页面基底 —— 壁纸可见性的关键前提（transparent） |
| `--dsw-alias-bg-layer-1` | 11 | 玻璃(10) + 无门控(1) | 96, 248, 366, 1666, 1727, 1749, 1754, 1763, 3395, 3402, 3413 | 面板层次 1（宿主对话框/侧栏底）；better-sidebar 亦按它上色 |
| `--dsw-alias-bg-layer-2` | 11 | 玻璃(11) | 251, 369, 903, 1669, 1730, 1750, 1755, 1764, 3396, 3403, 3414 | 面板层次 2 |
| `--dsw-alias-bg-layer-3` | 10 | 玻璃(10) | 254, 372, 1672, 1733, 1751, 1756, 1765, 3397, 3404, 3415 | 面板层次 3 |
| `--dsw-alias-bg-module-platform` | 2 | 玻璃(2) | 269, 382 |  |
| `--dsw-alias-bg-multi-select` | 2 | 玻璃(2) | 272, 385 |  |
| `--dsw-alias-bg-overlay` | 2 | 玻璃(2) | 266, 379 | 弹层/浮出层底（issue #71 全表面玻璃） |
| `--dsw-alias-border-l1` | 2 | 玻璃(2) | 330, 431 | 边框强调 L1（「边框」滑条） |
| `--dsw-alias-border-l2` | 2 | 玻璃(2) | 331, 432 | 边框强调 L2 |
| `--dsw-alias-border-l2-darkmode-thin` | 2 | 玻璃(2) | 332, 433 | 深色细边框 |
| `--dsw-alias-border-l3` | 1 | 玻璃(1) | 1180 |  |
| `--dsw-alias-brand-primary` | 3 | 玻璃(3) | 1188, 1348, 1685 |  |
| `--dsw-alias-brand-text` | 3 | 玻璃(3) | 1189, 1349, 1686 |  |
| `--dsw-alias-button-elevated-fill` | 4 | 玻璃(4) | 257, 375, 1766, 3416 | 抬高按钮实色（侧栏「新建会话」等） |
| `--dsw-alias-button-floating-fill` | 3 | 玻璃(3) | 275, 388, 905 |  |
| `--dsw-alias-button-floating-hover` | 1 | 玻璃(1) | 906 |  |
| `--dsw-alias-button-ghost-active-fill` | 2 | 玻璃(2) | 278, 391 |  |
| `--dsw-alias-button-info-fill` | 1 | 玻璃(1) | 524 |  |
| `--dsw-alias-button-info-hover` | 1 | 玻璃(1) | 525 |  |
| `--dsw-alias-button-primary-dimmed` | 1 | 玻璃(1) | 1689 |  |
| `--dsw-alias-button-primary-fill` | 1 | 玻璃(1) | 1687 |  |
| `--dsw-alias-button-primary-hover` | 1 | 玻璃(1) | 1688 |  |
| `--dsw-alias-button-tool-bar-fill` | 2 | 玻璃(2) | 281, 394 |  |
| `--dsw-alias-interactive-bg-active` | 2 | 玻璃(2) | 284, 397 |  |
| `--dsw-alias-interactive-bg-hover` | 6 | 玻璃(6) | 904, 1185, 1216, 1345, 1383, 1678 |  |
| `--dsw-alias-interactive-bg-hover-accent` | 3 | 玻璃(3) | 1186, 1346, 1679 |  |
| `--dsw-alias-interactive-bg-hover-solid` | 2 | 玻璃(2) | 287, 400 |  |
| `--dsw-alias-label-caption` | 1 | 壁纸(1) | 464 |  |
| `--dsw-alias-label-deep-diving` | 2 | 玻璃(2) | 499, 511 |  |
| `--dsw-alias-label-deep-diving-shimmer` | 2 | 玻璃(2) | 501, 512 |  |
| `--dsw-alias-label-dimmed` | 1 | 壁纸(1) | 465 |  |
| `--dsw-alias-label-primary` | 1 | 壁纸(1) | 460 | 正文灰阶（壁纸激活时压暗提对比） |
| `--dsw-alias-label-primary-dimmed` | 1 | 壁纸(1) | 461 |  |
| `--dsw-alias-label-primary-foreground` | 1 | 玻璃(1) | 1696 |  |
| `--dsw-alias-label-secondary` | 1 | 壁纸(1) | 462 | 次要文字灰阶 |
| `--dsw-alias-label-tertiary` | 1 | 壁纸(1) | 463 |  |
| `--dsw-alias-link` | 3 | 玻璃(3) | 498, 510, 530 |  |
| `--dsw-alias-markdown-citation` | 4 | 玻璃(2) + 无门控(2) | 290, 403, 1079, 1093 |  |
| `--dsw-alias-markdown-code-block` | 6 | 玻璃(4) + 无门控(2) | 308, 413, 939, 1073, 1087, 1769 | markdown 代码块底 |
| `--dsw-alias-markdown-code-block-banner` | 6 | 玻璃(4) + 无门控(2) | 311, 416, 940, 1074, 1088, 1770 | markdown 代码条幅底 |
| `--dsw-alias-markdown-code-segment-selected` | 5 | 玻璃(3) + 无门控(2) | 325, 428, 1078, 1092, 1774 | 代码卡分段（选中） |
| `--dsw-alias-markdown-code-segment-unselected` | 5 | 玻璃(3) + 无门控(2) | 320, 425, 1077, 1091, 1773 | 代码卡分段（未选中） |
| `--dsw-alias-markdown-inline-code` | 6 | 玻璃(4) + 无门控(2) | 314, 419, 866, 1075, 1089, 1771 | 行内代码底 |
| `--dsw-alias-markdown-placeholder` | 4 | 玻璃(2) + 无门控(2) | 293, 406, 1080, 1094 |  |
| `--dsw-alias-markdown-tag` | 5 | 玻璃(3) + 无门控(2) | 317, 422, 1076, 1090, 1772 | markdown 标签底 |
| `--dsw-alias-scrollbar-bg-l1` | 2 | 玻璃(2) | 663, 674 |  |
| `--dsw-alias-scrollbar-bg-l2` | 2 | 玻璃(2) | 664, 675 |  |
| `--dsw-alias-scrollbar-hover-l1` | 2 | 玻璃(2) | 665, 676 |  |
| `--dsw-alias-scrollbar-hover-l2` | 2 | 玻璃(2) | 666, 677 |  |
| `--dsw-alias-state-business-primary` | 5 | 玻璃(5) | 502, 513, 1187, 1347, 1690 |  |
| `--dsw-alias-turn-trigger-bg` | 3 | 玻璃(3) | 748, 758, 3427 |  |
| `--dsw-alias-turn-trigger-bg-hover` | 3 | 玻璃(3) | 751, 761, 3428 |  |
| `--dsw-mask-blur` | 1 | 玻璃(1) | 654 |  |
| `--dsw-specific-bubble` | 4 | 玻璃(2) + 无门控(2) | 625, 635, 1072, 1086 |  |
| `--dsw-specific-input-major` | 2 | 玻璃(2) | 622, 632 |  |
| `--dsw-specific-selector` | 1 | 玻璃(1) | 3417 |  |
| `--dsw-specific-sidebar-fill` | 4 | 壁纸(4) | 223, 344, 449, 1109 | 侧栏填充（宿主 Mica/深色主题各有一份） |
| `--dsw-specific-sidebar-nav-item-active` | 2 | 玻璃(2) | 1676, 1736 |  |
| `--dsw-specific-sidebar-nav-item-hover` | 2 | 玻璃(2) | 1677, 1737 |  |
