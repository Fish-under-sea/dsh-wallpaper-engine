/**
 * playback-rate-section.js — 「播放」页签的「倍速 / 帧率上限」节（含私有 renderTranscodeProgress）。
 *
 * ⚠️ 归属（ADR-0013 D20）：随包走的只有**渲染器**；倍速 / 帧率上限的选择、默认值、持久化与
 *    动作体（onPlaybackRate / onFpsCap）、档位表 FPS_CAP_VALUES、codecLabel、源信息与转码进度
 *    状态全留在主包 ⇒ 值一律经主包构造的渲染 ctx 或 host 显式键集拿到。
 *    本文件只读 ctx、不写 selection、不自发通知（接缝判据见 test/verify-client.mjs）。
 *    构建期内联在 packages/media-bridge/src/client.js 之前（inline 顺序见 client.build.json）。
 */

  // ── 转码进度行 ──
  function renderTranscodeProgress(sel) {
    return React.createElement("div", { className: "we-picker__row we-picker__prog", key: "transcode-prog" },
      React.createElement("div", {
        className: "we-picker__prog-track",
        role: "progressbar",
        "aria-label": weT("转码进度"),
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": Math.max(0, Math.min(100, sel.transcodeProgress.percent || 0)),
      },
        React.createElement("div", {
          className: "we-picker__prog-bar",
          style: { width: Math.max(2, Math.min(100, sel.transcodeProgress.percent || 0)) + "%" },
        }),
      ),
      React.createElement("span", { className: "we-picker__hint" },
        sel.transcodeProgress.phase === "download"
          ? weT("下载 ffmpeg {percent}%", { percent: sel.transcodeProgress.percent || 0 })
          : sel.transcodeProgress.phase === "transcode" && sel.transcodeProgress.finalizing ? weT("收尾中…")
          : sel.transcodeProgress.phase === "transcode"
            ? weT("转码中 {percent}%{eta}", {
              percent: sel.transcodeProgress.percent || 0,
              eta: sel.transcodeProgress.eta ? weT(" · 约剩 {sec} 秒", { sec: sel.transcodeProgress.eta }) : "",
            })
          : sel.transcodeProgress.phase === "done" ? weT("即将完成…")
          : weT("准备中…"),
      ),
    );
  }

  function renderEffectsPlaybackSection(ctx) {
    const { onFpsCap, onPlaybackRate, sel, surface } = ctx;
    const sidebarSurface = surface === "sidebar";
    return React.createElement(React.Fragment, null,
      // Playback speed — native playbackRate, instant, no media reload. Video
      // wallpapers only (web/iframe and scene wallpapers have no playbackRate).
      sel.type === "video"
        && React.createElement("div", { className: "we-picker__ctl", key: "rate" },
        ctlText(weT("倍速")),
        React.createElement("div", { className: "we-picker__seg" },
          [0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) =>
            React.createElement("button", {
              key: rate,
              className: "we-picker__btn we-picker__rate" + (sel.playbackRate === rate ? " we-picker__rate--active" : ""),
              type: "button",
              onClick: () => onPlaybackRate(rate),
            }, String(rate).replace(/\.?0+$/, "") + "x"),
          ),
        ),
      ),
      // 解码帧率上限（抽帧转码）：host 一次性把源视频重编码为上限帧率（时间线
      // 1.0x 正常速度，解码占用随帧率线性下降），与倍速解耦。首次转码需等待，
      // 播放中原片、转好自动切换；无 ffmpeg 自动回退原片。
      // 侧栏档不出现在这里（准备与诊断，见函数头）。──
      !sidebarSurface && sel.type === "video"
        && React.createElement("div", { className: "we-picker__ctl", key: "fps" },
        ctlText(weT("帧率上限"), weT("抽帧转码 · 降低解码占用")),
        React.createElement("div", { className: "we-picker__seg" },
          FPS_CAP_VALUES.map((cap) =>
            React.createElement("button", {
              key: cap,
              className: "we-picker__btn we-picker__rate" + (sel.fpsCap === cap ? " we-picker__rate--active" : ""),
              type: "button",
              onClick: () => onFpsCap(cap),
            }, cap === 0 ? weT("无限制") : cap + "fps"),
          ),
        ),
      ),
      // Source metadata + transcode status (host moov probe / transcode lifecycle).
      // 源信息与转码进度同样是准备/诊断行 —— 侧栏档不画（见函数头）。
      !sidebarSurface && sel.type === "video" && sel.mediaInfo && React.createElement("span", { className: "we-picker__hint", key: "media-info" },
        weT("源 {width}×{height}{fps}{codec}{state}", {
          width: sel.mediaInfo.width,
          height: sel.mediaInfo.height,
          fps: sel.mediaInfo.fps ? " · " + sel.mediaInfo.fps + "fps" : "",
          codec: sel.mediaInfo.codec ? " · " + weT(codecLabel(sel.mediaInfo.codec)) : "",
          state: sel.transcodeState === "working" ? weT(" · 抽帧准备中…")
            : sel.transcodeState === "ready" ? weT(" · 已切换至 {fps}fps 抽帧版（正常速度，解码占用约减半）", { fps: sel.fpsCap })
            : sel.transcodeState === "cached" ? weT(" · 抽帧版已就绪（下次切换到这张时生效）")
            : sel.transcodeState === "native" ? weT(" · 源帧率未知，未抽帧")
            : sel.transcodeState === "fallback" ? weT(" · 转码不可用，已回退原片")
            : sel.transcodeState === "skipped" ? weT(" · 源帧率 ≤ 上限，无需抽帧")
            : "",
        }),
      ),
      // Download / transcode progress bar (polled from /transcode-progress).
      !sidebarSurface && sel.type === "video" && sel.transcodeState === "working" && sel.transcodeProgress
        && renderTranscodeProgress(sel),
    );
  }

export { renderEffectsPlaybackSection };
