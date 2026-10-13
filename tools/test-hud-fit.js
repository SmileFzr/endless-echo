/**
 * 顶部文字避让检查:
 *   画布上的"回声小镇 · 山谷里的村庄 / 操作提示"不能和 DOM 的 HUD 重叠。
 *   分别在 手机竖屏 / 平板 / 宽屏 三种视口下检查。
 *
 * 桩提供 getBoundingClientRect, 模拟真实 HUD 布局:
 *   顶栏一行(经验条 + 统计)高约 52px; 特殊技能图标在右上角。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);

let VIEW = { w: 393, h: 774 };
let TOWN_BAR = true;          // 正常情况下 townBar 存在, 画布不画顶部文字
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
  ctx.measureText = (t) => ({ width: String(t).length * (String(t).charCodeAt(0) > 255 ? 12 : 7) });
  return ctx;
}
const mainCtx = makeCtx();

/* HUD 元素的矩形: 按真实布局模拟(index.html 的 .topbar 结构) */
function rectFor(id) {
  const pad = 12;
  const topPad = 10;
  // 左上: 经验条 + 血条 + 血量文字, 宽约 150, 高约 52
  if (id === 'expwrap') {
    return { top: topPad, left: pad, right: pad + 150, bottom: topPad + 52, width: 150, height: 52 };
  }
  // 右上: 统计(时间/击杀/金币) + 特殊技能图标 + 音效暂停按钮
  //      窄屏上会让出更多横向空间, 因为它本身比较宽
  if (id === 'townSkills') {
    // 城镇里右上角是 #townSkills(HUD 的 #hudSpecials 此时是隐藏的)
    const iconsW = 5 * 34 + 4 * 6;
    const right = VIEW.w - 12;
    return { top: 10, left: right - iconsW, right, bottom: 44, width: iconsW, height: 34 };
  }
  if (id === 'stats' || id === 'hudSpecials') {
    const iconsW = 5 * 34 + 4 * 6;
    const statsW = Math.max(90, Math.min(150, VIEW.w * 0.28));
    const blockW = Math.max(statsW, iconsW);
    const right = VIEW.w - pad;
    const top = topPad;
    const bottom = top + 20 * 3 + 6 + 34 + 6 + 34;   // 三行统计 + 技能 + 按钮
    return { top, left: right - blockW, right, bottom, width: blockW, height: bottom - top };
  }
  if (id === 'btnAudio') {
    const right = VIEW.w - pad, top = topPad + 20 * 3 + 6 + 34 + 6;
    return { top, left: right - 34, right, bottom: top + 34, width: 34, height: 34 };
  }
  if (id === 'townBar') {
    if (!TOWN_BAR) return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    // .town-head 在左上, 三行文字; 特殊技能图标在右上
    return { top: 0, left: 0, right: VIEW.w, bottom: 62, width: VIEW.w, height: 62 };
  }
  if (id === 'toast') {
    const el = elements.get('toast');
    const op = el && el.style ? parseFloat(el.style.opacity) : 0;
    if (!(op >= 0.1)) return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    const y = VIEW.h * 0.26;
    return { top: y, left: VIEW.w / 2 - 80, right: VIEW.w / 2 + 80, bottom: y + 20, width: 160, height: 20 };
  }
  return null;
}

