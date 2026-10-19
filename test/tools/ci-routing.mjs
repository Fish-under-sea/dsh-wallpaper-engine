#!/usr/bin/env node
/**
 * ci-routing.mjs — **CI 变更分类 + 文档快通道**的判据库（纯函数：不读盘、不写盘、无副作用）。
 *
 * ## 守的是什么实害
 * 以前 `.github/workflows/verify.yml` 对**每一次** push / PR 都跑同一套重活：装依赖、静态棘轮、
 * 构建、88 步结构守卫、media-bridge 端到端、冒烟 —— 改一个 README 错别字也要在 Windows +
 * Ubuntu 两个平台上把整条链走一遍。真正的代价不是慢，而是**排队**：文档改动与代码改动争同一
 * 份 runner，文档作者等的是与自己无关的门。
 *
 * 于是要"只改文档 ⇒ 只跑文档检查"。这条捷径的**实害**在分类判据上：
 *   · 白名单写宽了（一句 `assets/**`）—— 把运行时素材或代码当成文档，门禁静默少跑；
 *   · 只看最后一笔提交（`git diff HEAD^`）—— 一个 PR 里前几笔改代码、最后一笔改 README，
 *     按最后一笔分类 ⇒ 代码改动不受任何运行时判据约束；
 *   · 删除 / 重命名被当成"修改"—— 删掉 `lib/index.js` 在差异里是 `D`，分类成文档 ⇒ 放行；
 *   · 分类失败时默认走文档 —— 判据一崩，门禁就变成"什么都不做"。
 * 本文件把"哪些改动算纯文档"变成机器事实，且每条判断都 **fail-closed**（不确定 ⇒ full）。
 *
 * ## 三条硬约束（与 `docs/wip/CI-GATE-SIMPLIFICATION-PLAN.md:40` 一致）
 *   ① 文档白名单**小且明确**，不用 `assets/**` 代表文档；
 *   ② `docs/TOKEN-CONTRACT.md`、`docs/ROUTE-INDEX.md` 这类**机器派生契约不豁免**（改了它们
 *      等于改了判据本身，判据自己给自己免检就是假牙）；
 *   ③ 删除 / 重命名 / 未知状态 / 差异过大 / 取不到差异，一律 **full** 或**阻断**。
 *
 * ## 为什么分类与文档检查共用一个库
 * 两件事共用同一份"变更条目"与同一份白名单：分开写就会长出两套白名单，改一处漏一处。
 * CLI 在 `scripts/ci-routing.mjs`（薄：`check` 分类 / `docs` 文档检查），判据全在这里。
 */

/** 三种验证路径（CI 的 `ci/result` 只认这三个值）。 */
export const MODE_DOCS = 'docs';
export const MODE_DOCS_ASSETS = 'docs-assets';
export const MODE_FULL = 'full';
export const MODES = [MODE_DOCS, MODE_DOCS_ASSETS, MODE_FULL];

/** 差异条目超过这个数就直接 full（防"大范围改动被分类成文档"）。 */
export const DIFF_FLOOR = 300;

/**
 * 根目录里明确属于"纯文档"的文件（白名单必须**小且明确**：逐个列，不用 `*.md` 通配）。
 *
 * 三个 README 都要列：它们是同一个对外门面的三个语种/难度版本，漏一个就等于
 * "改那个版本的错别字要跑双平台全链" —— 与漏判同样都是错的判据。
 */
export const DOC_ROOT_FILES = ['README.md', 'README.en.md', 'README.beginner.md', 'CONTRIBUTING.md'];

/** 文档目录（普通 Markdown；机器派生契约见 `GENERATED_CONTRACTS`）。 */
export const DOC_DIRS = ['docs/'];

/**
 * 文档展示素材目录（图片与排版源稿；运行期素材**不**在此列）。
 *
 * ⚠️ 目录前缀**不是**白名单（D10）：`assets/readme/**` 里还躺着字体、许可正文、
 * 以及将来可能出现的任何二进制。前缀放行会把它们当成"文档" ⇒ 改字体不跑构建。
 * 因此这里只认**两类**：图片后缀（`ASSET_EXT`）与逐个列出的排版源稿（`ASSET_TEXT_FILES`）。
 * "随 npm 包发布" ≠ "运行期资源"，判据按**用途**分类，不按打包清单分类。
 */
