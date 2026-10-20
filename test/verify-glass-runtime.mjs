import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cssBodyOf } from './tools/src-scope.mjs';
// 剥 CSS 注释走共享实现（此前这里是一行朴素正则 —— 模块布局守卫规则 ⑦ 的针眼）。
import { stripCssComments } from './tools/css-text.mjs';
import { braceBody } from './tools/assert-harness.mjs';

const root = resolve('.');
const bundle = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
const css = stripCssComments(cssBodyOf(bundle));
const left = css.match(/body\[data-we-glass-page\]\[data-we-left-sidebar\] div:has\(> \[data-slot="sidebar"\]\)[^{]*\{([^}]+)\}/)?.[1] || '';
assert.ok(left, '必须读取真实构建的左栏绘制规则');
assert.ok(!/(?:^|[;\s])z-index:\s*0\b/.test(left), '左栏不得为负层载体新增 z-index:0 围栏');
assert.ok(!/(?:^|[;\s])position:\s*relative\b/.test(left), '不得改变宿主 absolute 包含块');
assert.ok(!/(?:^|[;\s])backdrop-filter:\s*(?!none)[^;]+/.test(left), '共享内容祖先不得承载模糊');
const path = resolve(root, 'src/glass-surfaces.js');
assert.ok(existsSync(path), '统一表面解析器必须存在，不能仅删除旧围栏');
const { weResolveSurface } = await import(new URL('../src/glass-surfaces.js', import.meta.url));
const safe = { enabled: true, visible: true, safeRoot: true };
assert.equal(weResolveSurface('left-sidebar', {}, safe).mode, 'root');
assert.equal(weResolveSurface('left-sidebar', { glassSurfacePolicy: { 'left-sidebar': 'native' } }, safe).reason, 'policy-native');
assert.equal(weResolveSurface('left-sidebar', {}, { ...safe, preserve: true }).reason, 'preserve');
assert.equal(weResolveSurface('left-sidebar', {}, { ...safe, visible: false }).reason, 'hidden');
assert.equal(weResolveSurface('left-sidebar', {}, { ...safe, enabled: false }).reason, 'disabled');
assert.equal(weResolveSurface('left-sidebar', {}, { ...safe, safeRoot: false }).mode, 'native');
assert.equal(weResolveSurface('right-sidebar', {}, { ...safe, nativeBlur: true }).reason, 'native-blur');
assert.equal(weResolveSurface('extra', {}, { ...safe, safeLocal: false }).mode, 'native');
assert.equal(weResolveSurface('extra', {}, { ...safe, safeLocal: true }).mode, 'local');
assert.equal(weResolveSurface('extra', {}, { ...safe, safeLocal: true, occupied: true }).reason, 'carrier-busy');
assert.equal(weResolveSurface('left-sidebar', {}, { ...safe, software: true }).mode, 'plate');

// 精确浮点残差与四边边界由真实几何函数验证，浏览器腿另验布局量化及分数 DPR。
const surfacesSrc = readFileSync(path, 'utf8');
const geometryBody = braceBody(surfacesSrc, 'weSurfaceGeometry');
assert.ok(geometryBody, '必须读取真实几何函数');
const geometry = (body) => new Function('target', 'id', 'owned', body);
const style = {
  display: 'block', visibility: 'visible', opacity: '1',
  backdropFilter: 'none', webkitBackdropFilter: 'none',
  transform: 'none', perspective: 'none', filter: 'none', isolation: 'auto',
  mixBlendMode: 'normal', contain: 'none', willChange: 'auto',
  translate: 'none', rotate: 'none', scale: 'none',
  overflow: 'visible', overflowX: 'visible', overflowY: 'visible',
  position: 'fixed', zIndex: 'auto', borderRadius: '0px',
};
function clippedGeometry(fn, edge, delta) {
  const rect = { left: 20, top: 20, right: 120, bottom: 120, width: 100, height: 100 };
  const clip = { ...rect, [edge]: rect[edge] + (['left', 'top'].includes(edge) ? delta : -delta) };
  const doc = { defaultView: { innerWidth: 800, innerHeight: 600, getComputedStyle: el => el.css } };
  const parent = {
    css: { ...style, overflow: 'hidden' }, getAnimations: () => [],
    getBoundingClientRect: () => clip, closest: () => null, parentElement: null,
  };
  doc.documentElement = parent;
  const target = {
    ownerDocument: doc, css: style, isConnected: true,
    getBoundingClientRect: () => rect, getAttribute: () => 'push',
    getAnimations: () => [], closest: () => null, parentElement: parent,
  };
  return fn(target, 'right-sidebar', false).safeRoot;
}
function clipContract(fn) {
  return ['left', 'right', 'top', 'bottom'].every(edge =>
    [0, 0.00006103515625, 0.015625, 0.125, 0.49, 0.51, 2]
      .every(delta => clippedGeometry(fn, edge, delta) === (delta <= 0.5)));
}
assert.ok(clipContract(geometry(geometryBody)), '四边浮点残差保持接管，真实裁剪仍回退');
assert.ok(geometryBody.includes('const CLIP_EPSILON = 0.5;'), '负对照必须命中真实容差声明');
const noTolerance = geometryBody.replace('const CLIP_EPSILON = 0.5;', 'const CLIP_EPSILON = 0;');
assert.equal(clipContract(geometry(noTolerance)), false, '负对照：零容差必须被同一判据拒绝');
const unusedTolerance = geometryBody.replace(/\s*[-+]\s*CLIP_EPSILON/g, '');
assert.notEqual(unusedTolerance, geometryBody, '负对照必须命中真实裁剪比较');
assert.equal(clipContract(geometry(unusedTolerance)), false, '负对照：只声明不使用容差必须被拒绝');
const excessiveTolerance = geometryBody.replace('const CLIP_EPSILON = 0.5;', 'const CLIP_EPSILON = 3;');
assert.equal(clipContract(geometry(excessiveTolerance)), false, '负对照：真实裁剪被放行必须被拒绝');

console.log('PASS | 真实构建无侧栏祖先围栏，解析器遵守策略、保留、可见性与安全回退');
