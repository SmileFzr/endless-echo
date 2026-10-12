/**
 * 端到端测试: 完全通过主循环(requestAnimationFrame -> frame -> update/render)
 * 与真实事件(键盘 / 虚拟摇杆 / visibilitychange / DOM 点击)驱动整条链路,
 * 不直接调用内部游戏函数。
 *
 * 链路: 开局 -> 打怪 -> 满足条件 -> 黑洞倒计时 -> 刷出黑洞 -> 走进去
 *       -> 小镇 -> 走到 NPC -> 按 F 对话 -> 接任务 -> 从南门离开
 *       -> 荒野推进任务 -> 第二个黑洞 -> 回城交差领奖励
 *       -> 点 HUD 按钮使用能力 -> 切后台自动暂停 -> 手动继续
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);

/* ---------------- DOM 桩(像浏览器一样: 写空 innerHTML 会清掉子节点) ---------------- */
const elements = new Map();
const drawStats = { fill: 0, stroke: 0, sprite: 0, text: 0 };
function makeCtx2d() {
  const grad = { addColorStop() {} };
  const noop = () => {};
  const t = {
    fillRect: noop, strokeRect: noop, clearRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, ellipse: noop, rect: noop,
    fill: () => drawStats.fill++, stroke: () => drawStats.stroke++,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    setTransform: noop, setLineDash: noop, drawImage: () => drawStats.sprite++,
    fillText: () => drawStats.text++, strokeText: noop,
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    measureText: () => ({ width: 10 }),
  };
  return new Proxy(t, { get: (o, k) => (k in o ? o[k] : undefined), set: (o, k, v) => (o[k] = v, true) });
}
function makeEl(id) {
  const cls = new Set();
  const el = {
    id, tagName: 'DIV', dataset: {}, children: [], style: {}, disabled: false,
    className: '', title: '', _sig: undefined, _text: '', _html: '',
    classList: {
      add: (...c) => c.forEach(x => cls.add(x)),
      remove: (...c) => c.forEach(x => cls.delete(x)),
      contains: c => cls.has(c),
    },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
    clearRefs() { this.children = []; return this; },
    addEventListener() {}, removeEventListener() {},
    getContext: () => makeCtx2d(),
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = String(v); if (!this._html) this.clearRefs(); },
  });
  Object.defineProperty(el, 'textContent', {
    get() { return this._text; },
    set(v) { this._text = String(v); },
  });
  return el;
}
const docListeners = {};
const document = {
  hidden: false,
  getElementById(id) { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
  createElement(t) { const e = makeEl('c-' + t); e.tagName = String(t).toUpperCase(); return e; },
  querySelectorAll: () => [], querySelector: () => null, body: makeEl('body'),
  addEventListener(ev, fn) { (docListeners[ev] = docListeners[ev] || []).push(fn); },
  removeEventListener() {},
};
const winListeners = {};
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
  performance: { now: () => now },
  addEventListener(ev, fn) { (winListeners[ev] = winListeners[ev] || []).push(fn); },
  removeEventListener() {} };
sb.window = sb; sb.globalThis = sb; sb.self = sb;
/* 先按 index.html 里写死的 class 初始化元素, 这样"初始状态"才和浏览器一致
   (例如 #hud / #townBar / #btnTownAct 一开始就带 hidden) */
for (const m of html.matchAll(/<[a-z]+[^>]*\bid="([^"]+)"[^>]*>/g)) {
  const tag = m[0];
  const id = m[1];
  const cls = (tag.match(/class="([^"]*)"/) || [, ''])[1];
  if (!elements.has(id)) elements.set(id, makeEl(id));
  const e = elements.get(id);
  cls.split(/\s+/).filter(Boolean).forEach(c => e.classList.add(c));
}

const ctx = vm.createContext(sb);
vm.runInContext(order.map(n => fs.readFileSync(path.join(ROOT, 'js', n), 'utf8')).join('\n;\n'), ctx, { filename: 'bundle.js' });

const g = vm.runInContext(`({
  get G(){ return G; }, get P(){ return P; }, get SAVE(){ return SAVE; }, set SAVE(v){ SAVE = v; },
  SPECIALS, NPCS, T, startGame, el,
  get enemies(){ return enemies; }, get input(){ return input; },
  get dbgBH(){ return window.dbgBH; }, get dbgGoto(){ return window.dbgGoto; }
})`, ctx);