export const ASSET_DIRS = ['assets/readme/'];

/** `assets/readme/` 里逐个人工确认过的**文本**源稿（可做 UTF-8 / 结构检查）。 */
export const ASSET_TEXT_FILES = [
  'assets/readme/SOURCES.md',
  'assets/readme/metadata.json',
  'assets/readme/hero.html',
  'assets/readme/creative-corner-source.json',
];

/**
 * 机器派生契约：内容由工具生成、且被判据当作事实读。
 * 改了它们等于改了判据本身 ⇒ 不享受文档豁免（否则"改判据"自称"改文档"）。
 */
export const GENERATED_CONTRACTS = [
  'docs/TOKEN-CONTRACT.md', 'docs/ROUTE-INDEX.md', 'docs/GUARD-MAP.md',
];

/** 一律完整验证的路径前缀 / 文件（包清单、锁文件、CI 接线本身）。 */
export const FULL_ALWAYS = ['package.json', 'package-lock.json'];
export const FULL_ALWAYS_DIRS = ['.github/'];

/** 文档快通道要核对引用的"素材"后缀。 */
export const ASSET_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/** 链接 / 引用里**不需要**在磁盘上核对的前缀（外链、站内锚点、绝对路径、data URI）。 */
const SKIP_LINK = /^(?:https?:|mailto:|tel:|data:|#|\/)/i;

const norm = (p) => String(p == null ? '' : p).replace(/\\/g, '/').replace(/^\.\//, '');
const startsIn = (p, dirs) => dirs.some((d) => p.startsWith(d));

/** 普通 Markdown 文档（白名单内）。 */
export function isDocFile(p) {
  const path = norm(p);
  if (!/\.md$/i.test(path)) return false;
  if (DOC_ROOT_FILES.includes(path)) return true;
  return startsIn(path, DOC_DIRS);
}

/** 文档展示素材（白名单内：`assets/readme/**` 里的**图片**与**逐个列出的文本源稿**）。 */
export function isDocAsset(p) {
  const path = norm(p);
  if (!startsIn(path, ASSET_DIRS)) return false;
  return ASSET_EXT.test(path) || ASSET_TEXT_FILES.includes(path);
}

/** 图片类素材（二进制：只查存在与大小，绝不按 UTF-8 扫文本）。 */
export function isImageAsset(p) {
  return ASSET_EXT.test(norm(p));
}

/**
 * 可以按文本检查的后缀。
 *
 * 判据：**先看类型，再看字节**。图片后缀直接算二进制（PNG 不一定含 NUL，靠"含不含 NUL"猜类型会漏）；
 * 已知文本后缀**永远**按文本查（`.md` / `.json` 里塞了 NUL 不能因此免检，反而要报 `nul`）。
 * 只有未知后缀才退回字节嗅探（`looksBinary`）。
 */
export const TEXT_EXT = /\.(?:md|markdown|json|txt|html?|ya?ml|css|js|mjs|cjs|ts|tsx)$/i;

/** 未知后缀的兜底嗅探：NUL 或解码替换字符（非法 UTF-8 的痕迹）⇒ 当二进制。 */
export function looksBinary(text) {
  return /[\u0000\uFFFD]/.test(String(text == null ? '' : text));
}

/** 该路径是否按文本检查（`text` / `binary`）。 */
export function textKind(p, text) {
  const path = norm(p);
  if (isImageAsset(path)) return 'binary';
  if (TEXT_EXT.test(path)) return 'text';
  return looksBinary(text) ? 'binary' : 'text';
}

/** 机器派生契约（命中 ⇒ full）。 */
export function isGeneratedContract(p) {
  return GENERATED_CONTRACTS.includes(norm(p));
}

/** 包清单 / 锁文件 / CI 接线（命中 ⇒ full）。 */
export function isPinnedPath(p) {
  const path = norm(p);
  return FULL_ALWAYS.includes(path) || startsIn(path, FULL_ALWAYS_DIRS);
}

/**
 * 把 `git diff --name-status -z` 的原始输出解析成条目 `[{ status, path, oldPath }]`。
 *
 * `-z` 形态：`R100\0old\0new\0M\0path\0…`（重命名 / 复制占**三段**）。不用 `-z` 的话，
 * 路径里的空格或引号会被 git 加引号转义 —— 那是"看起来解析对了，其实漏了带空格的路径"。
 */
export function parseNameStatus(raw) {
  const parts = String(raw == null ? '' : raw).split('\0').filter((s) => s !== '');
  const out = [];
  let i = 0;
  while (i < parts.length) {
    const status = String(parts[i]).trim().charAt(0).toUpperCase();
    if (status === 'R' || status === 'C') {
      const oldPath = parts[i + 1];
      const path = parts[i + 2];
      if (oldPath == null || path == null) break;
      out.push({ status, path: norm(path), oldPath: norm(oldPath) });
      i += 3;
      continue;
    }
    const path = parts[i + 1];
    if (path == null) break;
    out.push({ status, path: norm(path), oldPath: '' });
    i += 2;
  }
  return out;
}

/**
 * 把 `git diff --raw -z` 的原始输出解析成条目，**连模式位一起**：
 * `:<oldMode> <newMode> <oldSha> <newSha> <status>\0<path>\0…`（重命名 / 复制占**两个路径**）。
 *
 * 为什么非要 `--raw`：`--name-status` 只说"改了什么"，不说"改成了什么类型的文件"。
 * 一个 `docs/sneaky.md` 若是**符号链接**（mode `120000`），`--name-status` 里与普通 Markdown
 * 毫无区别 —— 而符号链接的内容指向仓库外，把它当文档就是让门禁去看一个它控制不了的目标。
 */
export function parseRawDiff(raw) {
  const parts = String(raw == null ? '' : raw).split('\0');
  const out = [];
  let i = 0;
  while (i < parts.length) {
    const head = parts[i];
    if (head == null || head === '') { i += 1; continue; }
    const m = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Za-z])\d*$/.exec(head.trim());
    if (!m) { i += 1; continue; }
    const status = m[5].toUpperCase();
    if (status === 'R' || status === 'C') {
      const oldPath = parts[i + 1];
      const path = parts[i + 2];
      if (oldPath == null || path == null) break;
      out.push({ status, path: norm(path), oldPath: norm(oldPath), oldMode: m[1], newMode: m[2] });
      i += 3;
      continue;
    }
    const path = parts[i + 1];
    if (path == null) break;
    out.push({ status, path: norm(path), oldPath: '', oldMode: m[1], newMode: m[2] });
    i += 2;
  }
  return out;
}

