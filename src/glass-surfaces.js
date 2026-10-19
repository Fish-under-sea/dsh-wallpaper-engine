/**
 * glass-surfaces.js — 表面策略与可撤销运行管理。
 * 参数沿用 glass.js 写出的变量；只给已验证页面区域放置根级背景叶节点。
 * 不改变共享祖先的定位、层叠、滤镜或宿主内容树；不安全的区域完整保留原生背景。
 * 额外选择器仅借用原生已有的定位/层叠上下文，不为其制造上下文。
 * sync/dispose 经 glass-extra 接入既有 effects 生命周期；静止时不安排循环帧。
 */
function weResolveSurface(id, selection, facts) {
  const native = (reason) => ({ mode: "native", reason });
  if (selection && selection.glassSurfacePolicy && selection.glassSurfacePolicy[id] === "native") return native("policy-native");
  if (facts.preserve) return native("preserve");
  if (!facts.enabled) return native("disabled");
  if (!facts.visible) return native("hidden");
  if (facts.nativeBlur) return native("native-blur");
  if (facts.occupied) return native("carrier-busy");
  if (id === "content") return { mode: "content", reason: "known-canvas" };
  if (id === "settings-window" || id === "declared") return facts.safeLocal
    ? { mode: "local", reason: "native-context" } : native("unsafe-local-carrier");
  if (id === "extra") {
    // 拒绝次序不放宽：unsafe-local-carrier 仍先于软渲档 —— 非安全上下文照旧完整原生。
    if (!facts.safeLocal) return native("unsafe-local-carrier");
    // 软渲档显式回退（G6）：resolver 打出 extra-fallback 标记 ⇒ glass-extra 的无霜
    // 不透明底色规则（body[data-we-glass-fallback] 组）才有着力点；非安全上下文不进这里。
    if (facts.software) return { mode: "extra-fallback", reason: "software-fallback" };
    return { mode: "local", reason: "native-context" };
  }
  if (!facts.safeRoot) return native("unsafe-root-geometry");
  return { mode: facts.software ? "plate" : "root", reason: facts.software ? "software-fallback" : "page-region" };
}

let weSurfaceRuntime = null;
const WE_SURFACE_MARKER = "data-we-surface-runtime";

function weSurfaceOwnNode(node) {
  const el = node && (node.nodeType === 1 ? node : node.parentElement);
  return !!(el && el.closest && el.closest("[data-we-surface-root], style[data-plugin-css]"));
}

function weSurfaceUnmark(record) {
  // 摘除判值用本 record 实际写过的标记值（markValue），不能假定它等于 record.id：
  // 软渲档把 extra 面标记跟走为 "extra-fallback"，按 id 判会永久摘不掉。
  const markValue = record.markValue || record.id;
  if (record.marked && record.target.getAttribute(WE_SURFACE_MARKER) === markValue) {
    if (record.before === null) record.target.removeAttribute(WE_SURFACE_MARKER);
    else record.target.setAttribute(WE_SURFACE_MARKER, record.before);
  }
  for (const [node, before] of record.layouts || []) {
    if (node.getAttribute("data-we-layout-runtime") !== record.id) continue;
    if (before === null) node.removeAttribute("data-we-layout-runtime");
    else node.setAttribute("data-we-layout-runtime", before);
  }
  record.layouts = new Map();
  record.marked = false;
  if (record.plate) record.plate.remove();
  record.plate = null;
}

