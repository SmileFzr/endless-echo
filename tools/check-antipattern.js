/**
 * 反模式检查: 找出 JS 里的 `(x || 默认值)` 用于"递减到零"的计时器。
 *
 * 为什么危险: 当 x 归零后, `0 || 默认值` 会得到默认值, 计时器被重置,
 * 于是 `<= 0` 永远不成立, 该效果永远触发不了。
 * 本项目已经在精英特性上栽过三次(冰弹 / 咆哮 / 闪现)。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const jsDir = path.join(ROOT, 'js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

/* 只挑"默认值非零"的: (x || 3) - dt
   默认值为 0 时 (0 || 0) === 0 是安全的, 不必报。 */
const BAD = /\(\s*[A-Za-z_$][\w$.]*\s*\|\|\s*(?!0[\s).,;])\d[\d.]*\s*\)\s*[-+]=?\s*[A-Za-z_$]/;
/* 正确写法: 先 typeof 判断再赋值, 或用 cdTick() */
const GOOD = /typeof\s+[\w$.]+\s*!==\s*'number'|cdTick\(/;

let bad = [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(jsDir, f), 'utf8').split('\n');
  lines.forEach((l, i) => {
    const code = l.replace(/\/\/.*$/, '');
    if (BAD.test(code)) bad.push({ file: f, line: i + 1, text: l.trim() });
  });
}

console.log('=== `(x || 默认值) - dt` 反模式检查 ===');
if (bad.length === 0) {
  console.log('   ✔ 没有发现: 递减计时器都用 typeof 判断或 cdTick()');
} else {
  console.log('   ✘ 发现 ' + bad.length + ' 处, 归零后会被重置, 效果永远触发不了:');
  for (const b of bad) console.log('     ' + b.file + ':' + b.line + '  ' + b.text.slice(0, 90));
}

// 额外报告: 哪些文件用了 cdTick(说明采用了正确写法)
const users = files.filter(f => GOOD.test(fs.readFileSync(path.join(jsDir, f), 'utf8')));
console.log('');
console.log('采用安全写法的文件: ' + (users.length ? users.join(', ') : '(无)'));

// ---------------------------------------------------------------
// 跨文件重复的顶层 const/let 声明
// 这些文件都是"经典 script", 共享同一个全局作用域, 重复声明会直接抛错:
//   Uncaught SyntaxError: Identifier 'X' has already been declared
// ---------------------------------------------------------------
function topLevelDecls(text) {
  const out = [];
  const lines = text.split('\n');
  let depth = 0;
  for (const raw of lines) {
    const code = raw.replace(/\/\/.*$/, '').replace(/'(?:\\.|[^'\\])*'/g, "''")
                    .replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/`(?:\\.|[^`\\])*`/g, '``');
    if (depth === 0) {
      // 顶层: 行首(可含少量缩进)的 const/let/var 声明
      const m = code.match(/^\s{0,2}(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/);
      if (m) out.push({ name: m[1], line: raw });
    }
    for (const ch of code) {
      if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);
    }
  }
  return out;
}

const decls = new Map();          // 名字 -> [{file, line}]
for (const f of files) {
  for (const d of topLevelDecls(fs.readFileSync(path.join(jsDir, f), 'utf8'))) {
    if (!decls.has(d.name)) decls.set(d.name, []);
    decls.get(d.name).push({ file: f, line: d.line });
  }
}
const clashes = [...decls.entries()].filter(([, v]) => v.length > 1);
console.log('');
console.log('=== 跨文件重复的顶层 const/let 声明 ===');
if (!clashes.length) {
  console.log('   ✔ 没有重复, 加载顺序安全');
} else {
  console.log('   ✘ 发现 ' + clashes.length + ' 个重复标识符(经典 script 共享作用域, 会直接报错):');
  for (const [name, v] of clashes) {
    console.log('     ' + name + ':  ' + v.map(x => x.file + '  ' + x.line.trim().slice(0, 60)).join('   |   '));
  }
}

const problems = bad.length + clashes.length;
console.log('');
console.log(problems === 0 ? '结论: 检查通过' : '结论: 存在 ' + problems + ' 项隐患');
process.exitCode = problems ? 1 : 0;