/** 符号链接的模式位（git 只认这一个值）。 */
export const SYMLINK_MODE = '120000';

/**
 * 分类本体（纯函数）：变更条目 → `{ mode, reasons, files }`。
 *
 * 顺序即 fail-closed 的顺序：**任何一条不放心就 full**，绝不因为"看起来主要是文档"而放行。
 */
export function classify(entries) {
  const list = (Array.isArray(entries) ? entries : []).map((e) => ({
    status: String((e && e.status) || '').trim().charAt(0).toUpperCase(),
    path: norm(e && e.path),
    oldPath: norm(e && e.oldPath),
    oldMode: String((e && e.oldMode) || '').trim(),
    newMode: String((e && e.newMode) || '').trim(),
  }));
  const files = list.map((e) => e.path);
  const reasons = [];

  // ① 取不到差异 ⇒ 阻断（不是"按文档放行"）。
  if (!list.length) {
    return { mode: MODE_FULL, reasons: ['差异为空：取不到完整差异时不给文档豁免（fail-closed）'], files };
  }
  // ② 差异过大：分类的收益（省一次重活）远小于"漏判一个代码文件"的代价。
  if (list.length > DIFF_FLOOR) {
    reasons.push('差异 ' + list.length + ' 个文件 > 地板 ' + DIFF_FLOOR + ' 个：大范围改动一律完整验证');
  }
  // ③ 删除 / 重命名 / 未知状态：路径边界不可信（删掉一个 lib 文件也是"改文档"吗？）。
  const risky = list.filter((e) => e.status !== 'A' && e.status !== 'M');
  if (risky.length) {
    const kinds = [...new Set(risky.map((e) => e.status))].join('');
    reasons.push('含非新增/修改状态（' + kinds + '：删除 / 重命名 / 复制 / 未知 ⇒ 一律完整验证）'
      + '：' + risky.slice(0, 5).map((e) => e.path).join(' '));
  }
  // ④ 符号链接：名字像文档，内容是"另一个路径"。名字可信、指向不可信 ⇒ 不给豁免。
  const links = list.filter((e) => e.newMode === SYMLINK_MODE || e.oldMode === SYMLINK_MODE);
  if (links.length) {
    reasons.push('含符号链接（mode ' + SYMLINK_MODE + '）：' + links.slice(0, 5).map((e) => e.path).join(' '));
  }
  // ⑤ 机器派生契约：判据给自己免检就是假牙。
  const contracts = list.filter((e) => isGeneratedContract(e.path));
  if (contracts.length) reasons.push('改动机器派生契约（判据的事实来源）：' + contracts.map((e) => e.path).join(' '));
  // ⑥ 包清单 / 锁文件 / CI 接线：改了它们就改变了"门禁跑什么"这件事本身。
  const pinned = list.filter((e) => isPinnedPath(e.path));
  if (pinned.length) reasons.push('改动包清单 / 锁文件 / CI 接线：' + pinned.slice(0, 5).map((e) => e.path).join(' '));
  // ⑦ 白名单外的一切。
  const outside = list.filter((e) => !isDocFile(e.path) && !isDocAsset(e.path));
  if (outside.length) {
    const shown = outside.slice(0, 8).map((e) => e.path).join(' ');
    reasons.push('白名单外的路径（' + outside.length + ' 个）：' + shown + (outside.length > 8 ? ' …' : ''));
  }

  if (reasons.length) return { mode: MODE_FULL, reasons, files };

  const hasAsset = list.some((e) => isDocAsset(e.path));
  const hasDoc = list.some((e) => isDocFile(e.path));
  return {
    mode: hasAsset ? MODE_DOCS_ASSETS : MODE_DOCS,
    reasons: ['全部 ' + list.length + ' 个改动都在文档白名单内（'
      + (hasAsset ? '含展示素材 ⇒ 追加图片尺寸与引用检查' : '仅普通 Markdown')
      + '）· 文档 ' + list.filter((e) => isDocFile(e.path)).length + ' / 素材 '
      + list.filter((e) => isDocAsset(e.path)).length + (hasDoc ? '' : '（无 .md）')],
    files,
  };
}

