/**
 * subpackage-shapes.mjs —— `packages/*` 里**两种包形态**的唯一真源（P1 upstream-fork 引入）。
 *
 * 为什么需要这张表：`packages/` 下现在有两种互不相同的包。
 *   ① 一般子包（`dsh-plugin-wallpaper-engine-<短名>`）：本仓自己写的，宿主半边 `inject` 主包服务、
 *      浏览器半边由 `scripts/build-client.mjs` 从 `src/` 编译而来，清单走 ADR-0014 S3.8 的
 *      逐字模板（含 `name = <主包名>-<目录名>` 与 `version = 主包 version`）。
 *   ② **upstream-fork**（`packages/pet`）：上游 `dsh-pet@0.3.7` 的受控派生副本 —— 固定派生身份
 *      `dsh-we-pet-builtin`、独立版本号、自带预构建产物 `lib/client.js`、且**不**消费主包服务面。
 *      它天然不满足 ① 的模板（名字不是 `<主包名>-pet`、版本不同号、清单要带来源登记、产物是
 *      "登记即可"而不是"每次重新编译"）。
 *
 * 纪律（这是这张表存在的全部理由）：
 *   · 形态判定**只**读本文件，不读清单里任何"自称"字段 —— 否则包只要给自己写个标记就能跳过判据。
 *   · 两种形态**各自都有**判据；把 ② 单独分出去是为了让 ① 的判据**一条都不放宽**
 *     （S3.1/S3.2/S3.5/S3.8 对 fonts/fx/parallax/pet-link 的逐字约束原样保留），
 *     而不是"遇到不认识的包就跳过"。
 *   · ② 的判据比 ① 更严的两处：身份与版本必须与**已核来源登记**逐字对上（防假冒身份 / 错版本）；
 *     产物里**禁止**出现主包说明符（② 的跨包面只有 HTTP capability 一条，不许偷偷 require 主包）。
 *
 * 已核来源（`.artifacts/rebuild-20261018/vendor-verification.md` t24 勘误值）：
 *   `.artifacts/dsh-pet-0.3.7.tgz` = 62,494,301 B / 308 条目 /
 *   sha256 `4a8cefce38e66f1e9371a19080ee8d9d4bf8a31ace3b39ca05427d730e756434`。
 */

/** 上游来源（已核）：路径相对仓库根。任何 fork 的来源登记都必须引用这一份。 */
export const UPSTREAM_SOURCES = Object.freeze({
  'dsh-pet@0.3.7': Object.freeze({
    package: 'dsh-pet',
    version: '0.3.7',
    tgz: '.artifacts/dsh-pet-0.3.7.tgz',
    bytes: 62494301,
    entries: 308,
    sha256: '4a8cefce38e66f1e9371a19080ee8d9d4bf8a31ace3b39ca05427d730e756434',
    license: 'MIT',
    homepage: 'https://github.com/PC2005-cloud/dsh-pet',
  }),
});

/**
 * upstream-fork 包登记表（**形态真源**）。键 = `packages/<dir>`（根相对 POSIX）。
 *
 * 字段：
 *   · `dir`            包目录（根相对）
 *   · `name`           固定派生身份（清单 `name` 必须逐字相等 —— 改名 = 换产品身份，不是重构）
 *   · `rowId`          主 patch 里认领它的行 id（`wallpaper-engine-<目录名>`，ADR-0014 S4.1/S4.3）
 *   · `source`         `UPSTREAM_SOURCES` 的键（来源必须已核，不许写"凭据待补"）
 *   · `manifestExtraKeys` 该形态清单**允许**出现的模板外顶层键（白名单，逐字；不在表里的判红）
 *   · `clientArtifact` 浏览器半边产物落点（根相对；与 `exports['./client'].default` 必须逐字对上）
 *   · `prebuilt`       产物是"上游预构建 + 派生登记"，`scripts/build-client.mjs` 只校验来源哈希、不重编译
 *   · `hostServiceConsumer` 是否消费主包服务面（fork = false ⇒ 守卫**反向**要求它不出现）
 *   · `resources`      该包必须自带的资源面（名字前缀 → 期望数量），供资源就绪判据复算
 */
export const UPSTREAM_FORKS = Object.freeze([
  // ── 当前为空：内置桌宠副本已解耦（2026-10-20）────────────────────────────────
  // `packages/pet`（`dsh-we-pet-builtin`）与它的 `wallpaper-engine-pet` 行已从本包移除：
  // 它把 `electron`（optional）带进安装树，而 electron 42+ 缺 `dist/` 时会在
  // `require('electron')` 里**同步**下载约 140MB 二进制 ⇒ 宿主启动被堵到 60 秒超时，
  // 整个 profile 起不来。桌宠本体的重新接入等上游 dsh-pet 提供联动接口后由 pet-link 对接
  // **外部** provider；届时在这里重新登记形态，本文件其余判据（upstreamForkViolations /
  // 键序 / peer 面 / 资源面）按原口径复用，一行都不用放宽。
]);

