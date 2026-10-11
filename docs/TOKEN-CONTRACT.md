# `--dsw-*` 令牌契约（自动生成，勿手改）

> 生成：`node test/tools/token-contract.mjs --write`；核对：`node test/verify-token-contract.mjs`
> （守卫在契约与代码不一致时失败 —— 令牌集合因此不会烂掉）。
>
> **口径**：只计 `src/styles.js` CSS 模板里**属性位**的 `--dsw-*` 声明（值里的
> `var(--dsw-…)` 是读不是写，不计）；门控归属按花括号栈上的**选择器链**判定。
> **玻璃** = 链上有 `[data-we-glass-*]`；**壁纸** = 只有 `[data-we-wallpaper]`；
> **无门控** = 两者都不挂（共存审计 M1 的全部暴露面 —— 白名单见下表，新增一条守卫即红）。
> JS 侧的令牌写入（`src/font/apply.js` 的 label 族等）不在本契约口径内，见 `docs/DSH-UI-INTERFACES.md`。

共 **162** 条声明 / **54** 个不同令牌。门控归属：
玻璃 **131** 条 · 壁纸 **12** 条 · 无门控 **19** 条。

## 无门控声明（白名单 —— M1 的全部暴露面）

除下列两处封闭白名单外，**任何新的无门控 `--dsw-*` 声明都会让 `verify-token-contract` 变红**
（按宿主规范消费 token 的第三方插件无法区分「玻璃开/关」，只能拿到配方本身 —— 见 `docs/COEXISTENCE.md`）。

