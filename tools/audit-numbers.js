/**
 * 数值审计: 用运行时实测验证几处可疑的加成是否被重复计算 / 是否符合预期。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);

const elements = new Map();
function makeEl(id) {
  const cls = new Set();
  return { id, tagName: 'DIV', dataset: {}, children: [], style: {}, textContent: '', innerHTML: '', disabled: false, className: '',
    classList: { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)), contains: c => cls.has(c) },
    appendChild(c) { this.children.push(c); return c; }, removeChild() {}, addEventListener() {}, removeEventListener() {},
    getContext: () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => (t[k] = v, true) }) };
}
const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
  createElement(t) { const e = makeEl('c-' + t); e.tagName = String(t).toUpperCase(); return e; },
  querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, body: makeEl('body') };
const store = new Map();
function param() { return { value: 0, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; } }; }
function node() { return { connect() { return this; }, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: '', buffer: null }; }
class AC { constructor() { this.sampleRate = 44100; this.state = 'running'; this.destination = node(); this.currentTime = 0; }
  createGain() { return node(); } createOscillator() { return node(); } createBufferSource() { return node(); }
  createBiquadFilter() { return node(); } createBuffer(c, l) { return { getChannelData: () => new Float32Array(l) }; } resume() { return Promise.resolve(); } }

let rafQ = [], now = 0; const timers = [];
const sb = { console, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, Promise,
  isFinite, isNaN, parseInt, parseFloat, Float32Array, Infinity, NaN,
  document, localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  AudioContext: AC, innerWidth: 400, innerHeight: 800, devicePixelRatio: 2,
  requestAnimationFrame: cb => rafQ.push(cb), cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => { timers.push({ fn, at: now + (ms || 0) }); return timers.length; }, clearTimeout: () => {},
  setInterval: () => 0, clearInterval: () => {}, performance: { now: () => now },
  addEventListener() {}, removeEventListener() {} };
sb.window = sb; sb.globalThis = sb; sb.self = sb;
const ctx = vm.createContext(sb);
vm.runInContext(order.map(n => fs.readFileSync(path.join(ROOT, 'js', n), 'utf8')).join('\n;\n'), ctx, { filename: 'bundle.js' });

const g = vm.runInContext(`({
  get P(){ return P; }, get SAVE(){ return SAVE; }, set SAVE(v){ SAVE = v; },
  createPlayer, recalcStats, startGame, expForLevel, SHOP_ITEMS, buyShop, openShop,
  get G(){ return G; }
})`, ctx);

let fails = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fails++; };

console.log('=== 1. 永久生命强化(局外强化 SAVE.up.hp)是否被重复计算 ===');
console.log('   设计意图(见 createPlayer): 基础生命 = 100 + SAVE.up.hp * 22');
for (const n of [0, 1, 3, 5, 10]) {
  g.SAVE = { gold: 0, up: { hp: n, spd: 0, dmg: 0, cdr: 0, size: 0 }, best: 0, pets: [], selected: [] };
  const p = g.createPlayer();
  const fromCreatePlayer = p.maxHp;
  // recalcStats 会在 startGame 里被调用
  g.startGame('endless', []);
  const afterRecalc = g.P.maxHp;
  const expect = 100 + n * 22;
  const mark = afterRecalc === expect ? '✔' : '✘';
  console.log('   %s SAVE.up.hp=%d -> createPlayer=%d, recalcStats 之后=%d (期望 %d)%s',
    mark, n, fromCreatePlayer, afterRecalc, expect,
    afterRecalc !== expect ? '  <-- 多算了 ' + (afterRecalc - expect) : '');
  if (afterRecalc !== expect) fails++;
}

console.log('');
console.log('=== 2. 对照: 局内商店的"生命强化"(P.up.maxhp) ===');
console.log('   设计意图: 每次 +22');
g.SAVE = { gold: 0, up: { hp: 0, spd: 0, dmg: 0, cdr: 0, size: 0 }, best: 0, pets: [], selected: [] };
g.startGame('endless', []);
const hp0 = g.P.maxHp;
g.P.up.maxhp = 1; g.recalcStats();
const hp1 = g.P.maxHp;
g.P.up.maxhp = 2; g.recalcStats();
const hp2 = g.P.maxHp;
ok(hp1 - hp0 === 22, '买 1 次局内生命强化: ' + hp0 + ' -> ' + hp1 + ' (差 ' + (hp1 - hp0) + ', 期望 22)');
ok(hp2 - hp1 === 22, '再买 1 次: ' + hp1 + ' -> ' + hp2 + ' (差 ' + (hp2 - hp1) + ', 期望 22)');

console.log('');
console.log('=== 3. 其它永久强化是否也存在重复计算 ===');
g.SAVE = { gold: 0, up: { hp: 0, spd: 4, dmg: 6, cdr: 5, size: 2 }, best: 0, pets: [], selected: [] };
g.startGame('endless', []);
console.log('   SAVE.up = spd:4 dmg:6 cdr:5 size:2');
console.log('   实际: speed=%.1f  dmgMult=%.3f  cdr=%.3f  sizeScale=%.2f',
  g.P.speed, g.P.dmgMult, g.P.cdr, g.P.sizeScale);
console.log('   期望(见 recalcStats): speed=205*(1+0.04*4)=%.1f  dmgMult=1*(1+0.05*6)=%.2f  cdr=min(0.03*5,0.72)=%.2f  sizeScale=1-0.04*2=%.2f',
  205 * (1 + 0.04 * 4), 1 * (1 + 0.05 * 6), Math.min(0.03 * 5, 0.72), 1 - 0.04 * 2);

console.log('');
console.log('=== 4. 商店"缩小"与玩家半径是否同步 ===');
g.SAVE = { gold: 0, up: { hp: 0, spd: 0, dmg: 0, cdr: 0, size: 0 }, best: 0, pets: [], selected: [] };
g.startGame('endless', []);
g.G.runGold = 99999; g.openShop();
const before = { r: g.P.r, sc: g.P.sizeScale };
for (let i = 0; i < 3; i++) g.buyShop(g.SHOP_ITEMS.find(s => s.id === 'size'), 10);
console.log('   缩小 3 次: r %s -> %s, sizeScale %s -> %s, r 是否等于 15*sizeScale: %s',
  before.r.toFixed(2), g.P.r.toFixed(2), before.sc.toFixed(2), g.P.sizeScale.toFixed(2),
  Math.abs(g.P.r - 15 * g.P.sizeScale) < 1e-9 ? '是 ✔' : '否 ✘');

console.log('');
console.log('=== 5. 技能冷却缩减上限 ===');
g.startGame('endless', []);
g.P.up.cdr = 100; g.recalcStats();
console.log('   局内急速堆到 +100 层后 cdr = %s (设计上限 0.72)', g.P.cdr);
ok(g.P.cdr <= 0.72 + 1e-9, '冷却缩减被正确限制在 72% 以内');

console.log('');
console.log(fails === 0 ? '结论: 未发现数值重复计算' : '结论: 发现 ' + fails + ' 处数值问题');
