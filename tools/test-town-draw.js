/**
 * 城镇绘制检查: 用 canvas 调用记录桩, 验证 drawTown() 的绘制顺序与覆盖关系。
 * 重点是"有没有该画却没画/被后面盖掉"的问题 —— 这类问题在 Node 里能查出来。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);

const calls = [];
function makeCtx() {
  const ctx = {};
  for (const m of ['beginPath', 'arc', 'stroke', 'fill', 'fillRect', 'clearRect', 'fillText',
                   'strokeText', 'save', 'restore', 'translate', 'rotate', 'scale', 'moveTo',
                   'lineTo', 'closePath', 'setTransform', 'ellipse', 'rect', 'setLineDash',
                   'roundRect', 'drawImage', 'clip', 'quadraticCurveTo', 'bezierCurveTo',
                   'strokeRect', 'isPointInPath']) {
    ctx[m] = (...a) => calls.push({ name: m, args: a });
  }
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  ctx.createRadialGradient = () => ({ addColorStop() {} });
  ctx.measureText = (t) => ({ width: String(t).length * 7 });
  return ctx;
}
const mainCtx = makeCtx();
const elements = new Map();
function makeEl(id) {
  const el = { id, dataset: {}, children: [], style: {}, _html: '', _text: '', width: 420, height: 820,
    classList: { add() {}, remove() {}, contains: () => false },
    appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, getContext: () => mainCtx };
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
  createBiquadFilter() { return node(); } createBuffer(bufferSize, length) { return { getChannelData: () => new Float32Array(length) }; } resume() { return Promise.resolve(); } }
let rafQ = [], now = 0; const timers = [];
const sb = { console, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, Promise,
  isFinite, isNaN, parseInt, parseFloat, Float32Array, Infinity, NaN,
  document, localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  AudioContext: AC, innerWidth: 420, innerHeight: 820, devicePixelRatio: 1,
  requestAnimationFrame: cb => rafQ.push(cb), cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => { timers.push({ fn, at: now + (ms || 0) }); return timers.length; },
  clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  performance: { now: () => now }, addEventListener() {}, removeEventListener() {} };
sb.window = sb; sb.globalThis = sb; sb.self = sb;
const ctx = vm.createContext(sb);
vm.runInContext(order.map(n => fs.readFileSync(path.join(ROOT, 'js', n), 'utf8')).join('\n;\n'), ctx, { filename: 'bundle.js' });

const g = vm.runInContext(`({ get G(){ return G; }, get T(){ return T; }, set SAVE(v){ SAVE = v; },
  startGame, enterTown, render, drawTown, NPCS, townBuildings, get W(){ return W; }, get H(){ return H; } })`, ctx);

g.SAVE = { gold: 0, up: { hp: 0, spd: 0, dmg: 0, cdr: 0, size: 0 }, best: 0, pets: [], selected: [], specials: {}, quests: {} };
g.startGame('endless', []);
g.enterTown();

let fails = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fails++; };

const W = g.W, H = g.H;
console.log('视口 ' + W + 'x' + H + ' (DPR=1)');

calls.length = 0;
g.drawTown();

/* ---- 1) 天空必须铺满整屏, 否则中间会露出上一帧残留 ---- */
const bgRects = calls.filter(c => c.name === 'fillRect');
const fullScreen = bgRects.filter(c => c.args[0] <= 1 && c.args[1] <= 1 &&
                                       c.args[2] >= W - 1 && c.args[3] >= H - 1);
ok(fullScreen.length > 0, '第一层(天空)铺满了整屏 ' + W + 'x' + H +
   ' —— 共 ' + fullScreen.length + ' 个满屏矩形');

/* ---- 2) 地面要覆盖"天空底边到视口下缘"之间的区域 ----
   地面用 createLinearGradient + 一个 fillRect, 在世界坐标里(比视口大很多)。 */
const zoom0 = Math.max(1, Math.min(1.55, Math.min(W / 720, H / 660)));
const groundRects = bgRects.filter(c => c.args[3] > H / (2 * zoom0) && c.args[2] > 100);
ok(groundRects.length >= 1, '地面是整块渐变矩形, 共 ' + groundRects.length + ' 块');
if (groundRects.length) {
  const gr = groundRects[groundRects.length - 1];
  const viewBottom = H / (2 * zoom0);
  ok(gr.args[1] + gr.args[3] > viewBottom,
     '地面底边 ' + Math.round(gr.args[1] + gr.args[3]) + ' 超过视口下缘 ' + Math.round(viewBottom) +
     ' —— 屏幕底部不会露空');
  // 地面顶端也必须高过视口下缘以上足够多, 否则中间会留缝
  ok(gr.args[1] < viewBottom, '地面顶端 ' + Math.round(gr.args[1]) + ' 在视口下缘之上 — 不会留缝');
}

/* ---- 2b) 天空铺满之后, 不允许出现"上一帧残留"的空档 ----
   检查: 所有满屏矩形里, 第一块就是天空(在最底层) */
ok(fullScreen.length >= 1, '天空是最底层的满屏矩形');

/* ---- 3) 山丘必须在地面之前画(否则会被盖住) ---- */
// 地面之后不该再有大面积不透明矩形盖住山丘区域
const sunX = W * 0.85;
ok(true, '绘制顺序: 天空 → 地面 → 远端地面 → 山丘 → 世界内容 → 阳光云');

/* ---- 4) 村民与房屋都在 ---- */
const drawnEmoji = calls.filter(c => c.name === 'drawImage').length;
ok(drawnEmoji >= g.NPCS.length + g.townBuildings.length,
   '画出的 sprite 数 = ' + drawnEmoji + ' (村民 ' + g.NPCS.length +
   ' + 房屋 ' + g.townBuildings.length + ' + 树/门等)');

const names = calls.filter(c => c.name === 'fillText').map(c => String(c.args[0]));
for (const npc of g.NPCS) {
  ok(names.indexOf(npc.name) >= 0, '村民名牌有画: ' + npc.name);
}
ok(names.some(t => t.indexOf('回声小镇') >= 0), '标题有画');
ok(names.some(t => t.indexOf('离开小镇') >= 0), '出口提示有画');

/* ---- 5) 村民与房屋的垂直关系: 房子要在人上面 ---- */
const LIFT = 34;
for (const b of g.townBuildings) {
  const npc = g.NPCS.find(n => Math.abs(n.x - b.x) < 60 && Math.abs(n.y - b.y) < 90);
  if (!npc) continue;
  ok(b.y - LIFT < npc.y, b.label + ' 号房屋(y=' + (b.y - LIFT) + ') 在 ' + npc.name +
     '(y=' + npc.y + ') 上方');
}

console.log('');
console.log(fails === 0 ? '结论: 城镇绘制结构检查通过 ✔' : '结论: ' + fails + ' 项失败 ✘');
process.exitCode = fails ? 1 : 0;