const BY_DIR = new Map(UPSTREAM_FORKS.map((f) => [f.dir, f]));
const BY_NAME = new Map(UPSTREAM_FORKS.map((f) => [f.name, f]));

/** `dir`（根相对 POSIX）对应的 fork 登记；不是 fork ⇒ null。 */
export function upstreamForkOf(dir) {
  return BY_DIR.get(String(dir == null ? '' : dir).replace(/\\/g, '/')) || null;
}

/** 派生身份 → fork 登记；不是 fork 的包名 ⇒ null。 */
export function upstreamForkByName(name) {
  return BY_NAME.get(String(name == null ? '' : name)) || null;
}

/** 该目录是不是 upstream-fork 形态（其余一律按一般子包判据判）。 */
export function isUpstreamFork(dir) {
  return upstreamForkOf(dir) !== null;
}

/** 该包名是不是 upstream-fork 形态。 */
export function isUpstreamForkName(name) {
  return upstreamForkByName(name) !== null;
}

/** 取登记引用的已核来源；引用不存在的来源 ⇒ null（判据点名，不静默）。 */
export function sourceOf(fork) {
  if (!fork || typeof fork.source !== 'string') return null;
  return UPSTREAM_SOURCES[fork.source] || null;
}

/**
 * 身份 / 来源 / 形态登记的三向交叉判据（纯函数；生产路径与负对照共用）。
 *
 * 判的是**只有 fork 形态才有的那几件事实**，一般子包判据一条都不复制过来：
 *   1. 清单 `name` === 登记的固定派生身份（防假冒身份 / 防改名漂移）
 *   2. `_upstream` 来源登记存在且逐字引用已核来源（package / version / sha256 / bytes / entries）
 *   3. 清单 `version` === 已核来源 version（派生副本不自己跳版本号；跳了就是换了来源没登记）
 *   4. `exports['./client'].default` 归一化后 === 登记的 `clientArtifact`
 *   5. `dsh.bundle.patch` === `./cordis.patch.yml`（bundle 行要能被宿主层栈读到）
 *   6. 模板外顶层键 ⊆ 登记白名单（未登记的键判红：那等于偷偷扩形态）
 *
 * @param {string} dir 包目录（根相对）
 * @param {object} manifest 已 parse 的清单
 * @returns {string[]} 违反项（空 = 通过）
 */
