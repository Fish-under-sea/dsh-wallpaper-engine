#!/usr/bin/env node
/**
 * verify-cache-keys.mjs —— 缓存产物文件名与 checkout 深度解耦（issue #208 / PR #246）。
 *
 * 真机形态：深目录 checkout 里 GPU 抓帧缓存名是 `lf1_<base64url(abs)>_<mtime>_gpu.png`；
 * base64url 是路径长度的 1.34 倍 ⇒ 产物名顶到 258 B > NAME_MAX(255) ⇒ ENAMETOOLONG，
 * `verify-scene` 出现一批与代码无关的假红。修法：键里只放 sha256(abs) 前 16 hex。
 *
 * 判据：① 键长与路径深度无关（400 字节路径也远低于 NAME_MAX）；② 键确定、互不碰撞、
 * 版本前缀保留；③ 三个命名空间（lf2 / sv1 / sa1）统一走 lib/cache-keys.js；④ 变异体
 * （旧 base64url 拼法 / 深路径）必须让同一判据判红。
 */
import { readFileSync } from 'node:fs';
import { createCheck } from './tools/assert-harness.mjs';
import { cacheKeyFor } from '../lib/cache-keys.js';

const { check, stats } = createCheck();
const DEEP = '/' + Array.from({ length: 40 }, (_, i) => 'wallpaper-scene-checkout-depth-' + i).join('/') + '/scene';
const LONGEST = (key) => `${key}_gpu.png.tmp${'1234567890'.slice(0, 5)}123456`.length;

// ① 长度与绝对路径长度无关。
{
  const key = cacheKeyFor('lf2', DEEP, 1729950000000);
  check('K1 cache key length is independent of checkout depth (far below NAME_MAX 255)',
    DEEP.length > 400 && LONGEST(key) < 80,
    'absLen=' + DEEP.length + ' key=' + key + ' longestName=' + LONGEST(key) + 'B');
}

// ② 确定性 / 唯一性 / 命名空间。
{
  const a = cacheKeyFor('sv1', '/a/b/scene.mp4', 42);
  const b = cacheKeyFor('sv1', '/a/b/scene.mp4', 42);
  const c = cacheKeyFor('sv1', '/a/b/scene.mp4', 43);
  const d = cacheKeyFor('sv1', '/a/b/other.mp4', 42);
  const e = cacheKeyFor('sa1', '/a/b/scene.mp4', 42);
  check('K2 keys are deterministic, mtime/path/namespace sensitive, and path-free',
    a === b && a !== c && a !== d && a !== e
      && /^[a-z0-9]+_[0-9a-f]{16}_\d+$/.test(a) && !a.includes('base64'),
    JSON.stringify({ a, c, d, e }));
}

// ③ 取不到 mtime 时不许把 NaN 写进文件名。
{
  const key = cacheKeyFor('lf2', '/x.mp4', NaN);
  check('K3 a missing mtime degrades to 0 instead of writing NaN into the name',
    /_0$/.test(key) && !/NaN/.test(key), key);
}

// ④ 三个命名空间统一走 cache-keys（静态契约 + 变异负对照）。
{
  const frameStore = readFileSync(new URL('../lib/media/frame-store.js', import.meta.url), 'utf8');
  const sceneProbe = readFileSync(new URL('../lib/media/scene-probe.js', import.meta.url), 'utf8');
  const sceneMedia = readFileSync(new URL('../packages/media-bridge/lib/routes/scene-media.js', import.meta.url), 'utf8');
  const boot = readFileSync(new URL('../lib/subpackage-boot.js', import.meta.url), 'utf8');
  const violations = (texts) => {
    const out = [];
    if (!/LIVE_FRAME_KEY_VERSION = 'lf2'/.test(texts.frameStore)) out.push('抓帧键版本未 bump 到 lf2');
    if (!/cacheKeyFor\(LIVE_FRAME_KEY_VERSION, abs, mtime\)/.test(texts.frameStore)) out.push('抓帧键没走 cacheKeyFor');
    if (!/cacheKeyFor\('sa1', abs, mtime\)/.test(texts.sceneProbe)) out.push('场景音频键没走 cacheKeyFor');
    if (!/cacheKeyFor\('sv1', abs, mtime\)/.test(texts.sceneMedia)) out.push('场景视频键没走 cacheKeyFor');
    if (/base64url/.test(texts.frameStore.replace(/^[\s\S]*?const LIVE_FRAME_KEY_VERSION = 'lf2';/, '').split('// <')[1] || '')) out.push('抓帧键仍出现 base64url');
    if (!/cacheKeyFor:\s*'boot:cacheKeyFor'/.test(texts.boot)) out.push('key 表未登记 boot:cacheKeyFor');
    return out;
  };
  const texts = { frameStore, sceneProbe, sceneMedia, boot };
  check('K4 all three cache namespaces derive keys through lib/cache-keys.js (lf2 / sv1 / sa1)',
    violations(texts).length === 0, violations(texts).join('；'));
  // 负对照：把抓帧键改回旧 base64url 拼法 ⇒ 同一 detector 判红。
  const oldFrame = frameStore.replace(
    'return cacheKeyFor(LIVE_FRAME_KEY_VERSION, abs, mtime);',
    "return LIVE_FRAME_KEY_VERSION + '_' + Buffer.from(abs, 'utf8').toString('base64url') + '_' + Math.round(mtime);");
  check('K5 negative control: the old base64url key construction is flagged',
    violations({ ...texts, frameStore: oldFrame }).some((v) => /cacheKeyFor|base64url/.test(v)));
}

// ⑤ 旧拼法在深路径下确实会超 NAME_MAX（证明这条守卫有牙，不是恒真）。
{
  const oldName = ('lf1_' + Buffer.from(DEEP, 'utf8').toString('base64url') + '_1729950000000' + '_gpu.png').length;
  check('K6 negative control: the old base64url formula really exceeds NAME_MAX at this depth',
    oldName > 255, 'oldName=' + oldName + 'B');
}

if (stats.failed) {
  console.error('CACHE KEY CHECKS FAILED — ' + stats.failed + ' failed, ' + stats.passed + ' passed');
  process.exitCode = 1;
} else {
  console.log('ALL CACHE KEY CHECKS PASSED (' + stats.passed + ')');
}