function weSurfaceGeometry(target, id, owned) {
  const win = target.ownerDocument.defaultView;
  const style = win.getComputedStyle(target), rect = target.getBoundingClientRect();
  const visible = target.isConnected && rect.width > 0 && rect.height > 0
    && style.display !== "none" && style.visibility === "visible" && Number(style.opacity) > 0;
  const nativeBlur = [style.backdropFilter, style.webkitBackdropFilter].some(v => v && v !== "none");
  const root = target.ownerDocument.documentElement;
  const rootStyle = root && win.getComputedStyle(root);
  // 根平移同时作用于宿主与装饰叶；在共同坐标系内验界，不把哈气位移误判为越界。
  const translated = rootStyle && rootStyle.translate && rootStyle.translate !== "none";
  const origin = translated ? root.getBoundingClientRect() : { left: 0, top: 0 };
  const x = translated ? origin.left + (win.scrollX || 0) : 0;
  const y = translated ? origin.top + (win.scrollY || 0) : 0;
  let safeRoot = visible && rect.left >= x && rect.top >= y
    && rect.right <= x + win.innerWidth + 1 && rect.bottom <= y + win.innerHeight + 1;
  // 宿主明确声明的 push/fullscreen 才进入右栏安全几何路径；未知模式继续原生回退。
  if (id === "right-sidebar" && !['push', 'fullscreen'].includes(target.getAttribute("data-sidebar-right-panel"))) safeRoot = false;
  const column = id === "right-sidebar" && target.closest("[data-rightbar-col]");
  const pureRootTranslation = animation => {
    if (animation.effect?.target !== root || !animation.effect.getKeyframes) return false;
    const keys = animation.effect.getKeyframes();
    return keys.length > 0 && keys.every(key => "translate" in key && Object.keys(key)
      .every(name => ["translate", "offset", "computedOffset", "easing", "composite"].includes(name)));
  };
  for (let el = target; safeRoot && el; el = el.parentElement) {
    const cs = win.getComputedStyle(el);
    if (Number(cs.opacity) < 1 || cs.transform !== "none" || cs.perspective !== "none"
      || cs.filter !== "none" || (cs.backdropFilter && cs.backdropFilter !== "none")
      || cs.isolation === "isolate" || cs.mixBlendMode !== "normal" || cs.contain !== "none"
      || /transform|filter|opacity|perspective|contain/.test(cs.willChange)
      || [el === root ? "none" : cs.translate, cs.rotate, cs.scale].some(v => v && v !== "none")
      || el.closest('[role="dialog"], dialog, [aria-modal="true"]')
      || (el.getAnimations && el.getAnimations().some(animation => {
        // 列宽不会建立新的合成上下文；仅认领该侧栏直接所属网格的原生列宽过渡。
        if (column && column.parentElement === el && animation.effect?.target === el
          && animation.transitionProperty === "grid-template-columns") return false;
        return el !== root || !pureRootTranslation(animation);
      }))) safeRoot = false;
    if (el !== target && (el.scrollTop || el.scrollLeft || /auto|scroll/.test(cs.overflow + cs.overflowX + cs.overflowY))) safeRoot = false;
    const clip = el.getBoundingClientRect();
    if (el !== target && /hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY)
      && (rect.left < clip.left || rect.top < clip.top || rect.right > clip.right || rect.bottom > clip.bottom)) safeRoot = false;
  }
  const pseudo = ["extra", "settings-window", "declared"].includes(id) ? win.getComputedStyle(target, "::before") : null;
  return {
    visible, safeRoot, nativeBlur, rect, radius: style.borderRadius,
    safeLocal: style.position !== "static" && style.zIndex !== "auto" && Number(style.opacity) === 1
      && style.filter === "none" && style.transform === "none" && style.isolation !== "isolate",
    occupied: !!(pseudo && pseudo.content !== "none" && pseudo.content !== "normal"
      && !(owned && pseudo.content === '\"\"')),
    preserve: !!target.closest("[data-we-surface-preserve]"),
  };
}

