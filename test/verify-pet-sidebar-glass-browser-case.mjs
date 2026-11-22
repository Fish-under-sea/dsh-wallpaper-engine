/** 新宿主同构网格 + 真侧栏控制面 + 真玻璃模块；不连接或修改用户GUI。 */
export async function verifyPetSidebarGlassBrowser({ send, evaluate, until, check, screenshot, css, runtime, bundle }) {
  const a = bundle.indexOf('  const officialPull = {');
  const b = bundle.indexOf('  }, [hidden, petOfficialMode]);', a);
  if (a < 0 || b <= a) throw Error('构建产物缺少真实侧栏控制面');
  const controller = bundle.slice(a, b) + '  }, [hidden, petOfficialMode]);';
  // 控制器把「开 / 合」交回宿主自己的接口：下面的夹具提供 `wallSidebarOpen` / `wallSidebarClose`
  // 两个桩，调用点是 `begin()` 的两处出口。这条判据盯住那个调用点 —— 控制器一旦不再调它们，
  // 两个桩就成了零引用声明（`verify-dead-declarations` 判红），而且"开合真的回到宿主侧"这件事
  // 再没有任何判据在看（夹具里 `toggle` 只被这两个桩调用）。
  check('控制器把开合交回宿主接口（切片里保有 wallSidebarOpen / wallSidebarClose 调用点）',
    /if \(expanded\) wallSidebarOpen\(\); else wallSidebarClose\(\);/.test(controller),
    controller.length + ' 字符切片');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'about:blank' });
  await until('document.readyState === "complete"');
  await evaluate(`(() => {
    document.body.innerHTML='<div id="wall"></div><main id="frame" data-rightbar-collapsed><nav>Left sidebar</nav><section id="center">Center</section><div data-rightbar-col><aside id="panel" data-sidebar-right-panel="push"><div data-dockkit-host="dock" aria-hidden="true"><section class="we-qp--official">Wallpaper</section></div></aside></div><footer>Bottom row</footer></main>';
    const style=document.createElement('style'); style.textContent=${JSON.stringify(css)};document.head.append(style);
    const fixture=document.createElement('style');fixture.textContent=
      'html,body{margin:0;width:100%;height:100%;background:transparent}body{--ds-transition-duration-slow:450ms;--ds-ease-in-out:ease-in-out;--we-readability-floor:.45;--we-sidebar-blur:14px;--we-sidebar-saturate:1.3;--we-sidebar-color:#ffffff;--we-sidebar-tint:20%;--we-sidebar-sheen:1;--we-sidebar-sheen-a:.1;--we-sidebar-sheen-b:.03;--we-sidebar-sheen-c:.05}'+
      '#wall{position:fixed;inset:0;z-index:-2;background:repeating-linear-gradient(90deg,#244f46 0 4px,#e6b929 4px 8px)}'+
      '#frame{display:grid;position:relative;width:100%;height:100%;overflow:hidden;grid-template-rows:minmax(0,1fr) 40px;grid-template-columns:240px minmax(400px,1fr) minmax(0px,320px)}#frame[data-rightbar-collapsed]{grid-template-columns:240px minmax(0px,1fr) minmax(0px,0px)}#frame[data-animating]{transition:grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out)}#center{min-width:0}[data-rightbar-col]{min-width:0;position:relative;overflow:visible}footer{grid-column:1/-1}'+
      '#panel{position:absolute;top:0;bottom:0;right:0;width:320px;overflow:clip}#panel [data-dockkit-host]{position:absolute;inset:0;transform:translateX(100%);transition:transform var(--ds-transition-duration-slow) var(--ds-ease-in-out)}#panel[data-sidebar-right-open] [data-dockkit-host]{transform:translateX(0)}';
    document.head.append(fixture);
    document.body.setAttribute('data-we-glass-page','on');document.body.setAttribute('data-we-sidebar-glass','on');
    ${runtime}
    window.__glass={sync:()=>syncGlassSurfaces({sidebarGlass:true}),dispose:disposeGlassSurfaces};
    const frame=document.getElementById('frame'),panel=document.getElementById('panel'),dock=panel.querySelector('[data-dockkit-host]');
    const toggle=open=>{frame.setAttribute('data-animating','');frame.toggleAttribute('data-rightbar-collapsed',!open);panel.toggleAttribute('data-sidebar-right-open',open);dock.setAttribute('aria-hidden',String(!open));setTimeout(()=>frame.removeAttribute('data-animating'),600);};
    const React={useEffect:fn=>{window.__sidebarCleanup=fn();}},petLink={mascot:{registerSidebar:api=>window.__sidebar=api}};
    const wallSidebarOpen=()=>toggle(true),wallSidebarClose=()=>toggle(false),sidebarRightOursActive=()=>panel.hasAttribute('data-sidebar-right-open');
    const hidden=false,petOfficialMode=true;
    ${controller}
    window.__pull=__sidebar.syncOpen();__pull.seek(.5);__glass.sync();
    return true;
  })()`);
  await until('document.querySelector("[data-we-surface-plate=right-sidebar]") && document.querySelector("[data-we-surface-plate=right-sidebar]").style.clipPath');
  await until('!document.getElementById("frame").hasAttribute("data-animating")');
  const mid = await evaluate(`(()=>{const frame=document.getElementById('frame'),col=document.querySelector('[data-rightbar-col]'),plate=document.querySelector('[data-we-surface-plate=right-sidebar]');return {width:col.getBoundingClientRect().width,duration:getComputedStyle(frame).transitionDuration,blur:plate&&getComputedStyle(plate).backdropFilter,paused:frame.getAnimations().map(a=>a.playState)};})()`);
  check('新版整层网格超过宿主600ms收尾仍停在视频一半', Math.abs(mid.width - 160) < 2 && mid.paused.includes('paused'), mid);
  check('展开一半玻璃已存在且有霜，不等待结束', mid.blur?.includes('blur(14px)'), mid);
  await evaluate(`window.__shake=document.documentElement.animate([{translate:'8px -5px'},{translate:'8px -5px'}],{duration:1000,fill:'both',composite:'add'});__shake.pause();__shake.currentTime=500;document.documentElement.style.overflow='clip';__glass.sync()`);
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const moved = await evaluate(`(()=>{const p=document.getElementById('panel').getBoundingClientRect(),plate=document.querySelector('[data-we-surface-plate=right-sidebar]'),r=plate?.getBoundingClientRect();const clip=plate?.style.clipPath;__glass.sync();return {panel:p.toJSON(),plate:r?.toJSON(),clip,beforeRefresh:clip,afterRefresh:plate?.style.clipPath};})()`);
  check('哈气纯根平移时玻璃与panel同位，没有二次位移', moved.plate && Math.abs(moved.plate.x - moved.panel.x) < .5 && Math.abs(moved.plate.y - moved.panel.y) < .5, moved);
  check('玻璃几何刷新不抹除联动持有的clip-path', !!moved.beforeRefresh && moved.afterRefresh === moved.beforeRefresh, moved);
  await screenshot('sidebar-mid-shake');
  for (const progress of [.2, .8]) {
    await evaluate(`__pull.seek(${progress});__glass.sync()`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const sample = await evaluate(`(()=>{const dock=document.querySelector('[data-dockkit-host]').getBoundingClientRect(),plate=document.querySelector('[data-we-surface-plate=right-sidebar]'),p=plate?.getBoundingClientRect(),clip=plate?.style.clipPath;return {column:document.querySelector('[data-rightbar-col]').getBoundingClientRect().width,dock:dock.left,plate:p?.left,clip,blur:plate&&getComputedStyle(plate).backdropFilter};})()`);
    const inset = Number(sample.clip?.match(/inset\(0px 0px 0px ([\d.]+)px\)/)?.[1]);
    check('进度'+progress+' 整列、dock与玻璃裁剪边缘同步', Math.abs(sample.column - 320 * progress) < 2 && sample.blur?.includes('blur(14px)') && Math.abs(sample.plate + inset - sample.dock) < 1, sample);
  }
  await evaluate('__shake.cancel();document.documentElement.style.removeProperty("overflow");__pull.finish();__glass.sync()');
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const end = await evaluate(`({width:document.querySelector('[data-rightbar-col]').getBoundingClientRect().width,transition:document.getElementById('frame').style.transition,duration:document.getElementById('frame').style.getPropertyValue('--ds-transition-duration-slow'),clip:document.querySelector('[data-we-surface-plate=right-sidebar]')?.style.clipPath})`);
  check('完成恢复原生过渡、玻璃裁剪且整列到位', Math.abs(end.width - 320) < 1 && !end.transition && !end.duration && !end.clip, end);
  await evaluate('__sidebarCleanup();__glass.dispose()');
  check('联动卸载归还玻璃节点', await evaluate('!document.querySelector("[data-we-surface-root]")'));
}
