#!/usr/bin/env node
/**
 * verify-avatar-interval-and-rotation.mjs —— 三个用户可见行为的聚焦判据：
 *
 *  ① **头像出现间隔可调**（issue #231 第二轮）：`avatarAiRepeatRows` 是合法设置键
 *     （DEFAULTS / KINDS / 复位分组 / 序列化四处齐），面板有滑块，装饰层**现读设置**
 *     而不是读死常量 —— 否则"旋钮在那儿、拖了没反应"。
 *  ② **轮播间隔不再锁死 30 分钟**（issue #230）：`rotationInterval` 是 `DEFAULTS_ONLY`
 *     （不在 KINDS 里），所以任何调用点问 `schemaRange('rotationInterval')` 都会拿到
 *     `[undefined, undefined]` ⇒ `clampNum` 恒回落 30。判据扫源码：**零处**再问 KINDS，
 *     且所有钳制点都用 `ROTATION_INTERVAL_MIN/MAX`（schema 导出的那对真源）。
 *  ③ **「视频播完就换」档**（issue #230 后续诉求）：组字段 `trigger` 被规范化（旧档缺字段
 *     ⇒ `interval`）、`syncRotationTimer` 在该档**不计时**、`watchVideoState` 挂了 ended 分支、
 *     视频层在该档**关掉 loop**（loop 会让 ended 永不触发）。
 *
 * 为什么单独成文件：这三件事都是"看不出来坏没坏"的接线形态 —— 面板上的下拉还在、
 * 值也存得进去，但真正驱动行为的那个函数没读它。源码口径 + 一个小求值台就够钉住。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCheck, braceBody } from './tools/assert-harness.mjs';
import { stripComments } from './tools/js-text.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { check, stats } = createCheck();
const norm = (s) => s.replace(/\r\n/g, '\n');
const read = (p) => norm(readFileSync(join(ROOT, p), 'utf8'));

const schemaSrc = read('lib/settings-schema.js');
const clientSrc = read('src/client.js');
const avatarSrc = read('src/avatar-layer.js');
const extAvatarSrc = read('src/ext-avatar.js');
const tabsSrc = read('src/panel-tabs-wallpaper.js');
const videoSrc = read('src/video-layer.js');

// ── ① avatarAiRepeatRows 四处齐 + 面板滑块 + 装饰层现读 ──────────────────────
{
  const schemaMod = await import(new URL('../lib/settings-schema.js', import.meta.url).href);
  const inDefaults = schemaMod.DEFAULTS.avatarAiRepeatRows === 6;
  const inKinds = Boolean(schemaMod.KINDS.avatarAiRepeatRows)
    && schemaMod.KINDS.avatarAiRepeatRows.min === schemaMod.AVATAR_AI_REPEAT_MIN
    && schemaMod.KINDS.avatarAiRepeatRows.max === schemaMod.AVATAR_AI_REPEAT_MAX;
  const inMascotGroup = (schemaMod.SETTINGS_NAMESPACES.mascot || []).includes('avatarAiRepeatRows');
  const inExtensionsReset = schemaMod.RESET_TABS.extensions.includes('avatarAiRepeatRows');
  check('avatarAiRepeatRows：DEFAULTS / KINDS / 命名空间 / 页签复位四处齐（且是合法设置键）',
    inDefaults && inKinds && inMascotGroup && inExtensionsReset,
    'defaults=' + inDefaults + ' kinds=' + inKinds + ' ns=' + inMascotGroup + ' reset=' + inExtensionsReset);
  check('avatarAiRepeatRows：能过 serialize → sanitize 往返（不会在落盘时被丢掉）',
    (() => {
      const t = schemaMod.sanitizeFromSchema({ avatarAiRepeatRows: 11 }, 'client');
      return t.avatarAiRepeatRows === 11
        && schemaMod.serializeSettings({ avatarAiRepeatRows: 11 }).avatarAiRepeatRows === 11;
    })());
  // 越界 / 坏值 ⇒ 回落默认值（clampNum 语义：越界即默认，不是夹紧）
  check('avatarAiRepeatRows：越界与坏值回落默认（不把 0 / 999 / NaN 写进设置）',
    schemaMod.sanitizeFromSchema({ avatarAiRepeatRows: 0 }, 'client').avatarAiRepeatRows === 6
    && schemaMod.sanitizeFromSchema({ avatarAiRepeatRows: 999 }, 'client').avatarAiRepeatRows === 6
    && schemaMod.sanitizeFromSchema({ avatarAiRepeatRows: 'x' }, 'client').avatarAiRepeatRows === 6);
  check('面板：扩展页签有「助手头像间隔」滑块，量程取 schema 常量（不手写数字）',
    extAvatarSrc.includes('weT("助手头像间隔")')
    && /AVATAR_AI_REPEAT_MIN,\s*AVATAR_AI_REPEAT_MAX/.test(extAvatarSrc)
    && extAvatarSrc.includes('onAvatarAiRepeatRows'));
  check('装饰层：分组**现读设置**（avatarAiRepeatRows 读 selection），不是读死常量',
    avatarSrc.includes('function avatarAiRepeatRows(selLike)')
    && avatarSrc.includes('sel.avatarAiRepeatRows')
    && avatarSrc.includes('const repeatRows = avatarAiRepeatRows();')
    && avatarSrc.includes('aiSince >= repeatRows')
    // 兜底值必须与 schema 默认同值（否则"设置缺失"的机器上表现与默认档不一样）
    && /const AVATAR_AI_REPEAT_FALLBACK = 6;/.test(avatarSrc));
  // ⚠️ 判据读**剥掉注释**的源码：解释"别写成 schemaRange(...)"的注释本身会命中子串。
  check('处理器：onAvatarAiRepeatRows 走 schemaRange（改 KINDS 不会漏改第二处）',
    clientSrc.includes('function onAvatarAiRepeatRows(v, live)')
    && stripComments(clientSrc).includes('...schemaRange("avatarAiRepeatRows")')
    && clientSrc.includes('onAvatarSize, onAvatarRadius, onAvatarAiRepeatRows'));
}

// ── ② 轮播间隔不再锁死 30 分钟（issue #230）─────────────────────────────────
{
  // 根因判据：`rotationInterval` 是 DEFAULTS_ONLY（不在 KINDS），问 KINDS 必得 undefined。
  check('前提：rotationInterval 仍是 DEFAULTS_ONLY（不在 KINDS）—— 所以不能问 schemaRange',
    read('lib/settings-schema.js').includes("const DEFAULTS_ONLY = ['rotationInterval'")
    && !/^\s*rotationInterval:\s*\{\s*kind:/m.test(schemaSrc));
  // 同一理由：注释里那句"不要用 schemaRange(\"rotationInterval\")"不算调用。
  check('修复：src/** 里**零处**再对 rotationInterval 调 schemaRange',
    !stripComments(clientSrc).includes('schemaRange("rotationInterval")'));
  const clamps = [...clientSrc.matchAll(/clampNum\(\s*[^;]*?DEFAULTS\.rotationInterval\s*\)/g)].map((m) => m[0]);
  check('修复：所有轮播间隔钳制点都用 ROTATION_INTERVAL_MIN/MAX（' + clamps.length + ' 处）',
    clamps.length >= 3 && clamps.every((c) => c.includes('ROTATION_INTERVAL_MIN, ROTATION_INTERVAL_MAX')),
    clamps.join(' | '));
  check('真源：schema 导出那对常量，且 readRotationGroups 用它（宿主与客户端同一域）',
    schemaSrc.includes('const ROTATION_INTERVAL_MIN = 1, ROTATION_INTERVAL_MAX = 1440;')
    && schemaSrc.includes('clampNum(g.interval, ROTATION_INTERVAL_MIN, ROTATION_INTERVAL_MAX, fallbackInterval)'));
  // 行为：真跑 readRotationGroups，任意档位都要被保留（30 以外的值不再被吞掉）
  const schemaMod = await import(new URL('../lib/settings-schema.js', import.meta.url).href);
  const kinds = schemaMod.KINDS.rotationGroups;
  const mk = (interval) => ({ id: 'g', name: 'g', interval, order: 'sequence', wallpaperIds: ['a'] });
  const round = (interval) => {
    // readRotationGroups 不导出 ⇒ 走同一套消毒入口（rotationGroups 的 kind 就是 'groups'）
    const out = schemaMod.sanitizeFromSchema({ rotationGroups: [mk(interval)] }, 'client');
    return out.rotationGroups[0].interval;
  };
  const probes = [1, 5, 10, 30, 60, 120, 180, 600];
  const got = probes.map(round);
  check('行为：间隔消毒保留 1/5/10/30/60/120/180/600 全部档位（30 只是其中之一）',
    got.join(',') === probes.join(','), got.join(','));
  check('前提自检：rotationGroups 的 kind 仍是 groups（上面那条走的是真消毒路径）',
    kinds && kinds.kind === 'groups');
}

// ── ③ 「视频播完就换」档（issue #230 后续诉求）───────────────────────────────
{
  const schemaMod = await import(new URL('../lib/settings-schema.js', import.meta.url).href);
  const round = (trigger) => schemaMod.sanitizeFromSchema(
    { rotationGroups: [{ id: 'g', name: 'g', interval: 30, order: 'sequence', wallpaperIds: ['a'], trigger }] }, 'client'
  ).rotationGroups[0].trigger;
  check('trigger 规范化：videoEnd 保留 · interval 保留 · 缺字段/坏值 ⇒ interval',
    round('videoEnd') === 'videoEnd' && round('interval') === 'interval'
    && round(undefined) === 'interval' && round('nonsense') === 'interval');
  // 计时器：该档**不建**计时器（推进由 ended 驱动）
  const timerBody = braceBody(clientSrc, 'syncRotationTimer');
  check('syncRotationTimer：videoEnd 档不计时（在读 minutes 之前就 return）',
    timerBody.includes('group.trigger === "videoEnd"')
    && timerBody.indexOf('videoEnd') < timerBody.indexOf('window.setTimeout'),
    timerBody.slice(0, 240));
  // ended 分支：只在 videoEnd 档、只对当前壁纸的视频、且 loop 为假时推进
  check('watchVideoState：ended ⇒ 仅 videoEnd 档 + 当前视频壁纸 + 非 loop 才 beginRotationPrepare',
    clientSrc.includes('group.trigger !== "videoEnd"')
    && clientSrc.includes('beginRotationPrepare(new Set())')
    && clientSrc.includes('liveLog("rotation-video-end"'));
  const endedAt = clientSrc.indexOf('video.addEventListener("ended"');
  const endedBody = endedAt >= 0 ? clientSrc.slice(endedAt, endedAt + 1600) : '';
  check('ended 分支的三道门都在（videoEnd / 当前视频 / 非 loop）',
    endedBody.includes('video.loop') && endedBody.includes('cur.type !== "video"')
    && endedBody.includes('trigger !== "videoEnd"')
    && endedBody.includes('rotationCandidates().length < 2'));
  // 视频层：该档必须关 loop，否则 ended 永不触发
  check('视频层：videoEnd 档关掉 media.loop（loop 会让 ended 永不触发）',
    videoSrc.includes('activeRotationGroup')
    && videoSrc.includes('g.trigger === "videoEnd"')
    && /media\.loop\s*=/.test(videoSrc)
    && !/media\.loop = true;/.test(videoSrc));
  // 面板：编辑器与主行都有推进方式下拉，处理器进 ctx
  check('面板：编辑器与主行都能选推进方式（两个 select + 两个处理器进 ctx）',
    tabsSrc.includes('onEditTrigger') && tabsSrc.includes('onGroupTrigger')
    && tabsSrc.includes('weT("视频播完就换")') && tabsSrc.includes('weT("按间隔")')
    && tabsSrc.includes('weT("轮播推进方式")')
    && clientSrc.includes('function onEditTrigger(e)')
    && clientSrc.includes('const onGroupTrigger = (e) =>')
    && clientSrc.includes('onEditTrigger, onGroupChange, onGroupInterval, onGroupTrigger'));
  // 选中视频结束档时，已经上屏的那层要立刻换 loop 语义（否则要等下一次换壁纸才生效）
  check('切换推进方式会立刻改已上屏视频的 loop（不只影响下一次建层）',
    clientSrc.includes('media.loop = group.trigger !== "videoEnd"'));
}

// ── ④ 图片缩略图管线（issue #240）───────────────────────────────────────────
{
  const imgSrc = read('lib/media/image-preview.js');
  const bytesSrc = read('lib/routes/media-bytes.js');
  const invSrc = read('lib/inventory.js');
  check('缩略图管线：落数据目录 thumbs/（**不**放会被 cache-prune 扫的缓存根）',
    imgSrc.includes("join(pluginDataDir(), 'thumbs')")
    && !imgSrc.includes('cacheBaseDir'));
  check('缩略图管线：缓存键含 size+mtime+宽度（换源 / 换宽度都自然失效）',
    imgSrc.includes("st.size") && imgSrc.includes('st.mtimeMs')
    && imgSrc.includes('IMAGE_PREVIEW_WIDTH')
    && imgSrc.includes("'|ip1|'"));
  check('缩略图管线：同键并发共享一次生成 + 失败返回 null（不抛给路由）',
    imgSrc.includes('const INFLIGHT = new Map();')
    && imgSrc.includes('INFLIGHT.get(out)')
    && imgSrc.includes('IMAGE_PREVIEW_MAX_CONCURRENT')
    && imgSrc.includes('return null;'));
  check('路由 /preview：图片按需缩略图 + 缺失回落原图 + 开 revalidate（304 缓存）',
    bytesSrc.includes('ensureImagePreview')
    && /serveFile\(thumb \|\| abs, req, res, method === 'HEAD', \{ revalidate: true \}\)/.test(bytesSrc)
    // 缩略图自己不再二次缩略（清单可能直接把 preview 指向 thumbs/ip_*.jpg）
    && bytesSrc.includes('[\\\\/]thumbs[\\\\/]ip_')
    // /media 保持默认（不给 revalidate）—— 视频要 Range，播放中不能换字节语义
    && bytesSrc.includes("if (seg !== 'preview') { serveFile(abs, req, res, method === 'HEAD'); return; }"));
  check('清单：上传图片已有缩略图就指向它，否则回落原图（缺失不坏、换机器不坏）',
    invSrc.includes('function previewSourceAbs(w)')
    && invSrc.includes('imageThumbPath(w.previewAbs)')
    && invSrc.includes('existsSync(thumb)'));
}

if (stats.failed) {
  console.error('AVATAR-INTERVAL + ROTATION CHECKS FAILED — ' + stats.failed + ' failed, ' + stats.passed + ' passed');
  process.exitCode = 1;
} else {
  console.log('ALL AVATAR-INTERVAL + ROTATION CHECKS PASSED (' + stats.passed + ')');
}