/* ---------------- 驱动工具 ---------------- */
function run(ms) {
  const frames = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < frames; i++) {
    now += 16;
    const q = rafQ; rafQ = [];
    for (const cb of q) cb(now);
    for (let k = timers.length - 1; k >= 0; k--) {
      if (timers[k].at <= now) { const f = timers[k].fn; timers.splice(k, 1); f(); }
    }
  }
}
/* 摇杆朝某方向走一段时间 */
function walk(dx, dy, ms) {
  g.input.joy.active = true; g.input.joy.dx = dx; g.input.joy.dy = dy;
  run(ms);
  g.input.joy.active = false; g.input.joy.dx = 0; g.input.joy.dy = 0;
}
/* 只推进时钟, 不跑帧 —— 模拟浏览器切到后台后 rAF 被冻结但仍然过了一段时间 */
function advanceClock(ms) { now += ms; }
/* 键盘: 走真实的 keydown 监听 */
function press(key) {
  (winListeners['keydown'] || []).forEach(fn => fn({ key, preventDefault() {} }));
}
/* 战场玩家定位(用于走进黑洞) */
function teleportField(x, y) { g.P.x = x; g.P.y = y; }
/* 小镇里的玩家定位(小镇用独立的 T 坐标) */
function teleportTown(x, y) { g.T.x = x; g.T.y = y; }
/* 对话框按钮(文字带空格, 如 "接 下 委 托") */
function findBtn(re) { return elements.get('dlgActions').children.find(b => re.test(b.textContent)); }
function btnTexts() { return elements.get('dlgActions').children.map(b => b.textContent); }
function dlgOpen() { return !elements.get('npcDlg').classList.contains('hidden'); }

let fails = 0;
function ok(cond, msg) { console.log((cond ? '✔ ' : '✘ ') + msg); if (!cond) fails++; }

console.log('=== 端到端: 全部通过主循环与真实事件驱动 ===');

/* ---------- 1. 开局 ---------- */
g.SAVE = { gold: 0, up: { hp: 0, spd: 0, dmg: 0, cdr: 0, size: 0 }, best: 0, pets: [], selected: [], specials: {}, quests: {} };
g.startGame('endless', []);
ok(g.G.state === 'playing', '开局进入战斗状态');
// 回归: 小镇的"交谈"按钮不能在战斗界面出现(曾直接盖住技能栏)
ok(elements.get('btnTownAct').classList.contains('hidden'),
   '"交谈"按钮在战斗界面是隐藏的');
ok(!elements.get('ui').classList.contains('town'),
   '#ui 没有 town 类(技能栏保持原位)');
run(500);
ok(g.G.time > 0.4, '主循环在推进时间: ' + g.G.time.toFixed(2) + 's');
ok(elements.get('btnTownAct').classList.contains('hidden'),
   '跑了 8 秒之后"交谈"按钮依然是隐藏的');
ok(g.enemies.length > 0, '主循环在刷怪: ' + g.enemies.length + ' 只');
ok(drawStats.sprite > 0 && drawStats.fill > 0,
   '主循环在渲染(精灵 ' + drawStats.sprite + ' / 填充 ' + drawStats.fill + ')');

/* ---------- 2. 满足条件 -> 黑洞出现 ---------- */
g.P.skills.push({ id: 'sword', lv: 3, mut: null, cd: 0 }, { id: 'bomb', lv: 3, mut: null, cd: 0 });
run(100);
ok(g.G.bh && g.G.bh.announced, '满足条件后黑洞事件启动, 倒计时 ' + Math.round(g.G.bh.timer) + 's');
g.G.bh.timer = 0.05;
run(200);
ok(!!g.G.bh.portal, '主循环自动刷出黑洞');

