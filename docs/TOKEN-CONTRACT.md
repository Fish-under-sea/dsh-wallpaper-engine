# `--dsw-*` 令牌契约（自动生成，勿手改）

> 生成：`node test/tools/token-contract.mjs --write`；核对：`node test/verify-token-contract.mjs`
> （守卫在契约与代码不一致时失败 —— 令牌集合因此不会烂掉）。
>
> **口径**：只计样式族（`src/styles-base.js` … `src/styles-ext.js` 的 8 个域模板）里**属性位**的
> `--dsw-*` 声明（值里的 `var(--dsw-…)` 是读不是写，不计）；门控归属按花括号栈上的**选择器链**判定。
> **玻璃** = 链上有 `[data-we-glass-*]`；**壁纸** = 只有 `[data-we-wallpaper]`；
> **无门控** = 两者都不挂（共存审计 M1 的全部暴露面 —— 白名单见下表，新增一条守卫即红）。
> JS 侧的令牌写入（`src/font/apply.js` 的 label 族等）不在本契约口径内，见 `docs/DSH-UI-INTERFACES.md`。

共 **183** 条声明 / **59** 个不同令牌。门控归属：
玻璃 **152** 条 · 壁纸 **12** 条 · 无门控 **19** 条。

## 无门控声明（白名单 —— M1 的全部暴露面）

除下列封闭白名单外，**任何新的无门控 `--dsw-*` 声明都会让 `verify-token-contract` 变红**
（白名单 = `body[data-we-thinking-native]` 思考块自带开关 + 插件自有 bare roots 封闭集
`{.we-layer, .we-picker, .we-picker__modal, .we-qp}` —— 整条选择器链必须是纯逗号列表、
每段 trim 后精确命中集合成员，不认 `.we-*` 前缀/子串，拒未知根/混组；
按宿主规范消费 token 的第三方插件无法区分「玻璃开/关」，只能拿到配方本身 —— 见 `docs/COEXISTENCE.md`）。

