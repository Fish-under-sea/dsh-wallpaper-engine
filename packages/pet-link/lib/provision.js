import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEME_NAMES, PET_NAMES } from './prepared.js';

/**
 * provision.js —— 把**内置资源**落到本插件自己的数据根（P1：内置 provider 的资源面）。
 *
 * 为什么需要这一步：九动画 / 五气泡的**字节**随包发（`packages/pet-link/assets`、`packages/pet/assets`），
 * 但内置桌宠运行时只从两个地方取素材：
 *   ① 用户数据根 `$DSH_HOME/dsh-we-pet-builtin/main-animation/webm/`（优先）；
 *   ② 包内 `packages/pet/assets/webm/`（兜底）。
 * 而**动画池**（`animations.events.DSHWE`）只从配置与 `animation-ext/*-ext.json` 合并而来 ——
 * 包里没有、用户也没准备时，池是空的 ⇒ 素材在盘上却永远不会被点播（"可达"是假的）。
 *
 * 所以内置 provider 在装载时做一次**幂等合并**：把九段 webm 与五张 png 复制到数据根，
 * 并把 `DSHWE` 池按「只追加」写进 `animation-ext/leash-bridge-ext.json`。
 *
 * 纪律（每条都来自旧的 inject-assets 踩坑记录）：
 *   · **只追加**：`target` 必须是 `main`；其它事件池、其它字段原样保留，绝不改写用户已有内容；
 *   · **不覆盖同名素材**：字节不同就跳过并记录原因（用户可能自己换过素材）；
 *   · **不动外部链**：数据根是 `$DSH_HOME/dsh-we-pet-builtin`（本插件自己的产品数据面），
 *     不是外部 `dsh-pet` 的目录 —— 不改外部 pet 安装与数据；
 *   · 全部幂等：内容已齐 ⇒ 不产生任何写入（不刷 mtime）。
 */

/** 内置素材根（`packages/pet-link/assets`）。 */
const ASSETS_ROOT = fileURLToPath(new URL('../assets/', import.meta.url));

const EXT_NAME = 'leash-bridge-ext.json';
/** 池键：与 `src/pet-link.js` 的 `events.DSHWE` 同一字面量（改这里必须同步那边）。 */
const POOL_KEY = 'DSHWE';
const TARGET = 'main';

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/**
 * 计算要写的文件（纯函数：不落盘）。测试与运行时共用这一份。
 *
 * @param {string} dataRoot 本插件数据根（`$DSH_HOME/dsh-we-pet-builtin`）
 * @param {{assetsRoot?: string, petNames?: readonly string[], memeNames?: readonly string[]}} [options]
 * @returns {{writes: {path: string, data: Buffer}[], skipped: string[], pool: string[]}}
 */
export function planProvision(dataRoot, options = {}) {
  const assetsRoot = options.assetsRoot || ASSETS_ROOT;
  const petNames = options.petNames || PET_NAMES;
  const memeNames = options.memeNames || MEME_NAMES;
  const writes = [];
  const skipped = [];

  for (const name of petNames) {
    const src = join(assetsRoot, 'webm', name + '.webm');
    const dst = join(dataRoot, 'main-animation', 'webm', name + '.webm');
    if (!existsSync(src)) { skipped.push(name + '（包内素材缺失）'); continue; }
    const data = readFileSync(src);
    if (existsSync(dst)) {
      if (!readFileSync(dst).equals(data)) skipped.push(name + '（用户已有不同字节，保留用户的）');
      continue; // 同字节 ⇒ 幂等，不重写（保持 mtime）
    }
    writes.push({ path: dst, data });
  }

  for (const name of memeNames) {
    const src = join(assetsRoot, 'memes', name + '.png');
    const dst = join(dataRoot, 'memes', name + '.png');
    if (!existsSync(src)) { skipped.push(name + '（包内表情缺失）'); continue; }
    const data = readFileSync(src);
    if (existsSync(dst)) {
      if (!readFileSync(dst).equals(data)) skipped.push(name + '（用户已有不同字节，保留用户的）');
      continue;
    }
    writes.push({ path: dst, data });
  }

  // 动画扩展：只追加 DSHWE 池，其它键原样保留。
  const extPath = join(dataRoot, 'animation-ext', EXT_NAME);
  const existing = readJsonIfExists(extPath) || {};
  const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const pools = object(existing.animations) && object(existing.animations.events) ? existing.animations.events : {};
  const current = Array.isArray(pools[POOL_KEY]) ? pools[POOL_KEY] : [];
  const merged = [];
  for (const name of [...petNames, ...current]) if (typeof name === 'string' && name && !merged.includes(name)) merged.push(name);
  if (existing.target != null && existing.target !== TARGET) {
    skipped.push(EXT_NAME + '（target=' + String(existing.target) + ' 不是 main，保留原文件）');
    return { writes, skipped, pool: current };
  }
  const next = {
    ...existing,
    target: TARGET,
    animations: { ...(object(existing.animations) ? existing.animations : {}), events: { ...pools, [POOL_KEY]: merged } },
  };
  const data = Buffer.from(JSON.stringify(next, null, 2) + '\n');
  const same = existsSync(extPath) && readFileSync(extPath).equals(data);
  if (!same) writes.push({ path: extPath, data });
  return { writes, skipped, pool: merged };
}

/**
 * 落盘（幂等）。任何失败只返回诊断，**不抛**：资源准备失败不该让整行组件装载失败
 * （就绪面会如实把 `available:false` 与原因报给浏览器半边，用户看到的是降级而不是白屏）。
 *
 * @returns {{written: number, skipped: string[], pool: string[], error: string|null}}
 */
export function provisionAssets(dataRoot, options = {}) {
  try {
    const plan = planProvision(dataRoot, options);
    for (const file of plan.writes) {
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, file.data);
    }
    return { written: plan.writes.length, skipped: plan.skipped, pool: plan.pool, error: null };
  } catch (error) {
    return { written: 0, skipped: [], pool: [], error: String((error && error.message) || error) };
  }
}
