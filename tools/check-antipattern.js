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

console.log('');
console.log(bad.length === 0 ? '结论: 检查通过' : '结论: 存在 ' + bad.length + ' 处隐患');
process.exitCode = bad.length ? 1 : 0;