export function upstreamForkViolations(dir, manifest) {
  const fork = upstreamForkOf(dir);
  if (!fork) return [];
  const out = [];
  const add = (msg) => out.push(dir + '：S12 ' + msg);
  const m = manifest && typeof manifest === 'object' ? manifest : {};

  if (m.name !== fork.name) {
    add('name=' + JSON.stringify(m.name) + ' ≠ 登记的固定派生身份 ' + JSON.stringify(fork.name)
      + '（upstream-fork 的身份是产品身份，改名不是重构）');
  }
  const src = sourceOf(fork);
  const reg = m._upstream && typeof m._upstream === 'object' ? m._upstream : null;
  if (!src) {
    add('登记引用的来源 ' + JSON.stringify(fork.source) + ' 不在 UPSTREAM_SOURCES 里（来源必须已核）');
  } else if (!reg) {
    add('缺 _upstream 来源登记（fork 形态必须能回答"派生自哪一份已核字节"）');
  } else {
    for (const k of ['package', 'version', 'sha256']) {
      if (reg[k] !== src[k]) {
        add('_upstream.' + k + '=' + JSON.stringify(reg[k]) + ' ≠ 已核来源 ' + JSON.stringify(src[k]));
      }
    }
    for (const k of ['bytes', 'entries']) {
      if (reg[k] !== src[k]) add('_upstream.' + k + '=' + JSON.stringify(reg[k]) + ' ≠ 已核来源 ' + String(src[k]));
    }
  }
  if (src && m.version !== src.version) {
    add('version=' + JSON.stringify(m.version) + ' ≠ 已核来源 version ' + JSON.stringify(src.version)
      + '（fork 不自己跳版本号；要跳就先登记新的已核来源）');
  }
  const exp = (m.exports && typeof m.exports === 'object' && !Array.isArray(m.exports)) ? m.exports : {};
  const client = exp['./client'];
  const clientDefault = client && typeof client === 'object' ? client.default : client;
  const normalized = typeof clientDefault === 'string' ? clientDefault.replace(/^\.\//, '') : null;
  const wantRel = fork.clientArtifact.slice(fork.dir.length + 1);
  if (normalized !== wantRel) {
    add("exports['./client'] 归一化落点=" + JSON.stringify(normalized) + ' ≠ ' + JSON.stringify(wantRel)
      + '（fork 允许条件对象 { types, default }，但 default 落点必须逐字对上登记）');
  }
  const patchTarget = m.dsh && m.dsh.bundle && m.dsh.bundle.patch;
  if (patchTarget !== './cordis.patch.yml') {
    add('dsh.bundle.patch=' + JSON.stringify(patchTarget) + ' ≠ "./cordis.patch.yml"');
  }
  const allowed = new Set(fork.manifestExtraKeys || []);
  for (const k of Object.keys(m)) {
    if (!FORK_TEMPLATE_KEYS.includes(k) && !allowed.has(k)) {
      add('出现未登记的模板外顶层键 ' + JSON.stringify(k)
        + '（fork 形态的额外键必须在 test/tools/subpackage-shapes.mjs 的 manifestExtraKeys 里登记）');
    }
  }
  // 7. 依赖面 ⇄ 登记表逐字相等（三族：peer / dependencies / optionalDependencies）。
  //    判据是**双向**的：多声明 = 偷偷扩依赖面；少声明 = 运行时会缺模块。两边都点名。
  for (const [field, want] of [['peerDependencies', fork.peerDependencies],
    ['dependencies', fork.dependencies], ['optionalDependencies', fork.optionalDependencies]]) {
    const got = (m[field] && typeof m[field] === 'object' && !Array.isArray(m[field])) ? m[field] : {};
    const wantObj = want || {};
    for (const [n, range] of Object.entries(wantObj)) {
      if (!(n in got)) add(field + ' 少了登记过的 ' + n + '（运行时/浏览器半边需要它，缺了就在用户机器上炸）');
      else if (got[n] !== range) add(field + '.' + n + '=' + JSON.stringify(got[n]) + ' ≠ 登记范围 ' + JSON.stringify(range));
    }
    for (const n of Object.keys(got)) {
      if (!(n in wantObj)) add(field + ' 里多出未登记的 ' + n + '（依赖面扩充要在登记表里写明理由）');
    }
  }
  return out;
}

/**
 * fork 形态的顶层键规范序（与 ADR-0014 S3.8 的 12 键**同名同序**；fork 额外键只许出现在
 * `_derived` / `_upstream` 这两个文档位，或 `files` 之后的**已登记**数据位 —— 顺序由下面的
 * `FORK_KEY_ORDER` 单独钉死，避免"多一个键就随便塞"）。
 */
export const FORK_TEMPLATE_KEYS = Object.freeze([
  'name', 'version', 'description', 'icon', 'type', 'main', 'exports', 'dsh', 'files',
  'peerDependencies', 'peerDependenciesMeta', 'license',
]);

/** fork 形态的键序：模板 12 键的相对序不许乱，额外键按此序落在两组位置之一。 */
export const FORK_KEY_ORDER = Object.freeze([
  'name', 'version', 'description', 'icon', 'type', 'main', 'exports', 'dsh', 'files',
  'peerDependencies', 'peerDependenciesMeta', 'license',
  // 文档位（来源 / 派生说明）：允许出现在清单**尾部**块，按此序。
  '_derived', '_upstream', '_comment',
  // 数据位：npm 清单字段，同样只许在文档位之后。
  'bin', 'engines', 'dependencies', 'optionalDependencies', 'devDependencies',
  'scripts', 'keywords', 'homepage', 'repository', 'bugs',
]);

/** fork 清单的键序判据（纯函数）。额外键必须在 FORK_KEY_ORDER 里；相对序不许逆序。 */
export function upstreamForkKeyOrderViolations(dir, manifest) {
  if (!isUpstreamFork(dir)) return [];
  const out = [];
  const keys = Object.keys(manifest && typeof manifest === 'object' ? manifest : {});
  for (const k of keys) {
    if (!FORK_KEY_ORDER.includes(k)) out.push(dir + '：S12 顶层键 ' + JSON.stringify(k) + ' 不在 fork 键序表里');
  }
  for (let i = 1; i < keys.length; i++) {
    const a = FORK_KEY_ORDER.indexOf(keys[i - 1]);
    const b = FORK_KEY_ORDER.indexOf(keys[i]);
    if (a < 0 || b < 0) continue;
    if (b < a) {
      out.push(dir + '：S12 顶层键序逆序：' + JSON.stringify(keys[i]) + ' 排在 '
        + JSON.stringify(keys[i - 1]) + ' 之后');
    }
  }
  return out;
}
