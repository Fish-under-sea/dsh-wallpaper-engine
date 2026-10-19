/**
 * 核对 `.github/workflows/verify.yml` 的**作业结构**与覆盖责任。
 *
 * 为什么改成按作业解析（而不是"文件里第一个 steps:"）：分流之后工作流不再只有一个作业，
 * 而"某个步骤在哪条路径上"本身就是判据 —— 旧写法只认第一个 `steps:`，于是加一个 `changes`
 * 作业就会让全部判据对着错误的作业块比对：要么假红（逼人把作业挪回去迁就解析器），
 * 要么假绿（判据看的是别人的步骤，怎么改都不响）。
 *
 * 判据按**覆盖责任**表达，不按固定字符串序列：
 *   · `full` 必须含完整验证序列（顺序固定，不因分流缩水），且装依赖在第一次 npm run 之前；
 *   · `docs` 只做文档检查，不许跑构建 / 运行时门禁，也不许在快通道上装依赖；
 *   · 两条路径都由 `changes` 分类，`full` 保持 Windows + Ubuntu 双平台；
 *   · 固定作业 `ci/result` 用 `judgeResult` 核验"这次该跑的作业真的 success"——
 *     失败、取消、缺失、意外跳过都不放行（判据本体在 `test/tools/ci-routing.mjs`，这里只核对接线）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCheck } from './tools/assert-harness.mjs';
import {
  ARTIFACT_STEP_NEEDLE,
  CI_WORKFLOW_REL,
  FULL_REQUIRED_SEQUENCE,
  INSTALL_COMMAND,
  REQUIRED_JOBS,
  RESULT_JOB_NAME,
  SOFT_STEP,
  STEP_FLOOR,
  auditCiWorkflow,
  dropJob,
  dropPermissionsBlock,
  dropStep,
  dropStepNamed,
  insertNpmStepAfter,
  insertStepIntoJob,
  insertTopLevel,
  installsDeps,
  npmScriptOf,
  parseWorkflow,
  removeLineMatching,
  renameNpmScript,
  setContinueOnError,
  setJobIf,
  setPermissionScope,
  swapSteps,
  swapStepsNamed,
  topLevelPermissions,
} from './tools/ci-workflow.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WORKFLOW_PATH = join(ROOT, CI_WORKFLOW_REL);
const workflowText = readFileSync(WORKFLOW_PATH, 'utf8');
const scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts || {};

const { check, stats } = createCheck();
const brief = (s, n = 72) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

/* ── ① 解析概览 ─────────────────────────────────────────────────────────── */
const parsed = parseWorkflow(workflowText);
console.log('解析出的作业：');
for (const job of parsed.jobs) {
  console.log(`  · ${job.id}（name=${brief(job.name, 24)} · needs=${JSON.stringify(job.needs)}`
    + ` · steps=${job.steps.length} · runs-on=${brief(job.runsOn, 28)}）`);
}
const full = parsed.jobs.find((j) => j.id === 'full');
console.log('full 作业的 npm 序列：'
  + JSON.stringify(full ? full.steps.map((s) => npmScriptOf(s)).filter(Boolean) : []));

/* ── ② 正判据 ───────────────────────────────────────────────────────────── */
const live = auditCiWorkflow({ workflowText, scripts });
for (const c of live.checks) check(c.name, c.ok, c.detail);

/* ── ③ 负对照：每条判据都要有一条变异把它打红 ─────────────────────────────── */
const control = (desc, mutatedText, id) => {
  const changed = mutatedText !== workflowText;
  check(`负对照：${desc}`, changed, changed ? '' : '变异没有改动文本（对照失效）');
  if (!changed) return;
  const result = auditCiWorkflow({ workflowText: mutatedText, scripts });
  const hit = result.checks.find((c) => c.id === id);
  check(`负对照判红：${desc} → ${id}`, !!hit && !hit.ok, hit ? brief(hit.detail) : '判据缺失：' + id);
};

