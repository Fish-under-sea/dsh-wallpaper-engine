/**
 * ext-avatar.js — 「扩展」页签**第一个模块**（自定义会话头像）的扩展岛。
 *
 * ══ 它是什么 ══════════════════════════════════════════════════════════════════
 * 一个**模块描述符**（形状 `{ id, title, desc?, render? }`，契约写在 src/panel-tabs.js 的
 * `extensionModules()` 上方）：panel-tabs 只负责把它排在「扩展」页签里（**第一个**），
 * 具体的控件与文案全在本文件。装饰本体在 `src/avatar-layer.js`（会话界面上的 DOM 补丁），
 * 设置项的真源在 `lib/settings-schema.js` 的五个 `avatar*` 键，图片本体在宿主的
 * `~/.dsh-wallpaper-engine/avatars/`（经 `lib/routes/avatar.js` 读写）。
 *
 * 契约：
 *   需要的外界：`ctx`（由 `src/client.js` 在 `renderExtensionsTab({...})` 的调用点组装）——
 *     `sel` + 四枚具名处理器（总开关 / 大小 / 圆角强度 / 导入 / 清除）；扁平可用的渲染助手
 *     `React` / `weT` / `switchRow` / `SliderRow` / `ctlText`。
 *   ⚠️ **没有自定义名字行**（用户口径："加了它太丑了"）—— 不要加回来：这一页只剩图片与两个滑块。
 *   对外提供：`AVATAR_EXTENSION_MODULE`（注册表项）+ `renderAvatarIsland(ctx)`。
 *
 * 不变量：
 *   · **模块不得自己写设置 / 发通知 / 持有状态**（panel-tabs 的注册表契约）：本文件里
 *     没有任何写设置的调用、没有重渲染通知、没有 `selection` 读取，一个动作一个
 *     `on*` 处理器 —— 文件选择器的 input 也**不在**这里造（那是一次性的 DOM 副作用，
 *     归 client.js 的 `onAvatarPick`）。
 *   · **只从一个参数取外界**：`renderAvatarIsland(ctx)`，函数体第一行解构。
 *   · **范围不在这里写死**：两个滑块的 min/max 直接读 `lib/settings-schema.js` 的
 *     `AVATAR_SIZE_MIN/MAX` 与 `AVATAR_RADIUS_MIN/MAX`（唯一真源；它们在产物里是同作用域常量）。
 *   · **预览必须说真话**：形状与大小按 `sel` 现算内联写（不进 CSS 变量、不依赖开关态），
 *     图与默认头像走 `src/avatar-layer.js` 的同一条 URL / 同一张零件表 ——
 *     面板里看到的就是会话里会出现的那一张。
 *   · 关掉总开关时**只画总开关 + 一句说明**（参数跟着收起来，与别的模块同口径）。
 */

/** 两方在界面上的名字与说明（`id` 与宿主路由的路径段一致，见 lib/index.js 的 AVATAR_SIDES）。 */
const AVATAR_SIDE_ROWS = [
  {
    id: 'user',
    get label() { return weT("「我」的头像"); },
    get hint() { return weT("你的消息在右侧，头像跟着在右侧"); },
  },
  {
    id: 'ai',
    get label() { return weT("「助手」的头像"); },
    get hint() { return weT("助手的消息在左侧，头像跟着在左侧"); },
  },
];

/** 预览框的固定边长（px）：比最大档（72）再留一点余量，于是任何一档都不被裁。
 *  固定不外扩的理由：这个框是**唯一**受"大小"影响的东西 —— 让它跟着变会让整页在拖动时抖。 */
const AVATAR_PREVIEW_BOX = 80;
/** 预览的兜底值（= lib/settings-schema.js 的 DEFAULTS.avatarSize / avatarRadius）。
 *  只在设置值是坏的（NaN / 缺键）时用得上 —— 正常情况下 schema 已经把值钳好了。 */
const AVATAR_PREVIEW_SIZE_FALLBACK = 40;
const AVATAR_PREVIEW_ROUND_FALLBACK = 100;

/**
 * 一方的头像行：预览 + 名字与说明 + 「导入图片…」/「替换图片…」+「清除」。
 * @param {object} side AVATAR_SIDE_ROWS 的一项
 * @param {object} sel  设置（读两个文件名键与在途态）
 * @param {object} acts { onPick, onClear }
 */
