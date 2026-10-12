/**
 * 一致性检查: 代码里 el('xxx') / getElementById('xxx') 引用的 id,
 * 是否都能在 index.html 里找到(防止拼写错误导致运行时 null 崩溃)。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const jsDir = path.join(ROOT, 'js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

const defined = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const used = new Map();
for (const f of files) {
  const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  for (const m of src.matchAll(/\bel\(\s*'([^']+)'\s*\)/g)) used.set(m[1], f);
  for (const m of src.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) used.set(m[1], f);
}

console.log('index.html 中定义的 id 共 ' + defined.size + ' 个');
console.log('代码中引用的 id 共 ' + used.size + ' 个');
console.log('');
const missing = [...used].filter(([id]) => !defined.has(id));
if (missing.length === 0) {
  console.log('✔ 所有引用的 id 都存在于 index.html');
} else {
  console.log('✘ 以下 id 被代码引用但 index.html 中没有:');
  for (const [id, f] of missing) console.log('   ' + id + '  (来自 ' + f + ')');
  process.exitCode = 1;
}

// 反向: index.html 里定义了但从未被引用的 id(可能是死元素)
const unused = [...defined].filter(id => !used.has(id));
const ignorable = /^(c|ui|menu|help|pauseVeil|resetVeil|petHome|petSelect|hatchVeil|levelup|shop|over|toast|npcDlg|townBar|townPrompt|btnTownAct)$/;
const dead = unused.filter(id => !ignorable.test(id));
console.log('');
console.log('未被代码直接引用的 id: ' + (unused.length ? unused.join(', ') : '(无)'));
if (dead.length) console.log('   其中非结构性元素(值得留意): ' + dead.join(', '));
