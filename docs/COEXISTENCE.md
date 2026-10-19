# 共存：玻璃表面与其他 UI 插件

> **English**：[en/COEXISTENCE.md](./en/COEXISTENCE.md)。本文描述当前源码；发布版是否包含这些行为，请核对版本。

## 接管边界

壁纸与玻璃独立：关闭壁纸不会关闭玻璃。皮肤中心的公开标记 `html[data-dsh-skin]` 仍使本插件整体让路，离场后恢复。

玻璃的**页面级背景层令牌映射**（`--dsw-alias-bg-layer-1/2/3`、`--dsw-alias-button-elevated-fill`、`--dsw-alias-bg-overlay` 等）作用在 `body[data-we-glass-page]` 上，对**整页**生效：宿主自己的侧栏按钮、右栏页签栏、设置窗内的卡片都读这一族令牌，只把它传给聊天流会让这些面退回宿主实底。每条映射都带可读性下限（`--we-readability-floor`），不是无下限透明。设置窗口、侧栏和声明式表面的**霜与底色**仍由统一运行管理器按面认领；未知第三方面板的**自有底色声明**、按钮语义色、编辑器语法色和终端 ANSI 色不被改写。

| 表面 | 接管方式 | 不满足条件时 |
|---|---|---|
| 宿主左右栏 | 校验几何后，在页面底层放独立装饰叶节点 | 保留原生；不修改祖先定位或提高层级 |
| 设置窗口 | 借用窗口已有的定位和层叠上下文，在空闲 `::before` 绘制 | 已有模糊、伪元素被占用或结构不安全时保留原生 |
| 右栏 CodeMirror / xterm | 仅认领展开右栏内的已知内容画布 | 单面原生、preserve 或侧栏关闭时撤销 |
| 第三方声明面 | 显式声明并通过载体安全检查后绘制 | 未声明或不安全时不猜测布局 |
| 额外选择器 | 仅为空闲且已有定位、层叠上下文的目标补雾化 | 不制造新上下文，不强清内容底色 |

宿主最外层为壁纸让开的规则不等于玻璃接管。共存边界也不意味着任意第三方插件已经过完整视觉验证。

## 逐面回退

在外观设置的「玻璃兼容」中，每面可选「自动适配」或「保留原生」。对应设置键为 `glassSurfacePolicy`，策略覆盖绘制资格，不改变 `glassMode` 原有的继承 / 独立参数语义。缺失策略按自动处理；策略随设置与整机预设保存、导入和导出。

可配置面：`left-sidebar`、`right-sidebar`、`settings-window`、`content`、`declared`、`extra`。高级区域显示当前认领记录的 `id / mode / reason`，不采集插件文本或任意样式值。该列表是面板渲染时的快照，不是所有插件的兼容认证。

这里仍不是「关闭所有玻璃」总开关。聊天、标题栏和其他原有独立玻璃门控不由这张策略表统一关闭。总开关的历史决策见 [ADR-0010](./adr/0010-glass-off-revisit-four-states.md)。

## 插件作者声明

```html
<section data-we-surface="v1" style="position:relative;z-index:1">
  <div data-we-surface-layout>允许撤去底色的布局容器</div>
  <div data-we-surface-preserve>必须保留的原生内容</div>
</section>
```

- `data-we-surface="v1"`：请求适配，不保证接管。不要仅为接入玻璃给共享祖先新增层叠上下文；示例只适用于本来已有该定位结构的面。
- `data-we-surface-layout`：在已认领声明面内允许清底。不会穿过嵌套声明面的所有权边界。
- `data-we-surface-preserve`：该节点及其后代拒绝玻璃接管，优先于内建适配器与额外选择器。
- `data-we-surface-runtime`、`data-we-layout-runtime` 等运行标记属于内部实现，第三方不要设置或依赖。

不移动第三方节点，不改变第三方 `z-index`，不利用 top layer 抢层。外部可见模态在场时，WE 拉绳、仓库抽屉、更新公告和自动引导暂时隐藏；普通非模态 `role="dialog"` 不触发让路。

## 排查

| 症状 | 检查 |
|---|---|
| 某面仍有实底 | 查看对应策略和运行原因；未知内容保留实底可能是安全回退，不代表失效 |
| 额外雾化不生效 | 检查目标本来是否有定位和非 auto 层级，是否已有模糊 / `::before`，以及 preserve 声明 |
| 弹层被覆盖或 fixed 偏移 | 对照关闭 WE 时的矩形与实际命中；检查宿主或其他插件的 transform、filter、contain、层叠祖先，不要盲目提高层级 |
| 侧栏收起后出现残底 | 记录侧栏模式、策略和运行原因；正常收起应撤销所有权与装饰叶节点 |
| 关皮肤中心后未恢复 | 等待让路观察完成；持续异常请附宿主与插件版本、步骤和诊断 |

## 验证与边界

`node test/verify-glass-runtime-browser.mjs` 使用真实构建中的 CSS 与运行器，在独立 Chromium 实例检查深浅主题、窄屏、命中、焦点、fixed 几何、绘制像素、回退和清理。缺少浏览器时必须通过 `WE_TEST_BROWSER` 指定可执行文件，不会静默跳过。回归接入 `npm run verify`。

这些是隔离宿主结构夹具，不等同于每个第三方插件的真实窗口验收，也不证明原生崩溃或长期稳定性已修复。未测平台和独立审查状态须另行列出。

更多说明：[表面层决策](./adr/0015-glass-surface-ownership.md)、[令牌账本](./TOKEN-CONTRACT.md)、[一般排障](./TROUBLESHOOTING.md)。
