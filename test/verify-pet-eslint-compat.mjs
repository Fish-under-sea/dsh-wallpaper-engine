#!/usr/bin/env node
/**
 * verify-pet-eslint-compat.mjs —— 静态兼容适配的**边界守卫**（t12 验收第 7 条）。
 *
 * 背景：`packages/pet/lib/**` 是 `dsh-pet@0.3.7` 的已核预构建字节，其中三份文件各含 2 行
 * `// eslint-disable-next-line @typescript-eslint/no-explicit-any`。本仓不装 `@typescript-eslint/*`，
 * 于是每条被报成 `Definition for rule '@typescript-eslint/no-explicit-any' was not found.`
 * （6 条**假错误**）。`eslint.config.mjs` 用窄作用域 processor 在**分析期**把该行换成等长空白。
 *
 * 本守卫证明**适配没变成"放行"**，逐条反证：
 *   ① 作用域精确：只有那 3 个文件、共 6 行被掩；其余内容逐字节不变（长度/行数/仅 6 行 diff）。
 *   ② 别家未知规则仍报错（`Definition for rule … was not found`）⇒ 不是"关掉未知规则报告"。
 *   ③ 真实 `no-unused-vars` 仍报错 ⇒ 不是"滤除真实诊断"。
 *   ④ 作用域外文件完全不受影响。
 *   ⑤ 目标文件在**不动字节**的前提下：那 6 条假错误消失，且仍能报出别人写的真实违规。
 *   ⑥ `ignores` 里没有它们、静态基线未改、扫描文件集未减（≥354）。
 *   ⑦ 三份预构建文件的 sha256 仍等于登记锚点 ⇒ 冻结上游字节未被修改。
 *
 * 用法：`node test/verify-pet-eslint-compat.mjs`（判据）· 进程内只读，不改任何文件。
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ESLint } from 'eslint';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
function check(label, ok, detail) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${label} | ${detail}`);
}

/** 与 `eslint.config.mjs` 里登记的作用域**逐字**对齐（两边任何一改动此守卫都会先红）。 */
const EXPECTED_FILES = [
  'packages/pet/lib/index.js',
  'packages/pet/lib/standalone.js',
  'packages/pet/lib/pet-link-backups/2026-10-17T17-57-50-362Z/index.js',
];
/** 三份文件的行号锚点：改动预构建字节会让这里先红（比"只查存在性"更紧）。 */
const EXPECTED_LINE_NUMBERS = {
  'packages/pet/lib/index.js': [3533, 3542],
  'packages/pet/lib/standalone.js': [3484, 3493],
  'packages/pet/lib/pet-link-backups/2026-10-17T17-57-50-362Z/index.js': [3449, 3458],
};
/** 登记的预构建 sha256（`packages/pet/client.build.json` + 备份文件实核值）。 */
const EXPECTED_SHA256 = {
  'packages/pet/lib/index.js': '49047662421d3a176e7ac7c62e37bf81212c8e91b54640d7bcddb67b1d7099dd',
  'packages/pet/lib/standalone.js': 'f44d7eda68d97928f331a2941cee4c38b9bb3294663aeb67314e005667cb42c2',
  'packages/pet/lib/pet-link-backups/2026-10-17T17-57-50-362Z/index.js':
    '1176a10a0f75ad5a9296d8031700ece40d7b9a94bacf8e4e21a4821c92550054',
};
const DIRECTIVE = '// eslint-disable-next-line @typescript-eslint/no-explicit-any';

const sha256 = (rel) => createHash('sha256').update(readFileSync(resolve(ROOT, rel))).digest('hex');

// ── ① 字节与行号锚点：预构建文件一个字节都没动 ────────────────────────────────────
for (const rel of EXPECTED_FILES) {
  check(`预构建字节未变：${rel}`, sha256(rel) === EXPECTED_SHA256[rel], sha256(rel));
}
for (const rel of EXPECTED_FILES) {
  const lines = readFileSync(resolve(ROOT, rel), 'utf8').split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    if (line.trim() === DIRECTIVE) hits.push(i + 1);
  });
  const want = EXPECTED_LINE_NUMBERS[rel];
  check(
    `行内指令位置与登记一致：${rel}`,
    JSON.stringify(hits) === JSON.stringify(want),
    `实测 ${JSON.stringify(hits)} 期望 ${JSON.stringify(want)}（共 ${hits.length} 行，仍**在盘上**未被删）`,
  );
}

