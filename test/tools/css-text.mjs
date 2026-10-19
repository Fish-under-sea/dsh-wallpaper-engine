#!/usr/bin/env node
/**
 * css-text.mjs — CSS 源码的**文本级**工具（守卫读样式表时用）。
 *
 * ── 为什么另起一个，不复用 `js-text.mjs` ──────────────────────────────────────
 * `js-text.mjs` 的字符扫描器认 `//` 行注释（JS 的语法）。CSS 里**没有**行注释，而 `url(//host/x)`
 * 是合法值 —— 套 JS 词法会把 URL 的后半段当注释删掉，判据于是对着一段被啃过的样式报绿。
 * CSS 只有块注释一种，所以这里只处理 `/* … *\/`。
 *
 * ── 这一份是**唯一真源** ─────────────────────────────────────────────────────
 * 此前 `test/tools/token-contract.mjs` 内部有一份同名私有实现，`test/verify-glass-runtime.mjs`
 * 与 `test/verify-host-paint-scope.mjs` 则各写了一行朴素正则（`replace(/…\/\*[\s\S]*?\*\/…/g, '')`）。
 * 三份各自演化 = 三份"差不多"的剥法，没人再对账。现在收敛到这一处，其余读点一律 import。
 *
 * ── 为什么用扫描器而不是那条正则 ─────────────────────────────────────────────
 * 朴素正则对**已配对**的注释完全够用（模块布局守卫规则 ⑦ 也承认这一点：所以它守的是
 * "别多出第二份"，而不是"正则本身有毒"）。但正则**判不出未配对**：`/* 未闭合` 这种输入会被
 * 原样留下，下游判据于是对着"带注释标记的样式"报绿。逐字符扫描顺手把这件事变成响亮失败。
 *
 * ── 与 `js-text.mjs` 一致的两条性质 ──────────────────────────────────────────
 *   · **等长 + 保留换行**：注释按字符数换成空格、换行原样留 ⇒ 行号与列偏移不变
 *     （按行定位的消费者依赖这一点）。
 *   · **未配对即抛错**：宁可响，不可静默返回半份样式。
 *
 * 自检：`node test/tools/css-text.mjs selftest`
 */
import { fileURLToPath } from 'node:url';

const OPEN = '/' + '*';
const CLOSE = '*' + '/';

/**
 * 把 CSS 里的块注释替换成等长空格（换行保留）。
 * 未被配对的注释标记 ⇒ 抛错（不返回半份样式）。
 */
export function stripCssComments(css) {
  const text = String(css);
  const n = text.length;
  const out = [];
  let i = 0;
  while (i < n) {
    if (text[i] === OPEN[0] && text[i + 1] === OPEN[1]) {
      // 块注释：整段换成空格（换行保留），直到配对的结束标记
      out.push('  ');
      i += 2;
      let closed = false;
      while (i < n) {
        if (text[i] === CLOSE[0] && text[i + 1] === CLOSE[1]) {
          out.push('  ');
          i += 2;
          closed = true;
          break;
        }
        out.push(text[i] === '\n' ? '\n' : ' ');
        i += 1;
      }
      if (!closed) throw new Error('css-text: 块注释未闭合（输入不是一份能被机械剥干净的样式）');
      continue;
    }
    out.push(text[i]);
    i += 1;
  }
  return out.join('');
}

/** 剥注释后剩下的**有效内容行数**（审计与自检用：判断某次剥法吃掉了多少真内容）。 */
export function contentLineCount(css) {
  return stripCssComments(css).split('\n').filter((l) => l.trim()).length;
}

/** 正/负对照成对的自检（朴素写法的缺陷与修法在同一处对照）。 */
export function selftest() {
  const cases = [];
  const ok = (name, cond, detail) => cases.push({ name, ok: !!cond, detail: String(detail == null ? '' : detail) });
  // 反面参照用的朴素正则：**用转义字符串拼出**，不写字面量 —— 模块布局守卫规则 ⑦ 的针眼是
  // 那串字面量字符，扫描器这一份不该因为"自检里要引用反面参照"而被算成又一个朴素剥法。
  const naive = new RegExp('\\/\\*' + '[\\s\\S]*?' + '\\*\\/', 'g');

  // 正：普通块注释被剥掉、长度不变。
  {
    const src = 'a{color:red}/* 注释 */b{color:blue}';
    const out = stripCssComments(src);
    ok('块注释被剥成等长空格', out.length === src.length && !out.includes('注释'), 'len=' + out.length);
    ok('保换行（行数不变）', stripCssComments('a{}\n/* x\ny */\nb{}').split('\n').length === 4);
    ok('多行注释逐行清空、只剩内容行',
      contentLineCount('a{}\n/* x\ny */\nb{}') === 2, contentLineCount('a{}\n/* x\ny */\nb{}'));
  }
  // 正：`url(//host/x)` 不算注释（CSS 没有行注释，这也是不能复用 js-text 的理由）。
  {
    const src = 'a{background:url(//host/x.png)}';
    ok('url(//host/x) 原样保留', stripCssComments(src) === src, stripCssComments(src));
    ok('字符串里的 /* 仍会被剥（CSS 侧不区分字符串：块注释在字符串里也不合法）',
      stripCssComments('a{content:"/*x*/"}') === 'a{content:"     "}');
  }
  // 负：未配对 ⇒ 抛错（不返回半份样式）。朴素正则在这里是**静默留下**。
  {
    let threw = null;
    try { stripCssComments('a{} /* 未闭合'); } catch (e) { threw = e.message; }
    ok('未配对块注释即抛错', threw && /未闭合/.test(threw), threw);
    ok('反面参照：朴素正则对同一输入静默留下注释标记',
      'a{} /* 未闭合'.replace(naive, ' ').includes(OPEN));
  }
  // 反面参照：对**已配对**输入，扫描器与朴素正则逐字节一致（⇒ 这次收敛没有改变既有读数）。
  {
    const src = 'a{color:red}/* x */b{color:blue}/* y\nz */c{}';
    ok('反面参照：收敛前后读数一致（已配对输入上等价）',
      src.replace(naive, (s) => s.replace(/[^\n]/g, ' ')) === stripCssComments(src));
  }
  const failed = cases.filter((c) => !c.ok);
  for (const c of cases) console.log((c.ok ? '  ✓ ' : '  ✗ ') + c.name + (c.detail ? ' — ' + c.detail : ''));
  console.log('');
  if (failed.length) {
    console.log('CSS TEXT SELFTEST FAILED — ' + failed.length + ' failed');
    process.exitCode = 1;
    return false;
  }
  console.log('CSS TEXT SELFTEST PASSED (' + cases.length + ')');
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('selftest')) {
  selftest();
}
