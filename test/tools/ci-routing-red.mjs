#!/usr/bin/env node
// CI 分流第一阶段的**最小**守卫（已转为链上正式硬档）：文档分流必须带**固定名**的
// `ci/result` 汇总作业（分支保护只有一个可勾的勾，按显示名认），且分类/审计/汇总必须
// 真的在跑 `scripts/ci-routing.mjs` —— 两条都对着 `.github/workflows/verify.yml` 原文断言。
// 完整的作业结构 / 覆盖责任 / 负对照判据在 `test/verify-ci-steps.mjs`（经 `test/tools/ci-workflow.mjs`），
// 本文件只钉"分流接了线"这一件事，防止工作流被整体换回旧的单 verify 矩阵时链上无声脱钩。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow = readFileSync(new URL('../../.github/workflows/verify.yml', import.meta.url), 'utf8');
assert.ok(workflow.includes('ci/result'), '文档分流必须有固定 ci/result 汇总，旧工作流对所有改动只跑全量');
assert.ok(
  workflow.includes('node scripts/ci-routing.mjs'),
  '文档分流必须真的在跑 scripts/ci-routing.mjs（分类 / 文档审计 / judgeResult 汇总），不是只留作业名',
);