// ── ② 作用域精确：processor 只抹这 6 行，其余逐字节不变 ──────────────────────────
const configSource = readFileSync(resolve(ROOT, 'eslint.config.mjs'), 'utf8');
for (const rel of EXPECTED_FILES) {
  check(`eslint.config.mjs 登记了作用域：${rel}`, configSource.includes(`'${rel}'`), '逐字出现');
}
check(
  'eslint.config.mjs 只登记这三份（没有第四份预构建文件混入）',
  (configSource.match(/^\s*'packages\/pet\/lib\/[^']+',$/gm) || []).length === EXPECTED_FILES.length,
  `UPSTREAM_PREBUILT_FILES 数组里 ${(configSource.match(/^\s*'packages\/pet\/lib\/[^']+',$/gm) || []).length} 项`,
);
check(
  '适配方式是 processor（不是 ignores、不是伪造规则/插件）',
  /processor:\s*upstreamInlineDirectiveCompat/.test(configSource) &&
    !/plugins:\s*\{\s*'@typescript-eslint'/.test(configSource) &&
    !/packages\/pet\/\*\*/.test(configSource),
  'processor 在、noop 插件不在、pet 未被整包 ignore',
);

// 用同一份配置跑 ESLint，验证"该消失的消失、该报的照报"。
const eslint = new ESLint({ cwd: ROOT });
const results = await eslint.lintFiles(EXPECTED_FILES);
const allMessages = results.flatMap((r) => r.messages);
check(
  '三份预构建文件在门禁下零假错误（Definition for rule … was not found 归零）',
  allMessages.filter((m) => /Definition for rule .* was not found/.test(m.message)).length === 0,
  `消息总数 ${allMessages.length}`,
);
check(
  '三份预构建文件整体零消息（其余规则本就干净）',
  allMessages.length === 0,
  allMessages.slice(0, 3).map((m) => `${m.ruleId}:${m.line}`).join(' · ') || '0 条',
);

// ── ③ 反事实：作用域内文件仍能报「别家未知规则」与「真实 unused」 ────────────────
const unknownProbe = await eslint.lintText(
  '// eslint-disable-next-line some-scope/unknown-rule\nconst probeUnknown = 1;\nexport { probeUnknown };\n',
  { filePath: EXPECTED_FILES[0] },
);
check(
  '反事实：作用域内文件里**别的**未知规则仍报 Definition for rule … was not found',
  unknownProbe[0].messages.some((m) => /Definition for rule 'some-scope\/unknown-rule' was not found/.test(m.message)),
  JSON.stringify(unknownProbe[0].messages.map((m) => m.message.slice(0, 60))),
);

const unusedProbe = await eslint.lintText(
  '/* eslint no-unused-vars: ["error"] */\nconst probeUnused = 1;\nexport const probeOk = 2;\n',
  { filePath: EXPECTED_FILES[0] },
);
check(
  '反事实：作用域内文件的真实 no-unused-vars 仍报错（真实诊断未被滤除）',
  unusedProbe[0].messages.some((m) => m.ruleId === 'no-unused-vars'),
  JSON.stringify(unusedProbe[0].messages.map((m) => `${m.ruleId}:${m.message.slice(0, 40)}`)),
);

// `packages/**` 在本仓不套宿主半边那批规则（只有末尾那条全局 `no-irregular-whitespace`），
// 所以「该文件面上真实生效的规则」也要有一条真违规被报出来 —— 证明 postprocess 不是丢消息。
const whitespaceProbe = await eslint.lintText('const probeWs = 1;\u3000const probeWs2 = 2;\nexport { probeWs, probeWs2 };\n', {
  filePath: EXPECTED_FILES[0],
});
check(
  '反事实：作用域内文件面上真实生效的规则（no-irregular-whitespace）仍报错',
  whitespaceProbe[0].messages.some((m) => m.ruleId === 'no-irregular-whitespace'),
  JSON.stringify(whitespaceProbe[0].messages.map((m) => `${m.ruleId}:${m.message.slice(0, 40)}`)),
);

// ── ④ 反事实：作用域外文件完全不受影响 ────────────────────────────────────────
const outsideProbe = await eslint.lintText('const probeOutside = 1;\nexport const probeOk2 = 2;\n', {
  filePath: 'test/fixtures/__probe-outside.mjs',
});
check(
  '反事实：作用域外的文件真实 no-unused-vars 仍报错（processor 没有溢出）',
  outsideProbe[0].messages.some((m) => m.ruleId === 'no-unused-vars'),
  JSON.stringify(outsideProbe[0].messages.map((m) => `${m.ruleId}:${m.message.slice(0, 40)}`)),
);

// ── ⑤ processor 的掩码语义自检：等长、行数不变、只动 6 行 ─────────────────────
// 从配置里取**同一份** processor 行为（复制其契约而不是复制实现给产品用）：
const maskLikeConfig = (text) => {
  const lines = text.split('\n');
  const masked = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === DIRECTIVE) {
      lines[i] = ' '.repeat(lines[i].length);
      masked.push(i + 1);
    }
  }
  return { text: lines.join('\n'), masked };
};
let totalMasked = 0;
for (const rel of EXPECTED_FILES) {
  const src = readFileSync(resolve(ROOT, rel), 'utf8');
  const out = maskLikeConfig(src);
  totalMasked += out.masked.length;
  const srcLines = src.split('\n');
  const outLines = out.text.split('\n');
  const diff = srcLines.map((l, i) => (l === outLines[i] ? null : i + 1)).filter(Boolean);
  check(
    `掩码等长且只动登记行：${rel}`,
    out.text.length === src.length &&
      outLines.length === srcLines.length &&
      JSON.stringify(diff) === JSON.stringify(EXPECTED_LINE_NUMBERS[rel]),
    `len ${src.length}→${out.text.length} · lines ${srcLines.length}→${outLines.length} · diff ${JSON.stringify(diff)}`,
  );
  check(
    `掩掉的全是空白（等长替换不留下可见字符）：${rel}`,
    out.text.split('\n')[EXPECTED_LINE_NUMBERS[rel][0] - 1].trim() === '',
    '目标行 trim 后为空',
  );
}
check('三份文件共掩 6 行（不多不少）', totalMasked === 6, `实测 ${totalMasked}`);

