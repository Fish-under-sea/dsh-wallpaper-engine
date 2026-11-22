# Upgrading

> **中文**: [`../UPGRADING.md`](../UPGRADING.md)（与本文同源：改一处请同步另一处）


### Current Test Branch Requirements

The suite requires **Node.js >=22.12.0 and DSH 0.2 (including 0.2.0-rc.1/rc.2)** and no longer contains a bundled pet or Electron. DSH 0.1 is outside the supported range. **Version floors are governed by `engines` in `package.json`** (`engines.node` / `engines.dsh`).

Close the host, update the entire checkout, and rerun the [source installer](../../README.en.md#quick-start). Registry package-name commands cannot fetch unpublished changes. The npm channel only applies after all nine release packages have been published.

Disable the old built-in pet bundle before upgrading. The installer does not delete old profile dependencies or data. Remove `dsh-we-pet-builtin` explicitly through the target host's package manager. Install an official pet build with `petApi7340` and the public control APIs separately; restore old file patches from backups or reinstall the official package. Wallpaper remains usable without a pet.

Older upgrade steps are in [`CHANGELOG.md`](./CHANGELOG.md); installation and upgrade of the current version follow only the requirements above.

### The correct update order

1. **Bring the DSH kernel to the `engines.dsh` floor in `package.json` first** (currently the DSH 0.2 kernel, including 0.2.0-rc.1/rc.2): on the official desktop (DeepSeek Harness) check for updates via the top-bar version info, or grab the installer from [GitHub Releases](https://github.com/anywhere-labs/dsh-desktop/releases);
2. **Then update this plugin**: `dsh plugin --profile web add dsh-plugin-wallpaper-engine` (or click update in the plugin market);
3. **dsh-better-sidebar has no version requirement**: if installed, bringing it to the latest (`dsh plugin --profile web add dsh-better-sidebar@latest`) is still a good idea.

> 💡 Also update your **other DSH plugins at the same time**: older plugins may fail to load outright on
> the new kernel (an old dsh-better-sidebar was observed misbehaving due to API changes).

### If anything breaks after updating

Bringing the kernel to the `engines.dsh` floor and dsh-better-sidebar to the latest restores everything —
**no plugin rollback needed**.

### Update notice

The plugin shows a one-time in-app notice per release; missing it is harmless.

### What changes after the upgrade (frame cache / live rendering)

- **The frame cache is invalidated once**: cache keys are prefixed with a pipeline version (currently
  `LIVE_FRAME_KEY_VERSION = 'lf2'`; source of truth: `lib/media/frame-store.js`), and any change to the
  capture / live-render logic bumps it — after a bump nothing under `~/.dsh-wallpaper-engine/cache/frames/`
  hits any more, and each scene wallpaper is captured afresh. **This is expected, not a regression**; old
  files are not deleted automatically (clear `cache/frames/` by hand to reclaim the space). The same
  directory also holds the scene's embedded video (`sv1_*.mp4`) and packaged audio (`sa1_*`), each with its
  own prefix.
- **Live rendering needs WebGL2**: after upgrading, scene / web wallpapers render live through WebWallGL by
  default (「场景实时渲染」/「网页实时渲染」, on by default). Without WebGL2, or with a broken GPU driver, once
  the renderer page's first-frame budget runs out it **degrades silently** to the
  「embedded MP4 → live capture → custom frame → empty state」 chain (before the first frame the
  **author's preview** stands in and only a missing preview leaves it honestly blank — no black screen).
  (A **loose `scene.json` directory also renders live**: the renderer judges the form from
  `project.json`'s `file` suffix, so a whole-package `scene.pkg` is no longer required.)
- **Live rendering is on by default** (`sceneLive`) — nothing to do after upgrading.

### Compatibility verification

- The live-rendering chain has offline verification (`test/verify-scene-live.mjs` and more,
  `npm run verify`).
- **Which steps the guard chain contains is governed by `MANIFEST` in `test/run-guards.mjs`** (the
  `verify` / `verify:docs` / `smoke` entries in `package.json` are only sleeves pointing at that runner;
  `package.json`'s `scripts` are not the list). This file does not enumerate them.
- **The current version is whatever `package.json`'s `version` says (published versions: see the npm
  package page / GitHub Releases).**

### Settings persistence: moved to a host-side file (v0.4.0)

**Since v0.4.0 every setting (selected wallpaper, accent, transparency, layout, rotation, hidden list,
playback speed/flip, …) lives in a host-side file instead of browser localStorage.**

- **Where**: `~/.dsh-wallpaper-engine/config.json` (the same file that stores your upload directory).
- **Why**: localStorage is isolated per "origin + port", and **DSH Desktop picks a random port on every
  start** — so each launch looked like a brand-new store and every setting reverted to default. A host-side
  file is port-independent.
- **Benefits**: restarts, port changes, cleared browser data, a different browser or a private window no
  longer lose your settings.
- **Migration**: settings previously kept in localStorage are **migrated automatically on first start**.
- **Behaviour change**: several browsers on the same machine now **share one config** (they used to be
  separate); rolling back to an older version still reads the localStorage copy, so nothing is lost.
- **Writes**: debounced automatically; a corrupt file falls back to defaults and is **never overwritten**.
