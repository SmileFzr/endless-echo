/**
 * 检查精英身上的 UI 元素不会互相重叠:
 *   血量圆环 / 血量文字 / "精英"名字 / 脉冲标记圈
 *
 * 之前的问题: 脉冲圈半径 46~54 压在血量圆环(半径 r+14)上,
 * 且 "精英" 文字(sy-62) 与血量文字(e.y-ringR-13) 几乎同一高度, 完全叠住。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);

const calls = [];          // 记录 canvas 绘制调用
function makeCtx() {
  const rec = (name) => (...a) => { calls.push({ name, args: a }); };
  const ctx = {};
  for (const m of ['beginPath', 'arc', 'stroke', 'fill', 'fillRect', 'clearRect', 'fillText',
                   'strokeText', 'save', 'restore', 'translate', 'rotate', 'scale', 'moveTo',
                   'lineTo', 'closePath', 'setTransform', 'ellipse', 'rect', 'quadraticCurveTo',
                   'bezierCurveTo', 'clip', 'drawImage', 'setLineDash', 'roundRect']) {
    ctx[m] = rec(m);
  }
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  ctx.createRadialGradient = () => ({ addColorStop() {} });
  ctx.measureText = (t) => ({ width: String(t).length * 6 });
  return ctx;
}
const mainCtx = makeCtx();
const elements = new Map();
function makeEl(id) {
  const el = { id, dataset: {}, children: [], style: {}, _html: '', _text: '', width: 1920, height: 664,
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}, getContext: () => mainCtx };
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); } });
  Object.defineProperty(el, 'textContent', { get() { return this._text; }, set(v) { this._text = String(v); } });
  return el;
}
const document = { hidden: false, head: makeEl('head'), body: makeEl('body'),
  getElementById(id) { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
  createElement(t) { return makeEl(t); }, querySelectorAll: () => [], querySelector: () => null, addEventListener() {} };
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
  AudioContext: AC, innerWidth: 1920, innerHeight: 664, devicePixelRatio: 1,
  requestAnimationFrame: cb => rafQ.push(cb), cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => { timers.push({ fn, at: now + (ms || 0) }); return timers.length; },
  clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  performance: { now: () => now }, addEventListener() {}, removeEventListener() {} };
sb.window = sb; sb.globalThis = sb; sb.self = sb;
const ctx = vm.createContext(sb);
vm.runInContext(order.map(n => fs.readFileSync(path.join(ROOT, 'js', n), 'utf8')).join('\n;\n'), ctx, { filename: 'bundle.js' });

const g = vm.runInContext(`({ get G(){ return G; }, get P(){ return P; }, set SAVE(v){ SAVE = v; },
  startGame, ELITE_TYPES, eliteDefOf, render, spawnElite, ENEMY_TYPES, get enemies(){ return enemies; } })`, ctx);

function run(ms) {
  const frames = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < frames; i++) {
    now += 16; const q = rafQ; rafQ = [];
    for (const cb of q) cb(now);
    for (let k = timers.length - 1; k >= 0; k--) if (timers[k].at <= now) { const f = timers[k].fn; timers.splice(k, 1); f(); }
  }
}
let fails = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fails++; };

console.log('=== 精英 UI 元素垂直位置检查 ===');
g.SAVE = { gold: 0, up: { hp: 0, spd: 0, dmg: 0, cdr: 0, size: 0 }, best: 0, pets: [], selected: [], specials: {}, quests: {} };
g.startGame('endless', []);

// 把每种精英都放到玩家正前方, 逐帧渲染并记下所有绘制调用
const rows = [];
for (const def of g.ELITE_TYPES) {
  g.enemies.length = 0;
  const base = g.ENEMY_TYPES.elite;
  const hp = 1000;
  g.enemies.push({
    type: 'elite', eliteDef: def.id, name: def.name, x: g.P.x + 200, y: g.P.y,
    vx: 0, vy: 0, r: base.r * def.rMul, size: base.size * def.rMul, hp, maxHp: hp,
    speed: base.speed, dmg: base.dmg, exp: 0, sprite: def.sprite, elite: true, dead: false,
    atkCd: 0, flash: 0, acid: 0, burn: 0, poison: 0, eliteTrait: def.trait, revived: false,
    shootCd: 99, roarCd: 99, poisonTick: 0, chargeCd: 99,
  });
  const e = g.enemies[0];
  const sx = e.x - g.P.x + 1920 / 2, sy = e.y - g.P.y + 664 / 2;

  calls.length = 0;
  g.render();

  // 血量圆环: 圆心是精英的"世界坐标"(drawEnemies 在 -P 平移后绘制)
  const ringArcs = calls.filter(c => c.name === 'arc' &&
    Math.abs(c.args[0] - e.x) < 1 && Math.abs(c.args[1] - e.y) < 1 && c.args[2] > 20);
  const ringR = e.r + 14;

  // 血量文字: 以 "/" 分隔的文本(同样在世界坐标里)
  const hpText = calls.filter(c => (c.name === 'fillText') && /\/\s*\d/.test(String(c.args[0])));
  const hpY = hpText.length ? hpText[0].args[2] : null;

  // "精英" 名字: 屏幕坐标, 圆心 (sx, sy)
  const label = calls.filter(c => (c.name === 'fillText') && String(c.args[0]) === '精英' &&
                                  Math.abs(c.args[1] - sx) < 60);
  const labelY = label.length ? label[0].args[2] : null;

  // 脉冲标记圈: 在"屏幕坐标"里以精英为中心的那个大圈(画在血环之外)
  const pulseArcs = calls.filter(c => c.name === 'arc' &&
    Math.abs(c.args[0] - sx) < 1 && Math.abs(c.args[1] - sy) < 1 && c.args[2] > 20);
  const pulseR = pulseArcs.length ? Math.max(...pulseArcs.map(c => c.args[2])) : null;

  // 血量文字在"世界坐标"里, 精英中心的世界坐标就是 e.y
  const above = (e.y - ringR) - hpY;    // >0 表示血量文字在环顶之上
  const below = labelY - (sy + ringR);  // >0 表示名字在环底之下(屏幕坐标)
  rows.push({ name: def.name, r: e.r, ringR, above, below, pulseR });

  ok(hpY !== null, def.name + ': 画出了血量文字');
  ok(labelY !== null, def.name + ': 画出了精英名字');
  ok(above > 0, def.name + ': 血量文字在圆环上方 ' + Math.round(above) + 'px');
  ok(below > 0, def.name + ': 名字在圆环下方 ' + Math.round(below) + 'px');
  // 关键: 两者不会落到同一个区域(之前的 bug 就是它们几乎同一高度)
  ok(Math.abs(labelY - hpY) > ringR * 2,
     def.name + ': 血量与名字分居圆环两侧, 相距 ' + Math.round(Math.abs(labelY - hpY)) + 'px');
  ok(pulseR === null || pulseR > ringR + 4,
     def.name + ': 脉冲标记圈在血环之外 (标记 ' + (pulseR === null ? '未画' : Math.round(pulseR)) + ' vs 血环 ' + ringR + ')');
}

console.log('');
console.log('=== 各精英身上 UI 元素的位置 ===');
console.log('  名称      体型r  血环R   血量文字在环顶上方   名字在环底下方   标记圈R');
for (const r of rows) {
  console.log('  ' + r.name.padEnd(6) + '  ' + String(Math.round(r.r)).padStart(4) +
              '  ' + String(Math.round(r.ringR)).padStart(5) +
              '  ' + String(Math.round(r.above)).padStart(14) + 'px' +
              '  ' + String(Math.round(r.below)).padStart(12) + 'px' +
              '  ' + (r.pulseR === null ? '     -' : String(Math.round(r.pulseR)).padStart(5)));
}
console.log('  (两者都是正数=确实在环外, 不会压到血环)');

console.log('');
console.log(fails === 0 ? '结论: 精英 UI 元素互不重叠 ✔' : '结论: ' + fails + ' 项失败 ✘');
process.exitCode = fails ? 1 : 0;
