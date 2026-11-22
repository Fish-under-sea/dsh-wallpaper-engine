# 立绘（Rope artwork）运行时载荷

本目录存放**拉绳吉祥物立绘的运行时载荷**：10 张已经缩放、抠底、编码好的 PNG。
它们原本以 10 条单行 base64 常量内联在 `src/client.js` 里（合计 2,369,676 字符 /
1,777,009 字节 PNG），是当时全仓最大的一处内聚污染。

## 2026-10-30：从"内联进产物"改为"按需外置"

启动性能 trace（`Trace-20261030T132329`）测出：主产物 4.2 MB 里 **56% 是这 10 张图的
base64**，下载 178 ms、`v8.compile` 25 ms；而启动时桌面只需要**当前形态一张**，其余九张
只在吉祥物面板里出现。于是改成：

- 字节仍住本目录（`assets/rope/<name>.png`），**随 npm 包发布**（`package.json` 的 `files`
  含 `assets/rope/`）；
- 客户端 `src/client.js` 的 `ROPE_IMG_*` 只保存 URL：
  `BASE + "/rope-art/<name>.png"`；
- 宿主只读路由 `GET/HEAD /wallpaper-engine/rope-art/<name>.png`
  （实现：`lib/routes/rope-art.js`，文件名白名单 + PNG + ETag 复核）按需直出；
- `scripts/build-client.mjs` 的 `checkRopeArtDeclarations()` 只做**对账**，不再把字节拼进
  bundle：声明形态唯一、声明名 ↔ 文件名一致、文件存在且是 PNG、目录里没有孤儿 PNG、
  正文没有残留占位符。

效果：主产物 4,208,662 B → 1,844,564 B（−56%）；启动少传约 2.37 MB。图片字节本身**没有
改** —— 外置是搬位置，不是重编码。

## 构建期对账契约

源码里一个形态一项声明：

```js
const ROPE_IMG_WHALE = BASE + "/rope-art/whale.png";
```

`scripts/build-client.mjs` 在拼装产物前扫一遍 `src/client.js`，断言：

1. 每个声明**恰好命中一次**（漏写/写重都当场 exit 1）；
2. `const ROPE_IMG_` 声明数 == 命中数（有人改回内联 base64 / 改错形态 → 红）；
3. 声明名与文件名一致（`ROPE_IMG_WHALE` ↔ `whale.png`；改名两边一起动）；
4. 每个文件在盘且是 PNG（magic 校验；路由按 `.png` 出 content-type）；
5. 本目录里每个 `.png` 都被某个声明用到（改名只改一边会留下孤儿 → 红）；
6. 替换后正文里没有残留 `__ROPE_ART_`。

因此：**文件名 = 声明名的小写形式**。改名必须同时动 `src/client.js`、本 README 与构建脚本。

## 文件与形态

| 文件 | 字节 | 像素 | 形态（`ROPE_FORMS` 的键） | 备注 |
|---|---|---|---|---|
| `whale.png` | 321,971 | 384×576 | `whale`（显示名 `Deepseek_Pro`） | 全身体鲸鱼女仆；源图 `assets/mascot/rope-whale-source-1024x1536.png`，2:3 精确对应 |
| `phoebe.png` | 125,011 | 283×384 | `phoebe` | 菲比啾比（2026-10-11 换图），源图 1254×1254 正方形 |
| `claude.png` | 179,363 | 324×384 | `claude` | 八只「模型娘」之一 |
| `deepseek.png` | 159,289 | 330×384 | `deepseek` | 八只「模型娘」之一 |
| `gemini.png` | 163,640 | 296×384 | `gemini` | 八只「模型娘」之一 |
| `gpt.png` | 169,823 | 320×384 | `gpt` | 八只「模型娘」之一 |
| `glm.png` | 161,342 | 308×384 | `glm` | 八只「模型娘」之一 |
| `grok.png` | 168,778 | 311×384 | `grok` | 八只「模型娘」之一 |
| `kimi.png` | 160,670 | 299×384 | `kimi` | 八只「模型娘」之一 |
| `qwen.png` | 167,358 | 307×384 | `qwen` | 八只「模型娘」之一 |

`whale` 之外九只的**源图、裁到 alpha 紧致包围盒、按面积平均缩放到高 384、PNG 自适应行
filter** 的完整派生流程与踩坑记录在 [`../mascot/README.md`](../mascot/README.md)（源资产归档
在 `assets/mascot/`）。本目录存的是**派生载荷**，不是源资产。

## 两条纪律

- **运行时载荷就是这些字节**：路由按 `.png` 直出，别换格式（WebP/JPEG）、别改扩展名；
  要重编码/降采样就得同时评估观感并更新本表与 `assets/mascot/README.md` 的派生流程
  （不再有"与拆分前逐字节相同"的等价性证据可依赖）。
- **必须随包发布**：`package.json` 的 `files` 里有 `assets/rope/`；从发布包里删掉它
  等于所有内置形态 404。构建期对账只证明"仓库里对得上"，`test/verify-package-files.mjs`
  负责"发布面覆盖"。
