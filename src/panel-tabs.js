/**
 * panel-tabs.js — 面板页签的**渲染器**（七个域：壁纸 / 外观 / 吉祥物 / 效果 / 声音 / 高级 / 关于，
 * 再加一个**模块容器**「扩展」；组合成六页签 壁纸库 / 外观 / 播放 / 系统 / 扩展 / 关于，
 * 装配点见 src/client.js 的 renderActiveTab）。
 *
 * 为什么单独一个文件：这些渲染器**读**面板状态、**调**面板处理器，但自己不持有状态 ——
 * 正是最适合独立出去的一层。这样面板组件体只剩"状态 + 处理器 + 装配"，页签怎么画看这里。
 * （「关于」是唯一连面板状态都不读的渲染器：静态文案 + 两张随包二维码。「扩展」读得更少：
 * 它只画 `extensionModules()` 里登记过的模块，一张都没登记就画空态。）
 *
 * 契约（构建期由 scripts/build-client.mjs 内联进 bundle 的工厂作用域，"外部作用域"=
 * 同一 prelude / src/client.js 的顶层）：
 *   · 每个渲染器**只从一个参数取外界**：`(ctx)`。函数体**逐字搬入**，唯一改动是开头那段
 *     解构 —— 于是"这个页签要什么"写在签名处，"怎么画"一行没动（模板字符串里的有效空白
 *     也不会被批量重排弄坏）。
 *   · ctx 由 `WallpaperPicker` 在调用点就地组装（见 src/client.js 的 `renderActiveTab`）：
 *     面板的 `sel` / 页签需要的局部视图状态 / 处理器。**多传字段无害，漏传会当场
 *     ReferenceError**（守卫会抓住）—— 这是刻意选的失败方式：响亮且可定位。
 *   · 页签**只做"读 + 组装 React 树"**，四类越界由 `test/verify-client.mjs` 的接缝判据钉住
 *     （与 `src/picker-modal.js` / `src/picker-props-panel.js` **同一条口径**）：
 *       ① 不得引用 `selection`（写入经 ctx 的 `setSetting` / `setTransient` 两个入口）；
 *       ② 不得调 `emit(`（通知归处理器）；
 *       ③ 不得改写 **ctx 别名**指向的东西（`editing` = `selection.editing`、`sel` = store 快照…）
 *          —— `editing.name = …` 是"渲染器成了状态的写入方"，那不是读；
 *       ④ 不得改写**模块级状态**（`propsPanelOpen` / `pickerFocusPending` / `pickerOpener` …）。
 *     ③④ 两类**不是风格问题**：它们不含 `selection.` 字面量，因此躲得过"只数字面量"的判据 ——
 *     那正是本文件长期违规却一直没变红的原因（同一批搬出去的另外两个渲染器早就在严口径下）。
 *   · **动作经具名处理器**：除写设置外还要做别的事（重建层 / 清失败记忆 / 重绘 / 刷库存…）
 *     一律收口成 `src/client.js` 里的 `on*` 处理器，经 ctx 传进来；页签只写 `onClick: onFoo`。
 *     于是"点了会发生什么"住在处理器里，页签只回答"画什么"。
 *   · 模块级依赖（React / SliderRow / switchRow / ctlText / FRAME_VARIANTS / 各类预设表 /
 *     纯函数如 `weT` / `adapterCaps` / `liveRenderEnabled`…）仍按内联规则直接读，不经过 ctx
 *     —— 它们是常量与纯组件/纯函数，与面板状态无关。**判据只盯状态与动作，不盯这些。**
 *   · 本文件必须保持浏览器安全（无 import / require / Node API），且**不得有顶层可执行语句**
 *     读 client.js 的 const（会被内联到 bundle 顶部，撞 TDZ）。
 */

  function renderWallpaperCurrentSection(ctx) {
    const { current, isLiveScene, onClear, onOpenPicker, onRefresh, onToggleAudio, onTogglePlay, onTogglePropsPanel, playbackLive, propsPanelOpen, renderUserPropsPanel, sel, setPickerOpener } = ctx;
    return React.createElement(React.Fragment, null,
    // ── 当前壁纸: vinyl record beside the selection, in both card styles. ──
    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("当前壁纸")),
      ),
      React.createElement("div", { className: "we-picker__current" },
        React.createElement(VinylRecord, {
          cover: current && current.preview, title: current ? current.title : "",
          playing: playbackLive && Boolean(sel.url) && vinylSpinVisible(),
        }),
        React.createElement("div", { className: "we-picker__current-info" },
          React.createElement("div", { className: "we-picker__current-title", title: current ? current.title : "" },
            sel.id && current ? current.title : weT("未选择壁纸"),
            // 类型 + 播放态：宽卡片里另起一行；抽屉（窄容器）里由 CSS 改成
            // 「名称（类型 · 播放中）」同一行，整行超出省略（见 .we-repo-panel 规则）。
            React.createElement("span", { className: "we-picker__current-meta" },
              current
                ? weT("{type}{status}", {
                    type: { video: weT("视频壁纸"), web: weT("网页壁纸"), image: weT("图片壁纸"), scene: weT(isLiveScene ? "场景壁纸（实时渲染）" : "场景壁纸（静态帧）") }[current.type] || weT("壁纸"),
                    status: weT(playbackLive ? " · 播放中" : " · 已暂停"),
                  })
                : weT("尚未选择壁纸"))),
          // 失败/被过滤的原因说明包一层：抽屉里该层用 display:contents 展开成
          // grid 项（标题已独走第一行），靠这个包裹层保证「一行一项」。
          React.createElement("div", { className: "we-picker__current-sub" },
          // 播放失败原因（#84）: 浏览器解不了的编码 / 解码失败等 —— 给出可读原因，
          // 配合下面的「播放」按钮重试（不是静默空白）。
          sel.videoError && React.createElement("div", { className: "we-picker__current-error" }, sel.videoError),
          // 选择被过滤条件排除（#84）: 明确指出是哪一项过滤挡住了、怎么恢复
          sel.blockedNote && React.createElement("div", { className: "we-picker__current-error" }, sel.blockedNote),
          // 实时渲染失败原因（自动回退到旧链时显示）：让「为什么黑」可见 ——
          // 用户反馈时能直接说明，也提示了重试入口（重开「实时渲染」开关）。
          liveFailReasonOf(sel) && React.createElement("div", { className: "we-picker__current-error" },
            weT("实时渲染失败（{reason}），已自动回退；重新打开「实时渲染」开关可重试", { reason: weT(liveFailReasonOf(sel)) }))
          ),
        ),
        // 主操作区：选择壁纸（下钻库视图）。壁纸属性入口在下面那排播放控制里、
        // 排在「暂停」之前（同排同级、同款式）。
        React.createElement("div", { className: "we-picker__current-actions" },
          React.createElement("button", {
            className: "we-picker__btn we-picker__btn--primary", type: "button",
            ref: setPickerOpener,
            onClick: onOpenPicker,
          }, weT("选择壁纸")),
        ),
      ),
      // 属性面板紧贴卡片下方（同一节里），抽屉/弹窗两种形态都可见。
      renderUserPropsPanel(),
      // Playback controls (wallpaper-independent; the thumbnail grid lives in
      // the modal above, so these stay within reach).
      React.createElement("div", { className: "we-picker__row" },
        // 壁纸属性（仅场景/网页壁纸 + 有 propsUrl）：与播放控制同排、同款式
        //（普通 .we-picker__btn；面板开着时 is-on 高亮）——入口与播放控制同级更顺手。
        (current && (current.type === "scene" || current.type === "web") && sel.propsUrl)
          && React.createElement("button", {
            className: "we-picker__btn" + (propsPanelOpen ? " is-on" : ""),
            type: "button",
            title: weT("壁纸作者提供的可调属性（改动立即生效）"),
            onClick: onTogglePropsPanel,
          }, weT("壁纸属性")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onTogglePlay, disabled: !sel.url,
          // 按钮显示真实状态（#84）: 播放失败时回到「播放」，就是用户要的「继续」。
        }, playbackLive ? weT("暂停") : weT("播放", null, "play")),
        // 音乐开关：与「播放」同级的一键切换。只影响音轨，不动播放态 ——
        // 关掉后画面继续播放。仅对含音轨的壁纸类型显示（视频 / 场景内嵌 MP4）。
        //
        // ⚠️ 高亮判据必须与**按钮自己的状态**（也就是下面文案那个判据）**逐字同一个**：
        // 这颗按钮切的是 `videoAudioEnabled`，所以「亮」= 该开关为开。按别的量（如音量）判亮
        // 会让文案与高亮互相矛盾、点击没有任何视觉反馈。
        // 音量是**另一颗**控件，不参与这颗按钮的开关状态。
        (sel.type === "video" || (sel.type === "scene" && (sel.sceneVideo || sel.sceneHasAudio)))
          && React.createElement("button", {
            className: "we-picker__btn" + (sel.videoAudioEnabled === false ? "" : " is-on"),
            type: "button",
            onClick: onToggleAudio,
            disabled: !sel.url,
            title: sel.videoAudioEnabled === false
              ? weT("开启壁纸音轨（音量为 0 时自动设为 50%）")
              : weT("关闭壁纸音轨（画面继续播放）"),
          }, sel.videoAudioEnabled === false ? weT("🔇 音乐关") : weT("🔊 音乐开")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onClear, disabled: !sel.id,
          title: weT("清除当前壁纸（停止播放，回到无壁纸状态）"),
        }, weT("清除")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onRefresh, disabled: sel.loading,
        }, sel.loading ? weT("刷新中…") : weT("刷新")),
      ),
    ),
    );
  }

  function renderWallpaperTransitionSection(ctx) {
    const { onSwitchTransition, onSwitchTransitionDir, onSwitchTransitionSpeed, sel } = ctx;
    const switchTr = switchTransitionOf(sel);
    return React.createElement(React.Fragment, null,
    // ── 切换过场（手动点选与自动轮播共用）：类型 / 方向 / 速度 ──
    // 默认「硬切」（零成本、零风险）；换默认改 DEFAULTS 一处即可。
    // 每种过场只动 transform / opacity / clip-path（见 switchFrames）。
    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("切换过场")),
      ),
      // 过场动画：**下拉菜单**（不用水平平铺）—— 过场会持续增加，平铺一排按钮
      // 迟早挤成两行、还会把「方向 / 时长」挤下去；下拉天然可扩展。
      React.createElement("div", { className: "we-picker__ctl" },
        ctlText(weT("过场动画"), weT("换壁纸时的转场")),
        React.createElement("select", {
          className: "we-picker__select",
          value: sel.switchTransition,
          onChange: (e) => onSwitchTransition(e.target.value),
          "aria-label": weT("过场动画"),
        },
          ...SWITCH_TRANSITIONS.map((t) =>
            React.createElement("option", { key: t.id, value: t.id }, t.label)),
        ),
      ),
      // 方向：只有方向型过场（推移 / 擦除 / 条带）听它；条带用它决定竖条 / 横条。
      switchTr.directional && React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        ctlText(weT("方向"), weT("新画面从哪边进")),
        React.createElement("div", { className: "we-picker__seg" },
          SWITCH_DIRS.map((d) =>
            React.createElement("button", {
              key: d,
              className: "we-picker__btn we-picker__rate" + (sel.switchTransitionDir === d ? " we-picker__rate--active" : ""),
              type: "button",
              onClick: () => onSwitchTransitionDir(d),
              "aria-pressed": sel.switchTransitionDir === d ? "true" : "false",
              "aria-label": weT("过场方向 {dir}", { dir: weT(SWITCH_DIR_LABELS[d]) }),
            }, SWITCH_DIR_LABELS[d]),
          ),
        ),
      ),
      // 时长档：只影响速度乘子，基准时长写在各过场里（见 SWITCH_TRANSITIONS）。
      switchTr.ms > 0 && React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        ctlText(weT("时长"), weT("当前约 {ms} ms", { ms: switchTr.ms })),
        React.createElement("div", { className: "we-picker__seg" },
          SWITCH_SPEEDS.map((s) =>
            React.createElement("button", {
              key: s.id,
              className: "we-picker__btn we-picker__rate" + (sel.switchTransitionSpeed === s.id ? " we-picker__rate--active" : ""),
              type: "button",
              onClick: () => onSwitchTransitionSpeed(s.id),
              "aria-pressed": sel.switchTransitionSpeed === s.id ? "true" : "false",
              "aria-label": weT("过场速度 {speed}", { speed: weT(s.label) }),
            }, s.label),
          ),
        ),
      ),
    ),
    );
  }

  function renderWallpaperRotationSection(ctx) {
    const { INTERVALS, armedConfirm, editing, group, groups, onArmDeleteGroup, onDeleteGroup, onDisarmConfirm, onEditInterval, onEditName, onEditOrder, onGroupChange, onGroupInterval, onOpenPickerDraft, onToggleRotation, playableCount, sel } = ctx;
    const groupToken = group ? "group:" + group.id : "";
    return React.createElement(React.Fragment, null,
    // ── 自动轮播: user-defined carousel lists, each with its own
    //    wallpaper set, interval and order. Persisted as `rotationGroups` (host config.json). ──
    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("自动轮播")),
      ),
      React.createElement("div", { className: "we-picker__row we-picker__playlist-row" },
      React.createElement("select", {
        className: "we-picker__playlist-select",
        value: sel.rotationGroupId,
        onChange: onGroupChange,
        disabled: groups.length === 0,
        "aria-label": weT("轮播列表"),
      },
      React.createElement("option", { value: "" }, groups.length ? weT("— 选择轮播列表 —") : weT("— 暂无轮播列表 —")),
      ...groups.map((g) => React.createElement("option", {
        key: g.id, value: g.id,
      }, weT("{name}（{count} 可播放 · {interval} 分钟）", { name: g.name, count: groupWallpapers(g).length, interval: g.interval }))),
      ),
      React.createElement("button", {
        className: "we-picker__btn", type: "button",
        onClick: startCreateGroup,
      }, weT("新建")),
      React.createElement("button", {
        className: "we-picker__btn", type: "button",
        onClick: () => startEditGroup(sel.rotationGroupId),
        disabled: !sel.rotationGroupId,
      }, weT("编辑")),
      React.createElement("button", {
        className: "we-picker__btn", type: "button",
        // 第一下只置令牌（`onArmDeleteGroup`）；落地在下面那行问句的「确认」里。
        // 待确认时**置灰**（不隐藏、不换位置）：按钮仍占着那一格，宽度就完全不变，
        // 而且它指路到问句行 —— 留着可点会让"再点一下是不是就删了"变成猜测。
        onClick: onArmDeleteGroup,
        disabled: !sel.rotationGroupId || armedConfirm === groupToken,
        title: armedConfirm === groupToken
          ? weT("已经问过你了 —— 在下面那一行选「确认」或「取消」")
          : weT("删除这个轮播列表（会再问一次）"),
      }, weT("删除")),
    ),
    renderConfirmRow(armedConfirm, groupToken,
      weT("删除轮播列表「{name}」？此操作不可恢复。", { name: (group && group.name) || "" }),
      onDeleteGroup, onDisarmConfirm),
    editing && React.createElement("div", { className: "we-picker__editor" },
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint we-picker__label" }, weT("名称")),
        React.createElement("input", {
          className: "we-picker__text", type: "text",
          value: editing.name,
          "aria-label": weT("轮播列表名称"),
          onInput: onEditName,
        }),
      ),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint we-picker__label" }, weT("间隔")),
        React.createElement("select", {
          className: "we-picker__rotation-interval",
          value: String(editing.interval),
          onChange: onEditInterval,
          "aria-label": weT("轮播间隔"),
        },
        ...INTERVALS.map((minutes) =>
          React.createElement("option", { key: minutes, value: String(minutes) }, weT("{min} 分钟", { min: minutes })),
        )),
        React.createElement("span", { className: "we-picker__hint we-picker__label" }, weT("顺序")),
        React.createElement("select", {
          className: "we-picker__playlist-select",
          value: editing.order,
          onChange: onEditOrder,
          "aria-label": weT("轮播顺序"),
        },
        React.createElement("option", { value: "sequence" }, weT("顺序", null, "seq")),
        React.createElement("option", { value: "random" }, weT("随机")),
        ),
      ),
      // 选片走**页内下钻**（与「选择壁纸」同一套库视图）：点按钮进库浏览，
      // 卡片点击 = 加入/移出草稿（pickerDraft），顶部提示已选数；「返回」回编辑器。
      // 这里**只有一行入口按钮、没有内联网格**：大库在 24px 缩略图里翻页选片不可用，
      // 全尺寸浏览 + 搜索/过滤才是选片的正确形态。
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("button", {
          className: "we-picker__btn we-picker__btn--primary", type: "button",
          onClick: onOpenPickerDraft,
        }, weT("选择壁纸")),
        React.createElement("span", { className: "we-picker__hint" },
          weT("下钻进库挑选 · 点卡片加入 / 移出")),
      ),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint" }, weT("已选 {count} 个", { count: editing.wallpaperIds.length })),
        sel.inventory.playlists.length > 0 && React.createElement("select", {
          className: "we-picker__playlist-select",
          value: "",
          onChange: (e) => {
            const p = sel.inventory.playlists.find((pl) => pl.id === e.target.value);
            if (p) importPlaylistIntoDraft(p);
          },
        },
        React.createElement("option", { value: "" }, weT("从 WE 播放列表导入…")),
        ...sel.inventory.playlists.map((p) => React.createElement("option", {
          key: p.id, value: p.id,
        }, weT("{name}（{count} 可播放）", { name: p.name, count: p.portableCount || 0 }))),
        ),
      ),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: saveEditingGroup,
        }, weT("保存")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: cancelEditGroup,
        }, weT("取消")),
      ),
    ),
    React.createElement("div", { className: "we-picker__ctl" },
      ctlText(weT("自动轮转"),
        !sel.rotationGroupId
          ? weT("请先选择或新建一个轮播列表")
          : playableCount < 2
            ? weT("当前列表至少需要 2 个可播放壁纸")
            : weT("每 {min} 分钟切换一次", { min: group ? group.interval : DEFAULTS.rotationInterval })),
      React.createElement("div", { className: "we-picker__ctl-side" },
        React.createElement("select", {
          className: "we-picker__rotation-interval",
          value: String(group ? group.interval : DEFAULTS.rotationInterval),
          onChange: onGroupInterval,
          disabled: !sel.rotationEnabled || !sel.rotationGroupId || playableCount < 2,
          "aria-label": weT("轮转间隔"),
        },
        ...INTERVALS.map((minutes) =>
          React.createElement("option", { key: minutes, value: String(minutes) }, weT("{min} 分钟", { min: minutes })),
        )),
        Toggle({
          checked: sel.rotationEnabled,
          onChange: onToggleRotation,
          label: weT("自动轮转"),
          disabled: !sel.rotationGroupId || playableCount < 2,
          title: weT("按列表顺序/随机自动切换壁纸"),
        }),
      ),
    ),
    ),
    );
  }

  function renderWallpaperUploadsSection(ctx) {
    const { armedConfirm, group, onArmConfirm, onCancelEditUploadDir, onCancelEditWeAssetsDir, onDisarmConfirm, onStartEditUploadDir, onStartEditWeAssetsDir, onUploadDirDraft, onWeAssetsDirDraft, playableCount, playableList, sel, uploadedList } = ctx;
    const uploadToken = (w) => "upload:" + w.id;
    return React.createElement(React.Fragment, null,
    // ── 自定义壁纸: local JPG/PNG/MP4 as wallpapers. Files are written by the
    //    host into its plugin-managed directory and served through the same
    //    media/preview routes (read-A storage: survives restarts, no quota
    //    limits). Uploads merge into the inventory on the host side. ──
    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("自定义壁纸")),
      ),
      React.createElement("div", { className: "we-picker__uploads" },
      // Storage location — users can point uploads at a non-system drive
      // (most people don't want wallpaper files piling up on C:). The host
      // persists the choice and migrates existing files on change.
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint we-picker__label" }, weT("存储位置")),
        React.createElement("span", {
          className: "we-picker__uploads-path",
        }, sel.inventory.uploadDir || "—"),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          disabled: sel.uploading,
          onClick: onStartEditUploadDir,
        }, weT("更改")),
      ),
      sel.editingUploadDir && React.createElement("div", { className: "we-picker__row" },
        React.createElement("input", {
          className: "we-picker__text", type: "text",
          value: sel.uploadDirDraft,
          placeholder: weT("绝对路径，如 D:\\MyWallpapers"),
          onInput: onUploadDirDraft,
          onKeyDown: (e) => {
            if (e.key === "Enter") changeUploadDir(sel.uploadDirDraft, true);
            if (e.key === "Escape") onCancelEditUploadDir();
          },
        }),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          disabled: sel.uploading,
          onClick: () => changeUploadDir(sel.uploadDirDraft, true),
        }, weT("保存")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onCancelEditUploadDir,
        }, weT("取消")),
      ),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint" },
          weT("已有文件会迁移到新位置")),
        React.createElement("span", { className: "we-picker__hint" },
          weT("支持 ~ 表示用户主目录")),
      ),
      // ── 官方资源路径（local-assets）：场景实时渲染的 util、particle、
      // gradient 贴图默认是程序化复刻（观感近似）；指向本机 WE 安装目录的
      // assets 树后按名取官方像素，与官方引擎逐像素对齐。素材属 WE 版权
      // 内容，只从本机路径只读取用，不会被复制/上传。路径不硬编码 ——
      // 持久化在宿主 config.json（weAssetsDir），经 we-assets-dir 端点读写。
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint we-picker__label" }, weT("官方资源路径")),
        React.createElement("span", {
          className: "we-picker__uploads-path",
        }, sel.inventory.weAssetsDir || "—"),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onStartEditWeAssetsDir,
        }, sel.inventory.weAssetsDir ? weT("更改") : weT("设置")),
      ),
      sel.editingWeAssetsDir && React.createElement("div", { className: "we-picker__row" },
        React.createElement("input", {
          className: "we-picker__text", type: "text",
          value: sel.weAssetsDirDraft,
          placeholder: weT("WE assets 绝对路径，留空保存=清除"),
          onInput: onWeAssetsDirDraft,
          onKeyDown: (e) => {
            if (e.key === "Enter") changeWeAssetsDir(sel.weAssetsDirDraft);
            if (e.key === "Escape") onCancelEditWeAssetsDir();
          },
        }),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: () => changeWeAssetsDir(sel.weAssetsDirDraft),
        }, weT("保存")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onCancelEditWeAssetsDir,
        }, weT("取消")),
      ),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint" },
          sel.inventory.weAssetsAvailable
            ? weT("已启用 · 场景实时渲染取官方像素")
            : (sel.inventory.weAssetsDir
              ? weT("目录不可用（缺 materials/），场景实时渲染走程序化复刻")
              : weT("未配置 · 场景实时渲染贴图走程序化复刻"))),
        React.createElement("span", { className: "we-picker__hint" },
          weT("指向 Wallpaper Engine 安装目录的 assets（或其拷贝）")),
      ),
      sel.weAssetsError && React.createElement("div", { className: "we-picker__error" },
        sel.weAssetsError,
      ),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint we-picker__label" }, weT("自定义")),
        React.createElement("input", {
          className: "we-picker__file", type: "file",
          accept: ".jpg,.jpeg,.png,.mp4",
          disabled: sel.uploading,
          onChange: (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) uploadWallpaperFile(f);
            e.target.value = "";
          },
        }),
        sel.uploading && React.createElement("span", { className: "we-picker__hint" }, weT("上传中…")),
      ),
      sel.uploadError && React.createElement("div", { className: "we-picker__error" }, sel.uploadError),
      sel.uploadNote && React.createElement("div", { className: "we-picker__note" }, sel.uploadNote),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint" }, weT("已上传 {count} 个", { count: uploadedList.length })),
        React.createElement("span", { className: "we-picker__hint" }, weT("支持 JPG / PNG / MP4，及含 project.json 的 WE 壁纸目录")),
      ),
      uploadedList.length > 0 && React.createElement("div", { className: "we-picker__uploads-list" },
        uploadedList.map((w) => React.createElement(React.Fragment, { key: w.id },
          React.createElement("div", { className: "we-picker__uploads-item" },
          React.createElement("span", { className: "we-picker__uploads-name", title: w.title }, w.title),
          React.createElement("span", { className: "we-picker__hint" }, w.type === "video" ? "MP4" : weT("图片")),
          React.createElement("button", {
            className: "we-picker__btn", type: "button",
            // **会删本地文件** ⇒ 这一处最需要两下：第一下只置令牌。
            onClick: () => onArmConfirm(uploadToken(w)),
            disabled: sel.uploading || armedConfirm === uploadToken(w),
            title: armedConfirm === uploadToken(w)
              ? weT("已经问过你了 —— 在下面那一行选「确认」或「取消」")
              : weT("移除这个自定义壁纸（会再问一次，且会删除本地文件）"),
          }, weT("移除")),
          ),
          // 问句行紧跟它自己那一项（挂在同一个 `key` 下，位置不会串到别的壁纸那里）。
          renderConfirmRow(armedConfirm, uploadToken(w),
            weT("移除自定义壁纸「{name}」？此操作会删除本地文件，且不可恢复。", { name: w.title }),
            () => removeUploadWallpaper(w.id), onDisarmConfirm),
        )),
      ),
      ),
    ),
    React.createElement("div", { className: "we-picker__row" },
      React.createElement("span", { className: "we-picker__hint" },
        (group
          ? weT("列表「{name}」：{count} 项 · {playable} 可播放 · 每 {interval} 分钟 · {order}{rotating}", {
            name: group.name,
            count: group.wallpaperIds.length,
            playable: playableCount,
            interval: group.interval,
            order: group.order === "random" ? weT("随机") : weT("顺序", null, "seq"),
            rotating: sel.rotationEnabled ? weT(" · 自动轮转中") : "",
          })
          : weT("{count} 个可播放壁纸{rotating}", { count: playableList.length, rotating: sel.rotationEnabled ? weT(" · 自动轮转中") : "" }))),
    ),
    );
  }
  // 这一层只**按顺序组装**各节（"有哪几节、什么顺序"一眼可读；
  // 判据按真渲染的节序列钉住，见 verify-scene-live 的节顺序一节）。
  function renderWallpaperTab(ctx) {
    const { } = ctx;
    return React.createElement(React.Fragment, null,
      renderWallpaperCurrentSection(ctx),
      renderWallpaperTransitionSection(ctx),
      renderWallpaperRotationSection(ctx),
      renderWallpaperUploadsSection(ctx),
    );
  }


  function renderAppearanceThemeSection(ctx) {
    const { onResetModule, onToggleThemeFollow, sel } = ctx;
    return React.createElement(React.Fragment, null,
    // ── 主题：本节点只剩「主题随壁纸」—— 玻璃配置在「玻璃 UI」节，
    //    **「配色」（accent）已迁进「全局 UI 配色」节**（2026-10-11 用户口径：配色要成为
    //    一个独立大项，并作为"直接调整全部"的总色；见 renderAppearanceUiColorSection）。──
    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("主题")),
        moduleResetButton("theme", onResetModule),
      ),
      // 主题随壁纸：总开关（**默认关** = 不按壁纸自动改深浅主题；**试验性功能**，行内已标注）。
      // 开着时才取色判决，并把**最近一次结论**摊开（"为什么判成浅色"要能当场答）；
      // 关着时这个功能整体不生效。见 src/theme-follow.js。
      switchRow(weT("主题随壁纸"), sel.themeFollow === true, (e) => onToggleThemeFollow(e.target.checked), {
        key: "theme-follow",
        hint: weT("试验性功能 · 关 = 不按壁纸自动改深浅主题（默认关）"),
        tooltip: weT("试验性功能：开着时按当前壁纸自动切全局深/浅：作者配色 → 画面主色，两条腿不一致时取深色；在 DSH 设置里手动改过主题后，本张壁纸不再自动。关（默认）时这个功能整体不生效：不取色、不判决、不改主题；切换开关立刻生效。"),
      }),
      sel.themeFollow === true && sel.themeFollowLine
        && React.createElement("div", { className: "we-picker__hint", key: "theme-follow-line" },
          weT("当前：{line}", { line: weT(sel.themeFollowLine) })),
    ),
    );
  }

  function renderAppearanceDetailSection(ctx) {
    const { onBorder, onResetModule, sel, detailOpen, onToggleDetailSection } = ctx;
    // 简化 / 高级分档见 ADR-0008 **D4**（实现口径在 `src/glass-panel.js`，按 `ctx.surface` 判定）：
    // 全局四件套、预设方案与各面总开关属简化配置（侧栏档也画）；本节的「独立配置」层及其子项
    // 属高级配置 ⇒ 只在设置页画。它与 quick-panel 的 setting-only 占位器互为负对照。
    // ⚠️ 折叠门（2026-10-11 **二次修订**）：**两档都支持隐藏**；差别只在默认值
    //    （组件算好当 `open` 传进来）—— 侧边栏默认展开、设置页默认展开。
    const open = detailOpen === true;
    return React.createElement(React.Fragment, null,
    // ── 细节：只剩**非釉层**的「边框」（边框 / 分割线对比度）—— 不属于玻璃配方 ──
    React.createElement("div", { className: "we-picker__section" },
      sectionHead(weT("细节"), open, onToggleDetailSection, moduleResetButton("detail", onResetModule)),
      open && SliderRow(weT("边框"), 0, 90, 5, Math.round(sel.border * 100), onBorder, Math.round(sel.border * 100) + "%", "border-emphasis", {
        tooltip: weT("提高边框 / 分割线的对比度（浅色与深色主题通用）"),
      }),
      // ── 「左侧栏液态玻璃」及其子项在「玻璃 UI」节（门槛 `leftSidebarGlass`，见
      //    `src/glass-panel.js`）：总开关两档都画，其下「独立配置」层属高级配置、只在设置页画。──
    ),
    );
  }

  // ── 字族下拉的**选项**（一处生成，四张表共用）────────────────────────────────
  // 两组：内置族键（FONT_FAMILY_LABELS，栈写死在 client.js）+ **本机字体**
  // （宿主枚举出来的族名，经 systemFontKeyOf 变成 `sys:` 族键，见 src/system-fonts.js）。
  // ⚠️ 本机那一组先过 **`filterUsableSystemFonts`**：只留**本浏览器真的能匹配**的名字 ——
  //    系统列出的族名里有相当一部分（系统保留字体、同一字体的另一种写法）浏览器压根取不到，
  //    摆出来就是"选了没反应"（现场缺陷："控制台切换了字体，特殊文字还是显示成口"）。
  //    量不到时（替身 DOM / 无布局）它原样返回 ⇒ 这里不会因为"测不出来"而少给。
  // 本机那一组可能为空（清单还在路上 / 取不到）—— 空组**不渲染** optgroup
  //（给一个拉不动的分组比没有这个分组更让人困惑），状态由 sysFontNote 那一行说。
  // `skipInherit`：全局字体那一行不要「默认」项（它在那里等于"不覆盖"，与「跟随 DSH」同义）。
  // `current`：**当前值**。它即使不在清单里（换了机器 / 之前选过一个本浏览器取不到的名字）
  //   也必须摆进去 —— 否则 `<select>` 会显示成第一项（「跟随」）而值其实还存着，界面在撒谎。
  function familyOptions(sel, opts) {
    const o = opts || {};
    const builtin = o.skipInherit
      ? FONT_FAMILY_LABELS.filter((f) => f.v !== "inherit") : FONT_FAMILY_LABELS;
    const nodes = builtin.map((f) => React.createElement("option", { key: f.v, value: f.v }, f.label));
    const sys = filterUsableSystemFonts(sel.systemFonts).fonts
      .map((name) => ({ v: systemFontKeyOf(name), label: name }))
      .filter((x) => x.v);
    // ⚠️ 局部名不叫 `current`：那是本仓 `MUTABLE_ALIASES` 里的一员（picker 的 ctx 别名），
    //    `verify-client` 的"渲染器不得改写别名"判据会把这个**声明**误认成赋值。
    const curKey = typeof o.current === "string" ? o.current : "";
    if (curKey && !builtin.some((f) => f.v === curKey) && !sys.some((x) => x.v === curKey)) {
      const name = systemFontNameOf(curKey);
      if (name) sys.unshift({ v: curKey, label: name });
    }
    if (sys.length) {
      nodes.push(React.createElement("optgroup", { key: "__sys", label: weT("本机字体") },
        sys.map((x) => React.createElement("option", { key: x.v, value: x.v }, x.label))));
    }
    return nodes;
  }

  /**
   * 本机字体那一组的**状态行**（空串 = 没什么要说的）。
   * 四种要说话的情形都是"用户会以为坏了"的：还在扫、取不到、**按文件名推测**出来的清单、
   * 以及**有名字被本浏览器过滤掉** —— 最后这种必须说：否则用户找 `Apple Color Emoji` 找不到，
   * 只会以为清单又漏了，而真相是这个名字在本浏览器里取不到。
   */
  function sysFontNote(sel) {
    if (sel.systemFontsLoading) return weT("正在读取本机字体…");
    if (sel.systemFontsError) return weT("本机字体读不到：{why}", { why: sel.systemFontsError });
    if (sel.systemFontsApproximate && (sel.systemFonts || []).length) {
      return weT("本机字体是按文件名推测的（没拿到系统字体清单）");
    }
    const probe = filterUsableSystemFonts(sel.systemFonts);
    if (probe.skipped > 0) {
      return weT("已略过 {count} 个本浏览器取不到的字体名（选了也不会生效）", { count: probe.skipped });
    }
    return "";
  }

  /** 本机字体那一组的「重新扫描」（刚装完字体时的出路；在途时禁用）。 */
  function sysFontRefresh(sel, onRefresh) {
    return React.createElement("button", {
      key: "sys-font-refresh",
      type: "button",
      className: "we-picker__chip",
      disabled: sel.systemFontsLoading === true,
      onClick: () => onRefresh(),
      title: weT("重新读取本机已安装的字体（装了新字体之后用）"),
    }, weT("重新扫描"));
  }

  // ── 全局 / 终端字体两行 + 本机字体状态行 ──
  function renderFontGlobalFamily(sel, onGlobalFamily, onComponentFamily, onRefreshSystemFonts) {
    return React.createElement(React.Fragment, null,
    // ── 全局字体 / 终端字体：本机字体的两个入口 ──────────────────────────────
    // 两行一个形状。**全局**是"默认"不是"强制"：角色表与组件表里单独设过的仍以那里为准
    // （解析在 src/font/typography.js 的 buildTypePayload —— 角色没设才落到全局）。
    // **终端**写的就是「高级字体设置 → 终端」那一行的同一个键
    // （`componentFonts.terminal.family`）：两处是同一个值的两个入口，不会漂。
    React.createElement("div", { className: "we-picker__ctl", key: "global-family" },
      ctlText(weT("默认字体"), weT("整套界面的默认字族（全局）；角色 / 组件里单独设过的仍以那里为准")),
      React.createElement("select", {
        value: sanitizeFamilyKey(sel.globalFamily),
        style: { width: "150px" },
        onChange: (e) => onGlobalFamily(e.target.value),
        title: weT("整套界面（含角色表覆盖不到的文字）的默认字体；任意角色 / 组件单独设了字族，那里优先"),
      },
        React.createElement("option", { value: "" }, weT("跟随 DSH")),
        familyOptions(sel, { skipInherit: true, current: sanitizeFamilyKey(sel.globalFamily) }),
      ),
    ),
    React.createElement("div", { className: "we-picker__ctl", key: "terminal-family" },
      ctlText(weT("终端字体"), weT("对话里的终端块 + 侧栏终端面板（dsh-ssh）；与「高级字体设置 → 终端」同一项")),
      React.createElement("select", {
        value: fontFamilyKeyOf((sel.componentFonts.terminal || {}).family),
        style: { width: "150px" },
        onChange: (e) => onComponentFamily("terminal", e.target.value),
        title: weT("终端字体：① 对话里的终端块（走官方 --dsl-terminal-font 钩子）② 侧栏 / SSH 终端面板（走 dsh-ssh 给皮肤留的 --dsh-ssh-terminal-font 钩子）；「跟随」= 都不覆盖，各用它们自己的默认。⚠️ 若在 dsh-ssh 的设置里填过 terminalFontFamily，那个值优先级更高"),
      },
        React.createElement("option", { value: "" }, weT("跟随")),
        familyOptions(sel, { current: fontFamilyKeyOf((sel.componentFonts.terminal || {}).family) }),
      ),
    ),
    // 「本机字体」那一组的状态行 + 重新扫描：在途 / 取不到 / 按文件名推测都要说出来
    //（后两种用户会以为坏了；推测那种不说的话，用户会以为系统里真有那个族名）。
    React.createElement("div", { className: "we-picker__row", key: "sys-font-note" },
      React.createElement("span", { className: "we-picker__hint" }, sysFontNote(sel)),
      sysFontRefresh(sel, onRefreshSystemFonts),
    ),
    );
  }

  // ── 文字颜色角色（F1）：逐角色上色 + 深色单独设置 ──
  function renderFontColorRoles(sel, officialColorOf, onThemeDarkSeparate, onThemeColor, onThemeColorClear) {
    return React.createElement(React.Fragment, null,
    // F1：分角色上色 —— 每个角色独立放开（不把四个角色压成同一个色而压平 DSH 的四级层次），
    // 留空 = 跟随原生。经 theme 令牌层生效：body 内联、免 !important、{light,dark} 随配色自动换值。
    React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
      ctlText(weT("文字颜色角色"), weT("未设置 = 用 DSH 默认色（色块显示当前值）")),
    ),
    switchRow(weT("深色单独设置"), sel.themeDarkSeparate, (e) => onThemeDarkSeparate(e.target.checked), {
      tooltip: weT("关闭时一个颜色同时用于浅色与深色两套（内部仍存两套值）；开启后浅色/深色分别设置"),
    }),
    THEME_COLOR_ROLES.map((role) => {
      const v = sel.themeColors[role.id] || { light: "", dark: "" };
      return React.createElement("div", { className: "we-picker__ctl", key: role.id },
        ctlText(role.label),
        React.createElement("label", { className: "we-picker__swatch-custom" },
          React.createElement("input", {
            type: "color",
            value: v.light || officialColorOf(role.tokens) || "#ffffff",
            onInput: (e) => onThemeColor(role.id, "light", e.target.value, sel.themeDarkSeparate),
            onChange: (e) => onThemeColor(role.id, "light", e.target.value, sel.themeDarkSeparate),
            title: weT("{role} · 浅色配色", { role: weT(role.label) }),
          }),
          React.createElement("span", { className: "we-picker__hint we-picker__value" },
            v.light ? weT("浅 {color}", { color: v.light }) : (officialColorOf(role.tokens) || weT("跟随"))),
        ),
        sel.themeDarkSeparate && React.createElement("label", { className: "we-picker__swatch-custom" },
          React.createElement("input", {
            type: "color",
            value: v.dark || officialColorOf(role.tokens) || "#000000",
            onInput: (e) => onThemeColor(role.id, "dark", e.target.value, true),
            onChange: (e) => onThemeColor(role.id, "dark", e.target.value, true),
            title: weT("{role} · 深色配色", { role: weT(role.label) }),
          }),
          React.createElement("span", { className: "we-picker__hint we-picker__value" },
            v.dark ? weT("深 {color}", { color: v.dark }) : (officialColorOf(role.tokens) || weT("跟随"))),
        ),
        (v.light || v.dark) && React.createElement("button", {
          type: "button",
          className: "we-picker__chip",
          onClick: () => onThemeColorClear(role.id),
          title: weT("清除该角色，回到原生层次"),
        }, weT("清除")),
      );
    }),
    );
  }

  // ── 排版角色（F2/G4）：字号 / 字重 / 字族表 ──
  function renderFontTypeRoles(sel, typeRoles, onThemeTypeOnly, onThemeSize, onThemeWeight, onThemeFamily) {
    return React.createElement(React.Fragment, null,
    // F2/G4：排版角色（**绝对字号**）。用户口径：字号用绝对值、默认值可见 ——
    // 未填时输入框显示 DSH 官方字号（角色表的 defaultPx），清空即回它。
    // 已确认接受的副作用：设过绝对值的角色不再随 DSH「通用 → 字号」缩放（未设的照旧跟随）；
    // 行高一律沿用 DSH 的令牌，不随绝对值缩放。我们始终**不写** --dsh-content-font-size（红线 3）。
    React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
      ctlText(weT("排版角色"), weT("字号 px；留空 = 不改（字号/字重显示 DSH 当前值，字族选「跟随」）")),
    ),
    switchRow(weT("只看改过的"), sel.themeTypeOnly, (e) => onThemeTypeOnly(e.target.checked), {
      tooltip: weT("只列出改过字号/字重/字族的角色，便于收尾核对"),
    }),
    // 表格化：表头放「字号 / 字重 / 字体」，一行一个角色 —— 三项在固定列上对齐，
    // 比每行重复三个无标签控件好扫读（颜色角色那张形状不同，仍用行式）。
    // 「只看改过的」**默认开** ⇒ 一行都没改过时表是空的：那种"空表"必须有话说，
    // 否则看着像坏了（这也是把默认值翻成开之后必须同时补的一件事）。
    typeRoles.length === 0
      ? React.createElement("div", { className: "we-picker__hint" },
        weT("没有改过的角色 —— 「只看改过的」正开着（共 {count} 个角色）。关掉它就能看到全部。", { count: THEME_TYPE_ROLES.length }))
      : null,
    React.createElement("table", { className: "we-picker__font-table" },
      React.createElement("thead", null,
        React.createElement("tr", null,
          React.createElement("th", null, weT("角色")),
          React.createElement("th", null, weT("字号")),
          React.createElement("th", null, weT("字重")),
          React.createElement("th", null, weT("字体")),
        ),
      ),
      React.createElement("tbody", null,
    typeRoles
      .map((role) => {
        const size = sel.themeSize[role.id];
        return React.createElement("tr", { key: role.id },
          React.createElement("td", null, ctlText(role.label)),
          React.createElement("td", null, React.createElement("input", {
            type: "number",
            value: size === undefined ? role.defaultPx : size,
            min: THEME_SIZE_MIN,
            max: THEME_SIZE_MAX,
            step: 1,
            style: { width: "46px" },
            onChange: (e) => onThemeSize(role.id, e.target.value),
            title: weT("{role}：字号 px（清空即回 DSH 默认 {px}px）", { role: weT(role.label), px: role.defaultPx }),
          })),
          React.createElement("td", null, React.createElement("input", {
            type: "number",
            value: sel.themeWeight[role.id] === undefined
              ? (role.prefix ? Number(role.prefix) : 400)
              : sel.themeWeight[role.id],
            min: 100,
            max: 900,
            step: 100,
            style: { width: "54px" },
            onChange: (e) => onThemeWeight(role.id, e.target.value),
            title: weT("{role}：字重 100–900（清空即回默认）", { role: weT(role.label) }),
          })),
          React.createElement("td", null, React.createElement("select", {
            value: sel.themeFamily[role.id] === undefined ? "" : sel.themeFamily[role.id],
            style: { width: "92px" },
            onChange: (e) => onThemeFamily(role.id, e.target.value),
            title: weT("{role}：字族（跟随 = 不覆盖，用 DSH 该角色的字族）", { role: weT(role.label) }),
          },
            React.createElement("option", { value: "" }, weT("跟随")),
            familyOptions(sel, { current: sel.themeFamily[role.id] || "" }),
          )),
        );
      }),
      ),
    ),
    );
  }

  // ── 组件字体（G3/G4，高级）：按组件细化表 ──
  function renderFontComponents(sel, onFontAdvanced, onComponentFont, onComponentFamily) {
    return React.createElement(React.Fragment, null,
    // G3/G4：组件字体 —— 属"高级"，收进本区内的「高级字体设置」子分支
    //（是"字体"的子分支，**不是**「高级」页签）。三条来自静态分析的纪律：
    //   ① 命中靠启动自探测（未命中的组件整条不生效，改名即降级、不误伤）；
    //   ② 代码块/终端的字体来自后代 `font:` 简写 ⇒ 只有官方 `--dsl-*` 钩子这条腿有效；
    //   ③ 不填 = 不生成规则（DSH 官方值）。
    switchRow(weT("高级字体设置"), sel.fontAdvanced, (e) => onFontAdvanced(e.target.checked), {
      tooltip: weT("按组件细化（模块前缀通道 + 官方 --dsl-* 钩子）：只对探测到的组件生效；不填即用 DSH 默认值"),
    }),
    sel.fontAdvanced && React.createElement(React.Fragment, null,
      React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        ctlText(weT("组件字体"), weT("未填时显示该组件当前的 DSH 默认值（— = 此刻不在页面上）；清空即回默认")),
      ),
      // 表格化：与「排版角色」表同构 —— 表头放「字号 / 字重 / 字体」，一行一个组件。
      React.createElement("table", { className: "we-picker__font-table" },
        React.createElement("thead", null,
          React.createElement("tr", null,
            React.createElement("th", null, weT("组件")),
            React.createElement("th", null, weT("字号")),
            React.createElement("th", null, weT("字重")),
            React.createElement("th", null, weT("字体")),
          ),
        ),
        React.createElement("tbody", null,
      COMPONENT_FONT_TARGETS.map((target) => {
        const c = sel.componentFonts[target.id] || {};
        // 未填时**直接显示 DSH 当前默认值**（启动自探测时顺带读回的 computed 值）。
        const d = (typeof componentFontDefaults === "function"
          ? componentFontDefaults()[target.id] : null) || {};
        const famKey = fontFamilyKeyOf(c.family);
        return React.createElement("tr", { key: target.id },
          React.createElement("td", null, ctlText(weT(target.label), weT("{group} · 走 {route}", { group: weT(target.group), route: target.route }))),
          React.createElement("td", null, React.createElement("input", {
            type: "number",
            value: c.size === undefined ? (d.size || "") : c.size,
            placeholder: d.size ? "" : "—",
            min: 6,
            max: 40,
            style: { width: "44px" },
            onChange: (e) => onComponentFont(target.id, "size", e.target.value),
            title: weT("{target}：字号 px（清空即回 DSH 默认{suffix}）", { target: weT(target.label), suffix: d.size ? " " + d.size + "px" : "" }),
          })),
          React.createElement("td", null, React.createElement("input", {
            type: "number",
            value: c.weight === undefined ? (d.weight || "") : c.weight,
            placeholder: d.weight ? "" : "—",
            min: 100,
            max: 900,
            step: 100,
            style: { width: "54px" },
            onChange: (e) => onComponentFont(target.id, "weight", e.target.value),
            title: weT("{target}：字重 100–900（清空即回 DSH 默认{suffix}）", { target: weT(target.label), suffix: d.weight ? " " + d.weight : "" }),
          })),
          React.createElement("td", null, React.createElement("select", {
            value: famKey,
            style: { width: "96px" },
            onChange: (e) => onComponentFamily(target.id, e.target.value),
            title: weT("{target}：字体族（跟随 = 不覆盖，用 DSH 默认）", { target: weT(target.label) }),
          },
            React.createElement("option", { value: "" }, weT("跟随")),
            familyOptions(sel, { current: famKey }),
          )),
        );
      }),
        ),
      ),
    ),
    );
  }

  // ── 字体集预设：总开关 + 编辑器 ──
  function renderFontSet(fontSet) {
    return React.createElement(React.Fragment, null,
    // 字重**没有全局值**（一个全局值会把 DSH 的粗细层次压成一档）：按角色（下面「排版角色」
    // 每行一个输入框）与按组件（「高级字体设置」里每组件一项）细化，都能填任意值；
    // 留空 /「恢复默认」即回 DSH 官方字重。
    // 字族同样无全局值：按角色（「排版角色」每行的字族下拉）与按组件（「高级字体设置」里每项
    // 的下拉）设置 —— 全局字族只经 body 继承，既压平 DSH 的字体栈层次，又够不到用 `font:` 简写的标题/表格/代码。
    // ── 字体集（**「字体自定义」的附属**）：总开关管"要不要自定义"，这里管"用哪一整套"。
    //    放在 `sel.fontCustom` 这一支**里面** —— 关掉自定义就整块收起（那时这一整套并不
    //    生效，摆出来只会让人以为它在起作用）。
    switchRow(weT("字体集预设"), fontSet.open, (e) => fontSet.onOpen(e.target.checked), {
      tooltip: weT("预设 = 一整套字体外观；改动只落到当前这一套，随时可以恢复原样"),
    }),
    fontSet.open && renderFontSetEditor(fontSet),
    );
  }

  function renderAppearanceFontSection(ctx) {
    const { officialColorOf, onComponentFamily, onComponentFont, onFontAdvanced, onFontResetAll, onGlobalFamily, onRefreshSystemFonts, onResetModule, onThemeColor, onThemeColorClear, onThemeDarkSeparate, onThemeFamily, onThemeSize, onThemeTypeOnly, onThemeWeight, onToggleFontCustom, fontOpen, onToggleFontSection, fontSet, sel } = ctx;
    // 「排版角色」表要按「只看改过的」筛，而**筛完是空**时要单独给一行提示 ⇒ 先算出来再渲染表。
    // ⚠️ 必须在 `React.createElement(...)` **之前**算（写成参数位置上的赋值表达式 ——
    //    赋值表达式的值是那个**数组本身**，于是它被当成一个子节点 ⇒ React #31「对象不能作为子节点」；
    //    空数组时看不出来，一旦有筛出来的角色就整块面板崩掉）。
    const typeRoles = THEME_TYPE_ROLES.filter((role) => !sel.themeTypeOnly
      || sel.themeSize[role.id] !== undefined
      || sel.themeWeight[role.id] !== undefined
      || sel.themeFamily[role.id] !== undefined);
    // ── 折叠态：整节一个开关（`fontOpen`，**默认收起** —— 调节项太多，默认全开太杂乱）。
    //    开合状态住 localStorage，渲染器只经 ctx 读它 + 调 onToggleFontSection，保持纯读契约。
    //    ⚠️ 两档各有自己的键（侧栏 `qp-font-open` / 设置页 `picker-font-open`）—— 与
    //    `qp-tab` / `picker-tab` 同一条"每档各自的 UI 状态"口径；两档默认值都是收起。
    const open = fontOpen === true;
    return React.createElement(React.Fragment, null,
    // ── 字体 (custom typography)：总开关（关 = 恢复 dsh 原生字体）+ 颜色角色 / 排版角色 /
    //    字体族 / 组件字体（高级），开启时才渲染细节控件。字重不设全局值：按角色与按组件细化。
    //    ⚠️ 分档（ADR-0008 D4 **三次修订**，2026-10-11 用户口径）：这一节**两档都画**
    //    （侧栏 + 设置页），无 surface 门。二次修订曾把它单向迁进侧栏，随后用户在设置页
    //    找不到该节、报"字体自定义被干掉了" ⇒ 用户口径"两边都有"。两档都**默认收起**
    //    （节头点击展开），开合状态各记各的键。──
    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", {
        className: "we-picker__section-head we-picker__section-head--toggle",
        role: "button",
        tabIndex: 0,
        "aria-expanded": open ? "true" : "false",
        onClick: () => onToggleFontSection && onToggleFontSection(),
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (onToggleFontSection) onToggleFontSection();
          }
        },
      },
        React.createElement("span", { className: "we-picker__section-label" }, weT("全局字体")),
        moduleResetButton("font", onResetModule),
        React.createElement("span", {
          className: "we-picker__section-caret" + (open ? " is-open" : ""),
          "aria-hidden": "true",
        }, "▾"),
      ),
      open && switchRow(weT("字体自定义"), sel.fontCustom, (e) => onToggleFontCustom(e.target.checked), {
        tooltip: weT("关闭后恢复 dsh 默认字体外观；开启后可调颜色角色、排版角色（字号/字重/字族）与组件字体"),
      }),
      // 「恢复默认」只在总开关开启时出现：关闭时字体本就是 DSH 默认值，摆一个"恢复默认"
      // 没有意义（也会让人以为关掉开关还残留了什么自定义）。
      open && sel.fontCustom && React.createElement("div", { className: "we-picker__ctl" },
        React.createElement("button", {
          type: "button",
          className: "we-picker__chip",
          onClick: onFontResetAll,
          title: weT("清空所有字体自定义项（颜色角色 / 排版 / 字重 / 字族 / 组件字体），回到 DSH 默认"),
        }, weT("恢复默认")),
      ),
      open && sel.fontCustom && React.createElement(React.Fragment, null,
        renderFontGlobalFamily(sel, onGlobalFamily, onComponentFamily, onRefreshSystemFonts),
        renderFontColorRoles(sel, officialColorOf, onThemeDarkSeparate, onThemeColor, onThemeColorClear),
        renderFontTypeRoles(sel, typeRoles, onThemeTypeOnly, onThemeSize, onThemeWeight, onThemeFamily),
        renderFontComponents(sel, onFontAdvanced, onComponentFont, onComponentFamily),
        renderFontSet(fontSet),
      ),
    ),
    );
  }

  // ── 「侧边栏圆角」节（外观页签）：左右两条侧栏各自一套 —— 统一档 + 四角单独直角 ──
  // 统一档写 border-radius 简写，四角开关写 border-*-radius 长属性覆盖它（CSS 见 styles.js
  // 同名块，顺序即语义）；真源 lib/settings-schema.js 的 leftSidebarCornerRadius /
  // rightSidebarCornerRadius 与两族 Square* 键。
  // ⚠️ 宿主原生左栏与右栏面板**都不带圆角** ⇒「圆角」要靠统一档选 6 / 12 / 20px 才看得见，
  //    「直角」是把某一角按回 0 的覆盖档；默认「跟随原生」= 一个属性都不挂（逐字节现状）。
  // 四角按几何排（左上 / 右上 / 右下 / 左下），与用户看到的形状同构。
  function sidebarCornerGroup(side, sideLabel, sel, onSidebarCornerRadius, onSidebarCornerSquare, onSidebarAllCorners) {
    const radiusLabels = { native: weT("跟随原生"), 6: weT("小 6px"), 12: weT("中 12px"), 20: weT("大 20px") };
    const corners = [["tl", weT("左上")], ["tr", weT("右上")], ["br", weT("右下")], ["bl", weT("左下")]];
    const radiusKey = side + "SidebarCornerRadius";
    const isSquare = (c) => sel[side + "SidebarSquare" + c.toUpperCase()] === true;
    return React.createElement(React.Fragment, null,
      React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        ctlText(weT("{side} · 统一圆角", { side: sideLabel }), weT("四角都按这个值；单独标「直角」的角覆盖它")),
        React.createElement("div", { className: "we-picker__seg" },
          SIDEBAR_CORNER_RADIUS_VALUES.map((v) =>
            React.createElement("button", {
              key: v,
              className: "we-picker__btn we-picker__rate" + (sel[radiusKey] === v ? " we-picker__rate--active" : ""),
              type: "button",
              onClick: () => onSidebarCornerRadius(side, v),
              "aria-pressed": sel[radiusKey] === v ? "true" : "false",
              "aria-label": weT("{side}统一圆角 {value}", { side: sideLabel, value: radiusLabels[v] }),
            }, radiusLabels[v]),
          ),
        ),
      ),
      React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        ctlText(weT("{side} · 四角单独", { side: sideLabel }), weT("点一下就切换：圆角（用统一值）/ 直角（0px）")),
        React.createElement("div", { className: "we-picker__seg" },
          corners.map(([c, cornerLabel]) =>
            React.createElement("button", {
              key: c,
              className: "we-picker__btn we-picker__rate" + (isSquare(c) ? " we-picker__rate--active" : ""),
              type: "button",
              onClick: () => onSidebarCornerSquare(side, c, !isSquare(c)),
              "aria-pressed": isSquare(c) ? "true" : "false",
              "aria-label": weT("{side}{corner}：{state}", { side: sideLabel, corner: cornerLabel, state: weT(isSquare(c) ? "直角" : "圆角") }),
            }, weT("{corner}角 {state}", { corner: cornerLabel, state: weT(isSquare(c) ? "直角" : "圆角") })),
          ),
        ),
      ),
      React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        React.createElement("div", { className: "we-picker__seg" },
          React.createElement("button", { className: "we-picker__btn", type: "button", onClick: () => onSidebarAllCorners(side, true) }, weT("四角全直角")),
          React.createElement("button", { className: "we-picker__btn", type: "button", onClick: () => onSidebarAllCorners(side, false) }, weT("四角全圆角")),
        ),
      ),
    );
  }

  function renderAppearanceSidebarCornersSection(ctx) {
    const { onResetModule, onSidebarAllCorners, onSidebarCornerRadius, onSidebarCornerSquare, sel, cornersOpen, onToggleCornersSection } = ctx;
    // ⚠️ 折叠门同「细节」节（2026-10-11 二次修订）：两档都支持隐藏，差别只在默认值。
    const open = cornersOpen === true;
    return React.createElement(React.Fragment, null,
      React.createElement("div", { className: "we-picker__section" },
        sectionHead(weT("侧边栏圆角"), open, onToggleCornersSection, moduleResetButton("corners", onResetModule)),
        open && sidebarCornerGroup("left", weT("左侧栏"), sel, onSidebarCornerRadius, onSidebarCornerSquare, onSidebarAllCorners),
        open && sidebarCornerGroup("right", weT("右侧栏"), sel, onSidebarCornerRadius, onSidebarCornerSquare, onSidebarAllCorners),
      ),
    );
  }

  // ── 「全局 UI 配色」节（2026-10-11 用户口径）：配色成为独立大项 + 五处"蓝色元素"可单独调 ──
  //    结构按用户原话：「做成 <全局 UI 配色> 下挂 <全局配色> 和 <UI 配色自定义>」——
  //      · **全局配色**（accent，原住「主题」节）＝ "用于直接调整全部"；
  //      · **UI 配色自定义**（开关，**默认关**，与 fontCustom 同形）＝ 开启后下面五项各自可调，
  //        此时「全局配色」整行**禁用**（用户口径：「开启后<全局配色>禁用，采用<UI配色自定义>」）。
  //    ⚠️ 五项的空值语义 = **跟随「全局配色」**（effects.js 里 `selection[k] || accent`）⇒
  //       开启那一刻观感零变化，随后逐项微调；不是"清空成宿主原生"。
  //    ⚠️ 折叠门与字体节同形（`uiColorOpen`，默认收起，两档各记各的 localStorage 键）。
  //    令牌与宿主消费者的实证见 `src/styles.js` 的同名段与 `lib/settings-schema.js` 的 DEFAULTS 注释。
  function renderAppearanceUiColorSection(ctx) {
    const { onAccent, onCaretColor, onResetModule, onToggleUiColorCustom, onUiColorElement, sel, uiColorOpen, onToggleUiColorSection } = ctx;
    const open = uiColorOpen === true;
    const custom = sel.uiColorCustom === true;
    // 五个元素行：id 与 settings 键一一对应；文案与 tooltip 写明它**具体是哪一处** ——
    // 用户是按截图点名的，标签必须让他能对上号（"发送键"而不是"主按钮"）。
    const rows = [
      { key: "uiColorSend", label: weT("发送键"), hint: weT("输入框右侧那个圆形箭头按钮（它的箭头固定白色，建议选中间调）") },
      { key: "uiColorLink", label: weT("链接文字"), hint: weT("会话与面板里的链接、强调文字") },
      { key: "uiColorFileIcon", label: weT("文件图标"), hint: weT("交付物卡片里 `</>` 那个文件图标（与链接共用令牌，这里单独覆盖）") },
      { key: "uiColorTab", label: weT("页签 / 焦点环"), hint: weT("会话的「对话 / 轨迹」页签与下划线；焦点环与状态点同源，一并跟色") },
      { key: "uiColorDeepDiving", label: weT("深度求索状态"), hint: weT("「深度求索中，用时 …」那行文字与它的微光") }
    ];
    // 「跟随配色」按钮：清空该项 ⇒ 回到 accent（与光标那行的「自动」同形）。
    const followSwatch = (key) => React.createElement("button", {
      key: "follow",
      className: "we-picker__swatch we-picker__swatch--auto" + (sel[key] === "" ? " we-picker__swatch--active" : ""),
      type: "button",
      title: weT("跟随「全局配色」"),
      onClick: () => onUiColorElement(key, ""),
      "aria-label": weT("跟随全局配色"),
    }, weT("跟随"));
    return React.createElement(React.Fragment, null,
    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", {
        className: "we-picker__section-head we-picker__section-head--toggle",
        role: "button",
        tabIndex: 0,
        "aria-expanded": open ? "true" : "false",
        onClick: () => onToggleUiColorSection && onToggleUiColorSection(),
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (onToggleUiColorSection) onToggleUiColorSection();
          }
        },
      },
        React.createElement("span", { className: "we-picker__section-label" }, weT("全局 UI 配色")),
        moduleResetButton("uiColor", onResetModule),
        React.createElement("span", {
          className: "we-picker__section-caret" + (open ? " is-open" : ""),
          "aria-hidden": "true",
        }, "▾"),
      ),
      open && React.createElement(React.Fragment, null,
        // ① 全局配色：直接调全部。开自定义后**禁用**（不是隐藏）—— 让它可见但明示"此刻不由它说了算"。
        React.createElement("div", { key: "global-accent", className: custom ? "we-picker__ctl we-picker__ctl--disabled" : "" },
          swatchRow(weT("全局配色"), ACCENT_PRESETS, sel.accent, custom ? () => {} : onAccent, {
            key: "accent",
            hint: custom
              ? weT("已开启「UI 配色自定义」—— 此刻由下面五项分别决定，本行暂不生效")
              : weT("一处调全部：界面强调色、按钮、选中态与下面那几处都会跟着变"),
            tooltip: custom
              ? weT("关闭「UI 配色自定义」后本行重新生效")
              : weT("调它等于一次性改全部；想给某几处单独指定颜色，打开下面的「UI 配色自定义」"),
          }),
        ),
        // ② UI 配色自定义：总开关。
        switchRow(weT("UI 配色自定义"), custom, (e) => onToggleUiColorCustom(e.target.checked), {
          key: "ui-color-custom",
          tooltip: weT("开启后「全局配色」不再生效，改由下面五项分别决定；每一项留「跟随」即回到全局配色"),
        }),
        custom && React.createElement(React.Fragment, null,
          ...rows.map((r) => swatchRow(weT(r.label), ACCENT_PRESETS, sel[r.key], (hex, live) => onUiColorElement(r.key, hex, live), {
            key: r.key,
            hint: weT(r.hint),
            auto: followSwatch(r.key),
            colorValue: sel[r.key] || sel.accent || "#4f8cff",
          })),
        ),
        // ③ 光标颜色：**原「输入光标」节唯一的一行，整节撤销后并入本节**（用户口径：
        //    「输入光标这一栏目取消 …… 光标颜色 …… 并入里面可以调单独设置」）。
        //    ⚠️ 它**不在** `custom` 门里：这一项从来是可用的可读性设置（#83），
        //       藏到总开关后面就是能力回退。也不吃 accent —— 它的空值语义是
        //       **跟随 dsh 原生光标色**（不注入任何规则），与上面五项"空 = 跟随全局配色"不同。
        swatchRow(weT("光标颜色"), CARET_COLOR_PRESETS, sel.caretColor, onCaretColor, {
          key: "caret-color",
          hint: weT("输入框光标看不清时换个颜色（与上面的总开关无关，始终可调）"),
          auto: React.createElement("button", {
            key: "auto",
            className: "we-picker__swatch we-picker__swatch--auto" + (sel.caretColor === "" ? " we-picker__swatch--active" : ""),
            type: "button",
            title: weT("跟随 dsh 原生光标颜色"),
            onClick: () => onCaretColor(""),
            "aria-label": weT("光标颜色 自动"),
          }, weT("自动")),
          colorValue: sel.caretColor || "#4f8cff",
        }),
      ),
    ),
    );
  }

  // ── 「玻璃 UI」节：所有玻璃配置（含「左侧栏液态玻璃」及其子项）同处一节。渲染器在
  //    `src/glass-panel.js` 的 renderAppearanceGlassSection（门槛一个都没放松）—— 它与其余页签
  //    只共享模块级纯助手 ⇒ 不需要 ctx 样板，这里按名字调用即可。

  // 这一层只**按顺序组装**各节（"有哪几节、什么顺序"一眼可读；
  // 判据按真渲染的节序列钉住，见 verify-scene-live 的节顺序一节）。
  // ⚠️ 这个顺序是**两个界面共用的**（侧边栏的 `qpRenderAppearancePane` 调的也是本函数）
  //    ⇒ 改这里等于同时改设置页与侧边栏 —— 这正是用户口径要的"两边同序"。
  // 模块级 ↺ 的**薄包装**（issue #192）：真实现住在 `src/module-reset.js`（panel-tabs 与
  // glass-panel 共用，抽出来才能让挂载台 import 真实现）。这里只把"取词 + 处理器"两样外界
  // 喂给它 —— 中文因此留在本文件的 `weT(...)` 里（i18n 扫描器认这个形态；写进被调模块会
  // 被判成"裸中文"），各节调用点则保持 `moduleResetButton("模块名", onResetModule)` 这么短。
  function moduleResetButton(moduleName, onResetModule) {
    return moduleResetButtonNode(moduleName, onResetModule, {
      title: weT("把这一块的参数恢复为默认值（不需要确认）"),
      aria: weT("重置本模块"),
    });
  }

  // 用户口径（2026-10-11）：主题 → 细节 → 玻璃 UI → 侧边栏圆角 → 全局 UI 配色 → 全局字体。
  // 与上一版的差别只有一处：**「玻璃 UI」与「侧边栏圆角」对调**（前者上移到细节之后）。
  function renderAppearanceTab(ctx) {
    const { } = ctx;
    return React.createElement(React.Fragment, null,
      renderAppearanceThemeSection(ctx),
      renderAppearanceDetailSection(ctx),
      renderAppearanceGlassSection(ctx),
      renderAppearanceSidebarCornersSection(ctx),
      // 「全局 UI 配色」在「全局字体」**上面**（用户口径：「变成全局UI配色放在全局字体上面」）；
      // 原「输入光标」节已撤销，其唯一一行（光标颜色）并入本节（见该渲染器的 ③）。
      renderAppearanceUiColorSection(ctx),
      renderAppearanceFontSection(ctx),
    );
  }


  function renderAudioTab(ctx) {
    const { onToggleAudio, onVideoVolume, sel } = ctx;
    // 声音：壁纸音轨（视频 / 场景内嵌 MP4 / 场景包内音频共用一套设置）。
    // 系统音频反应 / 媒体信息 / 在线歌词三键**恒为常开**（schema kind 'const'）：
    // 面板不提供页面定义，运行时两侧一律按默认接入读值。
    return React.createElement(React.Fragment, null,
      React.createElement("div", { className: "we-picker__section" },
        React.createElement("div", { className: "we-picker__section-head" },
          React.createElement("span", { className: "we-picker__section-label" }, weT("声音")),
        ),
        SliderRow(weT("音量"), 0, 100, 5,
          Math.round((Number(sel.videoVolume) || 0) * 100), onVideoVolume,
          Math.round((Number(sel.videoVolume) || 0) * 100) + "%"),
        switchRow(weT("壁纸音轨"), sel.videoAudioEnabled !== false, () => onToggleAudio(), {
          hint: weT("关闭=静音（保留音量数值）· 开启时音量 0 自动 50%"),
          tooltip: weT("视频壁纸与场景壁纸（内嵌 MP4 音轨 / 包内独立音频）共用；默认静音，开启时若音量为 0 会自动提到 50%"),
        }),
      ),
    );
  }


  // ── 吉祥物形态：**3D 圆环转盘**（2026-10-11 **四次返工**；形态取自用户给的 `28-3d.html`）──
  // 前三版各自的形态与缺陷（经过都记在 docs/CHANGELOG.md，这里只留结论）：
  //   ① 卡片一排 —— 平铺，不像转盘；
  //   ② 铺满舞台的绝对定位层 + 行内百分比位移 —— 中心层的**按钮盒**（立绘 64 + padding 16 = 80）
  //      压住相邻项约 12px ⇒ 每个侧项一条点不到的死带；且"自定义生效时把内置项与 ‹ › 全禁用"
  //      ⇒ 用户实测「**按钮都没办法点**」；
  //   ③ 流式轨道（定宽项 + 整轨位移）—— 有界滚动，选中**末项**时右半屏整片空着（用户截图）；
  //   ④ 现在：**真 3D 圆环** —— 每张卡 `rotateY(i·步进) translateZ(半径)`，整环 `rotateY(−逻辑索引·步进)`。
  //      前三类缺陷在结构上都不存在了：环是闭合的（任一档左右都有邻居）、前后由**真实 z** 决定
  //      （不靠层叠 + z-index 猜）、背面由 `backface-visibility: hidden` **整张剔除**
  //      （|φ| > 90° 的卡是环的后半圈，不剔会透到中间、看着很乱）。
  // ⚠️ **半径是解出来的、系数是量出来的**（verify-client 的环形几何判据会独立复算一遍）：
  //      相切半径 = (卡宽/2)/tan(π/n)（相邻两卡正好相切）⇒ 乘系数 = 留出间距。
  //      系数 **1.15** 的实测依据：1.00 时相邻卡的**可点盒相切重叠** ⇒ 前卡抢走邻卡的点击
  //      （就是 ② 那类"看着能点、点了却是别人"）；1.28 时侧栏里 ±2 档可见度掉到 **0.00**
  //      ⇒ 只剩 3 张、没有纵深。1.15：前排占舞台 **31%**、±1 邻卡 **100% 完整可见**、
  //      邻卡**零抢点**、±2 档仍露 46% 提供纵深。
  // ⚠️ **可点盒宽 = 立绘显示宽（64），不留透明内边距**：留了的话那圈透明边会盖在邻卡上
  //      抢走它的点击 —— ②的死带正是这么来的。这条由判据钉住。
  // ⚠️ 舞台有 `max-width`（340）：环是固定尺寸的（立绘宽固定 64），不封顶的话在宽面板里
  //      会变成正中间一小撮、四周全是空。
  const MASCOT_BOX_PX = 64;         // 卡宽 = 立绘显示宽（两者必须相等，理由见上）
  const MASCOT_RING_FACTOR = 1.15;  // 半径系数（1.0 = 相邻立绘正好相切）
  const MASCOT_PERSP_PX = 820;      // 透视 = 舞台上限 340 × 2.4（参考实现的公式）取整
  // ── 按**面板实测宽度**等比缩放（2026-10-11 用户口径：「这个左右也可以拉宽一点，顶格就行」）──
  // ⚠️ 为什么只能**等比**缩放：卡宽与半径锁在同一比例（半径 = (卡宽/2)/tan(π/n)×系数）——
  //    只放大卡宽会让相邻卡的可点盒重叠 ⇒ 前卡抢走邻卡的点击（历次缺陷的共同形态）；
  //    只放大半径会让卡片散成"天女散花"。所以两者必须同乘一个 scale。
  // ⚠️ 等比缩放要**连透视 P 一起乘**：放大率 k = P/(P−R)，P 与 R 同乘时 k 不变 ⇒
  //    投影出来的排布与设计档**逐点相似**，"邻卡不重叠"这条性质在任意 scale 下自动成立
  //    （不必重新解不等式 —— 这正是判据能简单地对任意 scale 复算的原因）。
  // ⚠️ scale 的**上限由高度预算**定：等比放大同时变高（窗口高 ∝ scale）。面板宽到一定程度后
  //    再放大只会得到一个巨大的控件，所以到顶就停。两个数都写在这儿，改之前先读下面的算式。
  /** s = 1 的设计宽度（按侧栏那一档标定：面板内容宽 328 时环正好铺满）。 */
  const MASCOT_DESIGN_PANE_PX = 328;
  /**
   * s 的上限。**它其实是一条高度预算**，换算关系（改之前先算一遍）：
   *   窗口高 = (最高立绘 96 × s + 排版余量 36) × 前排放大率 1.2006 + 12
   *   ⇒ s = 2.1 时窗口高 ≈ **298px**（实测：卡宽 134、半径 288、透视 1722）。
   * ⚠️ 为什么必须有上限：等比放大**同时变高**。而 **12 项环最多可见 5 张**
   *    （|φ| ≥ 90° 被背面剔除，与半径无关）⇒ "要填满 900px 面板"得把 s 提到 ≈3.2，
   *    即卡宽 203px、**窗口高 504px** —— 那不是"拉宽"，是换一个占掉大半屏的巨大控件。
   *    想更宽/更窄就调这个数；上面那行式子就是它的换算依据（判据按同一算式复算）。
   */
  const MASCOT_SCALE_MAX = 2.1;
  // ── 卡高**不写死**：由「最高的那只立绘」推出来（在渲染器里算，见下）─────────────────
  // ⚠️ 写死过 120，而最高的立绘是Deepseek_Pro的 **96px** —— 96 + padding 12 + gap 4 + 名字行 ≈13
  //    = **125 > 120**，卡内内容本身就溢出 4px（名字行被挤出卡片）。这是用户实测
  //    「上下有截断」的**第二个**来源（第一个是 3D 透视把卡片整体放大，见下）。
  //    改成"从立绘推"之后，以后加一只更高的立绘，卡高会自动跟着长。
  /** 卡内排版余量：上下 padding(6+6) + 立绘与名字之间的 gap(4) + 名字行(≈13) + 呼吸(7)。 */
  const MASCOT_CARD_PAD_PX = 36;
  /** "点"与"拖"的分界（px）。低于它算点击 —— 否则手抖 1px 就被当成拖动。 */
  const MASCOT_DRAG_SLOP_PX = 6;
  /** 抛掷投影时长（s）：落点 = 当前位置 + 速度 × 这个值。参考实现同值。 */
  const MASCOT_FLING_S = 0.32;
  /** 取样陈旧阈值（ms）：松手前超过这么久没有新样本 ⇒ 手指早已停 ⇒ 速度按 0 算。 */
  const MASCOT_FLING_STALE_MS = 70;
  // 拖动的**瞬时**状态：只活在"按下 → 抬起"之间，不进 settings、不进 localStorage。
  // ⚠️ `mascotDragMoved` 必须是**模块级**：指针抬起后 `onRopeFormChange` 会触发重渲染，
  //    闭包里的标志会被换成新的一份，而 `click` 是**之后**才到的 —— 放闭包里等于没生效
  //    （症状就是"拖一下换了两只"）。
  let mascotDrag = null;
  let mascotDragMoved = false;
  // **环的视图索引**（模块级，同属"视图状态"）：当前居中的逻辑索引。
  // ⚠️ 它必须与 `sel.ropeForm` 一致（不变量：中心 = 当前生效的形态）；不一致时以 settings 为准
  //    对齐（见渲染器里的 `alignedLogical`）——预设应用 / 外部改动会碰到这种情况。
  // ⚠️ 它**可以超出 [0, n)**：真值域是"整数槽位"，靠它才能**走近路**（从第 0 档往左一格到第
  //    n−1 档，而不是倒着转 n−1 格）。渲染器**只读不写**（panel-tabs 的契约 ④：渲染期不得改写
  //    模块级状态），写只发生在处理器里。
  let mascotRingLogical = 0;

  function renderMascotFormCards(sel, previewArt, previewW, previewH, onRopeFormChange, onMascotPick, onMascotClear, onMascotFormConfirm, onDisarmConfirm, paneWidth) {
    const customArt = previewArt.custom;
    const forms = ROPE_FORM_VALUES.map((k) => ({ id: k, kind: "builtin", form: ROPE_FORMS[k] }));
    // 自定义那一项排在最后（用户口径：导入后显示在最后）。
    const items = forms.concat([{ id: "custom", kind: "custom" }]);
    const builtinIdx = forms.findIndex((f) => f.id === sel.ropeForm);
    // **不变量：中心 = 当前生效的那一个**（中心若不是选中项，用户一眼看不出现在用的是哪个）。
    const activeIdx = customArt ? items.length - 1 : (builtinIdx >= 0 ? builtinIdx : 0);
    // ── scale：按**面板实测宽度**等比缩放（量不到 ⇒ 1，与设计档逐字相同）────────────────
    // `paneWidth` 由两端的面板组件量好经 ctx 传进来（渲染器是纯函数、拿不到宽度）；
    // 量不到（0 / undefined / 非数）时退回 1 —— **安全兜底**：宁可小，也不能把控件画坏。
    const paneW = Number(paneWidth) > 0 ? Number(paneWidth) : 0;
    const SCALE = paneW > 0
      ? Math.round(Math.min(MASCOT_SCALE_MAX, Math.max(1, paneW / MASCOT_DESIGN_PANE_PX)) * 100) / 100
      : 1;
    /** 设计档尺寸 × scale，取整（判据按同一算式复算，见 verify-client）。 */
    const at = (v) => Math.round(v * SCALE);

    // ── 环的几何（全部**由项数与卡宽推出**，没有魔法数）──────────────────────────────
    const n = items.length;
    const STEP_DEG = 360 / n;                       // 相邻两卡的角度间隔（环闭合 ⇒ 整除 360）
    const BOX_S = at(MASCOT_BOX_PX);                // 卡宽（= 立绘显示宽，两者必须相等）
    const PERSP_S = at(MASCOT_PERSP_PX);            // 透视（必须与半径同乘，见上）
    const RADIUS_PX = at((MASCOT_BOX_PX / 2) / Math.tan(Math.PI / n) * MASCOT_RING_FACTOR);
    /** 真模：JS 的 `%` 对负数返回负值，`((x % n) + n) % n` 才是数学模。 */
    const norm = (v) => ((v % n) + n) % n;
    /** 从 from 到 to 的**最短有符号步数**（∈ [−n/2, n/2]）—— "走近路"就靠它。 */
    const shortest = (from, to) => {
      const d = ((to - from) % n + n) % n;
      return d > n / 2 ? d - n : d;
    };
    // 拖拽灵敏度：**拖过一个「相邻卡在屏幕上的间距」= 换一档**（1:1 跟手，且有据可依）。
    // 相邻卡中心的屏幕间距 = R·sin(步进) × 它所在 z 处的透视缩放。
    const RAD_STEP = (STEP_DEG * Math.PI) / 180;
    const ADJACENT_PX = RADIUS_PX * Math.sin(RAD_STEP)
      * (PERSP_S / (PERSP_S - RADIUS_PX * Math.cos(RAD_STEP)));
    const DEG_PER_PX = STEP_DEG / ADJACENT_PX;
    const DRAG_LIMIT_PX = n * ADJACENT_PX;          // 一次拖动最多转一整圈
    // ── 环的**水平外沿**：取所有"朝向观众那一侧"卡片里最靠外的那个边（四角投影算）──────
    // 用途是给窗口一个 `max-width`：窗口**贴住环**（而不是写死 340 或铺满整行）——
    // 铺满整行会在环两侧留下大片空白（用户看到的"中间一小坨"就是这么来的）。
    const RING_EXTENT_PX = (() => {
      const half = Math.floor((n - 1) / 2);          // |d| ≤ half；|φ| ≥ 90° 的已被背面剔除
      let ext = 0;
      for (let d = 0; d <= half; d++) {
        const phi = ((d * STEP_DEG) * Math.PI) / 180;
        if (Math.abs(phi) >= Math.PI / 2) break;
        const cx = RADIUS_PX * Math.sin(phi), cz = RADIUS_PX * Math.cos(phi);
        const ux = Math.cos(phi), uz = -Math.sin(phi);
        for (const sx of [-1, 1]) {
          const x = cx + sx * (BOX_S / 2) * ux;
          const z = cz + sx * (BOX_S / 2) * uz;
          ext = Math.max(ext, Math.abs(x * (PERSP_S / (PERSP_S - z))));
        }
      }
      return Math.ceil(ext);
    })();
    // ── 卡高与窗口高**算出来**（2026-10-11 用户实测「上下有截断」）────────────────────
    // 两笔账，缺一笔就会切掉东西：
    //   ① **卡内**：卡高必须容得下最高的那只立绘 + padding + gap + 名字行（都随 scale 放大）。
    //   ② **卡外**：3D 透视会把卡片**整体**放大，前排放大率 k = P/(P−R) ⇒ 窗口必须按
    //      `ceil(卡高 × k) + 上下各 6px` 来给，否则立绘头顶与名字底部被切。
    const TALLEST_ART_PX = Math.max(...items.filter((it) => it.kind === "builtin").map((it) => it.form.h));
    const CARD_H_PX = at(TALLEST_ART_PX) + MASCOT_CARD_PAD_PX;
    const FRONT_ZOOM = PERSP_S / (PERSP_S - RADIUS_PX);
    const WINDOW_H_PX = Math.ceil(CARD_H_PX * FRONT_ZOOM) + 12;

    // ── 与 settings 对齐的**逻辑索引**（只读；写只发生在处理器里，见文件上方说明）────────
    // 不一致 ⇒ 以 `activeIdx`（= 当前生效的形态）为准：**不变量优先于"走近路"**。
    const alignedLogical = norm(mascotRingLogical) === activeIdx ? mascotRingLogical : activeIdx;
    /** 第 i 张卡相对**前排**的最短偏移（槽位，∈ [−n/2, n/2]）：决定它的透明度。 */
    const slotOffsetOf = (i) => shortest(alignedLogical, i);
    /** 越靠后越淡（|偏移| ≥ 3 的卡已被 backface-visibility 整张剔掉，这里的值用不上）。 */
    const opacityOf = (off) => {
      const a = Math.abs(off);
      return a === 0 ? 1 : Math.max(0.45, 0.88 - (a - 1) * 0.22);
    };

    // ── 跳到某一张 ──────────────────────────────────────────────────────────────
    /** 把环转到第 i 张（**走近路**：取离当前位置最近的等价角度，不倒着转大半圈）。 */
    const focusCard = (i) => {
      const target = alignedLogical + shortest(norm(alignedLogical), i);
      mascotRingLogical = target;
      onRopeFormChange(items[norm(target)].id);
    };
    /**
     * 点卡片 / 点圆点 / 按 ‹ › 的**统一入口**。
     * ⚠️ 「自定义立绘」是**动作**（选文件）而不是"一种形态" ⇒ 它不是落点：
     *    点它 = 导入；拖动碰上它要顺着同方向再走一格（见 dragEnd）。这两条合起来保证
     *    拖动**永远不会弹出文件选择框** —— 那会是纯粹的惊吓。
     */
    const activate = (i) => {
      if (items[i].kind !== "builtin") { onMascotPick(); return; }
      focusCard(i);
    };
    // ‹ › / ← → / Home / End：只在**内置形态**之间循环（自定义那一项是"选文件"这个动作）。
    // ⚠️ 导航**永不禁用**（用户口径：按钮要可点击）—— 自定义生效时按它走的是"改用内置形态"
    //    那条带确认的路（client.js 的 onRopeFormChange 收口），不是"点了没反应"。
    const cycle = (delta) => {
      const fn = forms.length;
      const cur = builtinIdx >= 0 ? builtinIdx : 0;
      activate((cur + delta + fn) % fn);
    };
    // ── 拖动 + 抛掷（环上的实现；物理口径沿用前几版，逐条都写了理由）───────────────────
    //   · 按下记基准；移动**直接写 DOM**（不 emit —— 每帧 setState + 整棵面板重渲染太贵，
    //     而这只是视图旋转）；抬起按**速度投影**吸附到最近的卡位。
    //   · ⚠️ 拖动期必须**关掉过渡**（环加 `is-dragging`）：否则每帧写 transform 都会被
    //     220ms 的过渡"追"一次，手感从跟手变成拖橡皮筋。
    //   · 抛掷时长 0.32s、"只留最近 100ms 取样"、"样本陈旧 70ms 即视为速度 0"都取自参考实现：
    //     手指停住再松手时速度必须是 0，否则"停一会儿再放"会莫名多转一格。
    //   · 吸附用 `Math.round(-rotation / 步进)`（参考实现同式）。环上**没有端点**，
    //     所以没有阻尼回弹那一套 —— 那是"有界滚动"才需要的东西（上一版就是有界滚动）。
    // ⚠️⚠️ **指针捕获必须等"真的开始拖"才做，绝不能在 pointerdown 就做**（2026-10-11 实测
    //   「自定义那个目前没法点击」的根因）：`setPointerCapture` 会把后续指针事件（含 pointerup）
    //   重定向到捕获元素；而浏览器把 `click` 派发给「pointerdown 与 pointerup 目标的**最近公共
    //   祖先**」—— pointerdown 的目标是卡片、pointerup 被重定向到舞台 ⇒ 公共祖先 = **舞台**
    //   ⇒ **卡片自己的 onClick 永远收不到**。症状就是"卡片都点不了"（圆点在外面，所以还点得动，
    //   这会让人误判成"只有某一项坏了"）。
    //   正确姿势：按下只记录；位移超过 `MASCOT_DRAG_SLOP_PX` 才认定"开始拖"，**那时**再捕获
    //   （捕获也是为了拖出舞台边界后仍能收到 pointermove / pointerup）。
    const dragStart = (e) => {
      if (e.button != null && e.button !== 0) return;
      const st = e.currentTarget;
      const ring = st.querySelector(".we-picker__mascot-ring");
      if (!ring) return;
      mascotDrag = {
        x0: e.clientX, dx: 0, ring, st, pointerId: e.pointerId, dragging: false,
        startRot: -alignedLogical * STEP_DEG,
        samples: [{ x: e.clientX, t: Date.now() }],
      };
      mascotDragMoved = false;
      // 这里**不**加 is-dragging、**不**捕获 —— 见上面的 ⚠️⚠️。
    };
    const dragMove = (e) => {
      if (!mascotDrag) return;
      const raw = e.clientX - mascotDrag.x0;
      // 越过阈值 = 这是一次**拖动**（而不是点击）：此刻才进入拖动模式。
      if (Math.abs(raw) > MASCOT_DRAG_SLOP_PX) {
        mascotDragMoved = true;
        if (!mascotDrag.dragging) {
          mascotDrag.dragging = true;
          try { mascotDrag.ring.classList.add("is-dragging"); } catch { /* ignore */ }
          try { mascotDrag.st.setPointerCapture(mascotDrag.pointerId); } catch { /* ignore */ }
        }
      }
      const dx = Math.max(-DRAG_LIMIT_PX, Math.min(DRAG_LIMIT_PX, raw));
      mascotDrag.dx = dx;
      mascotDrag.ring.style.transform =
        "rotateY(" + (mascotDrag.startRot + dx * DEG_PER_PX) + "deg)";
      const now = Date.now();
      mascotDrag.samples.push({ x: e.clientX, t: now });
      // 只留最近 100ms 的样本（够算"松手那一刻"的速度，又不被早先的大位移带偏）。
      while (mascotDrag.samples.length > 2 && now - mascotDrag.samples[0].t > 100) mascotDrag.samples.shift();
    };
    const dragEnd = () => {
      const d = mascotDrag;
      mascotDrag = null;
      if (!d) return;
      // 一次**点击**（没越过阈值）：什么都不做 —— 让浏览器照常把 click 派发给卡片本身。
      // 这里提前返回还顺带避免了"点一下也去写一次 transform"（那会打断正在进行的吸附过渡）。
      if (!d.dragging) return;
      try { d.ring.classList.remove("is-dragging"); } catch { /* ignore */ }
      // 松手速度（px/s，正 = 向右拖 = 环朝正方向转）。样本太旧（手指已停）⇒ 速度算 0。
      let vPx = 0;
      const s0 = d.samples[0], s1 = d.samples[d.samples.length - 1];
      if (s0 && s1 && s1.t > s0.t && Date.now() - s1.t < MASCOT_FLING_STALE_MS) {
        vPx = ((s1.x - s0.x) / (s1.t - s0.t)) * 1000;
      }
      const projectedRot = d.startRot + (d.dx + vPx * MASCOT_FLING_S) * DEG_PER_PX;
      let target = Math.round(-projectedRot / STEP_DEG);   // 吸附到最近的整数槽位
      const dir = target === alignedLogical ? 0 : Math.sign(target - alignedLogical);
      // ⚠️ 「自定义立绘」不是落点（它是"选文件"这个动作，不是一种形态）⇒ 顺着同方向再走一格。
      //    有这一条，拖动**永远不会弹出文件选择框** —— 那会是纯粹的惊吓。
      if (dir !== 0 && items[norm(target)].kind !== "builtin") target += dir;
      if (dir === 0 || items[norm(target)].kind !== "builtin") {
        // 没换档：把拖动期写下的行内 transform 弹回吸附值 —— 那一步绕过了 React，
        // 而此刻 `is-dragging` 已摘掉 ⇒ CSS 过渡负责把这一下走圆。
        d.ring.style.transform = "rotateY(" + (-alignedLogical * STEP_DEG) + "deg)";
        return;
      }
      mascotRingLogical = target;
      onRopeFormChange(items[norm(target)].id);
    };
    // 待确认的形态切换：自定义立绘生效时点内置项 / 按 ‹ › 都会走到这儿（**唯一的破坏性动作**，
    // 所以用两步确认 —— 切到内置形态必须先清除那张自定义立绘，而清除不可恢复）。
    const pendingId = typeof sel.mascotPendingForm === "string" ? sel.mascotPendingForm : "";
    const pendingLabel = pendingId ? (ROPE_FORMS[pendingId] ? ROPE_FORMS[pendingId].label : pendingId) : "";
    const confirmRow = pendingId
      ? renderConfirmRow(sel.armedConfirm, "mascot-form",
        weT("改用「{name}」需要先清除自定义立绘（清除不可恢复），继续吗？", { name: pendingLabel }),
        () => onMascotFormConfirm(), () => onDisarmConfirm())
      : null;
    // 层与职责（三层，每层只干一件事）：
    //   · `.we-picker__mascot-window`：**只负责裁剪**（环会伸出舞台）＋两端淡出遮罩。
    //     ⚠️ 裁剪必须由**祖先**做，不能直接给 `perspective` 那一层加 `overflow` ——
    //     overflow / mask 都是"分组属性"，加在 3D 上下文根上会把它**压平**。
    //     （参考实现也是靠更上层的 body 裁剪的，同一条道理。）
    //   · `.we-picker__mascot-stage`：3D 上下文根（`perspective`）＋指针 / 键盘事件。
    //   · `.we-picker__mascot-ring`：整环旋转（`rotateY(−逻辑索引 · 步进)`），拖动期被直接改写。
    return React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
      // ⚠️ **不给 hint**（2026-10-11 用户口径：「上面文案去掉」）：
      //    原来那句提示写的是"按 ‹ ›、用 ← / →、点圆点、点任意一只"—— 而 ‹ › 两个箭头
      //    同一轮被删掉了，留着就是**指导用户去点不存在的东西**。剩下的三条路（拖、点圆点、
      //    点立绘）本身自解释，再补一句反而又把这一行的文字拉长。
      //    标签「吉祥物形态」保留：它是这一行的名字，去掉后这一行就没有标签了
      //    （与上面「显示吉祥物」那一行不同形，读屏也失去分组名）。
      ctlText(weT("吉祥物形态")),
      React.createElement("div", { className: "we-picker__mascot-carousel" },
        React.createElement("div", {
          className: "we-picker__mascot-window",
          // 高度**算出来的**（见上 FRONT_ZOOM / WINDOW_H_PX）：3D 透视会把卡片整体放大，
          // 写死高度就会把立绘的头顶与名字的底部切掉 —— 用户实测的「上下有截断」正是这个。
          // 宽度是**贴住环**（`max-width` = 环的水平外沿）：铺满整行会在环两侧留下大片空白
          // （那正是"中间一小坨"的成因），而写死 340 又会在宽面板里显得窄。
          style: { height: WINDOW_H_PX + "px", maxWidth: RING_EXTENT_PX * 2 + "px" },
        },
          React.createElement("div", {
            className: "we-picker__mascot-stage",
            role: "group", "aria-label": weT("吉祥物形态"),
            // 透视也与 scale 同乘（写在行内，因为它随 scale 变；CSS 里那份是设计档的兜底）。
            style: { perspective: PERSP_S + "px" },
            onPointerDown: dragStart,
            onPointerMove: dragMove,
            onPointerUp: dragEnd,
            onPointerCancel: dragEnd,
            onKeyDown: (e) => {
              // ← / → 换形态；Home / End 跳到首/末。
              // ⚠️ 一律 `preventDefault`：不拦的话 ← / → 会把整块面板横向滚走、
              //    Home / End 会把页面滚到顶/底。
              if (e.key === "ArrowLeft") { e.preventDefault(); cycle(-1); }
              else if (e.key === "ArrowRight") { e.preventDefault(); cycle(1); }
              else if (e.key === "Home") { e.preventDefault(); activate(0); }
              else if (e.key === "End") { e.preventDefault(); activate(forms.length - 1); }
            },
          },
            React.createElement("div", {
              className: "we-picker__mascot-ring",
              style: { transform: "rotateY(" + (-alignedLogical * STEP_DEG) + "deg)" },
            },
              items.map((it, i) => {
                const off = slotOffsetOf(i);
                const isCenter = off === 0;
                const isBuiltin = it.kind === "builtin";
                const isActive = isCenter && (isBuiltin ? !customArt : Boolean(customArt));
                const label = isBuiltin ? it.form.label : weT("自定义");
                return React.createElement("button", {
                  key: it.id,
                  type: "button",
                  // ⚠️ **内置项永不禁用**（用户口径：按钮要可点击）：自定义立绘生效时点它会走
                  //    "改用内置形态"那条带确认的路。只有"正在导入"这一个瞬时态才禁用。
                  disabled: !isBuiltin && Boolean(sel.mascotBusy),
                  className: "we-picker__mascot-item" + (isCenter ? " we-picker__mascot-item--center" : "")
                    + (isActive ? " we-picker__mascot-item--active" : ""),
                  "aria-pressed": isActive ? "true" : "false",
                  "aria-label": label,
                  title: isBuiltin
                    ? (customArt ? weT("改用「{name}」（会先清除自定义立绘）", { name: label }) : label)
                    : (customArt ? weT("替换图片…（再导入会覆盖上一次）") : weT("导入图片…")),
                  // 尺寸与角度**全部行内写**：判据要能直接从渲染树里读到
                  // 「盒宽 = 立绘宽（不留透明内边距）」「卡高容得下最高的立绘」
                  // 与「每张卡等角度铺在环上」，而不是去猜 CSS。
                  style: {
                    width: BOX_S + "px",
                    height: CARD_H_PX + "px",
                    marginLeft: (-BOX_S / 2) + "px",
                    marginTop: (-CARD_H_PX / 2) + "px",
                    transform: "rotateY(" + (i * STEP_DEG) + "deg) translateZ(" + RADIUS_PX + "px)",
                    opacity: opacityOf(off),
                  },
                  onClick: () => {
                    // 拖动刚结束的那一次 click 丢掉（否则"拖一下"会顺带选中手指底下的卡）。
                    if (mascotDragMoved) { mascotDragMoved = false; return; }
                    activate(i);
                  },
                },
                  isBuiltin
                    ? React.createElement("span", {
                      className: "we-picker__mascot-art",
                      // 立绘盒也随 scale 放大（否则卡变大了、立绘还是 64px，中间空一圈）。
                      // 各形态的 w/h 比例不变 ⇒ "盒宽 = 卡宽"这条不变量在任意 scale 下都保持。
                      style: { width: at(it.form.w) + "px", height: at(it.form.h) + "px" },
                    }, React.createElement("img", { src: it.form.img, alt: label, draggable: false }))
                    : React.createElement("span", {
                      // ⚠️ 类名与内置项的立绘框**不同**（`we-picker__mascot-art` 是"内置形态"的
                      //    记号，复用会把"固定基础尺寸"那条判据的计数带偏 —— 实测踩过）。
                      className: "we-picker__mascot-custom-art",
                      style: { width: at(previewW) + "px", height: at(previewH) + "px" },
                    },
                      customArt
                        ? React.createElement("img", { src: previewArt.img, alt: weT("自定义"), draggable: false })
                        : React.createElement("span", { className: "we-picker__mascot-empty" }, "+")),
                  // 名字每项都画：环上名字各在自己的卡里、不会打架（旧扇面会，那时只画中心一项）。
                  React.createElement("span", { className: "we-picker__mascot-name" },
                    !isBuiltin && sel.mascotBusy ? weT("导入中…") : label),
                );
              }),
            ),
          ),
        ),
      ),
      // 圆点：10 只内置时"一只一只翻"太笨 ⇒ 给**直接跳到任意一只**的路，
      // 顺带回答"一共几只、现在第几只"（环上只能看见 3–5 张，答不了这个问题）。
      // ⚠️ 两个 ‹ › 箭头在 2026-10-11 按用户口径删掉了：它们与圆点功能重叠，
      //    而圆点更强（直接跳任意一只 + 显示总数）。换形态仍有四条路：拖环 / 点圆点 /
      //    点立绘 / 键盘 ← →（键盘那条对键盘用户是必需的，所以 `cycle` 保留）。
      React.createElement("div", { className: "we-picker__mascot-dots" },
        items.map((it, i) => {
          const label = it.kind === "builtin" ? it.form.label : weT("自定义");
          const on = i === activeIdx;
          return React.createElement("button", {
            key: "dot-" + it.id,
            type: "button",
            className: "we-picker__mascot-dot" + (on ? " is-active" : ""),
            "aria-label": weT("切换到「{name}」", { name: label }),
            "aria-current": on ? "true" : undefined,
            title: label,
            onClick: () => activate(i),
          });
        }),
      ),
      confirmRow,
      // 屏读播报：形态一变就念一次"<名字>，第 N 个，共 M 个"。轮播类控件不能只靠视觉 ——
      // 拖一下屏上转了、读屏用户却毫无感知（参考实现同样带 aria-live）。
      React.createElement("span", {
        key: "mascot-live", className: "we-sr-only",
        "aria-live": "polite", "aria-atomic": "true",
      }, weT("{name}，第 {n} 个，共 {m} 个", {
        name: customArt ? weT("自定义") : (ROPE_FORMS[sel.ropeForm] ? ROPE_FORMS[sel.ropeForm].label : ""),
        n: String(activeIdx + 1), m: String(items.length),
      })),
      customArt && React.createElement("button", {
        key: "custom-clear",
        className: "we-picker__btn we-picker__mascot-clear",
        type: "button",
        disabled: Boolean(sel.mascotBusy),
        onClick: onMascotClear,
      }, weT("清除")),
    );
  }

  function renderMascotTab(ctx) {
    const { onRopeScaleChange, onRopeVisibilityChange, onMascotFormConfirm, onDisarmConfirm, sel, paneWidth } = ctx;
    // 主页面那只吉祥物**当前用的立绘**（自定义优先 / 否则内置形态）—— 与 RopeDock 共用
    // 同一条解析（`ropeArtOf`）：设置页看到的盒与主页面那只的盒必须是同一个数。
    const previewArt = ropeArtOf(sel);
    const customArt = previewArt.custom;
    // 自定义立绘卡片的舞台盒 = 内置卡里最高的那张（Deepseek_Pro 64×96）的盒 ——
    // "同样的卡片大小和样式"（用户口径）在这条链上就落到这两个数上。
    const boxW = 64, boxH = 96;
    // 卡面舞台：把当前立绘等比缩进 64×96（与最高的内置卡「Deepseek_Pro」同一个盒）——
    // 保持宽高比，直接夹住某一边会把长竖图压成方的，看到的就不是那只吉祥物的形状了。
    const previewFit = Math.min(1, boxW / previewArt.w, boxH / previewArt.h);
    // 没导入时占位就是整块舞台（虚线框 + 一个加号），导入后图片按自己的比例缩进它。
    const previewW = customArt ? Math.max(1, Math.round(previewArt.w * previewFit)) : boxW;
    const previewH = customArt ? Math.max(1, Math.round(previewArt.h * previewFit)) : boxH;
    return React.createElement(React.Fragment, null,
      // ── 吉祥物：形态卡片固定基础尺寸（「吉祥物大小」只作用于主页面），开关总控 ──
      React.createElement("div", { className: "we-picker__section" },
        React.createElement("div", { className: "we-picker__section-head" },
          React.createElement("span", { className: "we-picker__section-label" }, weT("聊天吉祥物")),
        ),
        switchRow(weT("显示吉祥物"), sel.ropeShown !== false, onRopeVisibilityChange, {
          key: "rope-shown",
          hint: weT("关闭后隐藏吉祥物与壁纸仓库抽屉"),
          tooltip: weT("关闭后隐藏吉祥物与壁纸仓库抽屉；可随时在本页重新开启"),
        }),
        // ── 自定义立绘（用户口径：可导入，已导入时下一次导入覆盖上一次）──────────
        // 它是**转盘（3D 环）上的最后一项**（用户口径：与内置立绘同样的卡片大小和样式）——
        // 点它导入 / 替换（再导入即覆盖），正在用时是 `--active` 那一项；内置项**不因**自定义
        // 生效而禁用（2026-10-13 并入 #180 之后：点内置项 = 两步确认换回出厂自带，见
        // `onMascotFormConfirm`），只有导入进行中才禁用（`disabled: mascotBusy`）。
        // 卡面尺寸口径与内置项一致（固定，不随「吉祥物大小」缩放）：图片按自己的宽高比
        // contain 进 64×96 的小舞台（那是最高的内置项「Deepseek_Pro」的盒）。清除入口排在最后。
        renderMascotFormCards(sel, previewArt, previewW, previewH, onRopeFormChange, onMascotPick, onMascotClear, onMascotFormConfirm, onDisarmConfirm, paneWidth),
        sel.mascotError
          && React.createElement("div", { className: "we-picker__hint we-avatar-error", key: "rope-custom-err" }, sel.mascotError),
        SliderRow(weT("吉祥物大小"), ROPE_SCALE_MIN, ROPE_SCALE_MAX, ROPE_SCALE_STEP,
          sel.ropeScale, onRopeScaleChange, Math.round(sel.ropeScale * 100) + "%", "rope-scale"),
      ),
    );
  }


  function renderEffectsSlidersSection(ctx) {
    const { onBackgroundBrightness, onBackgroundContrast, onBackgroundSaturate, onLayerPositionX, onLayerPositionY, onLayerReset, onLayerScale, onScrim, onWallpaperBlur, onWallpaperOpacity, sel } = ctx;
    return React.createElement(React.Fragment, null,
      SliderRow(weT("壁纸模糊"), 0, 60, 1, sel.wallpaperBlur, onWallpaperBlur, sel.wallpaperBlur + "px"),
      SliderRow(weT("亮度"), 40, 160, 5, sel.backgroundBrightness, onBackgroundBrightness, sel.backgroundBrightness + "%"),
      SliderRow(weT("对比度"), 40, 200, 5, sel.backgroundContrast, onBackgroundContrast, sel.backgroundContrast + "%"),
      SliderRow(weT("饱和度"), 0, 200, 5, sel.backgroundSaturate, onBackgroundSaturate, sel.backgroundSaturate + "%"),
      // 壁纸层取景（位置 / 缩放）：WE 壁纸属性面板那三项（对齐方式 = 自由 时的 水平 / 垂直 /
      // 缩放，即 alignmentx / alignmenty / alignmentz）是 WE 引擎内置属性，存在 WE 自己的
      // config.json 里、本插件读不到；场景层的适配也只有 cover / contain / center / fill
      // ⇒ 想搬 WE 的取景只能在这里重设一遍。刻度与 WE 那三条滑条**同量程**（便于对拷）：
      // 位置 0..100（50 = 居中，整屏百分比偏移），缩放 50..150（100 = 原大小）。
      // `numberEdit` 让右侧数值区可直接键入；双击标签回默认（位置回 50、缩放回 100%）。
      SliderRow(weT("水平"), 0, 100, 1, sel.layerPositionX, onLayerPositionX, "%", "layer-pos-x", {
        tooltip: weT("整屏百分比偏移：50 = 中心，0/100 = 两端（与 Wallpaper Engine 自带的同名滑条同义）；双击标签回中心。"),
        numberEdit: true,
        onLabelDoubleClick: () => onLayerReset("x"),
      }),
      SliderRow(weT("垂直"), 0, 100, 1, sel.layerPositionY, onLayerPositionY, "%", "layer-pos-y", {
        tooltip: weT("整屏百分比偏移：50 = 中心，0/100 = 两端（与 Wallpaper Engine 自带的同名滑条同义）；双击标签回中心。"),
        numberEdit: true,
        onLabelDoubleClick: () => onLayerReset("y"),
      }),
      SliderRow(weT("缩放"), 50, 150, 1, sel.layerScale, onLayerScale, "%", "layer-scale", {
        tooltip: weT("100 = 原大小；95 = 缩到 95%（四周露出页面底色）；105 = 放大到 105%；双击标签回 100%。"),
        numberEdit: true,
        onLabelDoubleClick: () => onLayerReset("s"),
      }),
      // 壁纸透明度（#82）：越大越透，淡出后壁纸融向**原生外观**（浅色纯白 /
      // 深色纯黑，IDEA 背景图式）。与暗化互补 —— 一个减淡壁纸本身，一个压暗
      // 整体画面；上限 90% 避免调到「壁纸完全不可见但暗化还在」的诡异状态
      // （想关壁纸直接关掉即可）。
      SliderRow(weT("壁纸透明度"), 0, 90, 5, sel.wallpaperOpacity, onWallpaperOpacity, sel.wallpaperOpacity + "%", "wallpaper-opacity", {
        tooltip: weT("壁纸向原生底色淡出（浅色纯白 / 深色纯黑）；透明生效时壁纸层会垫这层原生底色，以保证玻璃模糊不被透明背景破坏。场景壁纸的垫底实时帧会在实时画面出场后退场，不会在淡出时透出来"),
      }),
      SliderRow(weT("暗化"), 0, 90, 5, Math.round(sel.scrim * 100), onScrim, Math.round(sel.scrim * 100) + "%"),
    );
  }

  function renderEffectsLiveSection(ctx) {
    const { onLiveBootDelay, onSceneLiveFps, onToggleSceneLive, sel } = ctx;
    return React.createElement(React.Fragment, null,
      // ── 场景实时渲染（WebWallGL）：scene.pkg 壁纸的实时 WebGL 形态，默认
      // 开启。失败（首帧超时/运行失联）按壁纸记忆并自动降级回内嵌 MP4 →
      // 静态帧；重开本开关清空全部失败记忆（显式重试入口）。
      (sel.type === "scene" || sel.type === "web") && switchRow(
        sel.type === "web" ? weT("网页实时渲染") : weT("场景实时渲染"),
        sel.sceneLive !== false, onToggleSceneLive, {
        key: "scene-live",
        hint: weT("WebGL 实时渲染 · 失败自动降级"),
        tooltip: sel.type === "web"
          ? weT("网页壁纸由 WebWallGL 加载并注入 WE API（音频/属性监听等），严格沙箱隔离（不继承宿主权限）；加载失败或运行失联时自动退回兼容 iframe。重新开启会重试此前失败的壁纸")
          : weT("场景壁纸由 WebWallGL 实时渲染（粒子/脚本/视差/包内音频）；加载失败或运行失联时自动退回内嵌视频 / 实时帧。重新开启会重试此前失败的壁纸"),
      }),
      (sel.type === "scene" || sel.type === "web") && sel.sceneLive !== false
        && React.createElement("div", { className: "we-picker__ctl", key: "live-boot-delay" },
        ctlText(weT("启动最长等待时间")),
        React.createElement("div", { className: "we-picker__seg" },
          [0, 3, 5, 10].map((secs) =>
            React.createElement("button", {
              key: secs,
              className: "we-picker__btn we-picker__rate" + (Number(sel.liveBootDelay) === secs ? " we-picker__rate--active" : ""),
              type: "button",
              onClick: () => onLiveBootDelay(secs),
            }, secs === 0 ? weT("立即") : "≤" + secs + "s"),
          ),
        ),
      ),
      (sel.type === "scene" || sel.type === "web") && sel.sceneLive !== false
        && (sel.sceneLiveSrc || sel.webLiveSrc)
        && React.createElement("div", { className: "we-picker__ctl", key: "scene-live-fps" },
        ctlText(weT("实时渲染帧率"), weT("渲染 fps · 越低越省电")),
        React.createElement("div", { className: "we-picker__seg" },
          SCENE_LIVE_FPS_VALUES.map((f) =>
            React.createElement("button", {
              key: f,
              className: "we-picker__btn we-picker__rate" + (sel.sceneLiveFps === f ? " we-picker__rate--active" : ""),
              type: "button",
              // 帧率进 iframe query（sceneFps）→ syncLayers key 变化重建层
              onClick: () => onSceneLiveFps(f),
            }, f + "fps"),
          ),
        ),
      ),
    );
  }

  function renderEffectsSourceSection(ctx) {
    const { onClearCustomFrame, onClearGpuFrame, onCustomFrameFile, onRecaptureGpuFrame, onRefreshFrame, sel, surface } = ctx;
    const sidebarSurface = surface === "sidebar";
    const sceneWithFrame = sel.type === "scene" && Boolean(sel.sceneFrameUrl);
    const gpuPinnedHere = gpuFrameUi.wid === String(sel.id) && gpuFrameUi.pinned;
    return React.createElement(React.Fragment, null,
      // ── 出图来源：**只在实时渲染未生效时**出现 —— 它换的是「没有实时画面时显示什么」，
      //    实时画面在跑时它没有任何作用（换实时帧用下面的「重新截」）。
      //    侧栏档不出现在这里（准备与诊断，见函数头）。──
      !sidebarSurface && sel.type === "scene" && sel.sceneFrameUrl && !liveRenderEnabled(sel)
        && React.createElement("div", { className: "we-picker__ctl" },
        ctlText(weT("出图来源"), weT("这张画面从哪来"),
          weT("场景壁纸「这张画面从哪来」。两档：**实时画面**（有抓帧就用它，没有则留空）与**自定义画面**（手动导入的截图）。点一次切换一次，选择记忆在当前壁纸上。实时渲染生效时本行不显示（那时画面来自实时渲染，切这里不会生效）")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onRefreshFrame,
          "aria-label": weT("切换出图来源"),
        }, weT("切换")),
        React.createElement("span", { className: "we-picker__hint we-picker__value" },
          // 按**档位值**查表，不能当下标：值域有洞（0 与 4），下标会越界成 undefined.label
          (() => {
            const v = Number(sel.frameVariants && sel.frameVariants[String(sel.id)]) || 0;
            const i = Math.max(0, FRAME_VARIANTS.findIndex((f) => f.id === v));
            return weT("第 {n}/{total} 档 · {label}", { n: i + 1, total: frameVariantCount(sel, String(sel.id)), label: weT(FRAME_VARIANTS[i].label) });
          })()),
      ),
      // ── GPU 实时帧（抓帧缓存 + 重新截 + 微缩预览）：**实时渲染开着时同样显示**。
      //    它是切换途中 / live 首帧之前给用户看的那张静帧 —— 构图不对（黑帧、旧视口、
      //    切走瞬间抓的）时用户必须能立刻重抓，而不是先关掉实时渲染再回来。
      //    预览窗口指向的就是**层上正在用的那个 URL**（同一档位 + 缓存破坏参数），
      //    所以「预览看到什么，切换途中就是什么」。
      //    侧栏档不出现在这里（准备与诊断，见函数头）。──
      !sidebarSurface && sceneWithFrame && (gpuPinnedHere || liveRenderEnabled(sel))
        && React.createElement("div", { className: "we-picker__ctl we-picker__ctl--wrap" },
        ctlText(weT("实时帧"),
          gpuPinnedHere
            ? weT("已抓帧 · 优先于全部画面档位")
            : weT("实时渲染中 · 可随时抓一张"),
          weT("实时渲染成功后会自动抓帧缓存这一帧（<key>_gpu.png），它优先于「出图来源」的自动档；切换壁纸途中、以及 live 首帧出来之前，屏幕上显示的就是它。「重新截」会按**当前**画面重抓一张（已存在的缓存会被替换，抓不到则原样保留）；「清除 GPU 帧」删掉缓存、回到「自动」：没有实时画面时是空态（不再**合成**任何「猜」出来的图）；唯一的例外是该帧连**加载都失败**、而壁纸有工程预览图时，退到预览图垫底（作者随包发布的图）。")),
        // 微缩预览：只有槽里真有实时帧时才显示（否则这里会显示成 CPU 档位帧，误导）。
        gpuPinnedHere && React.createElement("img", {
          className: "we-picker__frame-shot",
          src: framePreviewSrc(sel),
          alt: weT("当前壁纸实时帧预览"),
          title: weT("当前壁纸的实时帧（就是切换途中 / live 首帧前显示的那张静帧）{size}", { size: gpuFrameUi.w > 0 && gpuFrameUi.h > 0 ? " · " + gpuFrameUi.w + "×" + gpuFrameUi.h : "" }),
        }),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onRecaptureGpuFrame,
          disabled: gpuFrameUi.recapturing,
          "aria-label": weT("重新截取当前壁纸实时帧"),
        }, gpuFrameUi.recapturing ? weT("抓帧中…") : weT("重新截")),
        gpuPinnedHere && React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onClearGpuFrame,
          "aria-label": weT("清除 GPU 实时帧缓存"),
        }, gpuFrameUi.busy ? weT("清除中…") : weT("清除 GPU 帧")),
        gpuPinnedHere && gpuFrameUi.w > 0
          && React.createElement("span", { className: "we-picker__hint we-picker__value" },
            gpuFrameUi.w + "×" + gpuFrameUi.h),
        gpuFrameUi.error
          && React.createElement("div", { className: "we-picker__hint" }, gpuFrameUi.error),
      ),
      // ── 自定义画面（截屏导入）：出不了实时画面的壁纸（骨骼拼装场景，预览 gif 仅
      //    160px）由用户从 WE 截图导入，画质=截图分辨率；就是 ?v=4 那一档。
      //    同样**不受实时渲染开关影响**（导入/清除与 live 互不干扰）。──
      !sidebarSurface && sel.type === "scene" && React.createElement("div", { className: "we-picker__ctl" },
        ctlText(weT("自定义画面"),
          weT("手动给电脑桌面截图，导入截图解决错误壁纸"),
          weT("手动对电脑桌面截图（壁纸显示效果的分辨率即最终展示画质），再回来点「导入画面…」选中该截图；导入后自动切换为该图，可随时切回「实时画面」档。实时渲染生效时它仍会作为「出图来源」的自定义档")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: () => { if (customFrameInput) customFrameInput.click(); },
        }, frameVariantCount(sel, String(sel.id)) === FRAME_VARIANTS.length ? weT("替换图片…") : weT("导入画面…")),
        frameVariantCount(sel, String(sel.id)) === FRAME_VARIANTS.length && React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onClearCustomFrame,
        }, weT("清除")),
        React.createElement("input", {
          type: "file",
          accept: "image/png,image/jpeg,image/webp",
          style: { display: "none" },
          ref: (el) => { customFrameInput = el; },
          onChange: onCustomFrameFile,
        }),
      ),
    );
  }

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
  // 这一层保留"空态提前返回 + 唯一的节外壳"，把**节里的内容**按块分给子渲染器；
  // "有哪几块、什么顺序"一眼可读（细锚按真渲染的**控件标签有序序列**钉住，见 verify-scene-live）。
  function renderEffectsTab(ctx) {
    const { sel, setPickerOpener, onOpenPicker, onPickWallpaper, surface } = ctx;
    const sidebarSurface = surface === "sidebar";
    if (!sel.id) {
      return React.createElement("div", { className: "we-picker__empty" },
        React.createElement("span", { className: "we-picker__empty-title" }, weT("还没有启用壁纸")),
        React.createElement("span", { className: "we-picker__hint" },
          weT("选择一款壁纸后，可在这里调整模糊、亮度、适配、倍速等效果")),
        React.createElement("button", {
          className: "we-picker__btn we-picker__btn--primary", type: "button",
          ref: sidebarSurface ? undefined : setPickerOpener,
          onClick: sidebarSurface ? onPickWallpaper : onOpenPicker,
        }, sidebarSurface ? weT("去挑一张 ›") : weT("选择壁纸")),
      );
    }
    return React.createElement(React.Fragment, null,
      React.createElement("div", { className: "we-picker__section" },
        React.createElement("div", { className: "we-picker__section-head" },
          React.createElement("span", { className: "we-picker__section-label" }, weT("画面")),
        ),
        renderEffectsSlidersSection(ctx),
        renderEffectsLiveSection(ctx),
        renderEffectsSourceSection(ctx),
        renderEffectsPlaybackSection(ctx),
        renderEffectsFitSection(ctx),
      ),
    );
  }

  function renderAdvancedBrowsingSection(ctx) {
    const { onLayoutChange, sel } = ctx;
    return React.createElement(React.Fragment, null,
    // ── 浏览方式：紧凑 CD 架 vs 常规分页网格 ──
    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("浏览方式")),
      ),
      // Card style: classic (WE's original aspect-ratio 16/9 cards — the CD-like
      // look) vs the rewritten fixed-height cards that never overlap.
      switchRow(weT("紧凑布局"), sel.pickerLayout === "classic", (e) => onLayoutChange(e.target.checked ? "classic" : "fixed"), {
        hint: sel.pickerLayout === "classic" ? weT("CD 架：层叠 + 一页到底") : weT("常规网格 · 分页"),
        tooltip: weT("紧凑 CD 架：层叠 + 一页到底"),
      }),
    ),
    );
  }

  function renderAdvancedCompatSection(ctx) {
    const { onEdgeCompatChange, sel } = ctx;
    return React.createElement(React.Fragment, null,
    // ── 兼容性 ──
    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("兼容性")),
      ),
      // Edge 兼容渲染开关：仅在 Edge 中生效（canvas 渲染，避免浏览器自带的
      // 「下载 / 投屏」悬浮工具栏）。
      switchRow(weT("Edge 兼容"), sel.edgeCompat !== false, (e) => onEdgeCompatChange(e.target.checked), {
        hint: weT("Edge 下视频壁纸走 canvas 渲染"),
        tooltip: weT("Edge 兼容：视频壁纸改用 canvas 渲染，避免浏览器自带的「下载 / 投屏」悬浮工具栏；关闭则始终使用原生 <video>"),
      }),
    ),
    );
  }

  function renderAdvancedAdapterSection(ctx) {
    const { onAdapterTarget, sel } = ctx;
    return React.createElement(React.Fragment, null,
    // ── 适配（适配器模式）：本页跑在哪种宿主形态里 —— 自动检测 + 可手选 ──
    // 检测事实来源在宿主侧（能力头 / UA，见 lib/index.js 的 3c-0），客户端拿
    // 上报值 + 本地信号兜底；手选优先于检测，是检测不准时的自救。
    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", {
          className: "we-picker__section-label",
          title: weT("适配目标决定四件事：网页壁纸载荷走哪个源（有无能力头栅栏）、桌面壳材质规则是否生效、窗口失焦暂停是否适用、面板哪些行可用。默认自动检测，检测不准时可手选覆盖（手选优先）。"),
        }, weT("适配", null, "adapter")),
      ),
      React.createElement("div", { className: "we-picker__ctl" },
        ctlText(weT("适配目标"), weT("自动检测 · 手选可覆盖")),
        React.createElement("select", {
          className: "we-picker__select",
          value: ADAPTER_TARGET_VALUES.includes(sel.adapterTarget) ? sel.adapterTarget : "auto",
          onChange: onAdapterTarget,
          "aria-label": weT("适配目标"),
        },
          ADAPTER_TARGET_VALUES.map((t) =>
            React.createElement("option", { key: t, value: t }, ADAPTER_LABELS[t] || t)),
        ),
      ),
      // 状态行只反映**检测**（与手选无关），且必须与宿主 mediaOriginNeeded 的
      // 三分支逐条对齐 —— 否则文案会说错载荷到底走哪个源：栅栏 ⇒ 独立媒体源；
      // 无栅栏的桌面形态（Electron UA）**仍然**走独立媒体源（安全默认）；只有
      // 原生浏览器才走应用源。desktop/fence 取自 adapterCaps（最终目标 + 上报）。
      React.createElement("div", { className: "we-picker__hint", key: "adapter-detected" },
        weT("检测到：{target}{suffix}", {
          target: weT(adapterDetectedLabel()),
          suffix: adapterCaps().fence
            ? weT(" · 有能力头栅栏（网页壁纸走独立媒体源）")
            : adapterCaps().desktop
              ? weT(" · 无栅栏的桌面形态（网页壁纸仍走独立媒体源）")
              : weT(" · 无栅栏（网页壁纸走应用源）"),
        })),
      adapterMismatchWarning() && React.createElement("div", { className: "we-picker__hint", key: "adapter-warn" },
        adapterMismatchWarning()),
    ),
    );
  }

  function renderAdvancedPowerSection(ctx) {
    const { onPauseOnBattery, onPauseOnBlur, onPauseOnHidden, sel } = ctx;
    return React.createElement(React.Fragment, null,
    // ── 省电：遮挡暂停（借鉴 Wallpaper Engine 的「被遮挡时暂停」）──
    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", {
          className: "we-picker__section-label",
          title: weT("类似 WE 的遮挡暂停：最小化、切到其它应用或使用电池供电时视频暂停、GPU 解码归零；回到界面 / 接通电源自动继续（网页壁纸仅随页面隐藏被浏览器节流）"),
        }, weT("省电")),
      ),
      switchRow(weT("最小化/切页时暂停"), sel.pauseOnHidden, onPauseOnHidden, { key: "pause-hidden" }),
      // 失焦档按适配目标显隐：桌面壳失焦时壁纸多半仍整块可见，暂停会定格
      // **可见**画面 ⇒ 本目标下不提供；值不删，切到浏览器目标即重新生效。
      adapterCaps().blurPause
        && switchRow(weT("窗口失焦时暂停"), sel.pauseOnBlur, onPauseOnBlur, { key: "pause-blur" }),
      !adapterCaps().blurPause && React.createElement("div", { className: "we-picker__hint", key: "pause-blur-note" },
        weT("「窗口失焦时暂停」只在原生浏览器目标下提供 —— 桌面壳失焦时壁纸仍可见，暂停会定格可见画面{note}", {
          note: sel.pauseOnBlur ? weT("（当前已开启，本目标下不生效，切到浏览器目标后恢复）") : "",
        })),
      switchRow(weT("使用电池时暂停"), sel.pauseOnBattery, onPauseOnBattery, { key: "pause-battery" }),
    ),
    );
  }

  function renderAdvancedCacheSection(ctx) {
    const { onCacheDirDraft, onCancelEditCacheDir, onStartEditCacheDir, sel,
      onCacheDirBrowseInput, onCacheDirBrowseGo, onCacheDirBrowseEnter, onCacheDirBrowseUp, onPickCacheDir, onCloseCacheDirBrowse } = ctx;
    const browse = sel.cacheDirBrowse;
    return React.createElement(React.Fragment, null,
    // ── 缓存位置：转码产物 / faststart 变体 / 静态帧 / 预览图 / 媒体桥缓存都是**可再生**的
    //    大块文件（本机实测到 GB 级），默认落在插件数据目录 —— Windows 上那个目录仍在 C 盘
    //    用户目录下，这正是「C 盘洁癖」的触发点。持久化在宿主 config.json 的 cacheDir，
    //    经 /cache-dir 端点读写；显示值一律取宿主返回的**解析链答案**（设了
    //    `DSH_WE_CACHE_DIR` 时它与用户填的值不同 —— 那是环境变量覆盖，不是保存失败）。──
    React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: "we-picker__section-label" }, weT("缓存位置")),
      ),
      React.createElement("div", { className: "we-picker__uploads" },
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint we-picker__label" }, weT("缓存目录")),
        React.createElement("span", {
          className: "we-picker__uploads-path",
        }, sel.inventory.cacheDir || "—"),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          disabled: sel.cacheDirBusy,
          onClick: onStartEditCacheDir,
        }, weT("更改")),
      ),
      // 目录浏览器开着时草稿行让位（地址栏就在浏览器里，两行输入框互相打架）；
      // 选中后浏览器收起、草稿行带着填好的路径回来，保存/迁移语义不变。
      sel.editingCacheDir && !browse && React.createElement("div", { className: "we-picker__row" },
        React.createElement("input", {
          className: "we-picker__text", type: "text",
          value: sel.cacheDirDraft,
          placeholder: weT("绝对路径，如 D:\\WallpaperEngineCache"),
          onInput: onCacheDirDraft,
          onKeyDown: (e) => {
            if (e.key === "Enter") changeCacheDir(sel.cacheDirDraft, true);
            if (e.key === "Escape") onCancelEditCacheDir();
          },
        }),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          disabled: sel.cacheDirBusy,
          onClick: () => changeCacheDir(sel.cacheDirDraft, true),
        }, weT("保存")),
        React.createElement("button", {
          className: "we-picker__btn", type: "button",
          onClick: onCancelEditCacheDir,
        }, weT("取消")),
      ),
      // 目录浏览器：宿主列目录（GET /cache-dir/browse），这里只管点着进出 ——
      // 客户端不做路径拼接，条目的 path 原样回传问下一级。选中 = 把地址栏（或最后
      // 到达的一级）填进草稿，走既有保存链。
      browse && React.createElement("div", { className: "we-dirpick" },
        React.createElement("div", { className: "we-dirpick__bar" },
          React.createElement("input", {
            className: "we-picker__text we-dirpick__path", type: "text",
            value: browse.display || "",
            placeholder: weT("绝对路径，如 D:\\WallpaperEngineCache"),
            onInput: onCacheDirBrowseInput,
            onKeyDown: (e) => {
              if (e.key === "Enter") onCacheDirBrowseGo();
              if (e.key === "Escape") onCloseCacheDirBrowse();
            },
          }),
          React.createElement("button", {
            className: "we-picker__btn", type: "button",
            disabled: !browse.parent || browse.loading,
            title: weT("上一级"),
            onClick: onCacheDirBrowseUp,
          }, weT("上一级")),
        ),
        React.createElement("div", { className: "we-dirpick__chips" },
          React.createElement("button", {
            className: "we-picker__btn we-dirpick__chip", type: "button",
            disabled: browse.loading,
            onClick: () => onCacheDirBrowseEnter(""),
          }, weT("此电脑")),
          browse.home && React.createElement("button", {
            className: "we-picker__btn we-dirpick__chip", type: "button",
            disabled: browse.loading,
            onClick: () => onCacheDirBrowseEnter(browse.home),
          }, weT("主目录")),
          sel.inventory.cacheDir && React.createElement("button", {
            className: "we-picker__btn we-dirpick__chip", type: "button",
            disabled: browse.loading,
            onClick: () => onCacheDirBrowseEnter(sel.inventory.cacheDir),
          }, weT("当前缓存位置")),
        ),
        React.createElement("div", { className: "we-dirpick__list" },
          browse.loading && React.createElement("div", { className: "we-dirpick__empty" },
            weT("正在读取目录…")),
          !browse.loading && browse.error && React.createElement("div", { className: "we-picker__error" },
            browse.error),
          !browse.loading && !browse.error && !browse.dirs.length && React.createElement("div", { className: "we-dirpick__empty" },
            weT("没有子目录")),
          !browse.loading && browse.dirs.map((d, i) => {
            // 条目形状防御：宿主契约是 { name, path }，但万一拿到裸字符串（服务端形态
            // 漂移）也能渲染出名字、点进去 —— 空行比报错更难排查。
            const label = typeof d === "string" ? d : String((d && d.name) || (d && d.path) || "");
            const path = typeof d === "string" ? d : String((d && d.path) || "");
            return React.createElement("button", {
              key: path || label || i, type: "button", className: "we-dirpick__item",
              title: path,
              onClick: () => onCacheDirBrowseEnter(path),
            }, label || "—");
          }),
        ),
        browse.truncated && React.createElement("div", { className: "we-picker__hint" },
          weT("目录项过多，仅显示部分")),
        React.createElement("div", { className: "we-dirpick__foot" },
          React.createElement("span", {
            className: "we-picker__hint we-dirpick__sel", title: browse.display || "",
          }, browse.display || "—"),
          React.createElement("button", {
            className: "we-picker__btn", type: "button",
            disabled: browse.loading || !(String(browse.display || "").trim() || browse.path),
            onClick: onPickCacheDir,
          }, weT("选择此目录")),
          React.createElement("button", {
            className: "we-picker__btn", type: "button",
            onClick: onCloseCacheDirBrowse,
          }, weT("取消")),
        ),
      ),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("span", { className: "we-picker__hint" },
          weT("已有缓存会迁移到新位置")),
        React.createElement("span", { className: "we-picker__hint" },
          weT("缓存可再生，随时可删")),
      ),
      sel.cacheDirNote && React.createElement("div", { className: "we-picker__hint" },
        sel.cacheDirNote),
      sel.cacheDirError && React.createElement("div", { className: "we-picker__error" },
        sel.cacheDirError),
      ),
    ),
    );
  }

  function renderAdvancedDiagSection(ctx) {
    const { onToggleLiveDiag, sel } = ctx;
    return React.createElement(React.Fragment, null,
    // ── 实时渲染诊断（本会话有效，不落盘）：只对**能走实时
    //    渲染**的壁纸（场景 / 网页）显示 —— 视频、图片壁纸没有渲染页，摆出来是空的。──
    (sel.type === "scene" || sel.type === "web") && sel.sceneLive !== false
      && React.createElement("div", { className: "we-picker__section" },
        React.createElement("div", { className: "we-picker__section-head" },
          React.createElement("span", { className: "we-picker__section-label" }, weT("实时渲染诊断")),
        ),
        // live 诊断日志（本会话有效，不落盘）：默认只记关键事件（准备就绪/领养/
        // 首帧确认/判失败，每轮轮换 2–3 条，写在控制台与宿主诊断缓冲
        // `/wallpaper-engine/diag-log`）；这里开的是**逐秒心跳读数**（fps/running/
        // 暂停原因），排查「为什么没出帧」时用。
        switchRow(
          weT("live 诊断日志"), liveDiagVerbose(), onToggleLiveDiag, {
            key: "scene-live-diag",
            hint: weT("本会话有效 · 逐秒心跳读数"),
            tooltip: weT("开启后每秒记录一次渲染页心跳读数（fps / running / 暂停原因）与准备、领养、判失败事件；同时写入浏览器控制台和宿主诊断缓冲（GET /wallpaper-engine/diag-log）。排查 live 掉帧/降级时用，平时关着。"),
          }),
      ),
    );
  }
  // 这一层只**按顺序组装**各节 —— 于是"这个页签有哪几节、什么顺序"
  // 一眼可读（判据按真渲染的节序列钉住，见 verify-scene-live 的节顺序一节）。
  function renderAdvancedTab(ctx) {
    const { } = ctx;
    return React.createElement(React.Fragment, null,
      renderAdvancedBrowsingSection(ctx),
      renderAdvancedCompatSection(ctx),
      renderAdvancedAdapterSection(ctx),
      renderAdvancedPowerSection(ctx),
      renderAdvancedCacheSection(ctx),
      renderAdvancedDiagSection(ctx),
    );
  }
  // ── 「扩展」页签：后续功能的**模块容器** ─────────────────────────────────────
  // 这一页刻意只放一张**注册表**：加一个功能 = 往 EXTENSION_MODULES 里加一项，页签本身
  // 不用改（"接下来的功能追加都以模块形式放在该 tab 下"是用户的明确口径，见 CHANGELOG）。
  // 注册表为空时页签照旧在、只画空态 —— 页签栏是稳定的，用户不会因为"现在还没有模块"
  // 就找不到这一页的入口。
  //
  // 每一项的**描述符住在它自己的 src/<语义名>.js 里**（渲染器不膨胀）。取用一律走下面这个
  // **惰性**函数：顶层直接写 `const EXTENSION_MODULES = [SYMBOL]` 会踩两个坑 ——
  //   ① 内联后 prelude 求值期就要读兄弟模块的常量，模块顺序成了隐式契约；
  //   ② test/verify-scene-live.mjs 是**单独 import 本文件**、再喂 `globalThis` 的，
  //      顶层一引用别处的符号就当场 ReferenceError。
  // 写成函数后两个坑都没了：求值发生在"画这一页"的时候，那时兄弟模块早就内联好了。
  //
  // 模块形状（给未来加功能的自己）：
  //   { id, title, desc?, render? }
  //   · `id`    React key，稳定且唯一；
  //   · `title` / `desc` 取到的就是**译文**（描述符里写成 getter，见下）。写法上有个硬约束：
  //     **不能直接写成 `title: "…"`** —— 那在 test/verify-i18n.mjs 的判据 ① 里是
  //     "没进 weT(...) 的裸中文"；也不能写成顶层 `title: weT("…")`，那会在内联后的
  //     prelude 求值期撞 TDZ。既有写法是**getter**：
  //       get title() { return weT("点击效果与拖尾效果"); }
  //     这样 `weT(...)` 就落在字面量的最内层调用帧上，且取译文发生在渲染时（照抄
  //     src/ext-fx.js 的 FX_EXTENSION_MODULE 即可）—— 因此**本文件不再套一层
  //     weT**（套了就成了拿译文再查一次词表）。
  //   · `render(ctx)` 可选：给了就在这个模块的位置画它自己的控件；没给就只显示
  //     title + desc —— "功能还没做完"的模块可以先上架占位。
  //   · 模块**不得**自己写设置 / 发通知 / 持有状态：本文件是渲染器（契约见文件头），
  //     要动状态就把动作做成 src/client.js 的具名处理器、经 ctx 传进来。
  // 现有三项：一号 = 自定义会话头像（src/ext-avatar.js + src/avatar-layer.js，会话界面上的
  // DOM 补丁）、二号 = 点击效果与拖尾效果（src/ext-fx.js + src/fx-layer.js）、
  // 三号 = 3D 效果（src/ext-parallax.js + src/parallax-layer.js，只有变量与事件、不建 DOM）。
  // ⚠️ **顺序即屏上顺序**（数组第 0 项在最上面）：头像那一项排在**第一**（用户口径）。
  // 加第四项照抄这三份。
  function extensionModules() {
    return [AVATAR_EXTENSION_MODULE, FX_EXTENSION_MODULE, PARALLAX_EXTENSION_MODULE];
  }

  // 这一页自己不读 ctx 的任何字段：整包（sel + 具名 on* 处理器）转交给各模块的 render。
  // ⚠️ 判据口径：`const { … } = ctx;` 必须是函数体的**第一条语句**（前面连注释行都不许有），
  // 所以说明文字只能写在函数外面 —— 见 test/verify-scene-live.mjs 的『每个页签首行都从 ctx 解构』。
  function renderExtensionsTab(ctx) {
    const { onResetModule } = ctx;
    const modules = extensionModules();
    return React.createElement(React.Fragment, null,
      React.createElement("div", { className: "we-picker__section" },
        React.createElement("div", { className: "we-picker__section-head" },
          React.createElement("span", { className: "we-picker__section-label" }, weT("扩展模块")),
        ),
        React.createElement("div", { className: "we-ext" },
          modules.length === 0
            ? React.createElement("div", { className: "we-picker__empty" },
                React.createElement("span", { className: "we-picker__empty-title" },
                  weT("还没有可用的扩展模块")),
                React.createElement("span", { className: "we-picker__hint" },
                  weT("后续新增的功能会以模块形式收在这里，每个模块自带它的控件")),
              )
            : modules.map((mod) => React.createElement("div", {
                key: mod.id, className: "we-ext__module",
              },
                React.createElement("div", { className: "we-ext__module-head" },
                  React.createElement("span", { className: "we-ext__module-title" }, mod.title),
                  moduleResetButton(mod.resetGroup, onResetModule),
                ),
                mod.desc ? React.createElement("span", { className: "we-picker__hint" }, mod.desc) : null,
                mod.render ? mod.render(ctx) : null,
              )),
        ),
      ),
    );
  }

  // ── 「关于」页签：项目简介 / 仓库与 Star / 交流群二维码 / 贡献者致谢（压尾）──────
  // 这是**唯一不读面板状态**的页签：内容全是静态文案 + 两张内联二维码（数据在
  // src/about-assets.js，构建期随 prelude 内联）。但契约是**逐页签**的 ——
  // verify-scene-live 要求每个 render*Tab 首行从 ctx 解构（"要什么"写在签名处），
  // 所以这里显式写下空解构：别让后来人以为"这个页签不用取外界"就能绕过接缝。
  // 四段的**顺序**是用户的明确口径（致谢压尾），判据按首次出现下标比大小钉住。
  function renderAboutTab(ctx) {
    const { } = ctx;
    // star 数那一行（模块级：值 + 三态文案都在 client.js 的 starCountLabel 里；
    // 这里的"读"与 SliderRow 一类模块级助手同口径 —— 只读，不发请求）。
    const stars = starCountLabel();
    // 两张码的参数表：图（路由 URL）/ 图题 / 替代文本 / 一句话说明。渲染一次 map 两遍，
    // 免得两段几乎一样的 createElement 各自演化（改一处忘一处正是这类页面最容易烂的地方）。
    const qrCards = [
      {
        key: "qq",
        title: weT("🐧 QQ 群 · DSHWE | LLM 讨论群"),
        // 图本体是随包 PNG（lib/about/），这里只给路径 —— apiUrl 补 BASE 前缀。
        src: apiUrl(ABOUT_QR_QQ_PATH),
        alt: weT("QQ 群二维码"),
        hint: weT("手机 QQ 扫码加入 · 群里见 👋"),
      },
      {
        key: "douyin",
        title: weT("🎵 抖音群 · dsh 交流群"),
        src: apiUrl(ABOUT_QR_DOUYIN_PATH),
        alt: weT("抖音群二维码"),
        hint: weT("抖音扫码加入 · 群号 252729465001"),
      },
    ];
    // 贡献者致谢逐条列出（名字 / 做了什么）——「谢谢」要能落到具体的人身上，
    // 一句笼统的"感谢所有贡献者"没有信息量。
    const credits = [
      weT("🧩 oneincase —— 内置 WebWallGL 实时渲染引擎与 media-bridge 媒体中间件的作者：场景 / 网页壁纸的实时渲染，以及 Windows / macOS / Linux 三平台的原生媒体链路，都建立在它们之上"),
      weT("🛠️ YV3507 —— 提交量最大的贡献者：从早期场景渲染器起步，到静态帧系列修复、液态玻璃令牌体系、实时帧链路与多轮大型重构，几乎每个里程碑都有他"),
      weT("🎨 yuxilao —— scene-gl 的 Linux 实时渲染管线（WebGL2 官方 shader 驱动）、轮换交接与 GPU 帧回填"),
      weT("🍎 Jerry —— 在三平台原生支持落地之前，macOS 侧的适配与贡献路径由他维护"),
      weT("🌟 还有 SiriLee、libiwolve、0-007pro、jujubaoj646-star、xiahou001、wilianyichen、hecoococ、ShamSky88、Rekk0、Y1X1n 等贡献者，以及所有通过 issue 反馈与 PR 参与改进的朋友 —— 谢谢你们！"),
    ];
    return React.createElement(React.Fragment, null,
      // ── ① 项目简介 ──
      React.createElement("div", { className: "we-picker__section" },
        React.createElement("div", { className: "we-picker__section-head" },
          React.createElement("span", { className: "we-picker__section-label" }, weT("📖 项目简介")),
        ),
        React.createElement("div", { className: "we-about__lead" },
          React.createElement("div", { className: "we-about__lead-title" }, weT("🖼️ 壁纸引擎 · 让 DSH 的背后动起来")),
          React.createElement("p", { className: "we-about__p" },
            weT("把 Wallpaper Engine 的壁纸搬到 DSH 界面后面：视频直接播放，场景（Scene）与网页（Web）壁纸由内置的 WebWallGL 引擎实时渲染，再配上一整套液态玻璃界面改造 —— 你桌面上那张会动的画，现在就在对话背后放着。🎬✨")),
          React.createElement("p", { className: "we-about__p" },
            weT("壁纸全部来自你自己的机器（本机库 / WE 工程目录 / 手动上传），插件不联网也能用，更不会把它们传到任何地方。🔒")),
        ),
      ),
      // ── ② 仓库与 Star ──
      React.createElement("div", { className: "we-picker__section" },
        React.createElement("div", { className: "we-picker__section-head" },
          React.createElement("span", { className: "we-picker__section-label" }, weT("⭐ 开源与支持")),
        ),
        React.createElement("p", { className: "we-about__p" },
          weT("项目以 MIT 协议开源、完全免费。如果它让你的 DSH 好看了一点点，去仓库点一颗 ⭐ 就是最直接的鼓励～")),
        React.createElement("div", { className: "we-about__star-row" },
          React.createElement("a", {
            className: "we-picker__btn we-picker__btn--primary we-about__star",
            href: ABOUT_REPO_URL,
            target: "_blank",
            rel: "noopener noreferrer",
            title: weT("在浏览器里打开项目仓库"),
          }, weT("⭐ 去 GitHub 点亮 Star")),
          // 实时 star 数：宿主代取（带缓存，见 lib/routes/github-stars.js）。
          // 取不到时**整行不消失**、改说"暂时取不到" —— 数字是点缀，按钮才是主操作。
          stars
            ? React.createElement("span", {
                className: "we-about__stars",
                title: weT("来自 GitHub API 的实时数据（带缓存；拉不到时显示上一次取到的值）"),
              }, stars)
            : null,
        ),
        React.createElement("div", { className: "we-about__url-row" },
          React.createElement("span", { className: "we-picker__hint" }, weT("🔗 仓库地址（按钮打不开时可手动复制）：")),
          // 可选中、可整段复制的裸地址：桌面壳里外链能否唤起浏览器不由插件说了算，
          // 这条是给"点了没反应"的场景留的兜底（同字体集导出的"普通链接"口径）。
          React.createElement("code", { className: "we-about__url" }, ABOUT_REPO_URL),
        ),
        React.createElement("p", { className: "we-about__p" },
          weT("想要新功能、遇到问题，或者想看看接下来要做什么，都欢迎来仓库提 Issue / PR —— 一起把它做得更好 🧰")),
      ),
      // ── ③ 交流群（两张二维码）──
      React.createElement("div", { className: "we-picker__section" },
        React.createElement("div", { className: "we-picker__section-head" },
          React.createElement("span", { className: "we-picker__section-label" }, weT("💬 加入交流群")),
        ),
        React.createElement("p", { className: "we-about__p" },
          weT("卡住了、想吐槽、或者想第一时间拿到新版本，都欢迎来群里找我们 👋")),
        React.createElement("div", { className: "we-about__qr-row" },
          qrCards.map((c) => React.createElement("figure", { key: c.key, className: "we-about__qr" },
            React.createElement("figcaption", { className: "we-about__qr-title" }, c.title),
            React.createElement("img", {
              className: "we-about__qr-img",
              src: c.src,
              alt: c.alt,
              draggable: false,
            }),
            React.createElement("figcaption", { className: "we-about__qr-hint" }, c.hint),
          )),
        ),
      ),
      // ── ④ 贡献者致谢（**压尾**：用户口径——先讲清"这是什么、去哪支持、怎么找我们"，
      //    最后再把功劳簿摆出来。💌 那句收尾也并进这一段，页面结束在"谢谢"上。）──
      React.createElement("div", { className: "we-picker__section" },
        React.createElement("div", { className: "we-picker__section-head" },
          React.createElement("span", { className: "we-picker__section-label" }, weT("🙏 贡献者致谢")),
        ),
        React.createElement("p", { className: "we-about__p" }, weT("这个插件是许多人一起做出来的成果，谢谢他们：❤️")),
        React.createElement("ul", { className: "we-about__credits" },
          credits.map((line, i) => React.createElement("li", { key: "credit-" + i, className: "we-about__credit" }, line)),
        ),
        React.createElement("p", { className: "we-about__p" }, weT("也谢谢上游 Wallpaper Engine 生态与 DSH 官方插件的作者们 —— 站在你们的肩膀上。🙇")),
        React.createElement("p", { className: "we-about__p we-about__foot" },
          weT("💌 感谢每一位使用者 —— 换上你喜欢的那张壁纸，这个插件就没白写。")),
      ),
    );
  }


  // ── 页签级重置（issue #192 用户口径：「每个选项卡后面加重置，重置指定选项卡」）──────────
  // 压在**每个页签内容的最末尾**，由 client.js 的渲染点在 renderActiveTab() 之后统一挂 ——
  // 六处渲染器各挂一遍必然漏一个，挂一处才是结构性的。
  // 走两步确认：整页设置量不小（外观页就有 60 个键）且不可撤销 ⇒ 与模块级 ↺ 分档
  //（那是单模块、用户口径明确"无需确认"）。令牌按页签区分，因为 `armedConfirm` 是单值。
  function renderTabReset(ctx, tabId) {
    const { armedConfirm, onArmConfirm, onDisarmConfirm, onResetTab } = ctx;
    // 「关于」页签没有任何设置（纯静态文案）⇒ 不给它画一个点了没反应的按钮。
    if (tabId === "about") return null;
    const token = "tab:" + tabId;
    // ⚠️ 刻意**不用** `we-picker__section-label`：那是"设置分组卡"的类名，而本节的判据口径
    //（既有守卫按"末三张分组卡"取窗口）会被这一节顶掉 —— 3D 效果那一页就有三张分组卡，
    // 重置节排在它后面会挤走「背景」。它是**操作区**不是分组卡，用独立类名在语义上也更准。
    const cls = "we-picker__section-reset-label";
    return React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        React.createElement("span", { className: cls }, weT("重置本页")),
      ),
      React.createElement("span", { className: "we-picker__hint" },
        weT("把这一页的设置恢复为默认值；其他页签与导入的图片不受影响。")),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("button", {
          className: "we-picker__btn",
          type: "button",
          disabled: armedConfirm === token,
          onClick: () => onArmConfirm(token),
        }, weT("重置本页")),
      ),
      renderConfirmRow(armedConfirm, token,
        weT("确定要把这一页的设置恢复为默认吗？此操作不可撤销。"),
        () => onResetTab(tabId), onDisarmConfirm),
    );
  }

  // ── 全局重置节（issue #192，压在「系统」页签末尾）──────────────────────────────
  // 三档里的最高一档：**模块 < 页签 < 全局**。全局必须二次确认（不可撤销）。
  // 二次确认复用 client.js 既有的 `armConfirm` / `renderConfirmRow` 两步构件 ——
  // `selection.armedConfirm` 是单值 ⇒ 结构上同一时刻只有一个动作待确认。
  // ⚠️ 只重置**设置值**：导入的头像图 / 吉祥物立绘 / 字体集住各自的目录，删不删是另一件事
  //（文案必须把这一点说清，否则用户会以为"重置"连图一起删了）。
  function renderResetSection(ctx) {
    const { armedConfirm, onArmConfirm, onDisarmConfirm, onResetAll } = ctx;
    const token = "resetAll";
    return React.createElement("div", { className: "we-picker__section" },
      React.createElement("div", { className: "we-picker__section-head" },
        // 同 renderTabReset：操作区不用「设置分组卡」那个类名（它会被"末三张分组卡"那类
        // 位置口径的判据看见，挤掉真正的分组卡）。
        React.createElement("span", { className: "we-picker__section-reset-label" }, weT("重置")),
      ),
      React.createElement("span", { className: "we-picker__hint" },
        weT("把全部设置恢复为出厂默认值；导入的头像与吉祥物图片、字体集不受影响。此操作不可撤销。")),
      React.createElement("div", { className: "we-picker__row" },
        React.createElement("button", {
          className: "we-picker__btn we-picker__btn--danger",
          type: "button",
          disabled: armedConfirm === token,
          onClick: () => onArmConfirm(token),
        }, weT("全部重置")),
      ),
      renderConfirmRow(armedConfirm, token,
        weT("确定要将所有设置恢复为默认吗？此操作不可撤销。"),
        onResetAll, onDisarmConfirm),
    );
  }

export {
  renderWallpaperTab, renderAppearanceTab, renderAudioTab, renderMascotTab, renderEffectsTab, renderAdvancedTab,
  renderExtensionsTab, renderAboutTab, renderResetSection, renderTabReset,
};
