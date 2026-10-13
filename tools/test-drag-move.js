/**
 * 测试: 拖拽屏幕走路(虚拟摇杆)
 *   1) 在城镇里拖拽能移动(修复前被 if (G.state !== 'playing') return 挡掉)
 *   2) 在城镇里摇杆会画出来
 *   3) 正常游戏里拖拽照旧可用
 *   4) 菜单等状态不会误触发摇杆
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);

/* canvas 桩: 记录被注册的事件监听, 以便测试里手动派发 */
const listeners = {};
const drawn = [];
function makeCtx() {
  const ctx = {};
  for (const m of ['beginPath', 'arc', 'stroke', 'fill', 'fillRect', 'clearRect', 'fillText',
                   'strokeText', 'save', 'restore', 'translate', 'rotate', 'scale', 'moveTo',
                   'lineTo', 'closePath', 'setTransform', 'ellipse', 'rect', 'setLineDash',
                   'roundRect', 'drawImage', 'clip', 'quadraticCurveTo', 'bezierCurveTo',
                   'strokeRect', 'createPattern', 'isPointInPath']) {
    ctx[m] = (...a) => drawn.push({ name: m, args: a });
  }
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  ctx.createRadialGradient = () => ({ addColorStop() {} });
  ctx.measureText = () => ({ width: 20 });
  return ctx;
}
const mainCtx = makeCtx();
const canvas = { width: 800, height: 450, style: {}, classList: { add() {}, remove() {}, contains: () => false },
  getContext: () => mainCtx, addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
  removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }) };
const winListeners = {};
const elements = new Map();
function makeEl(id) {
  const el = { id, dataset: {}, children: [], style: {}, _html: '', _text: '', width: 800, height: 450,
    classList: { add() {}, remove() {}, contains: () => false },
    appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, getContext: () => mainCtx };
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); } });
  Object.defineProperty(el, 'textContent', { get() { return this._text; }, set(v) { this._text = String(v); } });
  return el;
}
if (!elements.has('c')) elements.set('c', canvas);   // game.js 用的是 id="c"
const document = { hidden: false, head: makeEl('head'), body: makeEl('body'),
  getElementById(id) { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
  createElement(t) { return makeEl(t); }, querySelectorAll: () => [], querySelector: () => null,
  addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); } };
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
  AudioContext: AC, innerWidth: 800, innerHeight: 450, devicePixelRatio: 1,
  requestAnimationFrame: cb => rafQ.push(cb), cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => { timers.push({ fn, at: now + (ms || 0) }); return timers.length; },
  clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  performance: { now: () => now },
  addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); }, removeEventListener() {} };
sb.window = sb; sb.globalThis = sb; sb.self = sb;
const ctx = vm.createContext(sb);
vm.runInContext(order.map(n => fs.readFileSync(path.join(ROOT, 'js', n), 'utf8')).join('\n;\n'), ctx, { filename: 'bundle.js' });

const g = vm.runInContext(`({ get G(){ return G; }, get P(){ return P; }, get T(){ return T; }, set SAVE(v){ SAVE = v; },
  startGame, enterTown, leaveTown, render, input, canMoveByDrag, get enemies(){ return enemies; } })`, ctx);

function run(ms) {
  const frames = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < frames; i++) {
    now += 16; const q = rafQ; rafQ = [];
    for (const cb of q) cb(now);
    for (let k = timers.length - 1; k >= 0; k--) if (timers[k].at <= now) { const f = timers[k].fn; timers.splice(k, 1); f(); }
  }
}
/* 派发 canvas 上的事件; mousemove/mouseup 挂在 window 上 */
function fire(type, ev) {
  const list = (type === 'mousemove' || type === 'mouseup') ? winListeners[type] : listeners[type];
  for (const fn of (list || [])) fn(ev);
}
let fails = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fails++; };