const elements = new Map();
function makeEl(id) {
  const el = { id, dataset: {}, children: [], style: {}, _html: '', _text: '', width: 100, height: 40,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    appendChild(c) { this.children.push(c); return c; }, addEventListener() {},
    getContext: () => mainCtx,
    getBoundingClientRect: () => (rectFor(id) || { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
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
  AudioContext: AC, innerWidth: VIEW.w, innerHeight: VIEW.h, devicePixelRatio: 1,
  requestAnimationFrame: cb => rafQ.push(cb), cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => { timers.push({ fn, at: now + (ms || 0) }); return timers.length; },
  clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  performance: { now: () => now }, addEventListener() {}, removeEventListener() {} };
sb.window = sb; sb.globalThis = sb; sb.self = sb;
const ctx = vm.createContext(sb);
vm.runInContext(order.map(n => fs.readFileSync(path.join(ROOT, 'js', n), 'utf8')).join('\n;\n'), ctx, { filename: 'bundle.js' });

const g = vm.runInContext(`({ get G(){ return G; }, get T(){ return T; }, set SAVE(v){ SAVE = v; },
  startGame, enterTown, drawTown, NPCS, get P(){ return P; } })`, ctx);
g.SAVE = { gold: 0, up: { hp: 0, spd: 0, dmg: 0, cdr: 0, size: 0 }, best: 0, pets: [], selected: [], specials: {}, quests: {} };
g.startGame('endless', []);
g.enterTown();

let fails = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fails++; };

/** 取标题/提示那两行文字的包围盒(按 fillText 的前两次调用) */
function measureTextRows() {
  const txt = calls.filter(c => c.name === 'fillText');
  const findRow = (kw) => txt.find(c => String(c.args[0]).indexOf(kw) >= 0);
  const titleRow = findRow('回声小镇');
  const tipRow = findRow('拖动屏幕移动');
  return { titleRow, tipRow };
}

function runCase(label, w, h, toastOn, barOn) {
  VIEW = { w, h };
  TOWN_BAR = barOn !== false;
  sb.innerWidth = w; sb.innerHeight = h;
  vm.runInContext('resize();', ctx);
  g.enterTown();
  const t = elements.get('toast');
  t.style.opacity = toastOn ? '1' : '0';

  calls.length = 0;
  g.drawTown();

  const { titleRow, tipRow } = measureTextRows();
  console.log('');
  console.log('=== ' + label + ' (' + w + 'x' + h + (toastOn ? ', toast 显示中' : '') +
              (TOWN_BAR ? '' : ', 无 townBar') + ') ===');

  if (TOWN_BAR) {
    // 正常情况下: 画布不该再画标题(避免和 DOM 的 townBar 重复 + 压住技能图标)
    ok(!titleRow, 'townBar 存在时, 画布不再画标题(避免重复与遮挡)');
    ok(!tipRow, 'townBar 存在时, 画布不再画操作提示');
    // DOM 那一行自己有没有越过屏幕中线(不能碰到右上角技能图标)
    const bar = rectFor('townBar');
    const spec = rectFor('townSkills');
    ok(spec.left > w * 0.40, '城镇技能图标靠右 (left=' + Math.round(spec.left) + ' / 屏宽 ' + w + ')');
    ok(spec.right <= w + 0.5, '城镇技能图标没有被挤出屏幕 (right=' + Math.round(spec.right) + ')');
    ok(bar.bottom < h * 0.5, 'townBar 只在屏幕上半部分 (bottom=' + Math.round(bar.bottom) + ')');
    return;
  }

  // 兜底: 没有 townBar 时, 画布文字必须自己避开 HUD
  ok(!!titleRow, '兜底: 标题画出来了');
  ok(!!tipRow, '兜底: 操作提示画出来了');
  const SPEC = rectFor('townSkills');
  const hit = (row, box) => {
    if (!row || !box || !box.height) return false;
    const cx = row.args[1], cy = row.args[2];
    const w2 = String(row.args[0]).length * 12 + 30, hw = w2 / 2, hh = 26;
    return !(cx + hw < box.left || cx - hw > box.right || cy + hh / 2 < box.top || cy - hh / 2 > box.bottom);
  };
  for (const [row, name] of [[titleRow, '标题'], [tipRow, '提示']]) {
    if (!row) continue;
    console.log('   ' + name + ' 中心 = (' + Math.round(row.args[1]) + ', ' + Math.round(row.args[2]) + ')');
    ok(!hit(row, SPEC), name + ' 不与右上角技能图标重叠');
    ok(!hit(row, rectFor('expwrap')), name + ' 不与左上角经验条重叠');
    ok(!hit(row, rectFor('townSkills')), name + ' 不与城镇技能图标重叠');
    if (toastOn) ok(!hit(row, rectFor('toast')), name + ' 不与 toast 重叠');
    ok(row.args[2] - 20 > 0 && row.args[2] + 20 < h, name + ' 在屏幕范围内');
  }
}

runCase('手机竖屏', 393, 774, false);
runCase('手机竖屏 + toast', 393, 774, true);
runCase('小屏手机', 360, 640, false);
runCase('平板竖屏', 768, 1024, false);
runCase('电脑宽屏', 1834, 877, false);
runCase('超宽屏', 1920, 1080, false);
console.log('');
console.log('--- 兜底场景(万一 townBar 不在) ---');
runCase('手机竖屏兜底', 393, 774, false, false);
runCase('手机竖屏兜底 + toast', 393, 774, true, false);
runCase('宽屏兜底', 1834, 877, false, false);

console.log('');
console.log(fails === 0 ? '结论: 顶部文字避让全部通过 ✔' : '结论: ' + fails + ' 项失败 ✘');
process.exitCode = fails ? 1 : 0;