function weSurfaceCandidates(state) {
  const entries = new Map(), doc = state.doc;
  const add = (target, id, enabled) => {
    if (!entries.has(target) && !weSurfaceOwnNode(target)) entries.set(target, { target, id, enabled });
  };
  const left = doc.querySelectorAll('div:has(> [data-slot="sidebar"])');
  // 唯一宿主区域才可认领；双侧栏/嵌套未知布局不猜测。
  for (const target of left) add(target, "left-sidebar", left.length === 1 && state.selection.leftSidebarGlass === true);
  const right = doc.querySelectorAll("[data-sidebar-right-panel]");
  // ⚠️ 宿主会为**每个被保留的会话**各渲染一份右栏面板（ui-sidebar-right 的 RightbarRoot
  //    按 useViews() 逐会话挂一份 SidebarPanel，非当前会话那份由 `.session[hidden]` 包住），
  //    所以 DOM 里常年有多份 [data-sidebar-right-panel]，但**真正参与布局的只有当前会话那份**。
  //    旧判据数的是 NodeList 长度 ⇒ 用户只要开过第二个会话的右栏，接管资格就永远为假，
  //    右侧栏整块退回原生不透明底（"我的右侧侧边栏玻璃效果被改没了"）。
  //    判据改成"**在布局里的**面板恰好一份"：hidden 子树里的兄弟面板不参与竞争。
  const rightLive = [...right].filter((panel) => !panel.closest("[hidden]") && panel.getClientRects().length > 0);
  for (const target of right) {
    const sole = rightLive.length === 1 && rightLive[0] === target;
    add(target, "right-sidebar", sole && state.selection.sidebarGlass === true && target.hasAttribute("data-sidebar-right-open"));
  }
  for (const target of doc.querySelectorAll('[role="dialog"]:has([data-slot="settings.section"])'))
    add(target, "settings-window", doc.body.hasAttribute("data-we-glass-window"));
  for (const target of doc.querySelectorAll('[data-we-surface="v1"]')) add(target, "declared", true);
  // ⚠️ 阅读文件页（`[data-document-preview]`，宿主 dsh-client-ui-sidebar-documentpreview 的
  // TextPreview 根节点）也是**内容面**：它此前不在这一组里 ⇒ 「内容面透明度 / 内容面底色」
  // 在那一页从来不生效（用户以为设置被删了）。
  // 与上面同一条纪律：只认在布局里的面板，hidden 子树里保留的旧会话不参与。
  for (const panel of rightLive) {
    if (!panel.hasAttribute("data-sidebar-right-open")) continue;
    for (const target of panel.querySelectorAll(".cm-editor,.xterm,[data-document-preview]"))
      add(target, "content", state.selection.sidebarGlass === true);
  }
  for (const selector of state.selectors) {
    for (const target of doc.querySelectorAll(selector)) {
      if (entries.size >= 32) break;
      if (target !== doc.body && target !== doc.documentElement) add(target, "extra", true);
    }
  }
  return entries;
}

function weSurfaceLayouts(record) {
  for (const [node, before] of record.layouts || []) {
    if (node.getAttribute("data-we-layout-runtime") === record.id) {
      if (before === null) node.removeAttribute("data-we-layout-runtime");
      else node.setAttribute("data-we-layout-runtime", before);
    }
  }
  record.layouts = new Map();
  const selector = record.id === "settings-window" ? '[data-slot="settings.section"]' : '[data-we-surface-layout]';
  for (const node of record.target.querySelectorAll(selector)) {
    if (node.closest('[data-we-surface-preserve]')) continue;
    const owner = node.closest('[data-we-surface="v1"]');
    if (record.id === "declared" ? owner !== record.target : owner !== null) continue;
    const before = node.getAttribute("data-we-layout-runtime");
    if (before !== null) continue;
    record.layouts.set(node, before);
    node.setAttribute("data-we-layout-runtime", record.id);
  }
}

function weSurfaceModalState(state) {
  const blocked = [...state.doc.querySelectorAll('[aria-modal="true"],dialog[open],[role="alertdialog"]')].some(node => {
    if (node.closest('.we-picker__modal,.we-preset-intro,[data-we-owned-modal]')) return false;
    const style = state.win.getComputedStyle(node), rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility === "visible" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
  });
  const body = state.doc.body;
  if (blocked && !body.hasAttribute("data-we-modal-blocked")) { body.setAttribute("data-we-modal-blocked", ""); state.modalOwned = true; }
  if (!blocked && state.modalOwned) { body.removeAttribute("data-we-modal-blocked"); state.modalOwned = false; }
}