/** 从 Markdown / HTML 里抽"要核对的本地相对引用"（`[x](p)`、`![x](p)`、`src="p"`、`href="p"`）。 */
export function docReferences(text) {
  const src = String(text == null ? '' : text);
  const out = [];
  const md = /!?\[[^\]]*\]\(\s*([^)\s]+)/g;
  let m = md.exec(src);
  while (m !== null) {
    out.push({ spec: m[1], at: m.index });
    m = md.exec(src);
  }
  const html = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
  m = html.exec(src);
  while (m !== null) {
    out.push({ spec: m[1], at: m.index });
    m = html.exec(src);
  }
  return out.filter((r) => !SKIP_LINK.test(r.spec)).map((r) => r.spec.split('#')[0].split('?')[0]).filter(Boolean);
}

/**
 * 冲突标记行（合入没解决完的 diff 残骸）。
 *
 * 只认**两侧**的 `<<<<<<<` / `>>>>>>>`：`=======` 在 Markdown 里是 setext 标题的下划线
 * （`标题\n=======`），把它当冲突标记会误伤正常文档 —— 与 `.github/workflows/verify.yml`
 * 里那条 `git grep` 判据保持同一条口径，两处不许各写一套。
 */
export function conflictMarkers(text) {
  const lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  lines.forEach((line, i) => {
    if (/^(?:<<<<<<< |>>>>>>> )/.test(line)) out.push({ line: i + 1, text: line.slice(0, 40) });
  });
  return out;
}