| 令牌 | 行 | 选择器链 | 归属 |
|---|---|---|---|
| `--dsw-alias-bg-layer-1` | src/styles-base.js:97 | `.we-layer` | .we-layer（插件自有元素，卸载即消失） |
| `--dsw-specific-bubble` | src/styles-shell.js:544 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-block` | src/styles-shell.js:545 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-block-banner` | src/styles-shell.js:546 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-inline-code` | src/styles-shell.js:547 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-tag` | src/styles-shell.js:548 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-segment-unselected` | src/styles-shell.js:549 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-segment-selected` | src/styles-shell.js:550 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-citation` | src/styles-shell.js:551 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-placeholder` | src/styles-shell.js:552 | `body[data-we-thinking-native] [data-chat-flow], body[data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-specific-bubble` | src/styles-shell.js:558 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-block` | src/styles-shell.js:559 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-block-banner` | src/styles-shell.js:560 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-inline-code` | src/styles-shell.js:561 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-tag` | src/styles-shell.js:562 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-segment-unselected` | src/styles-shell.js:563 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-code-segment-selected` | src/styles-shell.js:564 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-citation` | src/styles-shell.js:565 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |
| `--dsw-alias-markdown-placeholder` | src/styles-shell.js:566 | `body[data-ds-dark-theme][data-we-thinking-native] [data-chat-flow], body[data-ds-dark-theme][data-we-thinking-native] [data-vcp-rawhtml]` | thinking-native（思考块自带开关） |

## 全量令牌表

| 令牌 | 条数 | 门控 | 行号 | 消费者注记 |
|---|---|---|---|---|
| `--dsw-alias-bg-base` | 2 | 壁纸(2) | src/styles-base.js:223, src/styles-base.js:349 | 页面基底 —— 壁纸可见性的关键前提（transparent） |
| `--dsw-alias-bg-layer-1` | 14 | 玻璃(13) + 无门控(1) | src/styles-base.js:97, src/styles-base.js:254, src/styles-base.js:361, src/styles-chrome.js:93, src/styles-chrome.js:164, src/styles-chrome.js:175, src/styles-chrome.js:200, src/styles-chrome.js:205, src/styles-chrome.js:214, src/styles-panel.js:383, src/styles-panel.js:396, src/styles-ext.js:86, src/styles-ext.js:95, src/styles-ext.js:106 | 面板层次 1（宿主对话框/侧栏底）；better-sidebar 亦按它上色 |
| `--dsw-alias-bg-layer-2` | 14 | 玻璃(14) | src/styles-base.js:257, src/styles-base.js:364, src/styles-shell.js:375, src/styles-chrome.js:96, src/styles-chrome.js:165, src/styles-chrome.js:178, src/styles-chrome.js:201, src/styles-chrome.js:206, src/styles-chrome.js:215, src/styles-panel.js:386, src/styles-panel.js:399, src/styles-ext.js:87, src/styles-ext.js:96, src/styles-ext.js:107 | 面板层次 2 |
| `--dsw-alias-bg-layer-3` | 13 | 玻璃(13) | src/styles-base.js:260, src/styles-base.js:367, src/styles-chrome.js:99, src/styles-chrome.js:166, src/styles-chrome.js:181, src/styles-chrome.js:202, src/styles-chrome.js:207, src/styles-chrome.js:216, src/styles-panel.js:389, src/styles-panel.js:402, src/styles-ext.js:88, src/styles-ext.js:97, src/styles-ext.js:108 | 面板层次 3 |
| `--dsw-alias-bg-module-platform` | 2 | 玻璃(2) | src/styles-base.js:275, src/styles-base.js:377 |  |
| `--dsw-alias-bg-multi-select` | 2 | 玻璃(2) | src/styles-base.js:278, src/styles-base.js:380 |  |
| `--dsw-alias-bg-overlay` | 2 | 玻璃(2) | src/styles-base.js:272, src/styles-base.js:374 | 弹层/浮出层底（issue #71 全表面玻璃） |
| `--dsw-alias-border-l1` | 2 | 玻璃(2) | src/styles-base.js:336, src/styles-base.js:426 | 边框强调 L1（「边框」滑条） |
| `--dsw-alias-border-l2` | 2 | 玻璃(2) | src/styles-base.js:337, src/styles-base.js:427 | 边框强调 L2 |
| `--dsw-alias-border-l2-darkmode-thin` | 2 | 玻璃(2) | src/styles-base.js:338, src/styles-base.js:428 | 深色细边框 |
| `--dsw-alias-border-l3` | 1 | 玻璃(1) | src/styles-sidebar.js:60 |  |
| `--dsw-alias-brand-primary` | 3 | 玻璃(3) | src/styles-sidebar.js:68, src/styles-sidebar.js:232, src/styles-chrome.js:112 |  |
| `--dsw-alias-brand-text` | 3 | 玻璃(3) | src/styles-sidebar.js:69, src/styles-sidebar.js:233, src/styles-chrome.js:113 |  |
| `--dsw-alias-button-elevated-fill` | 5 | 玻璃(5) | src/styles-base.js:263, src/styles-base.js:370, src/styles-chrome.js:167, src/styles-chrome.js:217, src/styles-ext.js:109 | 抬高按钮实色（侧栏「新建会话」等） |
| `--dsw-alias-button-floating-fill` | 3 | 玻璃(3) | src/styles-base.js:281, src/styles-base.js:383, src/styles-shell.js:377 |  |
| `--dsw-alias-button-floating-hover` | 1 | 玻璃(1) | src/styles-shell.js:378 |  |
| `--dsw-alias-button-ghost-active-fill` | 2 | 玻璃(2) | src/styles-base.js:284, src/styles-base.js:386 |  |
| `--dsw-alias-button-info-fill` | 1 | 玻璃(1) | src/styles-base.js:519 |  |
| `--dsw-alias-button-info-hover` | 1 | 玻璃(1) | src/styles-base.js:520 |  |
| `--dsw-alias-button-primary-dimmed` | 1 | 玻璃(1) | src/styles-chrome.js:116 |  |
| `--dsw-alias-button-primary-fill` | 1 | 玻璃(1) | src/styles-chrome.js:114 |  |
| `--dsw-alias-button-primary-hover` | 1 | 玻璃(1) | src/styles-chrome.js:115 |  |
| `--dsw-alias-button-tool-bar-fill` | 2 | 玻璃(2) | src/styles-base.js:287, src/styles-base.js:389 |  |
| `--dsw-alias-interactive-bg-active` | 2 | 玻璃(2) | src/styles-base.js:290, src/styles-base.js:392 |  |
| `--dsw-alias-interactive-bg-hover` | 6 | 玻璃(6) | src/styles-shell.js:376, src/styles-sidebar.js:65, src/styles-sidebar.js:100, src/styles-sidebar.js:229, src/styles-sidebar.js:267, src/styles-chrome.js:105 |  |
| `--dsw-alias-interactive-bg-hover-accent` | 3 | 玻璃(3) | src/styles-sidebar.js:66, src/styles-sidebar.js:230, src/styles-chrome.js:106 |  |
| `--dsw-alias-interactive-bg-hover-solid` | 2 | 玻璃(2) | src/styles-base.js:293, src/styles-base.js:395 |  |
| `--dsw-alias-label-caption` | 1 | 壁纸(1) | src/styles-base.js:459 |  |
| `--dsw-alias-label-deep-diving` | 2 | 玻璃(2) | src/styles-base.js:494, src/styles-base.js:506 |  |
| `--dsw-alias-label-deep-diving-shimmer` | 2 | 玻璃(2) | src/styles-base.js:496, src/styles-base.js:507 |  |
| `--dsw-alias-label-dimmed` | 1 | 壁纸(1) | src/styles-base.js:460 |  |
| `--dsw-alias-label-primary` | 1 | 壁纸(1) | src/styles-base.js:455 | 正文灰阶（壁纸激活时压暗提对比） |
| `--dsw-alias-label-primary-dimmed` | 1 | 壁纸(1) | src/styles-base.js:456 |  |
| `--dsw-alias-label-primary-foreground` | 1 | 玻璃(1) | src/styles-chrome.js:123 |  |
| `--dsw-alias-label-secondary` | 1 | 壁纸(1) | src/styles-base.js:457 | 次要文字灰阶 |
| `--dsw-alias-label-tertiary` | 1 | 壁纸(1) | src/styles-base.js:458 |  |
| `--dsw-alias-link` | 3 | 玻璃(3) | src/styles-base.js:493, src/styles-base.js:505, src/styles-base.js:525 |  |
| `--dsw-alias-markdown-citation` | 4 | 玻璃(2) + 无门控(2) | src/styles-base.js:296, src/styles-base.js:398, src/styles-shell.js:551, src/styles-shell.js:565 |  |
| `--dsw-alias-markdown-code-block` | 6 | 玻璃(4) + 无门控(2) | src/styles-base.js:314, src/styles-base.js:408, src/styles-shell.js:411, src/styles-shell.js:545, src/styles-shell.js:559, src/styles-chrome.js:220 | markdown 代码块底 |
| `--dsw-alias-markdown-code-block-banner` | 6 | 玻璃(4) + 无门控(2) | src/styles-base.js:317, src/styles-base.js:411, src/styles-shell.js:412, src/styles-shell.js:546, src/styles-shell.js:560, src/styles-chrome.js:221 | markdown 代码条幅底 |
| `--dsw-alias-markdown-code-segment-selected` | 5 | 玻璃(3) + 无门控(2) | src/styles-base.js:331, src/styles-base.js:423, src/styles-shell.js:550, src/styles-shell.js:564, src/styles-chrome.js:225 | 代码卡分段（选中） |
| `--dsw-alias-markdown-code-segment-unselected` | 5 | 玻璃(3) + 无门控(2) | src/styles-base.js:326, src/styles-base.js:420, src/styles-shell.js:549, src/styles-shell.js:563, src/styles-chrome.js:224 | 代码卡分段（未选中） |
| `--dsw-alias-markdown-inline-code` | 6 | 玻璃(4) + 无门控(2) | src/styles-base.js:320, src/styles-base.js:414, src/styles-shell.js:317, src/styles-shell.js:547, src/styles-shell.js:561, src/styles-chrome.js:222 | 行内代码底 |
| `--dsw-alias-markdown-placeholder` | 4 | 玻璃(2) + 无门控(2) | src/styles-base.js:299, src/styles-base.js:401, src/styles-shell.js:552, src/styles-shell.js:566 |  |
| `--dsw-alias-markdown-tag` | 5 | 玻璃(3) + 无门控(2) | src/styles-base.js:323, src/styles-base.js:417, src/styles-shell.js:548, src/styles-shell.js:562, src/styles-chrome.js:223 | markdown 标签底 |
| `--dsw-alias-scrollbar-bg-l1` | 2 | 玻璃(2) | src/styles-shell.js:94, src/styles-shell.js:105 |  |
| `--dsw-alias-scrollbar-bg-l2` | 2 | 玻璃(2) | src/styles-shell.js:95, src/styles-shell.js:106 |  |
| `--dsw-alias-scrollbar-hover-l1` | 2 | 玻璃(2) | src/styles-shell.js:96, src/styles-shell.js:107 |  |
| `--dsw-alias-scrollbar-hover-l2` | 2 | 玻璃(2) | src/styles-shell.js:97, src/styles-shell.js:108 |  |
| `--dsw-alias-state-business-primary` | 5 | 玻璃(5) | src/styles-base.js:497, src/styles-base.js:508, src/styles-sidebar.js:67, src/styles-sidebar.js:231, src/styles-chrome.js:117 |  |
| `--dsw-alias-turn-trigger-bg` | 3 | 玻璃(3) | src/styles-shell.js:199, src/styles-shell.js:209, src/styles-ext.js:120 |  |
| `--dsw-alias-turn-trigger-bg-hover` | 3 | 玻璃(3) | src/styles-shell.js:202, src/styles-shell.js:212, src/styles-ext.js:121 |  |
| `--dsw-mask-blur` | 1 | 玻璃(1) | src/styles-shell.js:81 |  |
| `--dsw-specific-bubble` | 4 | 玻璃(2) + 无门控(2) | src/styles-shell.js:52, src/styles-shell.js:62, src/styles-shell.js:544, src/styles-shell.js:558 |  |
| `--dsw-specific-input-major` | 2 | 玻璃(2) | src/styles-shell.js:49, src/styles-shell.js:59 |  |
| `--dsw-specific-selector` | 1 | 玻璃(1) | src/styles-ext.js:110 |  |
| `--dsw-specific-sidebar-fill` | 4 | 壁纸(4) | src/styles-base.js:224, src/styles-base.js:350, src/styles-base.js:444, src/styles-shell.js:581 | 侧栏填充（宿主 Mica/深色主题各有一份） |
| `--dsw-specific-sidebar-nav-item-active` | 2 | 玻璃(2) | src/styles-chrome.js:103, src/styles-chrome.js:184 |  |
| `--dsw-specific-sidebar-nav-item-hover` | 2 | 玻璃(2) | src/styles-chrome.js:104, src/styles-chrome.js:185 |  |