function weSurfaceRefresh(state) {
  if (state !== weSurfaceRuntime || state.doc.hidden) return;
  if (!state.doc.body.hasAttribute("data-we-glass-page")) { disposeGlassSurfaces(); return; }
  weSurfaceModalState(state);
  const entries = weSurfaceCandidates(state), win = state.win;
  for (const [target, record] of state.records) {
    if (!entries.has(target)) { weSurfaceUnmark(record); state.records.delete(target); }
  }
  const observed = new Set();
  for (const [target, entry] of entries) {
    let record = state.records.get(target);
    if (record && record.id !== entry.id) { weSurfaceUnmark(record); record = null; }
    if (!record) {
      record = { ...entry, before: target.getAttribute(WE_SURFACE_MARKER), marked: false, plate: null };
      state.records.set(target, record);
    }
    const facts = weSurfaceGeometry(target, entry.id, record.marked);
    facts.enabled = entry.enabled;
    facts.software = state.doc.body.hasAttribute("data-we-glass-fallback")
      || !(win.CSS && (win.CSS.supports("backdrop-filter", "blur(1px)") || win.CSS.supports("-webkit-backdrop-filter", "blur(1px)")));
    const resolved = record.before !== null && !record.marked ? { mode: "native", reason: "foreign-owner" }
      : weResolveSurface(entry.id, state.selection, facts);
    Object.assign(record, resolved);
    if (resolved.mode === "native") weSurfaceUnmark(record);
    else {
      // 标记值跟走 resolver（t9-001）：软渲档把 extra 面标记从 "extra" 切到
      // "extra-fallback"，解除时切回；weSurfaceUnmark 按 record.markValue 判摘。
      // 不跟走时软渲专属 CSS 规则（:where([data-we-surface-runtime="extra-fallback"])）
      // 永不匹配，无霜不透明可读底色落空。
      const markValue = resolved.mode === "extra-fallback" ? "extra-fallback" : entry.id;
      if (!record.marked) {
        target.setAttribute(WE_SURFACE_MARKER, markValue);
        record.markValue = markValue;
        record.marked = true;
      } else if (target.getAttribute(WE_SURFACE_MARKER) !== markValue) {
        target.setAttribute(WE_SURFACE_MARKER, markValue);
        record.markValue = markValue;
      }
      if (entry.id === "settings-window" || entry.id === "declared") weSurfaceLayouts(record);
      // extra/extra-fallback 只借用目标原生定位/层叠上下文的 ::before，不建 plate
      // （契约：不为其制造上下文/节点；plate 属于页面区域根叶形态）。
      if (resolved.mode !== "local" && resolved.mode !== "content" && entry.id !== "extra") {
        if (!state.root) {
          state.root = state.doc.createElement("div");
          state.root.setAttribute("data-we-surface-root", "v1");
          state.root.setAttribute("aria-hidden", "true");
          state.root.setAttribute("inert", "");
          state.doc.body.appendChild(state.root);
        }
        if (!record.plate) {
          record.plate = state.doc.createElement("div");
          record.plate.setAttribute("data-we-surface-plate", entry.id);
          state.root.appendChild(record.plate);
        }
        const r = facts.rect, origin = state.root.getBoundingClientRect();
        // 共同根平移已经作用于装饰叶，viewport 测量须换算到该叶的本地坐标。
        // 只维护几何属性；cssText 会清掉联动持有的 clip-path，造成展开中漏底。
        const geometry = { left: (r.left - origin.left) + "px", top: (r.top - origin.top) + "px",
          width: r.width + "px", height: r.height + "px", borderRadius: facts.radius };
        for (const [name, value] of Object.entries(geometry)) {
          if (record.plate.style[name] !== value) record.plate.style[name] = value;
        }
      }
    }
    for (let el = target; el; el = el.parentElement) observed.add(el);
  }
  for (const el of state.observed) if (!observed.has(el)) state.resize.unobserve(el);
  for (const el of observed) if (!state.observed.has(el)) state.resize.observe(el);
  state.observed = observed;
  if (state.root && !state.root.children.length) { state.root.remove(); state.root = null; }
}