/** 尾随空白行（Markdown 的行尾双空格是换行语义 ⇒ 由调用方决定是否扫 .md）。 */
export function trailingWhitespace(text) {
  const lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  lines.forEach((line, i) => {
    if (/[ \t]+$/.test(line)) out.push({ line: i + 1 });
  });
  return out;
}

/** 仓库相对路径的所在目录（`docs/a/b.md` → `docs/a`；根目录文件 → `''`）。 */
export function dirOf(p) {
  const path = norm(p);
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
}

/** 每条路径**必须真跑过并成功**的作业（`changes` 是分类本身，三条路径都要它）。 */
export const REQUIRED_JOBS = {
  [MODE_DOCS]: ['changes', 'docs'],
  [MODE_DOCS_ASSETS]: ['changes', 'docs'],
  [MODE_FULL]: ['changes', 'full'],
};

/** 各作业的中文职责名（理由文字用，避免把 `docs` 说成"文档检查"）。 */
const JOB_LABEL = {
  changes: '变更分类（changes）',
  docs: '文档快通道（docs）',
  full: '完整验证（full）',
};

/**
 * `ci/result` 汇总判据（纯函数）：`{ mode, jobs }` → `{ ok, reasons }`。
 *
 * 这是整条 CI 里**唯一**该被分支保护要求的那颗勾，所以它的失败方式必须是最严的那种：
 * 只有"这次路径要求的作业**真的跑过并 success**"才放行，其余一律不放行 ——
 * 失败、取消、缺失、**意外跳过**、以及 `mode` 为空/未登记（outputs 没接上）都不行。
 *
 * 为什么"跳过"也不能放行：`if:` 写错一个表达式，作业就静默不跑；而 `skipped` 在
 * 分支保护里和 success 一样是绿的。把"没跑"当成"过了"，正是这套分流最贵的错法。
 * 反过来，**按设计该跳过**的那条腿（docs 路径下的 full）必须放行 —— 判据认的是
 * `REQUIRED_JOBS[mode]` 这张表，而不是"所有作业都 success"。
 */