function reset() {
  g.SAVE = { gold: 0, up: { hp: 0, spd: 0, dmg: 0, cdr: 0, size: 0 }, best: 0, pets: [], selected: [], specials: {}, quests: {}, seenEnemies: [], seenPets: [] };
  g.startGame('endless', []);
  run(32);
}

console.log('canvas 上注册的事件: ' + Object.keys(listeners).join(', '));
console.log('');
console.log('=== 1. 拖拽走路: 正常游戏里可用 ===');
reset();
{
  const x0 = g.P.x;
  fire('mousedown', { clientX: 400, clientY: 225 });
  ok(g.input.joy.active === true, '按下后摇杆激活');
  fire('mousemove', { clientX: 460, clientY: 225 });   // 往右拖
  run(500);
  ok(g.P.x > x0 + 5, '往右拖后玩家向右移动 ' + Math.round(x0) + ' → ' + Math.round(g.P.x));
  fire('mouseup', {});
  ok(g.input.joy.active === false, '松开后摇杆关闭');
}

console.log('');
console.log('=== 2. 拖拽走路: 城镇里也要可用(本次修复) ===');
reset();
g.enterTown();
run(32);
ok(g.G.state === 'town', '已进入城镇');
ok(g.canMoveByDrag() === true, 'canMoveByDrag() 在城镇里返回 true');
{
  const tx0 = g.T.x;
  fire('mousedown', { clientX: 400, clientY: 225 });
  ok(g.input.joy.active === true, '城镇里按下后摇杆激活(修复前这里不会被激活)');
  fire('mousemove', { clientX: 470, clientY: 225 });
  run(400);
  ok(g.T.x > tx0 + 5, '城镇里往右拖后角色向右移动 ' + Math.round(tx0) + ' → ' + Math.round(g.T.x));
  fire('mouseup', {});
  ok(g.input.joy.active === false, '松开后摇杆关闭');
}

console.log('');
console.log('=== 3. 城镇里摇杆要画出来 ===');
{
  fire('mousedown', { clientX: 400, clientY: 225 });
  fire('mousemove', { clientX: 460, clientY: 225 });
  drawn.length = 0;
  g.render();
  // 摇杆是画在屏幕坐标的两个圆: 外圈 58, 内圈 24
  const ring = drawn.filter(c => c.name === 'arc' && (c.args[2] === 58 || c.args[2] === 24));
  ok(ring.length >= 2, '城镇里画出了摇杆(' + ring.length + ' 个圆)');
  fire('mouseup', {});
}

console.log('');
console.log('=== 4. 触摸事件同理 ===');
reset();
g.enterTown();
run(32);
{
  const tx0 = g.T.x;
  fire('touchstart', { preventDefault() {}, touches: [{ clientX: 400, clientY: 225, identifier: 7 }] });
  ok(g.input.joy.active === true, '触摸按下后摇杆激活');
  fire('touchmove', { preventDefault() {}, touches: [{ clientX: 480, clientY: 225, identifier: 7 }] });
  run(400);
  ok(g.T.x > tx0 + 5, '城镇里触摸拖拽能移动 ' + Math.round(tx0) + ' → ' + Math.round(g.T.x));
  fire('touchend', { preventDefault() {}, touches: [] });
  ok(g.input.joy.active === false, '抬手后摇杆关闭');
}

console.log('');
console.log('=== 5. 不该走的状态不会误触发摇杆 ===');
reset();
g.G.state = 'menu';
fire('mousedown', { clientX: 400, clientY: 225 });
ok(g.input.joy.active === false, '主菜单里按下不会激活摇杆');
fire('touchstart', { preventDefault() {}, touches: [{ clientX: 400, clientY: 225, identifier: 1 }] });
ok(g.input.joy.active === false, '主菜单里触摸不会激活摇杆');
ok(g.canMoveByDrag() === false, 'canMoveByDrag() 在菜单里返回 false');

console.log('');
console.log(fails === 0 ? '结论: 拖拽走路(含城镇)全部通过 ✔' : '结论: ' + fails + ' 项失败 ✘');
process.exitCode = fails ? 1 : 0;
