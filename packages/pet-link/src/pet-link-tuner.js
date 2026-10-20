/** 官方联动调参面板；仅暴露原生接口实际支持的参数，不保留无效的逐帧宠物 DOM 旋钮。 */
function createOfficialPetTuner(link, options = {}) {
  const doc = options.document || document;
  let root = null, logic = 'sidebar', installed = false;
  const weT = options.translate || (value => value);
  const fields = [
    ['sidebarWalkMs', weT('走位时长（毫秒）')], ['braceMs', weT('准备时长（毫秒）')],
    ['slowOpenMs', weT('侧栏展开（毫秒）')], ['openDelayMs', weT('展开延迟（毫秒）')],
    ['bubbleMs', weT('气泡时长（毫秒）')], ['holdMaxMs', weT('等待关闭（毫秒）')], ['eggAt', weT('彩蛋触发次数')],
    ['mascotOpenAtMs', weT('抓绳触发（毫秒）')], ['mascotRopeDownPx', weT('绳子下拉（像素）')],
    ['mascotReleaseAtMs', weT('绳子释放（毫秒）')], ['egg1FlingPower', weT('原生抛掷力度')],
    ['egg1LeadMs', weT('踢腿提前量（毫秒）')], ['egg1PostLandMs', weT('落地停留（毫秒）')],
    ['egg2LeadMs', weT('哈气提前量（毫秒）')], ['egg2OpenAtPct', weT('哈气展开进度（%）')],
  ];
  const labels = { sidebar: weT('拉动侧边栏'), mascot: weT('抓绳互动'), egg1: weT('踢开并弹飞'), egg2: weT('站立哈气') };
  const text = value => options.translate ? options.translate(value) : value;
  function element(tag, label) {
    const node = doc.createElement(tag);
    if (label) node.textContent = text(label);
    return node;
  }
  function button(label, title, action) {
    const node = element('button', label);
    node.type = 'button'; node.title = text(title); node.setAttribute('aria-label', text(title));
    node.style.cssText = 'min-width:32px;min-height:32px;border:1px solid GrayText;background:ButtonFace;color:ButtonText;border-radius:4px;cursor:pointer';
    node.addEventListener('click', action);
    return node;
  }
  function sync() {
    if (!root) return;
    const value = link.tuner.snapshot();
    root.querySelector('[data-status]').textContent = value.busy ? value.phase : value.reason || text(weT('联动可用'));
    const target = root.querySelector('[data-target]');
    target.replaceChildren();
    const pets = value.pets.filter(item => ['web', 'both'].includes(item.display));
    if (!pets.some(item => item.id === value.target)) pets.unshift({ id: value.target, name: value.target });
    for (const pet of pets) {
      const option = element('option'); option.value = pet.id; option.textContent = pet.name || pet.id;
      option.selected = pet.id === value.target; target.appendChild(option);
    }
    for (const input of root.querySelectorAll('[data-param]')) {
      const key = input.getAttribute('data-param');
      input.value = String(value.logicTuning[logic]?.[key] ?? value.defaults[key]);
    }
    for (const group of root.querySelectorAll('[data-bubble-group]')) {
      const id = group.getAttribute('data-bubble-group');
      const spec = PET_BUBBLE_SPECS.find(item => item.id === id);
      group.hidden = spec.logic !== logic;
      for (const row of group.querySelectorAll('[data-bubble-rule]')) {
        const rule = value.bubbleTiming[id]?.[row.getAttribute('data-bubble-rule')];
        row.querySelector('[data-bubble-action]').value = rule?.action || '';
        row.querySelector('[data-bubble-edge]').value = rule?.edge || 'start';
        row.querySelector('[data-bubble-offset]').value = String(rule?.offsetMs || 0);
      }
    }
    for (const tab of root.querySelectorAll('[data-logic]')) tab.setAttribute('aria-selected', String(tab.getAttribute('data-logic') === logic));
  }
  function open() {
    if (!root) {
      root = element('section'); root.setAttribute('data-pet-tuner', 'official');
      root.setAttribute('aria-label', text(weT('桌宠联动调参'))); root.setAttribute('role', 'dialog');
      root.style.cssText = 'position:fixed;inset:8px 8px auto auto;width:min(460px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;box-sizing:border-box;padding:12px;border:1px solid GrayText;border-radius:8px;background:Canvas;color:CanvasText;z-index:1000;font:13px/1.5 system-ui;letter-spacing:0';
      const header = element('header'); header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px';
      const heading = element('strong', weT('桌宠联动调参')); heading.style.flex = '1'; header.appendChild(heading);
      header.appendChild(button('↻', weT('刷新桌宠'), () => { link.warmup().then(sync); }));
      header.appendChild(button('■', weT('停止联动'), () => { link.tuner.cancel(); sync(); }));
      header.appendChild(button('×', weT('关闭'), close)); root.appendChild(header);
      const targetLabel = element('label', weT('目标桌宠')); targetLabel.style.cssText = 'display:grid;grid-template-columns:100px minmax(0,1fr);gap:8px';
      const target = element('select'); target.setAttribute('data-target', ''); target.style.minWidth = '0';
      target.addEventListener('change', () => { link.tuner.setTarget(target.value); link.warmup().then(sync); });
      targetLabel.appendChild(target); root.appendChild(targetLabel);
      const tabs = element('div'); tabs.setAttribute('role', 'tablist'); tabs.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:8px 0';
      for (const key of PET_TUNER_LOGICS) {
        const tab = button(labels[key], labels[key], () => { logic = key; sync(); });
        tab.setAttribute('role', 'tab'); tab.setAttribute('data-logic', key); tabs.appendChild(tab);
      }
      root.appendChild(tabs);
      for (const [key, label] of fields) {
        const row = element('label', label); row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 100px;gap:8px;align-items:center;margin:5px 0;overflow-wrap:anywhere';
        const input = element('input'); input.type = 'number'; input.min = '0'; input.step = key === 'egg1FlingPower' ? '0.1' : '1';
        input.style.cssText = 'min-width:0;width:100%;box-sizing:border-box'; input.setAttribute('data-param', key);
        input.addEventListener('change', () => {
          if (!link.tuner.setForLogic(logic, key, Number(input.value))) sync();
        }); row.appendChild(input); root.appendChild(row);
      }
      for (const spec of PET_BUBBLE_SPECS) {
        const group = element('fieldset'); group.setAttribute('data-bubble-group', spec.id);
        group.style.cssText = 'margin:10px 0 0;padding:8px;min-width:0;border:1px solid GrayText';
        group.appendChild(element('legend', spec.text(weT)));
        for (const [edge, label] of [['show', weT('出现')], ['hide', weT('隐藏')]]) {
          const row = element('div'); row.setAttribute('data-bubble-rule', edge);
          row.style.cssText = 'display:grid;grid-template-columns:32px minmax(0,1fr) 60px 72px;gap:4px;margin:4px 0;align-items:center';
          row.appendChild(element('span', label));
          const action = element('select'); action.setAttribute('data-bubble-action', '');
          action.setAttribute('aria-label', edge === 'show' ? weT('出现动作') : weT('隐藏动作')); action.style.minWidth = '0';
          for (const [key, name] of [['', weT('默认')], ...Object.keys(PET_ANIM).map(key => [key, key])]) {
            const option = element('option', name); option.value = key; action.appendChild(option);
          }
          const anchor = element('select'); anchor.setAttribute('data-bubble-edge', '');
          anchor.setAttribute('aria-label', edge === 'show' ? weT('出现时间锚点') : weT('隐藏时间锚点'));
          for (const [key, name] of [['start', weT('开始')], ['end', weT('结束')]]) {
            const option = element('option', name); option.value = key; anchor.appendChild(option);
          }
          const offset = element('input'); offset.type = 'number'; offset.min = '-180000'; offset.max = '180000'; offset.step = '1';
          offset.style.cssText = 'width:100%;min-width:0;box-sizing:border-box';
          offset.setAttribute('data-bubble-offset', ''); offset.setAttribute('aria-label', edge === 'show' ? weT('出现偏移（毫秒）') : weT('隐藏偏移（毫秒）'));
          const change = () => {
            const config = { ...link.tuner.snapshot().bubbleTiming[spec.id] };
            if (action.value) config[edge] = { action: action.value, edge: anchor.value, offsetMs: Number(offset.value) };
            else delete config[edge];
            if (!link.tuner.setBubbleTiming(spec.id, config)) sync();
          };
          for (const input of [action, anchor, offset]) { input.addEventListener('change', change); row.appendChild(input); }
          group.appendChild(row);
        }
        root.appendChild(group);
      }
      const actions = element('div'); actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px';
      actions.appendChild(button('▶', weT('运行当前逻辑'), () => { link.tuner.run(logic).then(sync); sync(); }));
      actions.appendChild(button('↶', weT('重置当前逻辑'), () => { link.tuner.reset(logic); sync(); }));
      actions.appendChild(button('↓', weT('导出 JSON'), () => {
        const out = root.querySelector('textarea'); out.value = JSON.stringify(link.tuner.snapshot(), null, 2); out.hidden = false; out.focus(); out.select();
      })); root.appendChild(actions);
      const status = element('output'); status.setAttribute('data-status', ''); status.setAttribute('aria-live', 'polite'); root.appendChild(status);
      const out = element('textarea'); out.hidden = true; out.readOnly = true; out.rows = 6;
      out.setAttribute('aria-label', text(weT('当前调参 JSON'))); out.style.cssText = 'width:100%;box-sizing:border-box;margin-top:8px'; root.appendChild(out);
      doc.body.appendChild(root);
    }
    root.hidden = false; sync(); link.warmup().then(sync); return true;
  }
  function close() { if (root) root.hidden = true; return false; }
  const keydown = event => {
    if (!event.ctrlKey || !event.shiftKey || String(event.key).toLowerCase() !== 'd') return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (root && !root.hidden) close(); else open();
  };
  return {
    open, close, toggle() { return root && !root.hidden ? close() : open(); }, isOpen() { return Boolean(root && !root.hidden); },
    install() { if (!installed) { doc.addEventListener('keydown', keydown, true); installed = true; } },
    dispose() { doc.removeEventListener('keydown', keydown, true); installed = false; root?.remove(); root = null; },
  };
}