function syncGlassSurfaces(selection) {
  if (typeof document === "undefined" || !document.body || !document.defaultView) return;
  const win = document.defaultView;
  // 缺少可验证的几何能力就保留原生，不走定时轮询。
  if (!win.ResizeObserver || !win.MutationObserver || !win.requestAnimationFrame) return;
  if (!document.body.hasAttribute("data-we-glass-page")) { disposeGlassSurfaces(); return; }
  let state = weSurfaceRuntime;
  if (state && state.doc !== document) { disposeGlassSurfaces(); state = null; }
  if (!state) {
    state = { doc: document, win, selection, selectors: [], records: new Map(), observed: new Set(), root: null, frame: null, listeners: [] };
    weSurfaceRuntime = state;
    state.schedule = () => {
      if (state !== weSurfaceRuntime || state.doc.hidden || state.frame !== null) return;
      state.frame = win.requestAnimationFrame(() => { state.frame = null; weSurfaceRefresh(state); });
    };
    state.resize = new win.ResizeObserver(state.schedule);
    state.mutations = new win.MutationObserver(changes => {
      const selectors = ['div:has(> [data-slot="sidebar"])', '[data-sidebar-right-panel]', '[data-we-surface]', '[data-we-surface-layout]', '[data-slot="settings.section"]', '[role="dialog"]', '[aria-modal]', 'dialog', '[role="alertdialog"]', '.cm-editor', '.xterm', ...state.selectors].join(",");
      const relevant = node => node && node.nodeType === 1 && !weSurfaceOwnNode(node)
        && (node.matches(selectors) || node.querySelector(selectors));
      for (const change of changes) {
        if (weSurfaceOwnNode(change.target)) continue;
        if (change.type === "childList") {
          if ([...change.addedNodes, ...change.removedNodes].some(relevant)) { state.schedule(); break; }
        } else if (change.target === state.doc.body || change.target === state.doc.documentElement
          || change.attributeName === "data-we-surface-preserve" || change.attributeName === "data-we-surface-layout"
          || [...state.records.keys()].some(el => el === change.target || change.target.contains(el))
          || change.target.matches(selectors)) { state.schedule(); break; }
      }
    });
    state.mutations.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["class", "style", "hidden", "open", "data-sidebar-right-open", "data-sidebar-right-panel",
        "data-we-surface", "data-we-surface-layout", "data-we-surface-preserve", "role", "aria-modal", "data-we-glass-window", "data-we-glass-page", "data-we-glass-fallback", "data-ds-dark-theme", "data-dsh-skin"] });
    const listen = (target, name, callback, options) => {
      target.addEventListener(name, callback, options); state.listeners.push(() => target.removeEventListener(name, callback, options));
    };
    for (const event of ["resize", "scroll", "transitionrun", "transitionend", "animationstart", "animationend"])
      listen(win, event, state.schedule, { capture: true, passive: true });
    listen(document, "visibilitychange", () => {
      if (document.hidden) {
        if (state.frame !== null) win.cancelAnimationFrame(state.frame);
        state.frame = null;
        for (const record of state.records.values()) weSurfaceUnmark(record);
        state.resize.disconnect(); state.observed.clear();
        if (state.root) { state.root.remove(); state.root = null; }
      } else state.schedule();
    });
  }
  state.selection = selection || {};
  const list = typeof sanitizeExtraGlassSelectors === "function" ? sanitizeExtraGlassSelectors(state.selection.extraGlassSelectors) : "";
  state.selectors = (list ? list.split(", ") : []).filter(selector => {
    try { document.querySelector(selector); return true; } catch { return false; }
  });
  if (state.frame !== null) { win.cancelAnimationFrame(state.frame); state.frame = null; }
  weSurfaceRefresh(state);
}

function disposeGlassSurfaces() {
  const state = weSurfaceRuntime;
  if (!state) return;
  weSurfaceRuntime = null;
  if (state.frame !== null) state.win.cancelAnimationFrame(state.frame);
  state.mutations.disconnect(); state.resize.disconnect();
  if (state.modalOwned) state.doc.body.removeAttribute("data-we-modal-blocked");
  for (const stop of state.listeners) stop();
  for (const record of state.records.values()) weSurfaceUnmark(record);
  if (state.root) state.root.remove();
  state.records.clear(); state.observed.clear();
}

/** 高级兼容信息的数据源：不含宿主文本、DOM 引用或任意样式值。 */
function weGlassSurfaceStatus() {
  return weSurfaceRuntime ? [...weSurfaceRuntime.records.values()].map(({ id, mode, reason }) => ({ id, mode, reason })) : [];
}

export { weResolveSurface, syncGlassSurfaces, disposeGlassSurfaces, weGlassSurfaceStatus };
