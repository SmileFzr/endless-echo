/**
 * 交互范围核查: 建筑碰撞会不会把玩家推到 NPC 交互范围(62px)之外?
 * 对每个 NPC, 扫描其周围一圈位置, 看有多少位置最终能与它交互。
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
  const el = { id, tagName: 'DIV', dataset: {}, children: [], style: {}, disabled: false, className: '', _html: '', _text: '',
    classList: { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)), contains: c => cls.has(c) },
    appendChild(c) { this.children.push(c); return c; }, removeChild() {}, clearRefs() { this.children = []; },
    addEventListener() {}, removeEventListener() {},
    getContext: () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => (t[k] = v, true) }) };
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); if (!this._html) this.clearRefs(); } });
  Object.defineProperty(el, 'textContent', { get() { return this._text; }, set(v) { this._text = String(v); } });
  return el;
}
const document = { hidden: false, getElementById(id) { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
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
  AudioContext: AC, innerWidth: 420, innerHeight: 820, devicePixelRatio: 2,
  requestAnimationFrame: cb => rafQ.push(cb), cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => { timers.push({ fn, at: now + (ms || 0) }); return timers.length; },
  clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  performance: { now: () => now }, addEventListener() {}, removeEventListener() {} };
sb.window = sb; sb.globalThis = sb; sb.self = sb;
const ctx = vm.createContext(sb);
vm.runInContext(order.map(n => fs.readFileSync(path.join(ROOT, 'js', n), 'utf8')).join('\n;\n'), ctx, { filename: 'bundle.js' });
const g = vm.runInContext('({ NPCS, T, updateTown, townBuildings, get G(){return G;} })', ctx);

g.G.state = 'town';
console.log('NPC 交互半径 = 62px, 玩家半径 = ' + g.T.r);
console.log('建筑碰撞盒 = 建筑尺寸/2 + 玩家半径*0.6\n');

for (const npc of g.NPCS) {
  const b = g.townBuildings.find(x => Math.abs(x.x - npc.x) < 1 && Math.abs(x.y - npc.y) < 1);
  const hh = b ? b.h / 2 + g.T.r * 0.6 : 0;
  const hw = b ? b.w / 2 + g.T.r * 0.6 : 0;
  // 从正下方、正上方、正左、正右四个方向找最近的可站位置
  const probes = [
    ['下', npc.x, npc.y + hh + 6], ['上', npc.x, npc.y - hh - 6],
    ['左', npc.x - hw - 6, npc.y], ['右', npc.x + hw + 6, npc.y],
  ];
  let reachable = 0;
  for (const [dir, px, py] of probes) {
    g.T.x = px; g.T.y = py;
    g.updateTown(0.016);
    const d = Math.hypot(g.T.x - npc.x, g.T.y - npc.y);
    const hit = g.T.near === npc;
    if (hit) reachable++;
    console.log('  %s %-4s 起点(%.0f,%.0f) -> 落点(%d,%d) 距离 %.0fpx %s',
      npc.emoji, dir, px, py, Math.round(g.T.x), Math.round(g.T.y), d, hit ? '可交互 ✔' : '不可交互 ✘');
  }
  console.log('  => %s 共 %d/4 个方向可交互\n', npc.name, reachable);
}

/* ---------- 南门出口必须能够到 ---------- */
console.log('='.repeat(60));
console.log('南门出口可达性 (交互判定 = exit.r + 玩家半径*0.8)');
const need = g.T.exit.r + g.T.r * 0.8;
// 玩家能贴到的最南边
const southLimit = 212 - g.T.r;
g.T.x = g.T.exit.x; g.T.y = southLimit;
g.updateTown(0.016);
const dExit = Math.hypot(g.T.x - g.T.exit.x, g.T.y - g.T.exit.y);
const canExit = dExit < need;
console.log('  出口中心 = (' + g.T.exit.x + ', ' + g.T.exit.y + '), 半径 ' + g.T.exit.r);
console.log('  玩家最南可站到 y = ' + southLimit);
console.log('  最近距离 = ' + Math.round(dExit) + ' px, 需要 < ' + need + ' px');
console.log('  => ' + (canExit ? '可以离开小镇 ✔' : '出不去 ✘ (玩家会被困在镇里)'));
if (!canExit) process.exitCode = 1;