| 令牌 | 行 | 选择器链 | 归属 |
|---|---|---|---|
| `--dsw-alias-bg-layer-1` | styles.js:96 | `.we-layer` | .we-layer（插件自有元素，卸载即消失） |
| `--dsw-specific-bubble` | styles.js:1007 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-block` | styles.js:1008 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-block-banner` | styles.js:1009 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-inline-code` | styles.js:1010 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-tag` | styles.js:1011 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-segment-unselected` | styles.js:1012 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-segment-selected` | styles.js:1013 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-citation` | styles.js:1014 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-placeholder` | styles.js:1015 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-specific-bubble` | styles.js:1021 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-block` | styles.js:1022 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-block-banner` | styles.js:1023 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-inline-code` | styles.js:1024 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-tag` | styles.js:1025 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-segment-unselected` | styles.js:1026 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-segment-selected` | styles.js:1027 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-citation` | styles.js:1028 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-placeholder` | styles.js:1029 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |

## 全量令牌表

| 令牌 | 条数 | 门控 | 行号 | 消费者注记 |
|---|---|---|---|---|
| `--dsw-alias-bg-base` | 2 | 壁纸(2) | 222, 343 | 页面基底 —— 壁纸可见性的关键前提（transparent） |
| `--dsw-alias-bg-layer-1` | 11 | 玻璃(10) + 无门控(1) | 96, 248, 366, 1545, 1606, 1628, 1633, 1642, 3170, 3177, 3188 | 面板层次 1（宿主对话框/侧栏底）；better-sidebar 亦按它上色 |
| `--dsw-alias-bg-layer-2` | 11 | 玻璃(11) | 251, 369, 838, 1548, 1609, 1629, 1634, 1643, 3171, 3178, 3189 | 面板层次 2 |
| `--dsw-alias-bg-layer-3` | 10 | 玻璃(10) | 254, 372, 1551, 1612, 1630, 1635, 1644, 3172, 3179, 3190 | 面板层次 3 |
| `--dsw-alias-bg-module-platform` | 2 | 玻璃(2) | 269, 382 |  |
| `--dsw-alias-bg-multi-select` | 2 | 玻璃(2) | 272, 385 |  |
| `--dsw-alias-bg-overlay` | 2 | 玻璃(2) | 266, 379 | 弹层/浮出层底（issue #71 全表面玻璃） |
| `--dsw-alias-border-l1` | 2 | 玻璃(2) | 330, 431 | 边框强调 L1（「边框」滑条） |
| `--dsw-alias-border-l2` | 2 | 玻璃(2) | 331, 432 | 边框强调 L2 |
| `--dsw-alias-border-l2-darkmode-thin` | 2 | 玻璃(2) | 332, 433 | 深色细边框 |
| `--dsw-alias-border-l3` | 1 | 玻璃(1) | 1115 |  |
| `--dsw-alias-brand-primary` | 3 | 玻璃(3) | 1123, 1227, 1564 |  |
| `--dsw-alias-brand-text` | 3 | 玻璃(3) | 1124, 1228, 1565 |  |
| `--dsw-alias-button-elevated-fill` | 4 | 玻璃(4) | 257, 375, 1645, 3191 | 抬高按钮实色（侧栏「新建会话」等） |
| `--dsw-alias-button-floating-fill` | 3 | 玻璃(3) | 275, 388, 840 |  |
| `--dsw-alias-button-floating-hover` | 1 | 玻璃(1) | 841 |  |
| `--dsw-alias-button-ghost-active-fill` | 2 | 玻璃(2) | 278, 391 |  |
| `--dsw-alias-button-primary-dimmed` | 1 | 玻璃(1) | 1568 |  |
| `--dsw-alias-button-primary-fill` | 1 | 玻璃(1) | 1566 |  |
| `--dsw-alias-button-primary-hover` | 1 | 玻璃(1) | 1567 |  |
| `--dsw-alias-button-tool-bar-fill` | 2 | 玻璃(2) | 281, 394 |  |
| `--dsw-alias-interactive-bg-active` | 2 | 玻璃(2) | 284, 397 |  |
| `--dsw-alias-interactive-bg-hover` | 6 | 玻璃(6) | 839, 1120, 1148, 1224, 1262, 1557 |  |
| `--dsw-alias-interactive-bg-hover-accent` | 3 | 玻璃(3) | 1121, 1225, 1558 |  |
| `--dsw-alias-interactive-bg-hover-solid` | 2 | 玻璃(2) | 287, 400 |  |
| `--dsw-alias-label-caption` | 1 | 壁纸(1) | 464 |  |
| `--dsw-alias-label-dimmed` | 1 | 壁纸(1) | 465 |  |
| `--dsw-alias-label-primary` | 1 | 壁纸(1) | 460 | 正文灰阶（壁纸激活时压暗提对比） |
| `--dsw-alias-label-primary-dimmed` | 1 | 壁纸(1) | 461 |  |
| `--dsw-alias-label-primary-foreground` | 1 | 玻璃(1) | 1575 |  |
| `--dsw-alias-label-secondary` | 1 | 壁纸(1) | 462 | 次要文字灰阶 |
| `--dsw-alias-label-tertiary` | 1 | 壁纸(1) | 463 |  |
| `--dsw-alias-markdown-citation` | 4 | 玻璃(2) + 无门控(2) | 290, 403, 1014, 1028 |  |
| `--dsw-alias-markdown-code-block` | 6 | 玻璃(4) + 无门控(2) | 308, 413, 874, 1008, 1022, 1648 | markdown 代码块底 |
| `--dsw-alias-markdown-code-block-banner` | 6 | 玻璃(4) + 无门控(2) | 311, 416, 875, 1009, 1023, 1649 | markdown 代码条幅底 |
| `--dsw-alias-markdown-code-segment-selected` | 5 | 玻璃(3) + 无门控(2) | 325, 428, 1013, 1027, 1653 | 代码卡分段（选中） |
| `--dsw-alias-markdown-code-segment-unselected` | 5 | 玻璃(3) + 无门控(2) | 320, 425, 1012, 1026, 1652 | 代码卡分段（未选中） |
| `--dsw-alias-markdown-inline-code` | 6 | 玻璃(4) + 无门控(2) | 314, 419, 801, 1010, 1024, 1650 | 行内代码底 |
| `--dsw-alias-markdown-placeholder` | 4 | 玻璃(2) + 无门控(2) | 293, 406, 1015, 1029 |  |
| `--dsw-alias-markdown-tag` | 5 | 玻璃(3) + 无门控(2) | 317, 422, 1011, 1025, 1651 | markdown 标签底 |
| `--dsw-alias-scrollbar-bg-l1` | 2 | 玻璃(2) | 598, 609 |  |
| `--dsw-alias-scrollbar-bg-l2` | 2 | 玻璃(2) | 599, 610 |  |
| `--dsw-alias-scrollbar-hover-l1` | 2 | 玻璃(2) | 600, 611 |  |
| `--dsw-alias-scrollbar-hover-l2` | 2 | 玻璃(2) | 601, 612 |  |
| `--dsw-alias-state-business-primary` | 3 | 玻璃(3) | 1122, 1226, 1569 |  |
| `--dsw-alias-turn-trigger-bg` | 3 | 玻璃(3) | 683, 693, 3202 |  |
| `--dsw-alias-turn-trigger-bg-hover` | 3 | 玻璃(3) | 686, 696, 3203 |  |
| `--dsw-mask-blur` | 1 | 玻璃(1) | 589 |  |
| `--dsw-specific-bubble` | 4 | 玻璃(2) + 无门控(2) | 560, 570, 1007, 1021 |  |
| `--dsw-specific-input-major` | 2 | 玻璃(2) | 557, 567 |  |
| `--dsw-specific-selector` | 1 | 玻璃(1) | 3192 |  |
| `--dsw-specific-sidebar-fill` | 4 | 壁纸(4) | 223, 344, 449, 1044 | 侧栏填充（宿主 Mica/深色主题各有一份） |
| `--dsw-specific-sidebar-nav-item-active` | 2 | 玻璃(2) | 1555, 1615 |  |
| `--dsw-specific-sidebar-nav-item-hover` | 2 | 玻璃(2) | 1556, 1616 |  |
