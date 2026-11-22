import assert from 'node:assert/strict';
import { DEFAULTS, sanitizeFromSchema, serializeSettings, sanitizePresetValues, PROFILE_PRESET_KEYS } from '../lib/settings-schema.js';

assert.deepEqual(DEFAULTS.glassSurfacePolicy, {}, '旧配置缺省为自动策略');
const raw = { glassSurfacePolicy: { 'left-sidebar': 'native', 'settings-window': 'auto', content: 'native', unknown: 'native', extra: true, declared: 'native' } };
const value = sanitizeFromSchema(raw);
assert.deepEqual(value.glassSurfacePolicy, { 'left-sidebar': 'native', 'settings-window': 'auto', content: 'native', declared: 'native' });
assert.deepEqual(sanitizeFromSchema(JSON.parse(JSON.stringify(value))).glassSurfacePolicy, value.glassSurfacePolicy);
assert.ok(JSON.stringify(serializeSettings(value)).includes('glassSurfacePolicy'), '策略必须持久化');
assert.ok(JSON.stringify(PROFILE_PRESET_KEYS).includes('glassSurfacePolicy'), '策略必须进入整机预设');
assert.ok(sanitizePresetValues, '使用已有整机预设内核');
assert.deepEqual(sanitizeFromSchema({ glassSurfacePolicy: [] }).glassSurfacePolicy, {});
assert.deepEqual(sanitizeFromSchema({ glassSurfacePolicy: JSON.parse('{"__proto__":"native","constructor":"native","content":"native"}') }).glassSurfacePolicy, { content: 'native' });
const panel = await import('../packages/glass/src/glass-panel.js');
assert.equal(typeof panel.renderGlassSurfaceControls, 'function', '兼容策略控件可独立渲染');
const previousReact = globalThis.React, previousT = globalThis.weT;
try {
  globalThis.React = { createElement: (type, props, ...children) => ({ type, props, children }) };
  globalThis.weT = value => value;
  const writes = [];
  const tree = panel.renderGlassSurfaceControls({ sel: value, onGlassSurfacePolicy: (...args) => writes.push(args), surfaceStatus: [{ id: 'content', mode: 'native', reason: 'preserve' }] });
  const flat = node => node && typeof node === 'object' ? [node, ...node.children.flat(Infinity).flatMap(flat)] : [];
  const nodes = flat(tree), selects = nodes.filter(node => node.type === 'select');
  assert.equal(selects.length, 6);
  const content = selects.find(node => node.props['data-we-policy'] === 'content');
  assert.equal(content.props.value, 'native');
  content.props.onChange({ target: { value: 'auto' } });
  assert.deepEqual(writes, [['content', 'auto']]);
  assert.equal(tree.type, 'details');
  assert.ok(JSON.stringify(tree).includes('preserve'));
} finally { globalThis.React = previousReact; globalThis.weT = previousT; }
console.log('PASS | 表面策略消毒、旧配置、持久化与预设键集及控件交互');
