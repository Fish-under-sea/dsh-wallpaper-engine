#!/usr/bin/env node
/**
 * test/verify-ci-routing.mjs — ci-routing CLI 的**隔离 git 库端到端**守卫。
 *
 * 与 `test/tools/ci-routing-selftest.mjs`（纯函数、合成差异）互补：这里每一幕都在
 * `os.tmpdir()` 下现造一个一次性 git 仓库（`git init` → 初始提交 → 场景改动），
 * 通过 `main(argv, { root, git, env, log })` 的注入点驱动**真实管道**：
 * 真实 `makeGit`（真 git 子进程、常规 stdio 管道）、真实 staged / unstaged / untracked
 * 三条本地通道、真实退出码、真实 `$GITHUB_OUTPUT` 落盘。**不碰本仓库的索引与工作区**
 * （不用 `git add` 污染共享仓库），也不断言任何"沙箱跑不了"的通道形态——
 * 环境性 EPERM 会作为普通失败带出精确错误串，如实记录，不当绿也不绕行。
 *
 * 覆盖（对照合同验收"提交差异和本地 staged/unstaged/untracked 分别覆盖"）：
 *   · 提交差异（`--base HEAD^ --head HEAD`）与 `--flag value` / `--flag=value` 双参数形态；
 *   · untracked-only / staged-only / staged+unstaged 混合三条本地通道分别被读到；
 *   · `docs` 在 full 差异上非 0 拒绝（EXIT_REFUSED=3，不是"跳过即通过"）；
 *   · `docs` 有发现（冲突标记）退出码 1；
 *   · git 取不到差异 ⇒ exit 2 阻断（fail-closed，GITHUB_OUTPUT 里 mode=full）；
 *   · 参数严格解析：布尔参数带值 / 缺值 / 未知参数都退出码 2；
 *   · `judgeResult` 放行 / 拒绝（失败、未知 mode）与 GITHUB_OUTPUT 的 ok=/reason= 行。
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main, EXIT_REFUSED } from '../scripts/ci-routing.mjs';

const results = [];
function add(desc, ok, detail = '') {
  results.push({ desc, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + desc + (detail ? ' — ' + detail : ''));
}

/** 测试脚手架自己的 git 操作（隔离仓库里建数据用，不走被测注入点）。 */
function sh(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.error) throw new Error('git ' + args.join(' ') + ' 不可用：' + r.error.message);
  if (r.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' 退出码 ' + r.status + '：' + String(r.stderr || '').trim());
  }
  return String(r.stdout || '');
}

/** 现造一个一次性 git 仓库：docs/README.md + app/index.js 初始提交。返回绝对路径。 */
function initRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'ci-routing-e2e-'));
  // 显式 -b main：不依赖机器 init.defaultBranch（后文 checkout main 的夹具因此可移植）。
  sh(['init', '-q', '-b', 'main'], dir);
  sh(['config', 'user.email', 'e2e@example.invalid'], dir);
  sh(['config', 'user.name', 'e2e'], dir);
  sh(['config', 'commit.gpgsign', 'false'], dir);
  mkdirSync(join(dir, 'docs'));
  mkdirSync(join(dir, 'app'));
  writeFileSync(join(dir, 'docs', 'README.md'), '# 文档\n', 'utf8');
  writeFileSync(join(dir, 'app', 'index.js'), 'export const one = 1;\n', 'utf8');
  sh(['add', '.'], dir);
  sh(['commit', '-q', '-m', 'init'], dir);
  return dir;
}

/** 驱动被测 CLI 的 main()：捕获输出、注入 root/env，git 缺省走真实 makeGit(root)。 */
function runMain(argv, opts = {}) {
  const lines = [];
  const code = main(argv, {
    root: opts.root,
    git: opts.git,
    env: { ...process.env, ...(opts.env || {}) },
    log: (s) => lines.push(String(s)),
  });
  return { code, out: lines.join('\n') };
}

/** 从捕获输出里抠 JSON 载荷（check/docs 的 --json 形态，或 docs 拒绝时 JSON+文字混合）。 */
function jsonOf(out) {
  const start = out.indexOf('{');
  const end = out.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('输出里没有 JSON：' + out.slice(0, 200));
  return JSON.parse(out.slice(start, end + 1));
}

const repos = [];
function freshRepo() {
  const dir = initRepo();
  repos.push(dir);
  return dir;
}

