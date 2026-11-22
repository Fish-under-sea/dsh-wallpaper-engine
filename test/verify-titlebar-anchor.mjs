#!/usr/bin/env node
/**
 * verify-titlebar-anchor.mjs —— 标题栏玻璃的容器锚点必须是**运行时探针**（#235）。
 *
 * 真机形态：宿主 AppFrame 的类名 = CSS-module 构建哈希 + 固定 local 名（`pI_x6G_frame` /
 * `BynINW_frame` / 本仓实测的 `_1qAH1q_frame` …）。把哈希写进选择器 ⇒ 宿主一升级，标题栏
 * 玻璃（含软件渲染回退）就**静默失效**，而两道硬门（[data-windows-titlebar] /
 * [data-we-adapter]）都还成立 ⇒「开关怎么点都没反应」。
 *
 * ADR-0016 第三刀后探针随玻璃层搬到 packages/glass/src/glass-layer.js，CSS 在 glass-css.js。
 * 本守卫在 mock DOM 上跑**真 syncTitlebarAnchor / findTitlebarFrame 源码**，钉住：
 *   T1 座位祖先链命中（布局事实，不受哈希漂移影响）；
 *   T2 座位缺席时的宽度兜底（≥70% 视口才算整页 grid 容器）；
 *   T3 关掉开关 ⇒ 宿主 DOM 上不留本插件属性；
 *   T4 负对照：宽度不足的 `*_frame` 不得被误认成标题栏容器；
 *   T5 静态契约：玻璃 CSS 里不再出现 `div[class*="…_frame"]` 哈希锚点，只用 [data-we-titlebar-anchor]；
 *   T5b 探针生命周期：玻璃层 sync 里接线、dispose 里摘除（而不是留在主包 effects.js）。
 */
import { readFileSync } from 'node:fs';
import { createCheck } from './tools/assert-harness.mjs';

const { check, stats } = createCheck();

function makeEl({ className = '', rect = { width: 0, height: 0, left: 0, top: 0 } } = {}) {
  const el = {
    nodeType: 1,
    className,
    children: [],
    parentElement: null,
    attrs: new Set(),
    rect,
    setAttribute(k) { this.attrs.add(k); },
    removeAttribute(k) { this.attrs.delete(k); },
    hasAttribute(k) { return this.attrs.has(k); },
    getBoundingClientRect() { return this.rect; },
    append(child) { child.parentElement = this; this.children.push(child); return child; },
    querySelector(sel) {
      const test = sel.includes('data-slot="sidebar"') ? 'sidebar'
        : sel.includes('data-slot="conversation"') ? 'conversation' : null;
      if (!test) return null;
      let hit = null;
      (function walk(node) {
        if (hit) return;
        if (node.attrs && node.attrs.has('data-slot=' + test)) { hit = node; return; }
        for (const c of node.children) walk(c);
      })(this);
      return hit;
    },
    querySelectorAll(sel) {
      const out = [];
      const attr = /^\[([\w-]+)\]$/.exec(sel);
      const cls = /^div\[class\]$/.test(sel);
      (function walk(node) {
        if (!node || node.nodeType !== 1) return;
        if (attr && node.attrs.has(attr[1])) out.push(node);
        if (cls && node.className) out.push(node);
        for (const c of node.children) walk(c);
      })(this);
      return out;
    },
  };
  return el;
}

function makeDocument(bodyChildren) {
  const body = makeEl();
  for (const c of bodyChildren) body.append(c);
  const doc = {
    body,
    querySelector(sel) {
      const test = sel.includes('data-slot="sidebar"') ? 'sidebar'
        : sel.includes('data-slot="conversation"') ? 'conversation' : null;
      if (!test) return null;
      let hit = null;
      (function walk(node) {
        if (hit) return;
        if (node.attrs.has('data-slot=' + test)) { hit = node; return; }
        for (const c of node.children) walk(c);
      })(body);
      return hit;
    },
    querySelectorAll(sel) { return body.querySelectorAll(sel); },
  };
  return doc;
}

