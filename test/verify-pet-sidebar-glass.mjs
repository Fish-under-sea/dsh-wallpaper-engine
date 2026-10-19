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
    getAnimations() { return this.animations; }, getBoundingClientRect: () => rect(...bounds), closest: () => null,
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
const grid = { transitionProperty: 'grid-template-columns', effect: { target: frame } };
const shake = { effect: { target: root, getKeyframes: () => [{ offset: 0, translate: '0px 0px' }, { offset: 1, translate: '8px -5px' }] } };
assert.equal(geometry(panel, 'right-sidebar').safeRoot, true, '静态基线应可建立玻璃');
frame.animations = [grid];
assert.equal(geometry(panel, 'right-sidebar').safeRoot, true, '拥有侧栏的网格过渡不应让玻璃回退到原生');
root.animations = [shake]; root.style.translate = '8px -5px'; shiftX = 8; shiftY = -5;
assert.equal(geometry(panel, 'right-sidebar').safeRoot, true, '根平移和独立玻璃同处一个坐标系，哈气中不能撤霜');
const foreign = { effect: { target: frame, getKeyframes: () => [{ opacity: 1 }, { opacity: .5 }] } };
frame.animations.push(foreign);
assert.equal(geometry(panel, 'right-sidebar').safeRoot, false, '其他祖先动画仍必须安全回退');
frame.animations = [grid]; root.style.scale = '1.1';
assert.equal(geometry(panel, 'right-sidebar').safeRoot, false, '只允许共同根平移，不放宽缩放');
root.style.scale = 'none'; frame.style.transform = 'translateX(1px)';
assert.equal(geometry(panel, 'right-sidebar').safeRoot, false, '局部祖先变换不能冒充共同根平移');
frame.style.transform = 'none'; root.animations.push({ effect: { target: root, getKeyframes: () => [{ filter: 'blur(1px)' }] } });
assert.equal(geometry(panel, 'right-sidebar').safeRoot, false, '根上的无关滤镜动画仍必须回退');
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
const state = { doc, win, selection: { sidebarGlass: true }, root: surfaceRoot, records: new Map([[panel, record]]),
  selectors: [], observed: new Set(), resize: { observe() {}, unobserve() {} } };
inline.clipPath = 'inset(0px 0px 0px 150px)';
refresh(state);
assert.equal(inline.clipPath, 'inset(0px 0px 0px 150px)', '几何刷新不得抹掉联动持有的裁剪');
assert.equal(inline.left, '900px', '玻璃位置必须换算到共同平移根的本地坐标，不能加两遍抖动');
assert.equal(inline.top, '0px', '负向根平移也不得二次应用');
assert.equal(record.plate, plate, '展开及抖动刷新不能重建或撤掉玻璃');
shiftX = -8; shiftY = 5; root.style.translate = '-8px 5px'; refresh(state);
assert.equal(inline.left, '900px'); assert.equal(inline.top, '0px');
assert.equal(inline.clipPath, 'inset(0px 0px 0px 150px)');
console.log('PASS 真实玻璃刷新保留裁剪所有权，正负根平移均不造成重复位移');