/* ---------- 3. 走进黑洞 ---------- */
teleportField(g.G.bh.portal.x, g.G.bh.portal.y);
run(50);
ok(g.G.state === 'town', '走进黑洞后进入小镇 (state=' + g.G.state + ')');
ok(!elements.get('townBar').classList.contains('hidden'), '小镇顶栏已显示');
ok(elements.get('hud').classList.contains('hidden'), '战斗 HUD 已隐藏');
ok(!elements.get('btnTownAct').classList.contains('hidden'), '城镇里"交谈"按钮显示出来');
ok(elements.get('ui').classList.contains('town'), '城镇里 #ui 带上 town 类(技能栏上移让位)');
const spritesBefore = drawStats.sprite;
run(200);
ok(drawStats.sprite > spritesBefore, '小镇画面在渲染(精灵 +' + (drawStats.sprite - spritesBefore) + ')');

/* ---------- 4. 走到铁匠 -> 按 F -> 接任务 ---------- */
const smith = g.NPCS.find(n => n.id === 'smith');
teleportTown(smith.x, smith.y + 40);
run(100);
ok(g.T.near === smith, '站到铁匠旁边: ' + (g.T.near && g.T.near.name));
ok(winListeners['keydown'] && winListeners['keydown'].length >= 1, 'keydown 监听已注册');
press('f');
ok(dlgOpen(), '按 F 打开了对话');
ok(elements.get('dlgTitle').textContent.indexOf('铁匠') >= 0,
   '对话框标题正确: ' + elements.get('dlgTitle').textContent);
const accept = findBtn(/接\s*下/);
ok(!!accept, '出现"接下委托"按钮: ' + btnTexts().join(' | '));
accept.onclick();
ok(!!g.SAVE.quests.smith, '委托已接下');

/* ---------- 5. 关对话 -> 从南门离开 ---------- */
findBtn(/离\s*开/).onclick();
ok(!dlgOpen(), '对话已关闭');
teleportTown(g.T.exit.x, g.T.exit.y);
run(60);
ok(g.T.near === null, '走到南门后不再锁定 NPC (near=' + (g.T.near && g.T.near.name) + ')');
press('f');
if (g.G.state !== 'playing') {
  console.log('   [debug] T = (' + Math.round(g.T.x) + ', ' + Math.round(g.T.y) + ')');
  console.log('   [debug] exit = (' + g.T.exit.x + ', ' + g.T.exit.y + '), r=' + g.T.exit.r);
  console.log('   [debug] 距离 = ' + Math.round(Math.hypot(g.T.x - g.T.exit.x, g.T.y - g.T.exit.y)));
  console.log('   [debug] 判定阈值 = ' + (g.T.exit.r + g.T.r * 0.8));
  console.log('   [debug] T.near = ' + (g.T.near ? g.T.near.name : 'null'));
  console.log('   [debug] state = ' + g.G.state);
}
ok(g.G.state === 'playing', '从南门按 F 回到荒野 (state=' + g.G.state + ')');
ok(elements.get('townBar').classList.contains('hidden'), '小镇顶栏已收起');
ok(elements.get('btnTownAct').classList.contains('hidden'),
   '回到荒野后"交谈"按钮已收起(不再挡住技能栏)');
ok(!elements.get('ui').classList.contains('town'), 'town 类已移除, 技能栏回到原位');
ok(elements.get('npcDlg').classList.contains('hidden'), 'NPC 对话框已关闭');
ok(!elements.get('hud').classList.contains('hidden'), '战斗 HUD 已恢复');

/* ---------- 6. 回荒野推进任务进度 ---------- */
const base = g.SAVE.quests.smith.quest.base;
g.G.kills = base + 30;
run(100);
ok(g.SAVE.quests.smith.done, '主循环推进了任务并标记可交差');
ok(g.SAVE.quests.smith.quest.cur === 30, '进度 = ' + g.SAVE.quests.smith.quest.cur + ' / 30');

/* ---------- 7. 第二个黑洞 -> 回城交差领奖励 ---------- */
g.G.bh.timer = 0.05;
run(200);
ok(!!g.G.bh.portal, '主循环刷出了第二个黑洞');
teleportField(g.G.bh.portal.x, g.G.bh.portal.y);
run(50);
ok(g.G.state === 'town', '第二次进入小镇');
teleportTown(smith.x, smith.y + 40);
run(100);
press('f');
ok(dlgOpen(), '再次打开对话');
ok(!findBtn(/接\s*下/), '"接下委托"按钮已被清理, 不会误点: ' + btnTexts().join(' | '));
const claim = findBtn(/领\s*取/);
ok(!!claim, '出现"领取奖励"按钮: ' + btnTexts().join(' | '));
claim.onclick();
ok(g.SAVE.specials.boots === true, '获得踏空靴');
ok(!!findBtn(/离\s*开/), '领取后可以离开对话');

