/**
 * 城镇交互测试: 靠近 NPC 后, 三条路径都要能触发交谈
 *   1) 按 F
 *   2) 点"交谈"按钮
 *   3) 点"按 F / 点这里 与 XX 交谈"那条提示
 *
 * 用户反馈: 提示条写着"点这里", 但它 pointer-events:none, 点了没反应。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);

/* 解析 CSS 里某个选择器的 pointer-events 与 bottom(用于判断能不能点) */
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
function cssRule(sel) {
  const i = css.indexOf(sel + '{');
  if (i < 0) return null;
  const j = css.indexOf('}', i);
  return css.slice(i + sel.length + 1, j);
}
const townPromptCss = cssRule('#townPrompt') || '';
const townActCss = cssRule('.town-act') || '';

const listeners = {};
const winListeners = {};
const elements = new Map();
function makeEl(id) {
  const el = { id, dataset: {}, children: [], style: {}, textContent: '', disabled: false,
    _cls: new Set(), _html: '',
    classList: {
      add(...c) { c.forEach(x => el._cls.add(x)); },
      remove(...c) { c.forEach(x => el._cls.delete(x)); },
      contains(c) { return el._cls.has(c); },
      toggle(c, on) { if (on) el._cls.add(c); else el._cls.delete(c); },
    },
    appendChild(c) { this.children.push(c); return c; }, removeChild() {},
    addEventListener(t, fn) { (this._ev = this._ev || {})[t] = (this._ev[t] || []).concat(fn); },
    removeEventListener() {}, getContext: () => mainCtx,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 393, height: 48, bottom: 48, right: 393 }) };
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); } });
  Object.defineProperty(el, 'textContent', {
    get() { return el._txt || ''; },
    set(v) { el._txt = String(v); },
  });
  return el;
}
function makeCtx() {
  const ctx = {};
  for (const m of ['beginPath', 'arc', 'stroke', 'fill', 'fillRect', 'clearRect', 'fillText',
                   'strokeText', 'save', 'restore', 'translate', 'rotate', 'scale', 'moveTo',
                   'lineTo', 'closePath', 'setTransform', 'ellipse', 'rect', 'setLineDash',
                   'roundRect', 'drawImage', 'clip', 'quadraticCurveTo', 'bezierCurveTo',
                   'strokeRect', 'isPointInPath']) ctx[m] = () => {};
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  ctx.createRadialGradient = () => ({ addColorStop() {} });
  ctx.measureText = (t) => ({ width: String(t).length * 7 });
  return ctx;
}
const mainCtx = makeCtx();
const canvas = { width: 393, height: 774, style: {}, classList: makeEl('c').classList,
  getContext: () => mainCtx,
  addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
  removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 393, height: 774 }) };
const document = { hidden: false, head: makeEl('head'), body: makeEl('body'),
  getElementById(id) { if (id === 'c') return canvas; if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
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
  AudioContext: AC, innerWidth: 393, innerHeight: 774, devicePixelRatio: 1,
  requestAnimationFrame: cb => rafQ.push(cb), cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => { timers.push({ fn, at: now + (ms || 0) }); return timers.length; },
  clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  performance: { now: () => now },
  addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); }, removeEventListener() {} };
sb.window = sb; sb.globalThis = sb; sb.self = sb;
const ctx = vm.createContext(sb);
vm.runInContext(order.map(n => fs.readFileSync(path.join(ROOT, 'js', n), 'utf8')).join('\n;\n'), ctx, { filename: 'bundle.js' });

const g = vm.runInContext(`({ get G(){ return G; }, get T(){ return T; }, set SAVE(v){ SAVE = v; },
  startGame, enterTown, updateTown, townInteract, NPCS, get ui(){ return el('ui'); } })`, ctx);

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

function reset() {
  g.SAVE = { gold: 0, up: { hp: 0, spd: 0, dmg: 0, cdr: 0, size: 0 }, best: 0, pets: [], selected: [], specials: {}, quests: { seenEnemies: [], seenPets: [] } };
  g.startGame('endless', []);
  g.enterTown();
  run(32);
}

const dlg = () => elements.get('npcDlg');
const isOpen = () => !dlg().classList.contains('hidden');

console.log('=== 0. 提示条 CSS 必须可点击(它写着"点这里") ===');
console.log('   #townPrompt: ' + townPromptCss.replace(/\s+/g, ' ').trim());
ok(/pointer-events\s*:\s*auto/.test(townPromptCss),
   '#townPrompt 是 pointer-events:auto —— 点了才有反应');

console.log('');
console.log('=== 1. 按 F 交谈 ===');
reset();
g.T.x = g.NPCS[0].x; g.T.y = g.NPCS[0].y + 20;
g.updateTown(0.016);
ok(g.T.near === g.NPCS[0], '已靠近 ' + g.NPCS[0].name);
{
  for (const fn of (winListeners.keydown || [])) fn({ key: 'f', preventDefault() {} });
  ok(isOpen(), '按 F 打开对话框');
}

console.log('');
console.log('=== 2. 点"交谈"按钮 ===');
reset();
g.T.x = g.NPCS[1].x; g.T.y = g.NPCS[1].y + 20;
g.updateTown(0.016);
ok(g.T.near === g.NPCS[1], '已靠近 ' + g.NPCS[1].name);
{
  const btn = elements.get('btnTownAct');
  ok(!btn.classList.contains('hidden'), '"交谈"按钮已显示');
  ok(typeof btn.onclick === 'function', '"交谈"按钮绑定了 onclick');
  if (typeof btn.onclick === 'function') btn.onclick();
  ok(isOpen(), '点按钮打开对话框');
}

console.log('');
console.log('=== 3. 点"按 F / 点这里 与 XX 交谈"提示条 ===');
reset();
g.T.x = g.NPCS[2].x; g.T.y = g.NPCS[2].y + 20;
g.updateTown(0.016);
{
  const prompt = elements.get('townPrompt');
  ok(prompt.textContent.indexOf('点这里') >= 0, '提示条写着"点这里": ' + prompt.textContent);
  ok(!prompt.classList.contains('hidden'), '提示条已显示');
  ok(typeof prompt.onclick === 'function', '提示条绑定了 onclick(修复重点)');
  if (typeof prompt.onclick === 'function') prompt.onclick();
  ok(isOpen(), '点提示条打开对话框');
}

console.log('');
console.log('=== 4. 点提示条也能出镇(南门) ===');
reset();
g.T.x = g.T.exit.x; g.T.y = g.T.exit.y - 10;
g.updateTown(0.016);
{
  const prompt = elements.get('townPrompt');
  ok(prompt.textContent.indexOf('离开小镇') >= 0, '提示条显示离开小镇: ' + prompt.textContent);
  if (typeof prompt.onclick === 'function') prompt.onclick();
  ok(g.G.state !== 'town', '点提示条离开了小镇 (state=' + g.G.state + ')');
}

console.log('');
console.log('=== 5. 按钮文案与状态依然正确 ===');
reset();
g.T.x = 0; g.T.y = 0;
g.updateTown(0.016);
ok(elements.get('btnTownAct').textContent.indexOf('交') >= 0, '不在 NPC 旁时按钮是"交谈"');
g.T.x = g.T.exit.x; g.T.y = g.T.exit.y - 10;
g.updateTown(0.016);
ok(elements.get('btnTownAct').textContent.indexOf('离') >= 0, '在出口处按钮变"离开小镇"');

console.log('');
console.log(fails === 0 ? '结论: 城镇交互(键盘+点击)全部通过 ✔' : '结论: ' + fails + ' 项失败 ✘');
process.exitCode = fails ? 1 : 0;
