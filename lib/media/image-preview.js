/**
 * image-preview.js — 自定义上传**图片**的缩略图族（按需 ffmpeg 缩放 + 磁盘缓存 + 并发闸）。
 *
 * ══ 为什么需要它（PR#1 ③ / issue #240）══════════════════════════════════════════
 * 上传图片原先**直接把自己当 preview**（`/preview/<token>` = 原图）。壁纸库卡片只有 92px 高、
 * 列宽约 120–160px，却让浏览器下载并解码一张 8064×5376（43 MP、17 MB）的原图；一页 24 张就是
 * 数百 MB 传输 + 24 × 43 MP 解码 ⇒ 同一个渲染进程里的整个 GUI（点击 / 滚动 / 重渲染）全部排队，
 * 表现为"翻到含大图那几页就卡死"。
 *
 * 缩略图把每张压到 ~10 KB 量级（320px 宽 JPEG），卡片只解 0.1 MP ⇒ 卡顿消失；
 * 原图与 `/media` 一个字节都不动，点开播放仍是原画质。
 *
 * ══ 契约（与 `lib/media/video-preview.js` **同族同形**，两处刻意不同点见下）══════
 * deps：
 *   · pluginDataDir()      → 插件数据目录（缩略图落 `<它>/thumbs/`）
 *   · ensureDirOnce(dir)   → memo 化的 mkdirSync（转码套件里那份共享实现）
 *   · transcodeKit         → 只借 `resolveFfmpeg` / `spawnFfmpeg`（不自带供给链，避免成环）
 *   · IMAGE_PREVIEW_WIDTH / IMAGE_PREVIEW_MAX_CONCURRENT（**可选**）→ 缺省 320 / 2
 *
 * 返回面：`imageThumbDir()` · `imageThumbPath(abs)` · `ensureImagePreview(abs)` ·
 *         `pruneImagePreviewCache()` · `IMAGE_PREVIEW_WIDTH`
 *
 * ⚠️ 与视频族的**两处刻意不同**（都是 issue #240 的口径）：
 *   ① 落点是**插件数据目录**的 `thumbs/`，**不放 `cacheDir`** —— 那里会被 cache-prune 按
 *      体积 / 年龄扫，把缩略图当垃圾清掉；它们是**派生但稳定**的资产（源图在就在）。
 *   ② 键含 路径 + size + mtime + 宽度，**不带版本段**（视频族带 `|v1|`），两族键形态各自独立。
 *
 * 不变量：
 *   · **缓存键含 size + mtime + width**：替换源图 / 改宽度 ⇒ 键变 ⇒ 重新生成，绝不吐旧缩略图。
 *   · **同一个键的并发请求共享一次生成**（in-flight 表）：一页 24 张卡片会同时问同一个源，
 *     不合并就是 24 次 ffmpeg。
 *   · **失败一律返回 null，绝不抛给路由**：调用方据此回落原图（换机器 / 没装 ffmpeg /
 *     源文件是畸形图片都要能退化成"慢一点但可用"）。
 *   · **产出判定是 spawn 正常返回**，不是"文件存在"——失败那次可能在盘上留 0 字节残片
 *     （与视频族同一条教训），拿它发布会留下永久坏图。
 *
 * 本模块只 import `node:*` 与相对路径，**绝不** import `lib/index.js`（会成环）。
 */

import { existsSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * 建一次图片缩略图套件。deps 见文件头；返回门面要用的面。
 */
export function createImagePreviewKit(deps) {
  const { pluginDataDir, ensureDirOnce, transcodeKit } = deps;
  const { resolveFfmpeg, spawnFfmpeg } = transcodeKit;

  /**
   * 缩略图宽度上限（px）。卡片最宽约 160 CSS px，按 2× 屏给到 320 —— 再大只是浪费带宽，
   * 再小在高 DPI 上会糊。写进缓存键 ⇒ 以后调这个值会让旧缩略图自然失效（不会端糊图）。
   * ⚠️ 与视频族同：可注入（判据据此钉"键含 width"），缺省 320。
   */
  const IMAGE_PREVIEW_WIDTH = deps.IMAGE_PREVIEW_WIDTH === undefined ? 320 : deps.IMAGE_PREVIEW_WIDTH;
  /** 并发生成闸：一页 24 张同时打开时，别一次 spawn 24 个 ffmpeg 把机器压住。 */
  const IMAGE_PREVIEW_MAX_CONCURRENT = deps.IMAGE_PREVIEW_MAX_CONCURRENT === undefined
    ? 2 : deps.IMAGE_PREVIEW_MAX_CONCURRENT;
  /** 磁盘缓存上限（文件个数）。一张 ~10 KB ⇒ 512 个约 5 MB，足够一个几百张的库。 */
  const IMAGE_PREVIEW_CACHE_MAX = 512;

  let imagePreviewActive = 0;
  const imagePreviewWaiters = [];
  function acquireImagePreviewSlot() {
    if (imagePreviewActive < IMAGE_PREVIEW_MAX_CONCURRENT) {
      imagePreviewActive += 1;
      return Promise.resolve();
    }
    return new Promise((resolveSlot) => { imagePreviewWaiters.push(resolveSlot); });
  }
  function releaseImagePreviewSlot() {
    const next = imagePreviewWaiters.shift();
    if (next) next();
    else imagePreviewActive -= 1;
  }

  /** 缩略图目录：`<插件数据目录>/thumbs`（**刻意不放 cacheDir**，理由见文件头）。 */
  function imageThumbDir() {
    return ensureDirOnce(join(pluginDataDir(), 'thumbs'));
  }

  /**
   * 缓存路径：键 = 绝对路径 + size + mtime + 目标宽度（换源 / 改 mtime / 改宽度都自然失效）。
   * 读不到 stat 时 size/mtime 退化为 0 —— **不抛**（源可能刚被删，调用方会回落原图）。
   */
  function imageThumbPath(abs) {
    let size = 0, mtime = 0;
    try { const st = statSync(abs); size = st.size; mtime = Math.round(st.mtimeMs); } catch { /* 退化 0 */ }
    const key = createHash('sha256')
      .update(String(abs) + '|' + size + '|' + mtime + '|' + IMAGE_PREVIEW_WIDTH)
      .digest('hex').slice(0, 24);
    return join(imageThumbDir(), 'ip_' + key + '.jpg');
  }

  /** 同一输出路径的 in-flight 账本：同键并发只生成一次。 */
  const IMAGE_PREVIEW_INFLIGHT = new Map();

  /**
   * 按需把源图缩成 320px JPEG。成功 ⇒ 返回缩略图绝对路径；**任何失败 ⇒ `null`**（不抛）。
   */
  function ensureImagePreview(abs) {
    if (!abs || typeof abs !== 'string') return Promise.resolve(null);
    let out;
    try { out = imageThumbPath(abs); } catch { return Promise.resolve(null); }
    // 已在盘上 ⇒ 直接命中（热路径：翻页 / 重开面板不该重新跑 ffmpeg）。
    if (existsSync(out)) return Promise.resolve(out);
    const pending = IMAGE_PREVIEW_INFLIGHT.get(out);
    if (pending) return pending;
    const job = (async () => {
      await acquireImagePreviewSlot();
      const tmp = out + '.tmp' + process.pid;
      try {
        const ffmpeg = resolveFfmpeg();
        // `-vf scale=320:-2`：宽定 320、高按比例取偶（JPEG 的 4:2:0 要求偶数）。
        const args = ['-y', '-i', abs, '-vf', 'scale=' + IMAGE_PREVIEW_WIDTH + ':-2', '-q:v', '4', tmp];
        const r = await spawnFfmpeg(args, { ffmpeg });
        // ⚠️ 产出判定 = **spawn 正常返回**（不是"文件存在"）：失败那次可能留下 0 字节残片，
        // 拿它 rename 发布就是永久坏图（与视频族同一条实测教训）。
        if (!r || r.ok !== true) { try { unlinkSync(tmp); } catch { /* ignore */ } return null; }
        renameSync(tmp, out);
        return out;
      } catch {
        try { unlinkSync(tmp); } catch { /* ignore */ }
        return null;
      } finally {
        releaseImagePreviewSlot();
        IMAGE_PREVIEW_INFLIGHT.delete(out);
      }
    })();
    IMAGE_PREVIEW_INFLIGHT.set(out, job);
    return job;
  }

  /** 按 mtime-LRU 收敛缩略图缓存（源图删了以后缩略图会留在盘上，只能靠这条收）。 */
  function pruneImagePreviewCache() {
    /** @type {string[]} */
    let names;
    try { names = readdirSync(imageThumbDir()); } catch { return; }
    const files = names.filter((n) => n.startsWith('ip_') && n.endsWith('.jpg'));
    if (files.length <= IMAGE_PREVIEW_CACHE_MAX) return;
    const ranked = files.map((n) => {
      const p = join(imageThumbDir(), n);
      let mtime = 0; try { mtime = statSync(p).mtimeMs; } catch { /* keep 0 */ }
      return { p, mtime };
    }).sort((a, b) => b.mtime - a.mtime);
    for (const f of ranked.slice(IMAGE_PREVIEW_CACHE_MAX)) {
      try { unlinkSync(f.p); } catch { /* ignore */ }
    }
  }

  return {
    imageThumbDir,
    imageThumbPath,
    ensureImagePreview,
    pruneImagePreviewCache,
    IMAGE_PREVIEW_WIDTH,
  };
}