try {
  // ── 提交差异通道 + 双参数两种形态 ────────────────────────────────────────────
  const repoCommit = freshRepo();
  writeFileSync(join(repoCommit, 'app', 'index.js'), 'export const one = 1;\nexport const two = 2;\n', 'utf8');
  sh(['add', '.'], repoCommit);
  sh(['commit', '-q', '-m', 'code change'], repoCommit);

  const s1 = runMain(['check', '--base', 'HEAD^', '--head', 'HEAD', '--json'], { root: repoCommit });
  const p1 = jsonOf(s1.out);
  add('提交差异：--base HEAD^ --head HEAD 判 full 且不掺本地通道',
    s1.code === 0 && p1.mode === 'full' && p1.local === false && p1.count === 1,
    'exit=' + s1.code + ' mode=' + p1.mode + ' local=' + p1.local + ' count=' + p1.count);

  const s2 = runMain(['check', '--base=HEAD^', '--head=HEAD', '--json'], { root: repoCommit });
  const p2 = jsonOf(s2.out);
  add('双参数等价：--flag=value 与 --flag value 取到同一个 merge-base 与模式',
    s2.code === 0 && p2.mode === p1.mode && p2.base === p1.base,
    'base=' + p2.base + ' mode=' + p2.mode);

  // ── 本地三通道：untracked / staged / staged+unstaged ─────────────────────────
  // 本地通道用例显式 `--base HEAD`：让 base..HEAD 为空、差异全部来自本地三条通道，
  // 否则根提交仓库的缺省通道会把"空树..HEAD"（基线自身）也算进差异 ⇒ 断言与被测通道脱钩。
  // 根提交缺省通道的语义单独有下面的负例钉住（全部文件都是新增 ⇒ 必须 full）。
  const repoUntracked = freshRepo();
  writeFileSync(join(repoUntracked, 'docs', 'new.md'), '# 新文档\n', 'utf8');
  const s3 = runMain(['check', '--base', 'HEAD', '--local', '--json'], { root: repoUntracked });
  const p3 = jsonOf(s3.out);
  add('untracked-only：纯新文档 ⇒ docs（未跟踪通道被读到，local=true）',
    s3.code === 0 && p3.mode === 'docs' && p3.local === true && p3.count === 1,
    'mode=' + p3.mode + ' local=' + p3.local + ' count=' + p3.count);

  const repoStaged = freshRepo();
  writeFileSync(join(repoStaged, 'docs', 'staged.md'), '# 已暂存\n', 'utf8');
  sh(['add', 'docs/staged.md'], repoStaged);
  const s4 = runMain(['check', '--base', 'HEAD', '--json'], { root: repoStaged });
  const p4 = jsonOf(s4.out);
  add('staged-only：已暂存新文档 ⇒ docs（已暂存通道被读到）',
    s4.code === 0 && p4.mode === 'docs' && p4.count === 1,
    'mode=' + p4.mode + ' count=' + p4.count);

  appendFileSync(join(repoStaged, 'app', 'index.js'), 'export const three = 3;\n', 'utf8');
  const s5 = runMain(['check', '--base', 'HEAD', '--json'], { root: repoStaged });
  const p5 = jsonOf(s5.out);
  add('staged+unstaged 混合：暂存文档 + 未暂存代码 ⇒ full 且两条都计数（漏一条就是假文档）',
    s5.code === 0 && p5.mode === 'full' && p5.count === 2,
    'mode=' + p5.mode + ' count=' + p5.count);

  const repoAsset = freshRepo();
  mkdirSync(join(repoAsset, 'assets', 'readme'), { recursive: true });
  writeFileSync(join(repoAsset, 'assets', 'readme', 'x.png'), 'PNGDATA'.repeat(64), 'utf8');
  const sAsset = runMain(['check', '--base', 'HEAD', '--json'], { root: repoAsset });
  const pAsset = jsonOf(sAsset.out);
  add('untracked 展示素材 ⇒ docs-assets（未跟踪的素材也走快通道资产组）',
    sAsset.code === 0 && pAsset.mode === 'docs-assets',
    'mode=' + pAsset.mode);

  // 根提交（无父提交）的缺省通道：base=空树 ⇒ 基线自身的全部文件都是"新增"，
  // 其中 lib/index.js 是代码 ⇒ 必须 full（分类器不许把"整库初提交"误判成文档）。
  const repoRoot = freshRepo();
  const sRoot = runMain(['check', '--json'], { root: repoRoot });
  const pRoot = jsonOf(sRoot.out);
  add('根提交缺省通道：基线全部文件都是新增 ⇒ full（不许把整库初提交误判 docs）',
    sRoot.code === 0 && pRoot.mode === 'full' && pRoot.count === 2,
    'mode=' + pRoot.mode + ' count=' + pRoot.count);

  // ── docs 快通道：full 拒绝（exit 3）与有发现（exit 1） ────────────────────────
  const repoRefuse = freshRepo();
  writeFileSync(join(repoRefuse, 'app', 'stray.js'), 'export const stray = true;\n', 'utf8');
  const s6 = runMain(['docs', '--base', 'HEAD', '--json'], { root: repoRefuse });
  let p6 = {};
  try { p6 = jsonOf(s6.out); } catch { /* 输出不含 JSON 时保持空对象 */ }
  add('full 误调用 docs ⇒ exit 3 明确拒绝（不是假成功；payload.refused=true）',
    s6.code === EXIT_REFUSED && p6.refused === true && s6.out.includes('拒绝'),
    'exit=' + s6.code + ' refused=' + p6.refused);

  const repoConflict = freshRepo();
  writeFileSync(join(repoConflict, 'docs', 'bad.md'), '# 坏文档\n<<<<<<< HEAD\n=======\n>>>>>>> other\n', 'utf8');
  const s7 = runMain(['docs', '--base', 'HEAD', '--json'], { root: repoConflict });
  const p7 = jsonOf(s7.out);
  add('docs 快通道有发现（冲突标记）⇒ exit 1 且 finding 可读',
    s7.code === 1 && (p7.findings || []).some((f) => f.kind === 'conflict'),
    'exit=' + s7.code + ' findings=' + JSON.stringify((p7.findings || []).map((f) => f.kind)));

  // ── 提交差异通道的 docs 快路径 + 多提交 PR 的完整差异负例 ─────────────────────
  // 多提交 PR：**首提交是代码、末提交把代码文件恢复回基线** —— 只看末提交会"看不到代码"，
  // 完整 merge-base 差异必须仍然判 full（这正是"严格完整 PR 差异，不能只拿最后提交"的机器化）。
  const repoMulti = freshRepo();
  writeFileSync(join(repoMulti, 'app', 'index.js'), 'export const one = 1;\nexport const stray = true;\n', 'utf8');
  sh(['add', 'app/index.js'], repoMulti);
  sh(['commit', '-q', '-m', 'code in the middle'], repoMulti);
  writeFileSync(join(repoMulti, 'docs', 'story.md'), '# 多提交故事的末提交是文档\n', 'utf8');
  sh(['add', 'docs/story.md'], repoMulti);
  writeFileSync(join(repoMulti, 'app', 'index.js'), 'export const one = 1;\n', 'utf8');
  sh(['add', 'app/index.js'], repoMulti);
  sh(['commit', '-q', '-m', 'docs last, code reverted'], repoMulti);
  const sMulti = runMain(['check', '--base', 'HEAD^', '--head', 'HEAD', '--json'], { root: repoMulti });
  const pMulti = jsonOf(sMulti.out);
  add('多提交 PR：首提交代码 + 末提交只动文档 ⇒ 完整差异仍判 full（不许只看最后提交）',
    sMulti.code === 0 && pMulti.mode === 'full',
    'mode=' + pMulti.mode + ' reasons=' + JSON.stringify((pMulti.reasons || []).slice(0, 2)));

  const repoDocsCommit = freshRepo();
  writeFileSync(join(repoDocsCommit, 'docs', 'pure.md'), '# 纯文档提交\n', 'utf8');
  sh(['add', 'docs/pure.md'], repoDocsCommit);
  sh(['commit', '-q', '-m', 'docs only'], repoDocsCommit);
  const sDocsCommit = runMain(['check', '--base', 'HEAD^', '--head', 'HEAD', '--json'], { root: repoDocsCommit });
  const pDocsCommit = jsonOf(sDocsCommit.out);
  add('提交差异：纯文档提交 ⇒ docs（快路径对提交差异同样成立）',
    sDocsCommit.code === 0 && pDocsCommit.mode === 'docs' && pDocsCommit.count === 1,
    'mode=' + pDocsCommit.mode + ' count=' + pDocsCommit.count);

  // ── force-push 反例：push 必须用 --base-mode exact 按 before→after 原样 diff ────────
  // 拓扑（m00697 裁定 + m00992 修正：祖先**没有**该代码，删除发生在 before→after 之间）：
  //   A  = 共同祖先：freshRepo 后先 git rm app/index.js ⇒ 祖先**没有** app/index.js
  //   B  = before（side 独有提交）：**新增** app/index.js（旧 tip，force-push 前状态）
  //   C  = after（main 新 tip）：从 A 只改文档、仍没有 app/index.js（force-push 后）
  // merge-base(B,C)=A：A→C 只见文档 ⇒ 缺省 merge-base 档判 docs，把 B→C 的真实代码删除
  // 算漏（误放行形态）；exact 档按 B→C 原样 diff ⇒ 删除被看见 ⇒ full。这正是 push 档
  // 必须 exact 的原因（判据：scripts/ci-routing.mjs collectDiff exact 分支）。
  // 断言不只看 files 名单——用独立 git 取证：merge-base(B,C) 确为 A（拓扑前提），
  // 且 B→C 原样 diff 里 app/index.js 是 D（删除）而非恢复/新增。
  const repoForce = freshRepo();
  sh(['rm', '-q', 'app/index.js'], repoForce);
  sh(['commit', '-q', '-m', 'ancestor: 删掉代码使共同祖先没有 app/index.js'], repoForce);
  const base0 = sh(['rev-parse', 'HEAD'], repoForce).trim();
  sh(['checkout', '-q', '-b', 'side'], repoForce);
  mkdirSync(join(repoForce, 'app'), { recursive: true });
  writeFileSync(join(repoForce, 'app', 'index.js'), 'module.exports = 1;\n', 'utf8');
  sh(['add', '.'], repoForce);
  sh(['commit', '-q', '-m', 'side: 独有新增 app/index.js（before 旧 tip）'], repoForce);
  const oldTip = sh(['rev-parse', 'HEAD'], repoForce).trim();
  sh(['checkout', '-q', 'main'], repoForce);
  writeFileSync(join(repoForce, 'docs', 'new.md'), '# after 侧新文档\n', 'utf8');
  sh(['add', '.'], repoForce);
  sh(['commit', '-q', '-m', 'main: 只改文档（after 新 tip，force-push 后）'], repoForce);
  const newTip = sh(['rev-parse', 'HEAD'], repoForce).trim();
  // 独立取证：拓扑前提（merge-base(B,C)=A）+ before→after 原样 diff 里 app/index.js 是 D。
  const mbActual = sh(['merge-base', oldTip, newTip], repoForce).trim();
  const nameStatus = sh(['diff', '--name-status', oldTip, newTip, '--', 'app/index.js'], repoForce).trim();
  add('force-push：夹具取证 merge-base(B,C)=共同祖先 且 app/index.js 在 B→C 原样 diff 中是 D（删除）',
    mbActual === base0 && /(^|\n)D\s+app\/index\.js/.test(nameStatus),
    'merge-base=' + mbActual.slice(0, 7) + ' 期望=' + base0.slice(0, 7)
      + ' name-status=' + JSON.stringify(nameStatus));
  // 缺省 merge-base 档：base=B ⇒ 差异=A→C 纯文档 ⇒ docs（暴露这次误放行的真实形态）。
  const sForceMb = runMain(['check', '--base', oldTip, '--head', newTip, '--json'], { root: repoForce });
  const pForceMb = jsonOf(sForceMb.out);
  add('force-push：merge-base 档把 B→C 的代码删除算漏 ⇒ docs（误放行形态）',
    sForceMb.code === 0 && pForceMb.mode === 'docs',
    'mode=' + pForceMb.mode + ' base=' + String(pForceMb.base || '').slice(0, 7) + ' count=' + pForceMb.count);
  // exact 档：按 before→after 原样 diff ⇒ 代码删除被看见 ⇒ full（fail-closed，安全方向）。
  const sForceExact = runMain(['check', '--base', oldTip, '--head', newTip, '--base-mode', 'exact', '--json'],
    { root: repoForce });
  const pForceExact = jsonOf(sForceExact.out);
  add('force-push：--base-mode exact 按 before→after 原样 diff ⇒ full（删除的 app/index.js 进差异）',
    sForceExact.code === 0 && pForceExact.mode === 'full'
      && (pForceExact.files || []).includes('app/index.js'),
    'mode=' + pForceExact.mode + ' base=' + String(pForceExact.base || '').slice(0, 7)
      + ' files=' + JSON.stringify((pForceExact.files || []).slice(0, 4)));
  // docs 腿同形态也要拒绝：同一 exact 差异走 docs 命令 ⇒ exit 3（快通道不吃 merge-base 漏算）。
  const sForceDocs = runMain(['docs', '--base', oldTip, '--head', newTip, '--base-mode', 'exact'],
    { root: repoForce });
  add('force-push：docs 命令对同一 exact 差异 ⇒ exit 3 拒绝（快通道不以假成功放行）',
    sForceDocs.code === EXIT_REFUSED,
    'exit=' + sForceDocs.code);

  // ── 新建分支 / 首次推送：push 事件的 before 是**全零 SHA** ──────────────────────
  // GitHub 在分支此前不存在时把 `before` 填成 40 个 0。它不是 git 对象，直接送去
  // `git diff` 只会 `fatal: bad object` ⇒ 以前这里**必然误报**（"跑不了"被读成阻断，
  // 而分支之前根本不存在，整条历史都是本次推送新增的）。语义上空树才是对的边界：
  // 该提交的全部文件都计为新增，仍在 fail-closed 方向上（差异只会更大，不会漏）。
  // 两条断言各管一半：①全零 ⇒ 走空树并判 full；②非全零 ⇒ **绝不**走空树（防误判）。
  const ZERO_SHA = '0'.repeat(40);
  const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const zeroCalls = [];
  const sZero = runMain(['check', '--base', ZERO_SHA, '--head', 'HEAD', '--base-mode', 'exact', '--json'], {
    root: repoForce,
    git: (args) => {
      zeroCalls.push(args.join(' '));
      if (args[0] === 'hash-object') return { ok: true, out: EMPTY_TREE + '\n', err: '' };
      if (args[0] === 'diff') {
        return { ok: true, out: ':000000 100644 0000000 1111111 A\0app/index.js\0', err: '' };
      }
      return { ok: false, out: '', err: '注入：意外参数 ' + args.join(' ') };
    },
  });
  const pZero = jsonOf(sZero.out);
  add('push 的 before 是全零 SHA（新建分支）⇒ 按空树 diff 判 full，不再 fatal: bad object',
    sZero.code === 0 && pZero.mode === 'full'
      && zeroCalls.some((c) => c.startsWith('hash-object'))
      && zeroCalls.some((c) => c.startsWith('diff --raw') && c.includes(EMPTY_TREE)),
    'exit=' + sZero.code + ' mode=' + pZero.mode + ' calls=' + JSON.stringify(zeroCalls.slice(0, 3)));

  const realCalls = [];
  const nonZeroBase = 'abc1234' + 'a'.repeat(33);
  runMain(['check', '--base', nonZeroBase, '--head', 'HEAD', '--base-mode', 'exact', '--json'], {
    root: repoForce,
    git: (args) => {
      realCalls.push(args.join(' '));
      if (args[0] === 'diff') return { ok: true, out: ':100644 100644 aaa bbb M\0src/x.js\0', err: '' };
      return { ok: false, out: '', err: '注入：意外参数 ' + args.join(' ') };
    },
  });
  add('非全零 base 仍原样使用（不得被空树分支误吞）',
    !realCalls.some((c) => c.startsWith('hash-object')) && realCalls.some((c) => c.includes(nonZeroBase)),
    'calls=' + JSON.stringify(realCalls.slice(0, 2)));

  // ── fail-closed：git 取不到差异 ⇒ 阻断（exit 2），GITHUB_OUTPUT 里 mode=full ──
  const s8 = runMain(['check', '--json'], {
    root: repoRefuse,
    git: () => ({ ok: false, out: '', err: '注入：git 不可用（模拟沙箱 EPERM 形态）' }),
  });
  let p8 = {};
  try { p8 = jsonOf(s8.out); } catch { /* 同上 */ }
  add('git 取不到差异 ⇒ exit 2 阻断（不按文档放行；JSON 载荷 mode=full）',
    s8.code === 2 && p8.mode === 'full' && p8.ok === false && s8.out.includes('阻断'),
    'exit=' + s8.code + ' mode=' + p8.mode);

  // ── GITHUB_OUTPUT 严格落盘 ──────────────────────────────────────────────────
  const outDir = mkdtempSync(join(tmpdir(), 'ci-routing-e2e-out-'));
  repos.push(outDir);
  const ghOutput = join(outDir, 'github-output.txt');
  writeFileSync(join(repoUntracked, 'docs', 'another.md'), '# 又一篇\n', 'utf8');
  // 与本地通道用例同一形态：显式 --base HEAD，让差异只来自本地 untracked 通道；
  // 缺省通道会把根提交基线（含 app/index.js 代码）整段算进差异 ⇒ mode=full。
  const s9 = runMain(['check', '--base', 'HEAD', '--github-output'], { root: repoUntracked, env: { GITHUB_OUTPUT: ghOutput } });
  const gh9 = existsSync(ghOutput) ? readFileSync(ghOutput, 'utf8') : '';
  add('GITHUB_OUTPUT：check 写出 mode=docs / reason / count 行（CI 接线真的能读到）',
    s9.code === 0 && gh9.includes('mode=docs') && /^count=\d+$/m.test(gh9) && gh9.includes('reason='),
    '文件内容：' + JSON.stringify(gh9));

  const ghBad = join(outDir, 'github-output-fail.txt');
  const s10 = runMain(['judgeResult', '--mode', 'full', '--changes', 'success', '--docs', 'skipped', '--full', 'failure', '--github-output'],
    { root: repoRefuse, env: { GITHUB_OUTPUT: ghBad } });
  const gh10 = existsSync(ghBad) ? readFileSync(ghBad, 'utf8') : '';
  add('GITHUB_OUTPUT：judgeResult 拒绝时写 ok=false 且带 reason 行，退出码 1',
    s10.code === 1 && gh10.includes('ok=false') && /^reason\d+=/m.test(gh10),
    'exit=' + s10.code + ' 文件内容：' + JSON.stringify(gh10));

  // ── 参数严格解析（布尔带值 / 缺值 / 未知参数都 exit 2） ───────────────────────
  const s11 = runMain(['check', '--json=true'], { root: repoUntracked });
  add('参数严格解析：布尔参数带值 ⇒ exit 2（不能静默当 true 吃下）',
    s11.code === 2 && s11.out.includes('布尔参数'), 'exit=' + s11.code);
  const s12 = runMain(['check', '--base'], { root: repoUntracked });
  add('参数严格解析：值参数缺值 ⇒ exit 2', s12.code === 2 && s12.out.includes('参数缺值'), 'exit=' + s12.code);
  const s13 = runMain(['check', '--nope'], { root: repoUntracked });
  add('参数严格解析：未知参数 ⇒ exit 2', s13.code === 2 && s13.out.includes('未知参数'), 'exit=' + s13.code);

  // ── judgeResult 放行 / 未知 mode 拒绝 ────────────────────────────────────────
  const ghOk = join(outDir, 'github-output-ok.txt');
  const s14 = runMain(['judgeResult', '--mode', 'docs', '--changes', 'success', '--docs', 'success', '--full', 'skipped', '--github-output'],
    { root: repoUntracked, env: { GITHUB_OUTPUT: ghOk } });
  const gh14 = existsSync(ghOk) ? readFileSync(ghOk, 'utf8') : '';
  add('judgeResult：docs 路径必需腿 success + full 按设计 skipped ⇒ 放行（exit 0，ok=true）',
    s14.code === 0 && gh14.includes('ok=true'),
    'exit=' + s14.code + ' 文件：' + JSON.stringify(gh14));

  const s15 = runMain(['judgeResult', '--mode', 'fast', '--changes', 'success', '--docs', 'success', '--full', 'skipped'],
    { root: repoUntracked });
  add('judgeResult：mode 未登记 ⇒ exit 1（outputs 没接上时不能默认放行）',
    s15.code === 1 && s15.out.includes('未登记'), 'exit=' + s15.code);
} finally {
  for (const dir of repos) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* 清理失败不掩盖判据结果 */ }
  }
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + (failed.length
  ? failed.length + ' CHECK(S) FAILED'
  : 'ALL CI ROUTING E2E CHECKS PASSED (' + results.length + ')'));
process.exit(failed.length ? 1 : 0);
