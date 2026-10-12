/**
 * 针对新修复的回归测试:
 *   1) 切到后台(visibilitychange -> hidden)时游戏自动暂停, 且不再推进时间
 *   2) 切回来时能正确恢复(短暂离开静默恢复 / 离开久了显示暂停菜单)
 *   3) 手动暂停后, 切后台再回来不会把游戏擅自恢复成 "进行中"
 *   4) 静音时 BGM 调度器被真正停掉(clearInterval 被调用)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);

/* ---------- DOM 桩: 支持 visibilitychange 与 document.hidden ---------- */
const elements = new Map();
const docListeners = {};
function makeEl(id) {
  const cls = new Set();
  return { id, tagName: 'DIV', dataset: {}, children: [], style: {}, textContent: '', innerHTML: '',
    disabled: false, className: '',
    classList: { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)), contains: c => cls.has(c) },
    appendChild(c) { this.children.push(c); return c; }, removeChild() {},
    addEventListener() {}, removeEventListener() {},
    getContext: () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => (t[k] = v, true) }) };
}
const document = {
  hidden: false,
  getElementById(id) { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
  createElement(t) { const e = makeEl('c-' + t); e.tagName = String(t).toUpperCase(); return e; },
  querySelectorAll: () => [], querySelector: () => null, body: makeEl('body'),
  addEventListener(ev, fn) { (docListeners[ev] = docListeners[ev] || []).push(fn); },
  removeEventListener() {},
};
function fire(ev) { (docListeners[ev] || []).forEach(fn => fn({ type: ev })); }

const store = new Map();
function param() { return { value: 0, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; } }; }
function node() { return { connect() { return this; }, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: '', buffer: null }; }
/* 记录 setInterval / clearInterval 调用, 用于验证 BGM 是否真的被停掉 */
const intervalLog = [];
let intervalId = 100;
class AC { constructor() { this.sampleRate = 44100; this.state = 'running'; this.destination = node(); this.currentTime = 0; }
  createGain() { return node(); } createOscillator() { return node(); } createBufferSource() { return node(); }
  createBiquadFilter() { return node(); } createBuffer(c, l) { return { getChannelData: () => new Float32Array(l) }; }
  resume() { this.state = 'running'; return Promise.resolve(); } }

let rafQ = [], now = 0; const timers = [];
const sb = { console, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, Promise,
  isFinite, isNaN, parseInt, parseFloat, Float32Array, Infinity, NaN,
  document, localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  AudioContext: AC, innerWidth: 400, innerHeight: 800, devicePixelRatio: 2,
  requestAnimationFrame: cb => rafQ.push(cb), cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => { timers.push({ fn, at: now + (ms || 0) }); return timers.length; },
  clearTimeout: () => {},
  setInterval: () => { const id = ++intervalId; intervalLog.push({ op: 'set', id, timer: null }); return id; },
  clearInterval: id => { intervalLog.push({ op: 'clear', id }); },
  performance: { now: () => now }, addEventListener() {}, removeEventListener() {} };
sb.window = sb; sb.globalThis = sb; sb.self = sb;
const ctx = vm.createContext(sb);
vm.runInContext(order.map(n => fs.readFileSync(path.join(ROOT, 'js', n), 'utf8')).join('\n;\n'), ctx, { filename: 'bundle.js' });

const g = vm.runInContext(`({
  get G(){ return G; }, get P(){ return P; },
  startGame, pauseGame, resumeGame, initAudio, el, updateHUD,
  get musicOn(){ return musicOn; }, set musicOn(v){ musicOn = v; }
})`, ctx);
/* initAudio 需要 window.AudioContext, 上面已提供 */
sb.AudioContext = AC;

function frames(n) {
  for (let i = 0; i < n; i++) {
    now += 16;
    const q = rafQ; rafQ = [];
    for (const cb of q) cb(now);
    for (let k = timers.length - 1; k >= 0; k--) if (timers[k].at <= now) { const f = timers[k].fn; timers.splice(k, 1); f(); }
  }
}
let fails = 0;
function ok(cond, msg) { console.log((cond ? '✔ ' : '✘ ') + msg); if (!cond) fails++; }

