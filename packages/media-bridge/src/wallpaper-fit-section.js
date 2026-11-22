/**
 * wallpaper-fit-section.js — 「播放」页签的「适配 / 水平翻转」节渲染器。
 *
 * ⚠️ 归属（ADR-0013 D20）：随包走的只有**渲染器**；objectFit / flip 的选择、默认值、持久化与
 *    动作体（onObjectFit / onFlip）全留在主包 ⇒ 值一律经主包构造的渲染 ctx 拿到。
 *    本文件只读 ctx、不写 selection、不自发通知（接缝判据见 test/verify-client.mjs）。
 *    构建期内联在 packages/media-bridge/src/client.js 之前（inline 顺序见 client.build.json）。
 */

  function renderEffectsFitSection(ctx) {
    const { onFlip, onObjectFit, sel } = ctx;
    return React.createElement(React.Fragment, null,
      // Fit mode — applies to the CURRENT wallpaper whatever its type (WE
      // video/scene image and custom uploads alike; web/iframe wallpapers
      // have no object-fit). 覆盖=cover 填充=contain 居中=center 拉伸=fill
      React.createElement("div", { className: "we-picker__ctl", key: "fit" },
        ctlText(weT("适配")),
        React.createElement("div", { className: "we-picker__seg" },
          ["cover", "contain", "center", "fill"].map((mode) => {
            const label = { cover: weT("覆盖"), contain: weT("填充"), center: weT("居中"), fill: weT("拉伸") }[mode];
            return React.createElement("button", {
              key: mode,
              className: "we-picker__btn we-picker__rate" + (sel.objectFit === mode ? " we-picker__rate--active" : ""),
              type: "button",
              title: mode,
              onClick: () => onObjectFit(mode),
            }, label);
          }),
        ),
      ),
      // Horizontal mirror — scaleX(-1), compositor-only; works for video,
      // web (iframe) and (later) uploaded image wallpapers alike.
      switchRow(weT("水平翻转"), sel.flip, onFlip, { key: "flip" }),
    );
  }

export { renderEffectsFitSection };