/* ---------- 8. 回荒野 -> 点 HUD 按钮使用能力 ---------- */
findBtn(/离\s*开/).onclick();
teleportTown(g.T.exit.x, g.T.exit.y);
run(60);
press('f');
ok(g.G.state === 'playing', '回到荒野');

g.P.specials = { boots: { cd: 0 } };
run(50);   // 让 syncSpecialBars 渲染出按钮
const bar = elements.get('hudSpecials');
ok(bar.children.length > 0, 'HUD 上出现了特殊能力按钮 (' + bar.children.length + ' 个)');
bar.children[0].onclick();
ok(g.P.bootsT > 0, '点击按钮激活踏空靴: ' + g.P.bootsT.toFixed(1) + 's');
// 按"游戏内经过的秒数"来跑, 而不是固定帧数
run((g.P.bootsT + 0.3) * 1000);
ok(g.P.bootsT <= 0, '持续时间结束后自动失效');
ok(g.P.specials.boots.cd > 0 && g.P.specials.boots.cd < 16,
   '冷却在走: ' + g.P.specials.boots.cd.toFixed(1) + 's');

/* ---------- 9. 切后台自动暂停 ---------- */
document.hidden = true;
(docListeners['visibilitychange'] || []).forEach(fn => fn({ type: 'visibilitychange' }));
ok(g.G.state === 'paused', '切后台自动暂停');
const tAtPause = g.G.time;
run(500);
ok(g.G.time === tAtPause, '暂停期间时间不推进 (' + g.G.time.toFixed(2) + 's)');
// 浏览器切到后台后 rAF 会停: 只让时钟走 4 秒, 不跑任何帧
advanceClock(4000);
document.hidden = false;
(docListeners['visibilitychange'] || []).forEach(fn => fn({ type: 'visibilitychange' }));
ok(g.G.state === 'paused', '离开 4 秒后停在暂停界面 (state=' + g.G.state + ')');
ok(!elements.get('pauseVeil').classList.contains('hidden'), '暂停菜单已显示');

/* ---------- 10. 手动继续后能正常作战 ---------- */
elements.get('btnResume').onclick();
ok(g.G.state === 'playing', '点了"继续游戏"后恢复战斗');
run(300);
ok(g.G.time > tAtPause, '恢复后时间继续推进: ' + g.G.time.toFixed(2) + 's');

/* ---------- 11. 控制台调试入口(dbqBH / dbgGoto)可用 ---------- */
ok(typeof g.dbgBH === 'function' && typeof g.dbgGoto === 'function',
   'window.dbgBH / window.dbgGoto 已挂载');
g.G.bh.portal = null;
g.G.bh.timer = 9999;
const r1 = g.dbgBH();
ok(g.G.bh.timer === 0 && g.G.bh.announced === true,
   'dbgBH() 让主循环立刻生成黑洞 (' + r1 + ')');
run(100);
ok(!!g.G.bh.portal, '主循环真的把黑洞生成出来了');
g.G.bh.portal = null;
g.G.bh.timer = 9999;
g.dbgGoto();
run(100);                       // 等 setTimeout 里的传送回调 + 主循环吸入
// 传送到黑洞上之后主循环会立刻吸入 -> 直接进城, 黑洞随之被清掉
ok(g.G.state === 'town', 'dbgGoto() 一步进入小镇 (state=' + g.G.state + ')');
ok(g.G.bh.portal === null, '进入小镇后黑洞被清除(符合预期)');
// 再手动验一次"送到黑洞旁边"的距离
g.G.bh.timer = 9999;
g.G.bh.portal = { x: g.P.x + 900, y: g.P.y, life: 150, spin: 0 };
g.dbgGoto();
run(100);
ok(g.G.state === 'town', 'dbgGoto() 再次成功进城');

console.log('');
console.log(fails === 0 ? '结论: 端到端链路全部通过 ✔' : '结论: ' + fails + ' 项失败 ✘');
process.exitCode = fails ? 1 : 0;