export function judgeResult(input) {
  const src = input || {};
  const mode = String(src.mode || '').trim();
  const jobs = (src.jobs && typeof src.jobs === 'object') ? src.jobs : {};
  const reasons = [];
  const conclusion = (name) => String(jobs[name] == null ? '' : jobs[name]).trim().toLowerCase();

  if (!MODES.includes(mode)) {
    reasons.push('分类模式未登记（mode=' + (mode || '空') + '）：outputs 没接上或分类器异常，不能默认放行');
    return { ok: false, reasons };
  }

  for (const name of REQUIRED_JOBS[mode]) {
    const got = conclusion(name);
    const label = JOB_LABEL[name] || name;
    if (!got) { reasons.push('必需作业结果缺失：' + label + '（没跑到 / 名字写错 / 汇总没拿到）'); continue; }
    if (got === 'success') continue;
    if (got === 'skipped') { reasons.push('必需作业被跳过（跳过不等于通过）：' + label); continue; }
    reasons.push('必需作业未成功（' + got + '）：' + label);
  }

  // 非必需的那条腿按设计应是 skipped；若它其实跑起来并失败/取消，说明状态自相矛盾，同样不放行。
  for (const name of Object.keys(jobs)) {
    if (REQUIRED_JOBS[mode].includes(name)) continue;
    const got = conclusion(name);
    if (got === 'failure' || got === 'cancelled' || got === 'timed_out') {
      reasons.push('非必需作业实际执行但未成功（' + got + '）：' + (JOB_LABEL[name] || name));
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * 文档快通道判据（纯函数）：`{ entries, read, exists, sizeOf }` → `{ findings, counts }`。
 *
 * 三个探针都**注入**（不读盘），于是负对照可以喂合成输入证明它真的有牙。
 * `findings` 非空 ⇒ 文档检查失败（快通道不是"跑跑看"，它有硬判据）。
 *
 * 两条容易写错的地方，都在这里钉住：
 *   · **引用按文档所在目录解析**（`exists(spec, baseDir)`）：`docs/README.md` 里的
 *     `[x](CHANGELOG.md)` 指的是 `docs/CHANGELOG.md`，不是仓库根的 `CHANGELOG.md`。
 *     按仓库根解析会让每一份子目录文档都"引用缺失" —— 误报多了，真报就没人看了。
 *   · **二进制不按 UTF-8 扫**：PNG 解成字符串必然出现替换字符与"尾随空白"，
 *     那是解码噪声不是缺陷。图片只看存在与大小；`.md` / `.json` 这类文本后缀
 *     **不因含 NUL 而免检**（含 NUL 本身就是 `nul` 发现）。
 */
export function auditDocs(input) {
  const src = input || {};
  const entries = Array.isArray(src.entries) ? src.entries : [];
  const read = typeof src.read === 'function' ? src.read : () => null;
  const exists = typeof src.exists === 'function' ? src.exists : () => false;
  const sizeOf = typeof src.sizeOf === 'function' ? src.sizeOf : () => 0;
  const findings = [];
  const counts = { files: 0, refs: 0, skippedRefs: 0, missingRefs: 0, binarySkipped: 0 };
  const push = (file, kind, detail) => findings.push({ file, kind, detail });

  for (const entry of entries) {
    const path = norm(entry && entry.path);
    if (!path) continue;
    // 图片类素材：只查存在与大小（下面的素材段落），文本检查一律不做。
    if (isImageAsset(path)) continue;
    // 只查**还在盘上**的那一侧：删除件由分类层判 full，这里没有可读内容 ⇒ 不重复判。
    const text = read(path);
    if (text == null) continue;
    if (textKind(path, text) === 'binary') { counts.binarySkipped += 1; continue; }
    counts.files += 1;
    const isMd = /\.md$/i.test(path);
    const baseDir = dirOf(path);

    if (String(text).includes('\u0000')) {
      push(path, 'nul', '文本文件里有 NUL 字节（不是可读文本；不接受"含 NUL 就跳过检查"）');
    }
    for (const marker of conflictMarkers(text)) {
      push(path, 'conflict', '第 ' + marker.line + ' 行有冲突标记：' + marker.text.trim());
    }
    if (!isMd) {
      for (const ws of trailingWhitespace(text)) push(path, 'trailing-ws', '第 ' + ws.line + ' 行尾随空白');
    }
    if (path.endsWith('.json')) {
      try {
        JSON.parse(text);
      } catch (err) {
        push(path, 'json', '不是合法 JSON：' + String(err && err.message ? err.message : err));
      }
    }

    for (const spec of docReferences(text)) {
      counts.refs += 1;
      if (SKIP_LINK.test(spec)) { counts.skippedRefs += 1; continue; }
      if (exists(spec, baseDir)) continue;
      counts.missingRefs += 1;
      push(path, 'missing-ref', '引用了不存在的相对路径：' + spec
        + (baseDir ? '（相对 ' + baseDir + '/ 解析）' : '（相对仓库根解析）'));
    }
  }

  // 素材模式追加：白名单里的图片必须**非空**（0 字节的 PNG 在 README 上就是裂图）。
  const assetMode = entries.some((e) => isDocAsset(norm(e && e.path)));
  if (assetMode) {
    for (const entry of entries) {
      const path = norm(entry && entry.path);
      if (!isImageAsset(path)) continue;
      if (!exists(path)) { push(path, 'asset-missing', '展示素材不在盘上'); continue; }
      if (sizeOf(path) <= 0) push(path, 'asset-empty', '展示素材是 0 字节（README 上会裂图）');
    }
  }

  return { findings, counts, assetMode };
}