control('删掉 docs 作业', dropJob(workflowText, 'docs'), 'job-structure');
control('full 作业只剩 9 步', dropStep(dropStep(dropStep(workflowText, 'verify:bridge'), 'smoke'), 'verify:docs'), 'step-floor');
control('分类步骤不写 GITHUB_OUTPUT', removeLineMatching(workflowText, /--github-output/), 'changes-wiring');
control('docs 作业偷偷跑 npm run verify', insertStepIntoJob(workflowText, 'docs', 'npm run verify', '顺手全量'), 'docs-fast-path');
control('docs 作业去掉 mode 守卫', setJobIf(workflowText, 'docs', ''), 'docs-fast-path');
// docs 腿的核心步必须是真 docs CLI（同一差异二次分类）；退回六步 warn-only 内务必须红。
// docs 腿 run 已是多行 bash（三个事件分支 + --base-mode 档位），负控对着整个 run 块替换。
const DOCS_RUN_BLOCK = [
  '        run: |',
  '          if [ -n "${{ github.event.pull_request.base.sha }}" ]; then',
  '            BASE_ARGS=(--base "${{ github.event.pull_request.base.sha }}" --head "${{ github.event.pull_request.head.sha }}" --base-mode merge-base)',
  '          elif [ -n "${{ github.event.before }}" ]; then',
  '            BASE_ARGS=(--base "${{ github.event.before }}" --head "${{ github.event.after }}" --base-mode exact)',
  '          else',
  '            BASE_ARGS=(--base "${{ github.sha }}" --head "${{ github.sha }}" --base-mode exact)',
  '          fi',
  '          node scripts/ci-routing.mjs docs "${BASE_ARGS[@]}"',
].join('\n');
control('docs 腿退回仅 verify:docs 内务', workflowText.replace(DOCS_RUN_BLOCK, '        run: npm run verify:docs'), 'docs-fast-path');
control('docs 腿丢掉同一差异接线', removeLineMatching(workflowText, /--base "/), 'docs-fast-path');
// 同一变异（两腿的 --base 行一起消失）也要打红 changes-wiring：两腿必须同一差异边界。
control('changes 腿丢掉差异边界（与 docs 同一变异）', removeLineMatching(workflowText, /--base "/), 'changes-wiring');
control('docs 腿 checkout 不指向 head 树', removeLineMatching(workflowText, /ref: \$\{\{ github\.event\.pull_request\.head\.sha/), 'docs-fast-path');
// changes 腿的 PR 分支退化成 github.sha（与 docs 腿不一致）——两腿各审各的差异 ⇒ 判红。
// PR 分支行在两腿逐字符相同，replace 只换第一处 = changes 腿（文件顺序在 docs 之前）。
control('changes 腿 PR 分支退化成 github.sha（与 docs 不一致）', workflowText
  .replace('BASE_ARGS=(--base "${{ github.event.pull_request.base.sha }}" --head "${{ github.event.pull_request.head.sha }}" --base-mode merge-base)',
    'BASE_ARGS=(--base "${{ github.sha }}" --head "${{ github.sha }}" --base-mode exact)'), 'changes-wiring');
// push 场景的 exact 档被退化成 merge-base：force-push 后 before 非祖先，merge-base 会漏算
// before 独有的代码删除（E2E force-push 幕实证）——退化即回归 ⇒ 判红。
control('push exact 档退化成 merge-base',
  workflowText.split('--base-mode exact').join('--base-mode merge-base'), 'changes-wiring');
// dispatch 分支（github.sha 空差异 ⇒ 保守 full）被删 ⇒ 无事件边界时接线不完整 ⇒ 判红。
control('dispatch 边界分支被删',
  removeLineMatching(workflowText, /github\.sha.*base-mode exact/), 'changes-wiring');
control('full 漏掉 verify:bridge', dropStep(workflowText, 'verify:bridge'), 'full-coverage');
control('full 漏掉 smoke', dropStep(workflowText, 'smoke'), 'full-coverage');
control('full 把安装放到第一次 npm run 之后', swapStepsNamed(workflowText, 'npm ci', 'verify:static'), 'full-coverage');
control('给 verify 加 continue-on-error', setContinueOnError(workflowText, 'verify', true), 'soft-tier');
control('去掉 verify:docs 的 continue-on-error', setContinueOnError(workflowText, SOFT_STEP, false), 'soft-tier');
control('ci/result 不再 always()', removeLineMatching(workflowText, /if: always\(\)/), 'result-gate');
control('ci/result 不用 judgeResult', removeLineMatching(workflowText, /judgeResult/), 'result-gate');
control('ci/result 少 needs 一条腿', removeLineMatching(workflowText, /needs: \[changes, docs, full\]/), 'result-gate');
control('改用 pull_request_target', insertTopLevel(workflowText, 'pull_request_target:\n  branches: [main]'), 'fork-safety');
control('顶层加 paths-ignore', insertTopLevel(workflowText, 'paths-ignore:\n  - "docs/**"'), 'fork-safety');
control('checkout 不取全历史', removeLineMatching(workflowText, /fetch-depth: 0/), 'checkout-depth');

/* ── ③-b C3 盲区 A：多行 run 把安装藏到第二行 ─────────────────────────────
 * 原判据只对**折行后的整串**做 `startsWith(INSTALL_COMMAND)` ⇒ 只要安装不是 run 的第一行，
 * `docs-fast-path` 的 `install=0` 照样报绿，而这步在 CI 上真的装了依赖（实测先红）。
 * 下面三条：首行安装（逃不掉，作参照）· 第二行安装（原盲区的原形态）· 三行 bash 里藏在末行。 */
control('docs 腿安装写成首行（参照：本来就该红）',
  insertStepIntoJob(workflowText, 'docs', INSTALL_COMMAND, 'docs 腿装依赖（首行）'), 'docs-fast-path');
control('docs 腿多行 run 把安装藏到第二行（set -e 在首行）',
  insertStepIntoJob(workflowText, 'docs', '|\n            set -e\n            ' + INSTALL_COMMAND,
    'docs 腿多行安装（C3 盲区 A）'), 'docs-fast-path');
control('docs 腿三行 bash 把安装藏在末行',
  insertStepIntoJob(workflowText, 'docs', '|\n            set -euo pipefail\n            echo prepare\n            ' + INSTALL_COMMAND,
    'docs 腿三行安装（末行）'), 'docs-fast-path');
// 判据本体自检：`installsDeps` 对"首行/非首行/多命令混排"三种形态都必须为真（直接断言纯函数，
// 不靠变异间接证明），对"只是提到 npm ci 但没真执行"的注释行必须为假。
check('installsDeps：首行安装为真', installsDeps({ run: INSTALL_COMMAND }));
check('installsDeps：第二行安装为真', installsDeps({ run: 'set -e\n' + INSTALL_COMMAND }));
check('installsDeps：缩进/CRLF/空行混排仍为真',
  installsDeps({ run: 'set -e\r\n\r\n   ' + INSTALL_COMMAND + '   \r\n' }));
check('installsDeps：只在行尾提一句不算安装',
  installsDeps({ run: 'echo "see ' + INSTALL_COMMAND + ' later"' }) === false);
check('installsDeps：非安装命令为假', installsDeps({ run: 'npm run verify:docs' }) === false);
check('installsDeps：无 run 为假', installsDeps({}) === false);

/* ── ③-c C3 盲区 B：顶层 permissions 整块删除 / 取值放开 ───────────────────
 * 原 `fork-safety` 只认 `pull_request_target` 与顶层 `paths-ignore` 两个坏形态，对"整块删掉
 * permissions"无感（实测全绿）。下面三条把存在性、取值、越界 write 分别钉住。 */
control('删掉顶层 permissions 整块（C3 盲区 B）', dropPermissionsBlock(workflowText), 'permissions-minimal');
control('顶层 permissions 的 contents 改成 write',
  setPermissionScope(workflowText, 'contents', 'write'), 'permissions-minimal');
control('顶层 permissions 追加一个越界 write scope',
  setPermissionScope(workflowText, 'id-token', 'write'), 'permissions-minimal');
// 判据本体自检：纯函数口径（块缺失 ⇒ null；块内只认当前块的键，不吃到 jobs 里的 permissions）。
check('topLevelPermissions：读出 contents=read',
  JSON.stringify(topLevelPermissions(workflowText)) === JSON.stringify({ contents: 'read' }),
  JSON.stringify(topLevelPermissions(workflowText)));
check('topLevelPermissions：无块 ⇒ null', topLevelPermissions('on: push\njobs: {}\n') === null);
check('topLevelPermissions：作业内的 permissions 不算顶层',
  topLevelPermissions('on: push\njobs:\n  a:\n    permissions:\n      contents: write\n') === null);
control('full 漏掉产物入库检查', dropStepNamed(workflowText, ARTIFACT_STEP_NEEDLE), 'full-coverage');
control('空工作流', '', 'job-structure');

// 变异器本身的自检：对不匹配的输入必须是恒等（否则负对照会"自己打自己"）。
check('变异器恒等：dropStep 对不存在的脚本', dropStep(workflowText, 'verify:bogus') === workflowText);
check('变异器恒等：dropJob 对不存在的作业', dropJob(workflowText, 'nope') === workflowText);
check('变异器恒等：swapSteps 对不存在的脚本',
  swapSteps(workflowText, 'verify:bogus', 'verify:static') === workflowText);
check('变异器恒等：renameNpmScript 对不存在的脚本',
  renameNpmScript(workflowText, 'verify:bogus', 'verify:still-bogus') === workflowText);
check('变异器恒等：insertNpmStepAfter 对不存在的锚点',
  insertNpmStepAfter(workflowText, 'verify:bogus', 'lint') === workflowText);
check('变异器恒等：setJobIf 对不存在的作业', setJobIf(workflowText, 'nope', 'true') === workflowText);

// 正对照：脚本表为空时"每个 npm 步骤的脚本都存在"必须判红（否则那条判据永远真）。
const emptyScripts = auditCiWorkflow({ workflowText, scripts: {} });
const existsCheck = emptyScripts.checks.find((c) => c.id === 'npm-scripts-exist');
check('正对照：脚本表为空 ⇒ npm-scripts-exist 判红', !!existsCheck && !existsCheck.ok,
  existsCheck ? brief(existsCheck.detail) : '判据缺失：npm-scripts-exist');

/* ── ④ 结构面：作业齐全、序列按序、装依赖与产物检查都在 ───────────────────── */
const ids = parsed.jobs.map((j) => j.id);
check(`作业齐全（${REQUIRED_JOBS.join(' / ')}）`, REQUIRED_JOBS.every((id) => ids.includes(id)), JSON.stringify(ids));
check(`full 步骤数 ≥ 地板 ${STEP_FLOOR}`, !!full && full.steps.length >= STEP_FLOOR,
  full ? String(full.steps.length) : '缺 full 作业');

const fullScripts = full ? full.steps.map((s) => npmScriptOf(s)).filter(Boolean) : [];
const seqOk = (() => {
  let at = 0;
  for (const want of FULL_REQUIRED_SEQUENCE) {
    const found = fullScripts.indexOf(want, at);
    if (found < 0) return false;
    at = found + 1;
  }
  return true;
})();
check('full 的 npm 序列按序包含完整验证链', seqOk, JSON.stringify(fullScripts));

const installAt = full ? full.steps.findIndex((s) => String(s.run || '').trim().startsWith(INSTALL_COMMAND)) : -1;
const firstNpmAt = full ? full.steps.findIndex((s) => /(?:^|\s)npm run\s/.test(String(s.run || ''))) : -1;
check('full 先装依赖再跑第一条 npm 脚本', installAt >= 0 && (firstNpmAt < 0 || installAt < firstNpmAt),
  `install@${installAt} firstNpm@${firstNpmAt}`);
check('full 保留产物不入库检查', !!full && full.steps.some((s) => String(s.run || '').includes(ARTIFACT_STEP_NEEDLE)));
check(`汇总作业名为 ${RESULT_JOB_NAME}`,
  parsed.jobs.some((j) => j.name === RESULT_JOB_NAME), JSON.stringify(parsed.jobs.map((j) => j.name)));

/* ── 收尾 ───────────────────────────────────────────────────────────────── */
if (stats.failed) {
  console.error(`\n${stats.failed} CHECK(S) FAILED`);
  process.exit(1);
}
console.log(`\nALL CI STEP CHECKS PASSED (${stats.passed})`);