const LAYER = readFileSync(new URL('../packages/glass/src/glass-layer.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../packages/glass/src/glass-css.js', import.meta.url), 'utf8');
const BODY = LAYER.replace(/export\s*\{[\s\S]*?\};?/g, ' ');
const load = (doc) => new Function('document', 'window',
  BODY + '\nreturn { findTitlebarFrame, syncTitlebarAnchor };')(doc, { innerWidth: 1000 });

// T1：座位祖先链（哈希前缀随便变都不影响结构事实）。
{
  const frame = makeEl({ className: '_1qAH1q_frame', rect: { width: 1000, height: 800, left: 0, top: 0 } });
  const col = makeEl({ className: 'x_sidebarCol' });
  const seat = makeEl({ className: 'seat' });
  seat.setAttribute('data-slot=sidebar');
  col.append(seat); frame.append(col);
  const doc = makeDocument([frame]);
  const api = load(doc);
  api.syncTitlebarAnchor(true);
  check('T1 sidebar ancestry marks the AppFrame container regardless of the hash prefix',
    frame.hasAttribute('data-we-titlebar-anchor')
      && api.findTitlebarFrame() === frame);
}

// T2：座位缺席 ⇒ 宽度 ≥70% 视口的 *_frame 才算。
{
  const small = makeEl({ className: 'other_frame', rect: { width: 100, height: 100, left: 0, top: 0 } });
  const big = makeEl({ className: 'BynINW_frame', rect: { width: 900, height: 700, left: 0, top: 0 } });
  const doc = makeDocument([small, big]);
  const api = load(doc);
  api.syncTitlebarAnchor(true);
  check('T2 without a sidebar seat the >=70%-viewport *_frame is chosen (small one ignored)',
    big.hasAttribute('data-we-titlebar-anchor') && !small.hasAttribute('data-we-titlebar-anchor'));
}

// T3：关掉开关 ⇒ 全部摘除（不在宿主 DOM 留插件属性）。
{
  const frame = makeEl({ className: '_1qAH1q_frame', rect: { width: 1000, height: 800, left: 0, top: 0 } });
  const doc = makeDocument([frame]);
  const api = load(doc);
  api.syncTitlebarAnchor(true);
  api.syncTitlebarAnchor(false);
  check('T3 toggling off removes every data-we-titlebar-anchor', !frame.hasAttribute('data-we-titlebar-anchor'));
}

// T4：负对照 —— 只有宽度不足的 *_frame 时不得误标（证明 T2 不是恒真）。
{
  const small = makeEl({ className: 'other_frame', rect: { width: 100, height: 100, left: 0, top: 0 } });
  const doc = makeDocument([small]);
  const api = load(doc);
  api.syncTitlebarAnchor(true);
  check('T4 negative control: a narrow *_frame is never mistaken for the titlebar container',
    !small.hasAttribute('data-we-titlebar-anchor'));
}

// T5：静态契约 —— 玻璃 CSS 里不再有哈希锚点，顶栏规则只认运行时锚点。
{
  const HASH = /div\[class\*="[A-Za-z0-9_]+_frame"\]/;
  const tbLines = CSS.split('\n').filter((l) => l.includes('[data-we-titlebar-glass]'));
  check('T5 titlebar CSS uses [data-we-titlebar-anchor] and contains no build-hash frame selector',
    !HASH.test(CSS)
      && tbLines.some((l) => l.includes('[data-we-titlebar-anchor]'))
      && !tbLines.some((l) => HASH.test(l)));
  check('T5 negative control: the old hash-anchor form is caught by the same detector',
    HASH.test('div[class*="pI_x6G_frame"]') === true);
  check('T5b the probe is wired by the glass layer and cleaned up in its dispose (not left in effects.js)',
    /syncTitlebarAnchor\(selection\.titlebarGlass === true && !skinYield\)/.test(LAYER)
      && /disposeGlassLayer[\s\S]*?querySelectorAll\("\[data-we-titlebar-anchor\]"\)/.test(LAYER)
      && !/findTitlebarFrame/.test(readFileSync(new URL('../src/effects.js', import.meta.url), 'utf8')));
}

if (stats.failed) {
  console.error('TITLEBAR ANCHOR CHECKS FAILED — ' + stats.failed + ' failed, ' + stats.passed + ' passed');
  process.exitCode = 1;
} else {
  console.log('ALL TITLEBAR ANCHOR CHECKS PASSED (' + stats.passed + ')');
}