// ── ⑥ ignores / 基线 / 扫描面三项不许被动过 ───────────────────────────────────
check(
  '扫描面：三份预构建文件**没有**被 ignores 排除',
  await (async () => {
    const ignored = await eslint.isPathIgnored(EXPECTED_FILES[0]);
    return ignored === false;
  })(),
  'isPathIgnored=false',
);
const baselinePath = resolve(ROOT, 'test/fixtures/static-baseline.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
check(
  '静态基线未被改动（byRule 仍为空 ⇒ 没有把 6 条假错误记成欠账）',
  Object.keys(baseline.eslint.byRule || {}).length === 0,
  JSON.stringify(baseline.eslint.byRule || {}),
);
check(
  '静态基线扫描面地板未被下调（仍 225，且 ≤ 现扫描数）',
  baseline.eslint.filesLinted === 225,
  `${baseline.eslint.filesLinted}`,
);

// ── ⑦ 扫描文件集不得删除原 354 项 ─────────────────────────────────────────────
const scanned = await eslint.lintFiles(['.']);
check(
  'ESLint 扫描文件集未减少（≥354，新测试只增不减）',
  scanned.length >= 354,
  `${scanned.length} file(s)`,
);
check(
  '扫描集里仍包含那三份预构建文件',
  EXPECTED_FILES.every((rel) =>
    scanned.some((r) => r.filePath.toLowerCase() === resolve(ROOT, rel).toLowerCase()),
  ),
  `${scanned.length} 项中逐字命中 3 项`,
);
check(
  '扫描集里有新守卫自身（证明新测试是**加入**而不是替换）',
  scanned.some((r) => r.filePath.toLowerCase().endsWith('test\\verify-pet-eslint-compat.mjs') ||
    r.filePath.toLowerCase().endsWith('test/verify-pet-eslint-compat.mjs')),
  statSync(resolve(ROOT, 'test/verify-pet-eslint-compat.mjs')).size + ' B',
);

// ── 收尾 ────────────────────────────────────────────────────────────────────
console.log('');
if (failed > 0) {
  console.log(`PET ESLINT COMPAT CHECKS FAILED — ${failed} failed`);
  process.exit(1);
}
console.log('PET ESLINT COMPAT CHECKS PASSED');