console.log('=== 1. 切到后台自动暂停 ===');
g.startGame('endless', []);
frames(60);
const tBefore = g.G.time;
ok(g.G.state === 'playing', '开局状态为 playing');
document.hidden = true; fire('visibilitychange');
ok(g.G.state === 'paused', '切后台后 state = ' + g.G.state + ' (期望 paused)');
frames(60);
ok(Math.abs(g.G.time - tBefore) < 0.001, '暂停后时间不推进 (之前 ' + tBefore.toFixed(2) + 's, 现在 ' + g.G.time.toFixed(2) + 's)');

console.log('');
console.log('=== 2. 很快切回来 -> 静默恢复(不弹暂停菜单) ===');
now += 800;                       // 离开 0.8 秒, 小于 3 秒阈值
document.hidden = false; fire('visibilitychange');
ok(g.G.state === 'playing', '短暂离开后自动恢复为 playing, 实际 ' + g.G.state);
ok(elements.get('pauseVeil').classList.contains('hidden'), '暂停菜单保持隐藏(没有打断玩家)');

console.log('');
console.log('=== 3. 离开很久 -> 恢复时弹出暂停菜单 ===');
document.hidden = true; fire('visibilitychange');
ok(g.G.state === 'paused', '再次切后台 -> paused');
now += 30000;                     // 离开 30 秒
document.hidden = false; fire('visibilitychange');
ok(g.G.state === 'paused', '长时间离开后停在 paused 状态等玩家确认, 实际 ' + g.G.state);
ok(!elements.get('pauseVeil').classList.contains('hidden'), '暂停菜单已显示给玩家');

console.log('');
console.log('=== 4. 手动暂停不会被切后台逻辑擅自恢复 ===');
g.resumeGame();                   // 玩家手动继续
ok(g.G.state === 'playing', '手动继续成功');
g.pauseGame();                    // 玩家手动暂停
ok(g.G.state === 'paused', '手动暂停成功');
document.hidden = false; fire('visibilitychange');   // 触发一次不影响
ok(g.G.state === 'paused', '手动暂停后仍保持 paused (没被自动恢复)');

console.log('');
console.log('=== 5. 静音 / 切后台时 BGM 调度器被真正停掉 ===');
// 注意: startGame() 内部就会调用 initAudio(), 所以 BGM 定时器在开局时已经创建
const created = intervalLog.filter(x => x.op === 'set').length;
ok(created > 0, 'BGM 定时器已创建 (' + created + ' 次)');
ok(typeof vm.runInContext('typeof stopMusic', ctx) === 'string' &&
   vm.runInContext('typeof stopMusic', ctx) === 'function', '新增了 stopMusic() 清理函数');

const clearBefore = intervalLog.filter(x => x.op === 'clear').length;
vm.runInContext('musicOn = false; musicScheduler();', ctx);   // 静音后调度器应自杀
const clearAfterOff = intervalLog.filter(x => x.op === 'clear').length;
ok(clearAfterOff > clearBefore, '静音后 musicScheduler 调用 clearInterval 停掉自己');

// 切后台同样应停掉
vm.runInContext('musicOn = true; startMusic();', ctx);
const clearBefore2 = intervalLog.filter(x => x.op === 'clear').length;
document.hidden = true;
vm.runInContext('musicScheduler();', ctx);
const clearAfterHidden = intervalLog.filter(x => x.op === 'clear').length;
ok(clearAfterHidden > clearBefore2, '切后台(document.hidden)后 BGM 调度器同样被停掉');
document.hidden = false;

console.log('');
console.log(fails === 0 ? '结论: 回归测试全部通过 ✔' : '结论: ' + fails + ' 项失败 ✘');
process.exitCode = fails ? 1 : 0;