function avatarSideRow(side, sel, acts) {
  const set = Boolean(side.id === 'user' ? sel.avatarUserImage : sel.avatarAiImage);
  const busy = sel.avatarBusy === side.id;
  const size = avatarPreviewSize(sel);
  const round = avatarPreviewRound(sel);
  const url = avatarImageUrl(side.id, sel);
  return React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap", key: "avatar-row-" + side.id },
    // 预览：固定框 + 按当前大小/圆角现画的头像（图或默认头像）。框固定、头像在里面，
    // 于是"拖大小"只改这张脸的直径，整行不会跟着长高。
    React.createElement("span", {
      className: "we-avatar-preview",
      style: { width: AVATAR_PREVIEW_BOX + "px", height: AVATAR_PREVIEW_BOX + "px" },
    },
      React.createElement("span", {
        className: "we-avatar-preview__face",
        style: {
          width: size + "px",
          height: size + "px",
          borderRadius: (round / 2) + "%",
        },
      },
        url
          ? React.createElement("img", {
              className: "we-avatar-preview__img", src: url, alt: "", draggable: false,
            })
          : React.createElement("span", { className: "we-avatar-preview__glyph" },
              renderAvatarGlyph(side.id, AVATAR_PREVIEW_BOX)),
      ),
    ),
    ctlText(side.label, side.hint),
    React.createElement("button", {
      className: "we-picker__btn",
      type: "button",
      disabled: busy,
      onClick: () => acts.onPick(side.id),
    }, busy ? weT("导入中…") : (set ? weT("替换图片…") : weT("导入图片…"))),
    set && React.createElement("button", {
      className: "we-picker__btn",
      type: "button",
      disabled: busy,
      onClick: () => acts.onClear(side.id),
    }, weT("清除")),
  );
}

/** 预览用的边长（钳到真源的范围里；与 avatar-layer 的画前钳位同一对常量）。 */
function avatarPreviewSize(sel) {
  const n = Number(sel && sel.avatarSize);
  if (!isFinite(n)) return AVATAR_PREVIEW_SIZE_FALLBACK;
  return Math.min(AVATAR_SIZE_MAX, Math.max(AVATAR_SIZE_MIN, Math.round(n)));
}
/** 预览用的圆角强度（%）。 */
function avatarPreviewRound(sel) {
  const n = Number(sel && sel.avatarRadius);
  if (!isFinite(n)) return AVATAR_PREVIEW_ROUND_FALLBACK;
  return Math.min(AVATAR_RADIUS_MAX, Math.max(AVATAR_RADIUS_MIN, Math.round(n)));
}

/**
 * 上传裁切弹窗（issue #191 问题 1）：居中模态 + 方形取景框。
 *
 * 交互：**拖拽平移** + **滚轮 / 滑块缩放**；框里那张图按 `zoom = 1 短边铺满` 起算
 * （再小就会露白），平移的边界是"图不能露出空白"。
 * 几何全在 client.js 的 `avatarCropGeometry`（唯一实现）—— 这一侧只读它算出的绘制值，
 * 不自己再算一遍（两处算法必然漂）。
 */
