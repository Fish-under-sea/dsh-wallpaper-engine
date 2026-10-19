# dsh-we-pet-builtin 🐾（wallpaper 内置子包候选）

本包是 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) `0.3.7` 的**受控派生副本**：完整保留上游全部功能（桌面窗、AI 对话、pet pack、多实例、物理与播放器、全部素材），加入 main 实例专属联动补丁，并把身份面改到独立命名空间，供 `dsh-wallpaper-engine`（wallpaper 插件）作为**可选内置子包**使用——wallpaper 只控制本包的 `main` 实例，其余实例保持原版行为。

**当前状态**：隔离包装候选（`.artifacts/rebuild-20261018/vendor/package/`），供 P1 无损落盘到真实 `packages/pet/`；尚未接入 wallpaper 发行面，接线与 main 消费链由后续集成任务完成。内容与 PA 已审计的 `.artifacts/pet-builtin-stage/package/` 一致（仅 README 许可节与派生声明按 t23 许可审计修正，见 `.artifacts/rebuild-20261018/vendor/SOURCE-LEDGER.md`）。

## 来源与派生声明

- 上游：`dsh-pet@0.3.7`（npm tgz，SHA256=`4a8cefce38e66f1e9371a19080ee8d9d4bf8a31ace3b39ca05427d730e756434`，308 条目），来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)。
- 上游 README 原文以 **`README.upstream.md`** 字节级保留于本包内（安装/独立模式/素材/pet pack 等使用说明以它为准）。
- 本副本改动（main 联动补丁 + 身份改名）逐文件哈希线与锚点计数见仓库内 `patch-log.md`（`.artifacts/pet-builtin-stage/`）；11 个执行产物文件头部均有派生声明注释。
- 快照登记：`0.3.7` 是本副本的内置快照版本，不构成对外部 dsh-pet 版本的锁定。

## 与原版 dsh-pet 的关系（共存限制）

本副本与活动安装的 dsh-pet 是**两只独立宠物**，可在同一宿主/同一页面共存：

- 独立命令：`/we-pet-balance`、`/we-pet-pet`、`/we-pet-chat`（原版为 `/balance`、`/pet`、`/chat`）。
- 独立路由前缀 `/dsh-we-pet-builtin`、独立浏览器模块 id、独立 `data-plugin-css` 样式键，样式互不吞并。
- 独立控制面与锁全局（`__dshWePetCtrls` 族 vs 上游 `__dshPet*`），`window.__dshWePetCtl` 恒指本包 `main` 实例。
- 独立数据根 `$DSH_HOME/dsh-we-pet-builtin/`（**不继承**原版 `dsh-pet` 的任何配置/素材/数据），独立 helper 应用身份 `dsh-we-pet-builtin-electron-helper`（独立 userData 与 DPI 缓存）。
- 互斥策略：**仅本方退让**——wallpaper 侧不会自动停用、改动或删除外部 dsh-pet 及其数据。
- 尚未在真实桌面窗验证的面（真实多开共存、桥接 consumer 适配）登记于 patch-log，接线阶段补行为证据。

## 维护责任

- 本副本由 `dsh-wallpaper-engine` 仓库维护（pet-builtin 系列）；**不是上游 dsh-pet 的发布物**，请勿向上游反馈本副本的改动。
- 升级方式：以新的上游 tgz 重跑补丁链（S1 解包 → S2/S3 main 补丁 → S4-S7 身份隔离），不手工热改。
- 补丁与 wallpaper 的联动接口：`window.__dshWePetCtl`（`lock/unlock/isLocked/lockBubbles/allowBubble/hideBubble/setBubbleDuration/getBubbleDuration`），只对 `main` 实例生效。

## 许可（三轨，勿合并）

- **上游代码**：MIT License，原文见包内 `LICENSE`（逐字节保留，满足 MIT 归属条款）。
- **上游素材**（动画 `assets/webm`、气泡表情包 `assets/memes`、通知与光标图标 `assets/pic`、`assets/logo.png`）：上游 README §许可 明示「**允许开源使用，禁止商用**」。**不得**标为 MIT；随包仅限非商用发行，商用须另行取得上游权利人授权。
- **字体** `assets/fonts/上首软糖体.ttf`：第三方商业字库（上首造字），再分发授权**未决**。发行前必须三选一：① 取得授权；② 更换为可证可分发字体；③ 从发行包排除该 ttf 并回退系统字体。本轮**不**删字体、不改产品字体、不为让打包门禁变绿而缩素材。
- 本副本的补丁与改名：随 `dsh-wallpaper-engine` 仓库许可对外（11 个执行产物文件头有派生声明）。
- 逐项证据、逐文件哈希与未知项见仓库内 `dsh-wallpaper-engine/.artifacts/rebuild-20261018/vendor/SOURCE-LEDGER.md`（台账属仓库文档，**不入包**）。

> **当前候选仅供本地接线验证，不是「发行许可齐备」的发布物。** 字体授权与素材商用条款是发行阻断级未决项，须由发行决策方另行裁定。

## 发行保全门禁（备份与探针排除）

- `lib/pet-link-backups/`（两份上游原字节备份）**不入发行**：`package.json` 的 `files` 含 `!lib/pet-link-backups`，并由 `verify-vendor.mjs` 的负控实测拦截（把排除项去掉必须判红）。
- `verify-vendor.mjs`、`source-manifest.json`、`patch-log.md` 等探针与台账只存在于 `.artifacts`，不在包内、不入发行。

## 退出与数据清理

- 卸载本子包：`dsh plugin --profile {profile} remove dsh-we-pet-builtin`（与设置页「卸载方法」一致；不会误删原版 dsh-pet）。
- 卸载**不会**自动删除数据：独立数据根 `$DSH_HOME/dsh-we-pet-builtin/` 与 helper userData 需手动删除；同样**不会**触碰原版 `$DSH_HOME/dsh-pet/`。
- 安装本包不会自动迁移原版配置，也不会自动启动桌面窗。
