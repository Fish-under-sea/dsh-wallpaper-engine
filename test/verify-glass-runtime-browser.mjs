import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { cssBodyOf } from './tools/src-scope.mjs';
import { createHash } from 'node:crypto';
import { verifyPetSidebarGlassBrowser } from './verify-pet-sidebar-glass-browser-case.mjs';

const bundle = readFileSync(resolve('lib/client.js'), 'utf8');
const css = new Function('READABILITY_FLOOR', 'READABILITY_FLOOR_DARK', 'return `' + cssBodyOf(bundle) + '`;')(0.45, 0.59);
function moduleText(name) {
  const start = bundle.indexOf('// ── 内联模块：src/' + name + '.js');
  if (start < 0) return '';
  const end = bundle.indexOf('// ── 内联模块：', start + 10);
  return bundle.slice(bundle.indexOf('\n', start), end < 0 ? bundle.length : end);
}
const runtime = moduleText('glass-surfaces');
const extra = moduleText('glass-extra');
const out = resolve('.artifacts/glass-runtime');
mkdirSync(out, { recursive: true });
const browsers = process.platform === 'win32'
  ? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe']
  : process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const browser = process.env.WE_TEST_BROWSER || browsers.find(existsSync);
assert.ok(browser && existsSync(browser), '缺少 Chromium 浏览器；请用 WE_TEST_BROWSER 指定可执行文件，浏览器回归不会跳过。');
const profile = mkdtempSync(join(out, 'profile-'));
const child = spawn(browser, [
  '--headless=new', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  ...(process.env.WE_TEST_BROWSER_LOG ? ['--enable-logging=stderr', '--log-level=0'] : []), 'about:blank',
], { stdio: process.env.WE_TEST_BROWSER_LOG ? 'inherit' : 'ignore' });
let socket, launchError, counter = 0;
const pending = new Map(), failures = [], report = [];
child.on('error', error => { launchError = error; });
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++counter;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(expression) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await delay(25);
  }
  throw Error('等待条件失败: ' + expression);
}
function check(name, passed, detail) {
  report.push({ name, passed, detail });
  if (!passed) failures.push(name + ': ' + JSON.stringify(detail));
  console.log((passed ? 'PASS' : 'FAIL') + ' | ' + name);
}
async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(out, name + '.png'), Buffer.from(data, 'base64'));
  return data;
}
try {
  let port;
  const deadline = Date.now() + 20000;
  while (!port && Date.now() < deadline) {
    if (launchError) throw launchError;
    try { port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); }
    catch (error) { if (!['ENOENT', 'EBUSY'].includes(error.code)) throw error; }
    if (!port) await delay(100);
  }
  assert.ok(port, '浏览器调试端口未就绪');
  const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({ data }) => {
    const event = JSON.parse(data), item = pending.get(event.id);
    if (!item) return;
    clearTimeout(item.timer); pending.delete(event.id);
    if (event.error) item.reject(Error(JSON.stringify(event.error))); else item.resolve(event.result);
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  for (const width of [320, 375, 414, 768, 1280]) for (const dark of [false, true]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 820, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'about:blank' });
    await until('document.readyState === "complete"');
    await evaluate(`(() => {
      document.documentElement.style.cssText='background:white';
      document.body.innerHTML='<div id="wall"></div><main id="app"><div id="left"><div data-slot="sidebar"><span>Sidebar</span><div id="modal" role="dialog" aria-modal="true"><section id="dialog-panel"><button id="modal-close">Close</button></section></div></div></div><section id="main"><button id="composer">Composer</button></section></main><aside id="right" data-sidebar-right-panel="push" data-sidebar-right-open><div data-dockkit-host="dock">Dock</div></aside><div id="unknown" class="extra"></div>';
      const fixture=document.createElement('style');fixture.textContent=
        'body{margin:0;font:16px sans-serif;--we-readability-floor:${dark ? '0.59' : '0.45'};--we-surface-tint-light:#8fd0ff;--we-surface-tint-dark:#0d1524;--we-left-sidebar-alpha:.12;--we-left-sidebar-blur:14px;--we-sidebar-blur:14px;--we-sidebar-saturate:1.3;--we-sidebar-color:${dark ? '#151515' : '#ffffff'};--we-sidebar-tint:20%;--we-panel-color:${dark ? '#151515' : '#ffffff'};--we-panel-sheen-a:.1;--we-panel-sheen-b:.03;--we-panel-sheen-c:.05;--we-sidebar-sheen-a:.1;--we-sidebar-sheen-b:.03;--we-sidebar-sheen-c:.05;--we-sidebar-sheen:1;--we-blur:14px}' +
        '#wall{position:fixed;inset:0;z-index:-2;background:repeating-linear-gradient(90deg,#244f46 0 4px,#e6b929 4px 8px)}#app{display:flex;height:820px}#left{width:30%;height:100%;background:transparent}#main{flex:1;position:relative;z-index:1}#composer{position:fixed;left:38vw;top:150px;width:58vw;height:220px;background:#128a4d;border:0;z-index:10}#modal{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.25)}#dialog-panel{position:fixed;left:38vw;top:150px;width:58vw;height:220px;background:#b32235}#modal-close{position:absolute;left:12px;top:12px;width:90px;height:38px}#right{position:fixed;right:0;bottom:0;width:25%;height:180px}#unknown{position:fixed;left:10px;bottom:10px;width:30px;height:30px;z-index:20;background:#57a0e0}';
      document.head.append(fixture);
      const style=document.createElement('style');style.dataset.testBundle='on';style.textContent=${JSON.stringify(css)};document.head.append(style);
      document.body.setAttribute('data-we-glass-page','on');document.body.setAttribute('data-we-left-sidebar','on');document.body.setAttribute('data-we-sidebar-glass','on');
      ${dark ? "document.body.setAttribute('data-ds-dark-theme','');" : ''}
      // 左栏默认关（G1 左栏条款）：leftSidebarGlass 先 false，模态移除后显式开。
      window.__selection={leftSidebarGlass:false,sidebarGlass:true,extraGlassSelectors:'.extra'};
      window.__clicks={modal:0,composer:0};document.querySelector('#modal-close').onclick=()=>__clicks.modal++;document.querySelector('#composer').onclick=()=>__clicks.composer++;
      window.__frames=0;const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=(callback)=>{__frames++;return raf(callback);};
      const sanitizeExtraGlassSelectors=value=>typeof value==='string' && /^\.[a-z]+$/.test(value)?value:'';
      ${runtime}\n${extra}
      window.__glass={sync:()=>syncExtraGlassCss(__selection),dispose:()=>disposeExtraGlassCss(),status:()=>typeof weGlassSurfaceStatus==='function'?weGlassSurfaceStatus():[]};
      __glass.sync();
      return true;
    })()`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const tag = (dark ? 'dark-' : 'light-') + width;
    // 两段配方解析器（t9-003 computed 取证）：与 src/glass-extra.js:63-73 / src/styles-panel.js:378-400
    // 同构 —— base@readability-floor 叠 tint 段@settings-window-alpha×0.9。序列化兼容
    // rgba(...) 与 Chrome 新式 color(srgb r g b / a)。floor/tint 按 loop 的 dark 取值，
    // 与 fixture 注入一致；base 不再硬编码（t30 F1：#151515/#ffffff 与产品真源
    // src/styles-base.js:554/585 的 tint 链自相矛盾）—— 读解析后的 --we-readability-base，
    // 期望与真实级联同源；解析失败 ⇒ NaN 让 own-four 如实 FAIL（detail 带原始文本）。
    const hex1 = (h) => parseInt(h, 16) / 255;
    const floor = dark ? 0.59 : 0.45;
    const baseHex = await evaluate("getComputedStyle(document.body).getPropertyValue('--we-readability-base').trim()");
    const baseMatch = /^#([0-9a-fA-F]{6})$/.exec(baseHex);
    const tintHex = dark ? '0d1524' : '8fd0ff';
    const base = baseMatch ? [0, 2, 4].map((i) => hex1(baseMatch[1].slice(i, i + 2))) : [NaN, NaN, NaN];
    const tint = [hex1(tintHex.slice(0, 2)), hex1(tintHex.slice(2, 4)), hex1(tintHex.slice(4, 6))];
    const mixOut = (alpha) => { // 两段配方解析式：base@floor 上 tint 段@alpha×0.9
      const at = alpha * 0.9, a = floor + (1 - floor) * at;
      return { a, rgb: base.map((bc, i) => (bc * floor + tint[i] * (1 - floor) * at) / a) };
    };
    const parseColor = (str) => { // 兼容 rgba(...) 与 color(srgb ... / a) 两种序列化
      const rgba = String(str).match(/rgba?\(([^)]+)\)/);
      if (rgba) { const p = rgba[1].split(',').map(Number); return { a: p.length > 3 ? p[3] : 1, rgb: [p[0] / 255, p[1] / 255, p[2] / 255] }; }
      const srgb = String(str).match(/color\(srgb\s+([^)]+)\)/);
      if (srgb) { const p = srgb[1].replace('/', ' ').trim().split(/\s+/).map(Number); return { a: p.length > 3 ? p[3] : 1, rgb: [p[0], p[1], p[2]] }; }
      return { a: NaN, rgb: [NaN, NaN, NaN], raw: String(str) };
    };
    const close = (got, want) => Number.isFinite(got.a) && Math.abs(got.a - want.a) < 0.02 &&
      Math.abs(got.rgb[0] - want.rgb[0]) < 0.02 && Math.abs(got.rgb[1] - want.rgb[1]) < 0.02 && Math.abs(got.rgb[2] - want.rgb[2]) < 0.02;
    const state = await evaluate(`(() => {
      const el=document.querySelector('#modal-close'), rect=el.getBoundingClientRect(), left=getComputedStyle(document.querySelector('#left'));
      el.focus();return {hit:document.elementFromPoint(rect.x+20,rect.y+20)?.id,rect:rect.toJSON(),focus:document.activeElement.id,left:{z:left.zIndex,position:left.position,blur:left.backdropFilter},plates:document.querySelectorAll('[data-we-surface-plate]').length,status:__glass.status(),x:rect.x+20,y:rect.y+20};
    })()`);
    check(tag + ' 模态命中与fixed包含块', state.hit === 'modal-close' && state.left.z === 'auto' && state.left.blur === 'none' && Math.abs(state.rect.x - (width * .38 + 12)) < 1 && state.focus === 'modal-close', state);
    check(tag + ' 左栏默认关：不认领所有权且仅右栏plate（玻璃开关关=原生外观）', state.plates === 1 && !await evaluate(`document.querySelector('#left').hasAttribute('data-we-surface-runtime')`), state);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: state.x, y: state.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: state.x, y: state.y, button: 'left', clickCount: 1 });
    check(tag + ' 点击未穿透到composer', await evaluate('__clicks.modal===1 && __clicks.composer===0'), await evaluate('__clicks'));
    const shot = await screenshot(tag);
    const pixel = await evaluate(`(async()=>{const image=new Image();image.src='data:image/png;base64,${shot}';await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return [...ctx.getImageData(Math.round(innerWidth*.65),300,1,1).data];})()`);
    check(tag + ' 模态像素未被底层输入区覆盖', pixel[0] > 120 && pixel[0] > pixel[1] * 2, pixel);
    if (runtime) {
      // 左栏显式开（G1）：selection 提交走产品真实接线（effects→syncExtraGlassCss），
      // observer 自动消费场景只在后续 DOM 变化（多 right/fullscreen 回撤）上取证。
      await evaluate('__selection.leftSidebarGlass=true;__glass.sync()');
      await until('document.querySelectorAll("[data-we-surface-plate=left-sidebar]").length===1');
      await evaluate("document.querySelector('#modal').remove();__glass.sync()");
      await until('document.querySelectorAll("[data-we-surface-plate]").length>=1');
      check(tag + ' 安全侧栏玻璃实际载体存在', await evaluate(`(()=>{const plate=document.querySelector('[data-we-surface-plate="left-sidebar"]');return !!plate && getComputedStyle(plate).backdropFilter.includes('blur(') && plate.children.length===0 && plate.getBoundingClientRect().width>20;})()`));
      await evaluate("document.querySelector('#left').style.width='25%'");
      await until('Math.abs(document.querySelector("[data-we-surface-plate=left-sidebar]").getBoundingClientRect().width-document.querySelector("#left").getBoundingClientRect().width)<1');
      // 多 right 节点（G1 历史栏位）：后台保留节点（无 open 属性）+ 活动节点。
      // 双 right ⇒ 两条候选都 disabled（weSurfaceCandidates 只认领唯一宿主区域），
      // 原右栏须撤销所有权；移除后台节点后自动恢复（observer 消费，不手动 sync）。
      await evaluate(`(() => {
        const dock=document.createElement('aside');
        dock.id='right-bg';dock.setAttribute('data-sidebar-right-panel','push');
        dock.style.cssText='position:fixed;left:0;bottom:0;width:20%;height:80px;background:#5c4a9e';
        dock.innerHTML='<div data-dockkit-host="dock">BG</div>';
        document.body.append(dock);return true;
      })()`);
      await until('!document.querySelector("[data-we-surface-plate=right-sidebar]") && !document.querySelector("#right").hasAttribute("data-we-surface-runtime")');
      check(tag + ' 多right：后台保留+活动双节点均不认领', await evaluate(`(()=>{const r=document.querySelector('#right'),p=document.querySelector('#right-bg');return !r.hasAttribute('data-we-surface-runtime') && !p.hasAttribute('data-we-surface-runtime') && !document.querySelector('[data-we-surface-plate=right-sidebar]');})()`));
      await evaluate("document.querySelector('#right-bg').remove()");
      await until('!!document.querySelector("[data-we-surface-plate=right-sidebar]")');
      check(tag + ' 多right：移除后台节点后唯一右栏恢复所有权（observer 自动）', await evaluate(`document.querySelector('#right').getAttribute('data-we-surface-runtime')==='right-sidebar'`));
      await evaluate("document.querySelector('#right').removeAttribute('data-sidebar-right-open')");
      await until('!document.querySelector("[data-we-surface-plate=right-sidebar]")');
      check(tag + ' 收起右栏无残板', true);
      // 收起→重新展开（observer 自动恢复 plate），后续 fullscreen 段需要 open 右栏在场。
      await evaluate("document.querySelector('#right').setAttribute('data-sidebar-right-open','')");
      await until('!!document.querySelector("[data-we-surface-plate=right-sidebar]")');
      await evaluate("document.body.setAttribute('data-we-glass-fallback','on')");
      await until('getComputedStyle(document.querySelector("[data-we-surface-plate=left-sidebar]")).backdropFilter==="none"');
      check(tag + ' 软件回退不留下模糊', true);
      // 软渲档 extra 面（t9-001 的浏览器级证据）：marker 跟走为 extra-fallback、
      // ::before 霜被门摘掉（frost 不该留在软渲环境），玻璃页别名块照样工作。
      await until('document.querySelector("#unknown").getAttribute("data-we-surface-runtime")==="extra-fallback"');
      check(tag + ' 软渲档 extra 标记跟走为 extra-fallback 且无霜', await evaluate(`(()=>{const b=getComputedStyle(document.querySelector('#unknown'),'::before');return b.backdropFilter==='none' && document.querySelector('#unknown').getAttribute('data-we-surface-runtime')==='extra-fallback';})()`));
      await evaluate("document.body.removeAttribute('data-we-glass-fallback');__glass.sync()");
      await until('document.querySelector("#unknown").getAttribute("data-we-surface-runtime")==="extra"');
      check(tag + ' 软渲解除 extra 标记切回 extra 且霜恢复（双向跟走）', await evaluate(`getComputedStyle(document.querySelector('#unknown'),'::before').backdropFilter.includes('blur(')`));
      await evaluate("document.body.removeAttribute('data-we-glass-fallback');document.querySelector('#unknown').setAttribute('data-we-surface-preserve','')");
      await until('!document.querySelector("#unknown").hasAttribute("data-we-surface-runtime")');
      check(tag + ' preserve声明撤销额外载体', await evaluate('getComputedStyle(document.querySelector("#unknown")).backgroundColor==="rgb(87, 160, 224)"'));
      await evaluate("document.querySelector('#unknown').removeAttribute('data-we-surface-preserve');__glass.sync();__glass.sync()");
      check(tag + ' 额外载体重复同步仍由同一所有者管理', await evaluate(`document.querySelector('#unknown').getAttribute('data-we-surface-runtime')==='extra' && getComputedStyle(document.querySelector('#unknown'),'::before').backdropFilter.includes('blur(')`));
      await evaluate("document.querySelector('#unknown').style.zIndex='auto';__glass.sync()");
      check(tag + ' 未知且无安全上下文目标完整保留原生', await evaluate(`!document.querySelector('#unknown').hasAttribute('data-we-surface-runtime') && getComputedStyle(document.querySelector('#unknown'),'::before').content==='none' && getComputedStyle(document.querySelector('#unknown')).backgroundColor==='rgb(87, 160, 224)'`));
      await evaluate("document.querySelector('#unknown').style.zIndex='20';document.querySelector('#unknown').style.setProperty('--occupied-content','1');const tag=document.createElement('style');tag.id='occupied';tag.textContent='#unknown::before{content:\"native\"}';document.head.append(tag);__glass.sync()");
      check(tag + ' 已有伪元素不被额外雾化覆盖', await evaluate(`!document.querySelector('#unknown').hasAttribute('data-we-surface-runtime') && getComputedStyle(document.querySelector('#unknown'),'::before').content==='"native"'`));
      await evaluate("document.querySelector('#occupied').remove();__selection.glassSurfacePolicy={'left-sidebar':'native'};__glass.sync()");
      check(tag + ' 单面原生策略撤销绘制和所有权', await evaluate(`!document.querySelector('[data-we-surface-plate="left-sidebar"]') && !document.querySelector('#left').hasAttribute('data-we-surface-runtime')`));
      await evaluate("__selection.glassSurfacePolicy={};document.querySelector('#app').style.transform='translateX(1px)';__glass.sync()");
      check(tag + ' 变换祖先回退原生不在错误坐标画底板', await evaluate(`!document.querySelector('[data-we-surface-plate="left-sidebar"]') && !document.querySelector('#left').hasAttribute('data-we-surface-runtime')`));
      await evaluate("document.querySelector('#app').style.transform='none';document.querySelector('#app').setAttribute('data-we-surface-preserve','');__glass.sync()");
      check(tag + ' 祖先preserve声明优先于内建适配器', await evaluate(`!document.querySelector('#left').hasAttribute('data-we-surface-runtime')`));
      await evaluate("document.querySelector('#app').removeAttribute('data-we-surface-preserve');__glass.sync()");
      await until('!!document.querySelector("[data-we-surface-plate=left-sidebar]")');
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
      await evaluate('window.__steadyFrames=__frames');
      await delay(150);
      check(tag + ' 静止不持续安排帧扫描', await evaluate('__frames===__steadyFrames'), await evaluate('({frames:__frames,steady:__steadyFrames})'));
      await evaluate(`document.querySelector('#left').style.zIndex='0';document.querySelector('#left').style.position='relative';document.querySelector('#left').innerHTML='<div data-slot="sidebar"><div id="negative" style="position:fixed;inset:0;z-index:1000;background:#b32235"></div></div>'`);
      check(tag + ' 种回旧围栏的负对照能失败', await evaluate('document.elementFromPoint(innerWidth*.65,300).id==="composer"'));
      await evaluate('__glass.dispose()');
      check(tag + ' 卸载成对清理', await evaluate('document.querySelectorAll("[data-we-surface-plate],[data-we-surface-runtime],[data-we-surface-root]").length===0'));
      await evaluate('window.__endFrames=__frames;document.body.append(document.createElement("section"))');
      await delay(100);
      check(tag + ' 卸载后无监听残留更新', await evaluate('__frames===__endFrames'));
    }
    await evaluate(`(() => {
      document.body.innerHTML='<div id="wall"></div><section id="settings" role="dialog" aria-modal="true"><div data-slot="settings.section" id="settings-layout"><section id="plugin-native"><button id="native-button">Native</button><div id="warning">Warning</div></section><section id="declared" data-we-surface="v1"><div data-we-surface-layout id="layout">Layout<div data-we-surface-preserve id="keep">Preserve<div data-we-surface-layout id="preserve-child">Keep</div></div><section data-we-surface="v1" id="nested"><div data-we-surface-layout id="nested-layout">Nested</div></section></div></section><button id="nested-modal" style="position:fixed;left:10px;top:20px;z-index:1001">Nested</button></div></section><aside data-sidebar-right-panel="push" data-sidebar-right-open id="content-dock"><div class="cm-editor" id="editor"><span id="syntax" style="color:rgb(197,104,228)">Syntax</span><div class="cm-selectionBackground" id="selection"></div></div><div id="preview" data-we-surface="v1"><div data-we-surface-layout>Preview</div></div></aside><div id="own-host"><div class="we-picker" id="own-picker"><div class="we-tabs" id="own-tabs"><button class="we-tabs__tab">Library</button></div><div class="we-picker__current" id="own-current"><span class="we-picker__current-title">Current</span></div><div class="we-picker__uploads" id="own-uploads"><span>Upload</span></div><div class="we-ext" id="own-ext"><div class="we-ext__module" id="own-module"><span class="we-ext__module-title">Module</span></div></div></div><button class="we-rope" id="rope">Rope</button><div class="we-update-notice" id="notice">Notice</div><div class="we-preset-intro" id="intro">Intro</div>';
      const fixture=document.createElement('style');fixture.id='compat-fixture';fixture.textContent=
        'body{--dsw-alias-bg-layer-1:rgb(246,246,246);--dsw-alias-bg-layer-2:rgb(241,242,243);--dsw-alias-bg-layer-3:rgb(225,226,227);--dsw-alias-label-primary:#151515;--we-settings-window-blur:14px;--we-settings-window-alpha:.15;--we-readability-floor:${dark ? '0.59' : '0.45'};--we-surface-tint-light:#8fd0ff;--we-surface-tint-dark:#0d1524}' +
        '#settings{position:fixed;z-index:1000;left:5vw;top:100px;width:90vw;height:500px;overflow:auto;background:var(--dsw-alias-bg-layer-2)}#settings-layout{background:var(--dsw-alias-bg-layer-1)}#plugin-native{background:#fff}#native-button{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}#warning{background:rgb(244,180,40)}#declared{position:relative;z-index:1;background:white}#layout,#keep,#preserve-child,#nested-layout{background:rgb(222,223,224)}#content-dock{position:fixed;bottom:0;right:0;width:40vw;height:150px}#content-dock[data-sidebar-right-panel="fullscreen"]{--dsh-dockkit-dock-layer:40}#own-host{--dsw-alias-bg-layer-1:rgb(0,0,0);--dsw-alias-bg-layer-2:rgb(0,0,0);--dsw-alias-bg-layer-3:rgb(0,0,0)}#own-current{position:fixed;left:12px;top:40px;width:220px;height:60px;background:var(--dsw-alias-bg-layer-1)}#own-module{position:fixed;left:12px;top:110px;width:220px;height:60px;background:var(--dsw-alias-bg-layer-1)}#editor{background:#fff;height:80px}#selection{background:rgb(60,80,160);height:8px}#rope{left:10px;top:20px}#notice{bottom:30px;left:40px}#intro{bottom:100px;left:10px}';
      document.head.append(fixture);document.body.setAttribute('data-we-glass-window','on');document.body.setAttribute('data-we-glass-floaters','on');
      document.querySelector('#plugin-native').className='thirdparty_root';document.querySelector('#warning').className='thirdparty_frame';
      const host=document.createElement('div');host.id='root';host.innerHTML='<div class="host_frame" id="host-frame"><div class="host_root" id="host-root"></div></div>';document.body.append(host);
      document.querySelector('#host-frame').style.background='rgb(20,30,40)';document.querySelector('#host-root').style.background='rgb(30,40,50)';
      document.body.setAttribute('data-we-wallpaper','on');document.body.setAttribute('data-we-adapter','browser');
      __selection={sidebarGlass:true};__glass.sync();return true;
    })()`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const compat = await evaluate(`(()=>{const s=id=>getComputedStyle(document.getElementById(id));const r=document.querySelector('#nested-modal').getBoundingClientRect();return {blur:s('settings').backdropFilter,rect:r.toJSON(),token:s('native-button').color,unknown:s('plugin-native').backgroundColor,warning:s('warning').backgroundColor,mark:document.querySelector('#settings').getAttribute('data-we-surface-runtime'),layout:s('layout').backgroundColor,keep:s('keep').backgroundColor,child:s('preserve-child').backgroundColor,syntax:s('syntax').color,selection:s('selection').backgroundColor,editor:s('editor').backgroundColor,ownTab:s('own-tabs').backgroundColor,ownUploads:s('own-uploads').backgroundColor,ownCurrent:s('own-current').backgroundColor,ownModule:s('own-module').backgroundColor,alias1:s('own-picker').getPropertyValue('--dsw-alias-bg-layer-1').trim(),rope:s('rope').visibility,notice:s('notice').visibility,intro:s('intro').visibility,status:__glass.status()};})()`);
    check(tag+' 设置本体不再建立fixed包含块', compat.blur==='none' && compat.rect.x===10 && compat.rect.y===20, compat);
    check(tag+' 未知设置控件令牌与状态填充保留原生',compat.token==='rgb(225, 226, 227)' && compat.unknown==='rgb(255, 255, 255)' && compat.warning==='rgb(244, 180, 40)',compat);
    check(tag+' 壁纸仅清宿主外壳而非任意root和frame',await evaluate(`getComputedStyle(document.querySelector('#host-frame')).backgroundColor==='rgba(0, 0, 0, 0)' && getComputedStyle(document.querySelector('#host-root')).backgroundColor==='rgba(0, 0, 0, 0)'`));
    check(tag+' 已知设置面与显式布局接管且preserve优先',compat.mark==='settings-window' && compat.layout==='rgba(0, 0, 0, 0)' && compat.keep==='rgb(222, 223, 224)' && compat.child==='rgb(222, 223, 224)',compat);
    check(tag+' 编辑内容底板受控且语法选区不改',compat.editor!=='rgb(255, 255, 255)' && compat.syntax==='rgb(197, 104, 228)' && compat.selection==='rgb(60, 80, 160)',compat);
    check(tag+' 本插件页签与上传区不继承宿主黑色实底',compat.ownTab!=='rgb(0, 0, 0)' && compat.ownUploads!=='rgb(0, 0, 0)',compat);
    // own 面 computed 精确配方（t8 修复的浏览器级验证）：玻璃页门别名块
    // （src/styles-panel.js:375-400）在 .we-picker 根上把 --dsw-alias-bg-layer-1 换成
    // 两段 color-mix（tint×alpha×0.9 + floor 地板）；.we-tabs(:249)/.we-picker__current(:208)/
    // .we-picker__uploads(:258)/.we-ext__module(styles-ext.js:222) 消费同一令牌 ⇒
    // 四元素 computed 必须等于配方解析值，且不等于宿主黑实底/宿主灰。深浅主题分叉由
    // tint 色相差异体现（light #8fd0ff / dark #0d1524，mixOut 已按主题取值）。
    const ownMix = mixOut(0.15); // phase-two fixture 显式给了 --we-settings-window-alpha:.15
    // F1 反事实负控（t31 revision1）：判据必须能红。wrongBaseMix = t30 F1 的旧错误硬编码
    // #151515 系构造的期望 —— 对观测值必须 close 失败（base 判据对色相敏感，深浅两主题
    // 均超 0.02 容差）；wrongWeightMix = 缺失 0.9 权重（tint 段 ×1.0）的期望 —— Δa≈0.006
    // 在 close(0.02) 下不可判别，故另设 exact(0.002) 精确档负控证明权重判据有判别力
    // （产品权重漂移时精确档主证据=alias1 结构判据 + 本负控同向翻转）。
    const wrongBaseMix = (() => { const wb = [hex1('15'), hex1('15'), hex1('15')]; const at = 0.15 * 0.9, a = floor + (1 - floor) * at; return { a, rgb: wb.map((bc, i) => (bc * floor + tint[i] * (1 - floor) * at) / a) }; })();
    const wrongWeightMix = (() => { const at = 0.15 * 1.0, a = floor + (1 - floor) * at; return { a, rgb: base.map((bc, i) => (bc * floor + tint[i] * (1 - floor) * at) / a) }; })();
    const exact = (got, want) => Number.isFinite(got.a) && Math.abs(got.a - want.a) < 0.002 && [0, 1, 2].every(i => Math.abs(got.rgb[i] - want.rgb[i]) < 0.002);
    const parsedTab = parseColor(compat.ownTab);
    check(tag+' own四元素=两段配方解析值（tabs/current/uploads/module，非黑非宿主灰）',
      close(parseColor(compat.ownTab), ownMix) && close(parseColor(compat.ownCurrent), ownMix) &&
      close(parseColor(compat.ownUploads), ownMix) && close(parseColor(compat.ownModule), ownMix), { got: [compat.ownTab, compat.ownCurrent, compat.ownUploads, compat.ownModule], want: ownMix });
    check(tag+' F1反事实负控：错误base(#151515)期望被拒（判据对base色相敏感）', !close(parsedTab, wrongBaseMix), { got: parsedTab, want: wrongBaseMix });
    check(tag+' F1反事实负控：缺失0.9权重(×1.0)期望在0.002精确档被拒', !exact(parsedTab, wrongWeightMix), { got: parsedTab, want: wrongWeightMix });
    // F2（t31 revision1）：computed 值是已解析 var() 的文本，不再检 var 字面量；
    // 对解析后的两段结构作可失败数值判据：①存在 color-mix(in srgb（外层+内层）；
    // ②地板段百分比=floor（浅 calc(0.45 * 100%) / 深 calc(calc(0.59 * 1) * 100%)，
    // 序列化按 Chrome 实测）；③tint 段权重=0.9×alpha（calc(.15 * 0.9 * 100%)——
    // 权重漂移为 1.0 或地板被摘除时本判据必红，即内嵌反事实负控）。
    const floorTxt = dark ? 'calc\\(0\\.59 \\* 1\\)' : '0\\.45';
    check(tag+' own面板别名token=两段color-mix配方（tint×alpha×0.9+地板段）', /color-mix\(in srgb/.test(compat.alias1) && new RegExp('calc\\(' + floorTxt + ' \\* 100%\\)').test(compat.alias1) && /calc\(\.15 \* 0\.9 \* 100%\)/.test(compat.alias1), compat.alias1);
    check(tag+' 可见外部模态时自有装饰和自动提示让路',compat.rope==='hidden' && compat.notice==='hidden' && compat.intro==='hidden',compat);
    // push→fullscreen→push（G1 历史栏位）：宿主布局属性（--dsh-dockkit-dock-layer），
    // 非浏览器 Fullscreen API；回撤后 plate 回 push 几何、所有权保持。
    await evaluate("document.querySelector('#content-dock').setAttribute('data-sidebar-right-panel','fullscreen');__glass.sync()");
     await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
     check(tag+' 宿主 fullscreen 右栏可接管并使用 dock 层（宿主布局属性，非Fullscreen API）',await evaluate("(()=>{const p=document.querySelector('#content-dock');return p.getAttribute('data-we-surface-runtime')==='right-sidebar' && getComputedStyle(p).zIndex==='40';})()"));
     // fullscreen→push 回撤：plate 继续存在（所有权不丢）且 dock 层抬升声明随之失效。
     await evaluate("document.querySelector('#content-dock').setAttribute('data-sidebar-right-panel','push');__glass.sync()");
     await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
     check(tag+' fullscreen→push 回撤保持所有权且dock层退回常态',await evaluate("(()=>{const p=document.querySelector('#content-dock');return p.getAttribute('data-we-surface-runtime')==='right-sidebar' && !!document.querySelector('[data-we-surface-plate=right-sidebar]') && getComputedStyle(p).zIndex!=='40';})()"));
     await evaluate("document.querySelector('#keep').removeAttribute('data-we-surface-preserve')");
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    check(tag+' 移除非布局preserve包装自动接管子布局',await evaluate("getComputedStyle(document.querySelector('#preserve-child')).backgroundColor==='rgba(0, 0, 0, 0)'"));
    await evaluate("document.querySelector('#keep').setAttribute('data-we-surface-preserve','')");
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    check(tag+' 恢复preserve包装自动撤回子布局',await evaluate("getComputedStyle(document.querySelector('#preserve-child')).backgroundColor==='rgb(222, 223, 224)'"));
    await evaluate("document.querySelector('#settings-layout').style.minHeight='1000px';document.querySelector('#settings').scrollTop=120;document.querySelector('#settings').style.width='80vw'");
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    check(tag+' 滚动缩放设置窗不拖动fixed子弹层',await evaluate("(()=>{const r=document.querySelector('#nested-modal').getBoundingClientRect();return document.querySelector('#settings').scrollTop===120 && r.x===10 && r.y===20 && getComputedStyle(document.querySelector('#settings')).backdropFilter==='none';})()"));
    await evaluate("document.querySelector('#nested-modal').focus();window.__modalClicks=0;document.querySelector('#nested-modal').onclick=()=>window.__modalClicks++");
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:20,y:30,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:20,y:30,button:'left',clickCount:1});
    check(tag+' 设置子弹层保持焦点和真实点击',await evaluate("document.activeElement.id==='nested-modal' && document.elementFromPoint(20,30).id==='nested-modal' && __modalClicks===1"));
    await evaluate("document.querySelector('#settings').scrollTop=0;document.querySelector('#settings-layout').style.minHeight='';document.querySelector('#settings').style.width='90vw'");
    await screenshot(tag+'-settings-owned');
    await evaluate("__selection.glassSurfacePolicy={'settings-window':'native',content:'native',declared:'native'};__glass.sync()");
    check(tag+' 逐面原生撤销设置布局和内容接管',await evaluate(`!document.querySelector('#settings').hasAttribute('data-we-surface-runtime') && getComputedStyle(document.querySelector('#settings')).backgroundColor==='rgb(241, 242, 243)' && getComputedStyle(document.querySelector('#editor')).backgroundColor==='rgb(255, 255, 255)' && getComputedStyle(document.querySelector('#layout')).backgroundColor==='rgb(222, 223, 224)'`));
    await evaluate("__selection.glassSurfacePolicy={};document.querySelector('#settings').remove();__glass.sync()");
    check(tag+' 模态卸载后浮层恢复',await evaluate("getComputedStyle(document.querySelector('#rope')).visibility==='visible'"));
    await evaluate("const el=document.createElement('div');el.setAttribute('role','dialog');el.style.cssText='width:20px;height:20px';document.body.append(el);__glass.sync()");
    check(tag+' 无模态语义的普通dialog不压制WE',await evaluate("getComputedStyle(document.querySelector('#rope')).visibility==='visible'"));
    await evaluate("document.querySelector('#editor').setAttribute('data-we-surface-preserve','');__glass.sync()");
    check(tag+' 内容preserve恢复原生画布',await evaluate("getComputedStyle(document.querySelector('#editor')).backgroundColor==='rgb(255, 255, 255)'"));
    await screenshot(tag+'-settings');
    // extra 端值 × 双主题（t9-003，真实参数合同取证）。真实范围（源码实测，非虚构滑杆）：
    // --we-settings-window-alpha ∈ [0.10, 0.25]（src/glass.js:103 Math.max(0.10, 0.25-pct/100*0.15)，
    // 不是自有设置窗 5..42/5..50）；--we-blur ∈ [0,60]px（src/glass-panel.js SliderRow(cn.blur,0,60,1)）。
    // extra normal 霜读 --we-blur（src/glass-extra.js:59-61），底色两段 color-mix 消费
    // --we-settings-window-alpha×0.9 + readability-floor 地板（src/glass-extra.js:63-73）；
    // own-current 走同一配方表（src/styles-panel.js:378）⇒ 同一断言面。phase-two 此处
    // 已无 #settings（:248 移除），霜载体读 extra 面 ::before 本体。
    await evaluate(`(() => {
      __selection.extraGlassSelectors='.extra';
      const el=document.createElement('div');el.id='extra-end';el.className='extra';
      el.style.cssText='position:fixed;left:12px;bottom:12px;width:60px;height:40px;z-index:20';
      document.body.append(el);__glass.sync();return true;
    })()`);
    await until('document.querySelector("#extra-end").getAttribute("data-we-surface-runtime")==="extra"');
    await evaluate("document.body.style.setProperty('--we-settings-window-alpha','0.10');document.body.style.setProperty('--we-blur','0px')");
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const low = await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('#extra-end'),'::before');const c=getComputedStyle(document.getElementById('own-current'));return {extraBg:s.backgroundColor,frost:s.backdropFilter,ownBg:c.backgroundColor};})()`);
    const wantLow = mixOut(0.10);
    check(tag + ' alpha端点0.10：extra底色=两段配方解析值（floor ' + floor + ' + tint×0.09）', close(parseColor(low.extraBg), wantLow), { got: parseColor(low.extraBg), want: wantLow, raw: low.extraBg });
    check(tag + ' own-current同配方表端点一致（非宿主黑灰）', close(parseColor(low.ownBg), wantLow) && low.ownBg !== 'rgb(0, 0, 0)' && low.ownBg !== 'rgb(246, 246, 246)', { got: parseColor(low.ownBg), want: wantLow, raw: low.ownBg });
    check(tag + ' blur端点0px：extra霜含blur(0px)（--we-blur 真实刻度0）', low.frost.includes('blur(0px)'), low.frost);
    await evaluate("document.body.style.setProperty('--we-settings-window-alpha','0.25');document.body.style.setProperty('--we-blur','60px')");
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const high = await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('#extra-end'),'::before');const c=getComputedStyle(document.getElementById('own-current'));return {extraBg:s.backgroundColor,frost:s.backdropFilter,ownBg:c.backgroundColor};})()`);
    const wantHigh = mixOut(0.25);
    check(tag + ' alpha端点0.25：extra底色=上限混合（floor ' + floor + ' + tint×0.225）', close(parseColor(high.extraBg), wantHigh), { got: parseColor(high.extraBg), want: wantHigh, raw: high.extraBg });
    check(tag + ' own-current上限端点一致（非宿主黑灰）', close(parseColor(high.ownBg), wantHigh) && high.ownBg !== 'rgb(0, 0, 0)' && high.ownBg !== 'rgb(246, 246, 246)', { got: parseColor(high.ownBg), want: wantHigh, raw: high.ownBg });
    check(tag + ' blur端点60px：extra霜含blur(60px)（--we-blur 真实刻度60）', high.frost.includes('blur(60px)'), high.frost);
    await evaluate("document.body.style.removeProperty('--we-settings-window-alpha');document.body.style.removeProperty('--we-blur');document.querySelector('#extra-end').remove();__glass.sync()");
    await evaluate('__glass.dispose()');
    check(tag+' 第二阶段卸载清理',await evaluate('document.querySelectorAll("[data-we-surface-runtime],[data-we-layout-runtime],[data-we-modal-blocked]").length===0'));
  }
  await verifyPetSidebarGlassBrowser({ send, evaluate, until, check, screenshot, css, runtime, bundle });
  // computed/身份证据：bundle 与内联模块字节的 sha256 —— 截图与 computed 矩阵对应
  // 的就是这批字节（同一进程内读出，不与盘上其他时点混淆）。
  const sha = (text) => createHash('sha256').update(text).digest('hex');
  writeFileSync(join(out, 'report.json'), JSON.stringify({
    bundleBytes: Buffer.byteLength(bundle),
    bundleSha256: sha(bundle),
    runtimeModuleSha256: sha(runtime),
    extraModuleSha256: sha(extra),
    cssSha256: sha(css),
    report, failures,
  }, null, 2));
  assert.equal(failures.length, 0, failures.join('\n'));
} finally {
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('browser closing')); }
  pending.clear();
  if (socket?.readyState===WebSocket.OPEN) { try { await send('Browser.close'); } catch { /* 关闭连接亦视为结束 */ } }
  socket?.close();
  if (child.exitCode===null) {
    const exit = new Promise(resolve=>{ child.once('exit',resolve); });
    child.kill(); await exit;
  }
}