function renderAvatarCropModal(ctx) {
  const { sel, onAvatarCropZoom, onAvatarCropDrag, onAvatarCropConfirm, onAvatarCropCancel } = ctx;
  if (!sel.avatarCropSide) return null;
  // 几何由 ctx 传进来（client.js 现算）：渲染器不引 avatarCropGeometry 这个裸标识符 ——
  // 它是"只读 ctx"契约的一部分（见文件头不变量）。
  const geo = ctx.avatarCropGeo || { dw: 0, dh: 0, dx: 0, dy: 0 };
  const view = ctx.avatarCropView || 260;
  return React.createElement("div", { className: "we-crop" },
    React.createElement("div", { className: "we-crop__card" },
      React.createElement("div", { className: "we-crop__title" }, weT("裁切头像")),
      React.createElement("span", { className: "we-picker__hint" },
        weT("拖动调整位置、滚轮或滑块缩放；框内这一块会作为头像（方形）。")),
      React.createElement("div", {
        className: "we-crop__view",
        style: { width: view + "px", height: view + "px" },
        onPointerDown: (e) => {
          const startX = e.clientX;
          const startY = e.clientY;
          const move = (ev) => onAvatarCropDrag(ev.clientX - startX, ev.clientY - startY);
          const up = () => {
            try { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); } catch { /* ignore */ }
          };
          try {
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          } catch { /* ignore */ }
          if (e.preventDefault) e.preventDefault();
        },
        onWheel: (e) => {
          const dir = (e.deltaY || 0) > 0 ? -0.1 : 0.1;
          onAvatarCropZoom((Number(sel.avatarCropZoom) || 1) + dir, true);
          if (e.preventDefault) e.preventDefault();
        },
      },
        React.createElement("img", {
          className: "we-crop__img",
          src: sel.avatarCropUrl,
          alt: "",
          draggable: false,
          style: {
            width: geo.dw + "px",
            height: geo.dh + "px",
            left: (view - geo.dw) / 2 + geo.dx + "px",
            top: (view - geo.dh) / 2 + geo.dy + "px",
          },
        }),
        React.createElement("span", { className: "we-crop__frame", "aria-hidden": "true" }),
      ),
      SliderRow(weT("缩放"), 100, 400, 5, Math.round((Number(sel.avatarCropZoom) || 1) * 100),
        (v, live) => onAvatarCropZoom(v / 100, live), "%", "avatar-crop-zoom"),
      React.createElement("div", { className: "we-crop__actions" },
        React.createElement("button", {
          className: "we-picker__btn", type: "button", onClick: onAvatarCropCancel,
        }, weT("取消")),
        React.createElement("button", {
          className: "we-picker__btn we-picker__btn--primary", type: "button",
          disabled: sel.avatarBusy === sel.avatarCropSide,
          onClick: onAvatarCropConfirm,
        }, sel.avatarBusy === sel.avatarCropSide ? weT("导入中…") : weT("确认并导入")),
      ),
    ),
  );
}

/**
 * 扩展岛：总开关 → 两方各自的头像行 → 大小 → 圆角强度。
 * @param {{sel:object}} ctx 见文件头契约
 */
function renderAvatarIsland(ctx) {
  const { sel, onAvatarEnabled, onAvatarSize, onAvatarRadius, onAvatarPick, onAvatarClear } = ctx;
  const on = sel.avatarEnabled === true;
  return React.createElement(React.Fragment, null,
    switchRow(weT("启用自定义会话头像"), on, onAvatarEnabled,
      { key: "avatar-on", hint: weT("给会话双方配上头像，消息像好友聊天一样左右分列") }),
    React.createElement("span", { className: "we-picker__hint", key: "avatar-what" },
      weT("开启后：你的消息靠右侧、带你的头像；助手的消息靠左侧、带助手的头像。图片只保存在本机（导入时会缩到 512px 以内），没导入就用内置的默认头像。关掉这个开关，会话立刻恢复原样。")),
    on && AVATAR_SIDE_ROWS.map((side) => avatarSideRow(side, sel, {
      onPick: onAvatarPick,
      onClear: onAvatarClear,
    })),
    on && SliderRow(weT("头像大小"), AVATAR_SIZE_MIN, AVATAR_SIZE_MAX, 1, sel.avatarSize, onAvatarSize, "px", "avatar-size"),
    on && SliderRow(weT("圆角强度"), AVATAR_RADIUS_MIN, AVATAR_RADIUS_MAX, 1, sel.avatarRadius, onAvatarRadius, "%", "avatar-radius",
      { tooltip: weT("100% = 正圆（默认），50% = 大圆角方块，0% = 直角方形") }),
    on && sel.avatarError
      && React.createElement("div", { className: "we-picker__hint we-avatar-error", key: "avatar-err" }, sel.avatarError),
    // 裁切弹窗（issue #191 问题 1）：只在"已选好图、还没确认"时画。
    renderAvatarCropModal(ctx),
  );
}

/** 「扩展」页签的第一个模块（注册表项；`id` 是 React key，改它会让面板重挂一次）。
 *  `title` / `desc` 与别的模块同一条理由写成 getter（见 src/panel-tabs.js 的注册表契约）。 */
const AVATAR_EXTENSION_MODULE = {
  id: 'avatar',
  // 模块级重置的分组名（issue #192）：键集住在 lib/settings-schema.js 的 RESET_GROUPS，
  // 这一侧只报"我是哪一组" —— 键表不在渲染器里手抄第二份。
  resetGroup: 'avatar',
  get title() { return weT("自定义会话头像"); },
  get desc() { return weT("给会话双方各配一张头像，消息像好友聊天一样左右分列（默认关）"); },
  render: renderAvatarIsland,
};

export { AVATAR_EXTENSION_MODULE, renderAvatarIsland, renderAvatarCropModal };
