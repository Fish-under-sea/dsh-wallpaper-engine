#!/usr/bin/env node
/** 执行真实几何解析：已知侧栏网格与根平移不能令展开中的玻璃消失。 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/glass-surfaces.js', import.meta.url), 'utf8').replace(/export\s*\{[^}]+\};?\s*$/, '');
const { geometry, refresh } = new Function(source + '\nreturn {geometry:weSurfaceGeometry,refresh:state=>{weSurfaceRuntime=state;weSurfaceRefresh(state);}};')();
const plain = { display: 'block', visibility: 'visible', opacity: '1', backdropFilter: 'none', webkitBackdropFilter: 'none',
  transform: 'none', perspective: 'none', filter: 'none', isolation: 'auto', mixBlendMode: 'normal', contain: 'none',
  willChange: 'auto', translate: 'none', rotate: 'none', scale: 'none', overflow: 'visible', overflowX: 'visible', overflowY: 'visible',
  borderRadius: '10px', position: 'absolute', zIndex: 'auto' };
let shiftX = 0, shiftY = 0;
const rect = (left, top, width, height) => ({ left: left + shiftX, top: top + shiftY, width, height,
  right: left + shiftX + width, bottom: top + shiftY + height });
const make = (parentElement, bounds) => {
  const attributes = new Map();
  return { parentElement, nodeType: 1, style: { ...plain }, animations: [], isConnected: true,
    getAnimations() { return this.animations; }, getBoundingClientRect: () => rect(...bounds),
    // 候选判据要求「在布局里」：getClientRects() 非空即视为参与布局（真 DOM 语义）。
    getClientRects: () => [rect(...bounds)], closest: () => null,
    // 内容面判据会在已展开的面板里找 .cm-editor/.xterm/[data-document-preview]；本替身没有内容面。
    querySelectorAll: () => [],
    getAttribute: key => attributes.get(key) ?? null, hasAttribute: key => attributes.has(key),
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
};
const root = make(null, [0, 0, 1200, 800]), body = make(root, [0, 0, 1200, 800]);
const frame = make(body, [0, 0, 1200, 800]), column = make(frame, [900, 0, 300, 800]);
const panel = make(column, [900, 0, 300, 800]);
panel.setAttribute('data-sidebar-right-panel', 'push');
panel.closest = selector => selector === '[data-rightbar-col]' ? column : null;
const win = { innerWidth: 1200, innerHeight: 800, scrollX: 0, scrollY: 0, getComputedStyle: el => el.style };
const doc = { defaultView: win, documentElement: root, body };
for (const el of [root, body, frame, column, panel]) el.ownerDocument = doc;
// 有限过渡：playState=running 且 endTime 有限 —— 宿主开合侧栏时 frame 上的列宽过渡就是这种。
const finite = (extra, endTime = 450) => ({ playState: 'running', ...extra,
  effect: { ...extra.effect, getComputedTiming: () => ({ endTime }) } });
const grid = finite({ transitionProperty: 'grid-template-columns', effect: { target: frame } });
const shake = finite({ effect: { target: root, getKeyframes: () => [{ offset: 0, translate: '0px 0px' }, { offset: 1, translate: '8px -5px' }] } });
assert.equal(geometry(panel, 'right-sidebar').safeRoot, true, '静态基线应可建立玻璃');
assert.equal(geometry(panel, 'right-sidebar').moving, false, '静止时不得安排续帧');
frame.animations = [grid];
const duringOpen = geometry(panel, 'right-sidebar');
assert.equal(duringOpen.safeRoot, true, '拥有侧栏的网格过渡不应让玻璃回退到原生');
assert.equal(duringOpen.moving, true, '有限过渡期间必须置 moving 让底板逐帧跟住几何');
root.animations = [shake]; root.style.translate = '8px -5px'; shiftX = 8; shiftY = -5;
assert.equal(geometry(panel, 'right-sidebar').safeRoot, true, '根平移和独立玻璃同处一个坐标系，哈气中不能撤霜');
// 无限动画（常驻 spinner）不触发续帧 —— 否则等于常驻 rAF。
root.animations = []; root.style.translate = 'none'; shiftX = 0; shiftY = 0;
frame.animations = [finite({ transitionProperty: 'transform', effect: { target: frame } }, Infinity)];
assert.equal(geometry(panel, 'right-sidebar').moving, false, '无限动画不得安排续帧（防常驻 rAF）');
// 祖先上的有限 filter 动画：computed filter 已经不再是 none ⇒ 仍必须回退原生。
const foreign = finite({ effect: { target: frame, getKeyframes: () => [{ filter: 'none' }, { filter: 'blur(2px)' }] } });
frame.animations = [foreign]; frame.style.filter = 'blur(2px)';
assert.equal(geometry(panel, 'right-sidebar').safeRoot, false, '祖先滤镜动画期间仍必须安全回退');
frame.style.filter = 'none';
// 祖先上的有限 transform 动画：几何由 follow 循环跟住 ⇒ 放行；但静态 transform 不放行。
const slide = finite({ transitionProperty: 'transform', effect: { target: frame } });
frame.animations = [slide]; frame.style.transform = 'translateX(12px)';
assert.equal(geometry(panel, 'right-sidebar').safeRoot, true, '有限 transform 动画期间由续帧跟住几何，不该撤霜');
frame.animations = [grid]; root.style.scale = '1.1';
assert.equal(geometry(panel, 'right-sidebar').safeRoot, false, '只允许共同根平移，不放宽缩放');
root.style.scale = 'none'; frame.style.transform = 'translateX(1px)';
assert.equal(geometry(panel, 'right-sidebar').safeRoot, false, '局部祖先静态变换不能冒充共同根平移');
frame.style.transform = 'none'; root.animations.push({ playState: 'running', effect: { target: root, getComputedTiming: () => ({ endTime: 400 }), getKeyframes: () => [{ filter: 'blur(1px)' }] } });
root.style.filter = 'blur(1px)';
assert.equal(geometry(panel, 'right-sidebar').safeRoot, false, '根上的无关滤镜动画仍必须回退');
root.style.filter = 'none';
console.log('PASS 展开和哈气时保留玻璃，只豁免已知网格与共同根平移，其他危险上下文仍回退');

// 边界 CSSOM 替身保留 cssText 的真实语义：整串赋值会清掉已有 clip-path。
const cssName = key => key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
let inlineValues = {};
const inline = new Proxy({}, {
  get: (_, key) => key === 'cssText' ? Object.entries(inlineValues).map(([k, v]) => k + ':' + v).join(';') : inlineValues[key] || '',
  set(_, key, value) {
    if (key === 'cssText') { inlineValues = {}; for (const item of value.split(';').filter(Boolean)) { const [k, v] = item.split(':'); inlineValues[cssName(k)] = v; } }
    else inlineValues[key] = value;
    return true;
  },
});
root.animations = [shake]; frame.animations = [grid];
body.setAttribute('data-we-glass-page', 'on'); panel.setAttribute('data-sidebar-right-open', '');
panel.setAttribute('data-we-surface-runtime', 'right-sidebar');
doc.querySelectorAll = selector => selector === '[data-sidebar-right-panel]' ? [panel] : [];
win.CSS = { supports: () => true };
const surfaceRoot = make(body, [0, 0, 1200, 800]);
const plate = make(surfaceRoot, [900, 0, 300, 800]); plate.style = inline; surfaceRoot.children = [plate];
const record = { target: panel, id: 'right-sidebar', before: null, marked: true, markValue: 'right-sidebar', plate };
let scheduled = 0;
const state = { doc, win, selection: { sidebarGlass: true }, root: surfaceRoot, records: new Map([[panel, record]]),
  selectors: [], observed: new Set(), resize: { observe() {}, unobserve() {} },
  moving: false, followFrames: 0, schedule() { scheduled += 1; } };
inline.clipPath = 'inset(0px 0px 0px 150px)';
refresh(state);
// 过渡仍在跑 ⇒ 刷新后必须自己排下一帧（否则底板停在动画起点）。
assert.equal(state.moving, true, '有限过渡期间刷新后应保持 moving');
assert.equal(scheduled, 1, '有限过渡期间刷新后必须安排续帧跟住几何');
assert.equal(inline.clipPath, 'inset(0px 0px 0px 150px)', '几何刷新不得抹掉联动持有的裁剪');
assert.equal(inline.left, '900px', '玻璃位置必须换算到共同平移根的本地坐标，不能加两遍抖动');
assert.equal(inline.top, '0px', '负向根平移也不得二次应用');
assert.equal(record.plate, plate, '展开及抖动刷新不能重建或撤掉玻璃');
shiftX = -8; shiftY = 5; root.style.translate = '-8px 5px'; refresh(state);
assert.equal(inline.left, '900px'); assert.equal(inline.top, '0px');
assert.equal(inline.clipPath, 'inset(0px 0px 0px 150px)');
// 动画结束（无 running）⇒ 立即停表，followFrames 归零，不再排帧。
frame.animations = []; root.animations = [];
const before = scheduled;
refresh(state);
assert.equal(state.moving, false, '动画结束后不得保持 moving');
assert.equal(state.followFrames, 0, '动画结束后 followFrames 必须归零');
assert.equal(scheduled, before, '静止后不得继续安排帧扫描');
console.log('PASS 真实玻璃刷新保留裁剪所有权，正负根平移均不造成重复位移');
