#!/usr/bin/env node
/**
 * readability-floors.mjs — 可读性下限常量（`READABILITY_FLOOR` / `READABILITY_FLOOR_DARK`）的**唯一读法**。
 *
 * ── 为什么需要它（这次 P1 修复的实害）──────────────────────────────────────────
 * ADR-0016 第四刀把玻璃样式表随玻璃包搬出主产物之后，这两个常量只住在
 * `packages/glass/src/glass-css.js`（= 玻璃包源，构建期内联进
 * `packages/glass/lib/client.glass.js`）；主产物 `lib/client.js` 里**已经没有**它们的声明。
 * 但有四个守卫仍在用 `SRC.match(/const READABILITY_FLOOR = ([\d.]+);/)` 从主产物取数：
 * 取到 `undefined` ⇒ `Number(undefined)` = `NaN` ⇒ `new Function(...)` 求值后的样式表里
 * `--we-readability-floor-base: NaN` ⇒ 判据对着一份**不是插件真正注入的样式**报绿。
 * 这是本仓最不想要的失败形态（静默失真），所以把读法收敛到这一处并**match 失败即 throw**。
 *
 * ── 口径 ─────────────────────────────────────────────────────────────────────
 *   · 数值的**唯一真源** = `packages/glass/src/glass-css.js` 的两个 `const`（它们被插值进
 *     同一文件的玻璃 CSS 模板；守卫求值样式表时用的就是这个数，两处不可能各说各话）；
 *   · 只认**变量声明形态** `^[ \t]*const <名字> = <数字>;`：散文/注释里出现同样的字面量
 *     不会把锚点带偏（源码里那两条声明在长注释之后单独成行，正是这个形态）；
 *   · **match 失败 / 数值非有限 / 不在 (0,1) 区间 ⇒ throw**（绝不返回 NaN / undefined ——
 *     那正是本 helper 要结构性堵死的失败形态）。
 *
 * 用法：
 *   `import { readabilityFloors } from './tools/readability-floors.mjs';`
 *   `const FLOOR = readabilityFloors();   // { light, dark }`
 *   需要玻璃 CSS 源全文时用 `glassCssSource()`（同样从这一处解析路径，不各抄一份）。
 *
 * 自检：`node test/tools/readability-floors.mjs selftest`（打印实测值 + 范围自证）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** 玻璃包样式源（构建期内联进 `packages/glass/lib/client.glass.js`）。 */
const GLASS_CSS_SRC = fileURLToPath(new URL('../../packages/glass/src/glass-css.js', import.meta.url));

/** 玻璃样式源全文（读点统一走这里 ⇒ "常量住哪个文件"只有一份答案）。 */
export function glassCssSource() {
  return readFileSync(GLASS_CSS_SRC, 'utf8');
}

/**
 * 从玻璃样式源读两个下限常量。
 * @returns {{ light: number, dark: number }}
 * @throws {Error} 声明锚点匹配不到 / 数值非有限 / 不在 (0,1) 区间。
 */
export function readabilityFloors() {
  const text = glassCssSource();
  const read = (name) => {
    const re = new RegExp('^[ \\t]*const ' + name + ' = ([\\d.]+);', 'm');
    const m = text.match(re);
    if (!m) {
      throw new Error('readability-floors: ' + GLASS_CSS_SRC
        + ' 里找不到 `const ' + name + ' = <数字>;`（锚点漂了？—— 这里绝不返回 NaN 让下游判据静默失真）');
    }
    const value = Number(m[1]);
    if (!Number.isFinite(value)) throw new Error('readability-floors: ' + name + ' 解析出非有限数：' + m[1]);
    if (!(value > 0 && value < 1)) {
      throw new Error('readability-floors: ' + name + ' = ' + value + ' 不在 (0,1) 区间（覆盖率常量语义变了？）');
    }
    return value;
  };
  return { light: read('READABILITY_FLOOR'), dark: read('READABILITY_FLOOR_DARK') };
}

/** 正/负对照自检：真实文件可读 + 每条失败形态都必须 throw（判据有牙）。 */
export function selftest() {
  const cases = [];
  const ok = (name, cond, detail) => cases.push({ name, ok: !!cond, detail: String(detail == null ? '' : detail) });
  const floors = readabilityFloors();
  ok('真实源：两个常量都是有限数', Number.isFinite(floors.light) && Number.isFinite(floors.dark),
    'light=' + floors.light + ' dark=' + floors.dark);
  ok('真实源：暗主题下限更高（覆盖率常量语义）', floors.dark > floors.light,
    floors.light + ' < ' + floors.dark);
  // 负对照：同一个解析口径喂给合成文本 —— 缺声明必须 throw（而不是给 NaN）。
  const throwOf = (text) => {
    try {
      const read = (name) => {
        const m = text.match(new RegExp('^[ \\t]*const ' + name + ' = ([\\d.]+);', 'm'));
        if (!m) throw new Error('missing');
        return Number(m[1]);
      };
      return read('READABILITY_FLOOR');
    } catch (e) { return e.message; }
  };
  ok('负对照：缺 `const READABILITY_FLOOR = …;` ⇒ throw（绝不静默 NaN）',
    throwOf('/* READABILITY_FLOOR = 0.45; */') === 'missing');
  ok('负对照：散文/注释里的同名声明不算（行首锚 + `const` 关键字）',
    throwOf(' * READABILITY_FLOOR = 0.45;\n') === 'missing');
  ok('正对照：声明前有缩进也认（产物整段缩进过）',
    throwOf('\t\tconst READABILITY_FLOOR = 0.45;\n') === 0.45);
  const failed = cases.filter((c) => !c.ok);
  for (const c of cases) console.log((c.ok ? '  ✓ ' : '  ✗ ') + c.name + (c.detail ? ' — ' + c.detail : ''));
  console.log('');
  if (failed.length) {
    console.log('READABILITY FLOORS SELFTEST FAILED — ' + failed.length + ' failed');
    process.exitCode = 1;
    return false;
  }
  console.log('READABILITY FLOORS SELFTEST PASSED (' + cases.length + ')');
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('selftest')) selftest();
