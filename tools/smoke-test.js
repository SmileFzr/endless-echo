/**
 * 运行时冒烟测试: 用最小 DOM / Canvas / AudioContext 桩在 Node 里加载拆分后的
 * 7 个 js, 跑几百帧游戏循环, 并模拟点开始/升级选择/暂停/商店, 任何未定义引用
 * 或异常都会抛出。
 *
 * 用法: node tools/smoke-test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);
if (order.length === 0) throw new Error('index.html 中没有找到 js 引用');

/* ---------------- DOM 桩 ---------------- */
const ctxCalls = { fill: 0, stroke: 0, sprite: 0 };
function makeCtx2d() {
  const grad = { addColorStop() {} };
  const noop = () => {};
  const target = {
    fillRect: noop, strokeRect: noop, clearRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop,
    ellipse: noop, rect: noop, fill: () => { ctxCalls.fill++; },
    stroke: () => { ctxCalls.stroke++; }, save: noop, restore: noop,
    translate: noop, rotate: noop, scale: noop, setTransform: noop,
    setLineDash: noop, drawImage: () => { ctxCalls.sprite++; },
    fillText: noop, strokeText: noop,
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    measureText: () => ({ width: 10 }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const elements = new Map();
function makeEl(id) {
  const classes = new Set();
  const el = {
    id, tagName: 'DIV', dataset: {}, children: [],
    style: {}, textContent: '', innerHTML: '', disabled: false, value: '',
    className: '',
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      contains: c => classes.has(c),
      toggle: c => (classes.has(c) ? classes.delete(c) : classes.add(c)),
    },
    _classes: classes,
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
    addEventListener() {}, removeEventListener() {},
    getContext: () => makeCtx2d(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    focus() {}, blur() {},
  };
  return el;
}

const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeEl(id));
    return elements.get(id);
  },
  createElement(tag) {
    const el = makeEl('created-' + tag);
    el.tagName = String(tag).toUpperCase();
    if (tag === 'canvas') { el.width = 0; el.height = 0; }
    return el;
  },
  querySelectorAll(sel) {
    // 仅需支持 [data-mode]
    if (sel === '[data-mode]') {
      return ['endless', 'challenge'].map(m => {
        const el = makeEl('mode-' + m);
        el.dataset.mode = m;
        return el;
      });
    }
    return [];
  },
  querySelector: () => null,
  addEventListener() {}, removeEventListener() {},
  body: makeEl('body'), documentElement: makeEl('html'),
};

const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
};

/* ---------------- AudioContext 桩 ---------------- */
function param() {
  return { value: 0, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; },
           exponentialRampToValueAtTime() { return this; }, cancelScheduledValues() { return this; } };
}
function audioNode() {
  return { connect() { return this; }, disconnect() {}, start() {}, stop() {},
           gain: param(), frequency: param(), Q: param(), type: 'sine',
           buffer: null, loop: false, detune: param(), playbackRate: param() };
}
class AudioContextStub {
  constructor() { this.sampleRate = 44100; this.state = 'running';
                  this.destination = audioNode(); this.currentTime = 0; }
  createGain() { return audioNode(); }
  createOscillator() { return audioNode(); }
  createBufferSource() { return audioNode(); }
  createBiquadFilter() { return audioNode(); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  createDynamicsCompressor() { return audioNode(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

/* ---------------- window / 计时器 ---------------- */
let rafQueue = [];
let now = 0;
const timers = [];
const sandboxGlobal = {
  console,
  Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
  Map, Set, WeakMap, Promise, Symbol, isFinite, isNaN, parseInt, parseFloat,
  Float32Array, Uint8Array, Infinity, NaN, undefined,
  document, localStorage, AudioContext: AudioContextStub,
  webkitAudioContext: AudioContextStub,
  innerWidth: 400, innerHeight: 800, devicePixelRatio: 2,
  requestAnimationFrame: cb => { rafQueue.push(cb); return rafQueue.length; },
  cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => { const t = { fn, at: now + (ms || 0) }; timers.push(t); return timers.length; },
  clearTimeout: t => { const i = timers.findIndex(x => x === t); if (i >= 0) timers.splice(i, 1); },
  setInterval: () => 0,
  clearInterval: () => {},
  performance: { now: () => now },
  addEventListener() {}, removeEventListener() {},
};
sandboxGlobal.window = sandboxGlobal;
sandboxGlobal.globalThis = sandboxGlobal;
sandboxGlobal.self = sandboxGlobal;

const ctx = vm.createContext(sandboxGlobal);

/* ---------------- 依次加载脚本 ---------------- */
/* 经典 <script> 之间共享全局词法作用域, 因此这里把 7 个文件拼接后一次执行,
   既能复现浏览器中的行为, 也能让顶层 const/let 在测试里可见。 */
const loaded = [];
const chunks = [];
for (const name of order) {
  let code;
  try {
    code = fs.readFileSync(path.join(ROOT, 'js', name), 'utf8');
  } catch (e) {
    console.error('✘ 读取 js/%s 失败: %s', name, e && e.message);
    process.exit(1);
  }
  chunks.push('/* ==== js/' + name + ' ==== */\n' + code);
  loaded.push(name);
}
try {
  vm.runInContext(chunks.join('\n;\n'), ctx, { filename: 'js/bundle.js' });
} catch (e) {
  console.error('✘ 执行脚本失败: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e));
  process.exit(1);
}
console.log('✔ 已加载: ' + loaded.join(', '));

/* 顶层 const/let 是词法声明, 不会成为 sandbox 的属性; 这里从上下文内部导出。
   注意 doResetSave() 会整体替换 SAVE 对象, 所以用 getter 保持引用最新。 */
const g = vm.runInContext(`({
  PETS, SKILLS, SHOP_ITEMS, ENEMY_TYPES, PASSIVES,
  get G(){ return G; },
  get SAVE(){ return SAVE; },
  get P(){ return P; },
  get enemies(){ return enemies; },
  get bullets(){ return bullets; },
  get orbs(){ return orbs; },
  startGame, applyOption, genOptions, gainExp, hurtEnemy, spawnElite,
  pauseGame, resumeGame, backToMenu, openShop, buyShop, doResetSave,
  damagePlayer, renderPetHome, showPetDetail, renderPetSelect,
  togglePetSelect, updateHUD, el, writeSave
})`, ctx, { filename: 'exports.js' });

function runFrames(count, stepMs) {
  for (let i = 0; i < count; i++) {
    now += stepMs || 16;
    const q = rafQueue; rafQueue = [];
    for (const cb of q) cb(now);
    // 触发到期的 setTimeout
    for (let k = timers.length - 1; k >= 0; k--) {
      if (timers[k].at <= now) { const f = timers[k].fn; timers.splice(k, 1); f(); }
    }
  }
}

function run(desc, fn) {
  try { fn(); console.log('✔ ' + desc); }
  catch (e) {
    console.error('✘ ' + desc + ' -> ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e));
    process.exitCode = 1;
  }
}

run('初始状态为菜单', () => {
  if (g.G.state !== 'menu') throw new Error('state=' + g.G.state);
  runFrames(3);
});

run('开始无尽模式并跑 600 帧(约 10 秒)', () => {
  g.startGame('endless', []);
  if (g.G.state !== 'playing') throw new Error('state=' + g.G.state);
  runFrames(600);
  if (!(g.G.time > 5)) throw new Error('time 没有推进: ' + g.G.time);
  if (g.enemies.length === 0) throw new Error('没有生成敌人');
});

run('渲染确实被调用', () => {
  if (ctxCalls.sprite + ctxCalls.fill + ctxCalls.stroke === 0) throw new Error('没有任何绘制调用');
});

run('升级三选一 -> 应用选项', () => {
  g.gainExp(g.P.expNext + 1);
  if (g.G.state !== 'levelup') throw new Error('未进入升级界面: ' + g.G.state);
  const opts = g.genOptions(3);
  if (opts.length !== 3) throw new Error('选项数量=' + opts.length);
  g.applyOption(opts[0]);
  runFrames(30);
});

run('击杀敌人 / 拾取经验球 / 精英怪', () => {
  const e = g.enemies[0];
  if (!e) throw new Error('没有敌人可击杀');
  g.hurtEnemy(e, 1e9);
  g.spawnElite();
  runFrames(120);
});

run('暂停 / 继续', () => {
  g.pauseGame();
  if (g.G.state !== 'paused') throw new Error('state=' + g.G.state);
  runFrames(30);
  g.resumeGame();
  if (g.G.state !== 'playing') throw new Error('state=' + g.G.state);
});

run('传送商店购买', () => {
  g.G.runGold = 9999;
  g.openShop();
  g.buyShop(g.SHOP_ITEMS[0], 10);
  g.buyShop(g.SHOP_ITEMS[6], 10);
  g.el('btnShopClose').onclick();
  runFrames(30);
});

run('宠物系统(孵化/出战/变异)', () => {
  g.SAVE.gold = 10000;
  const ids = Object.keys(g.PETS);
  g.SAVE.pets = ids.slice();
  g.writeSave();
  g.renderPetHome();
  g.showPetDetail(ids[0]);
  g.renderPetSelect();
  g.togglePetSelect(ids[0]);
  g.togglePetSelect(ids[1]);
  g.startGame('endless', [ids[0], ids[2]]);
  runFrames(300);
  if (!g.P.pets.length) throw new Error('宠物没有出战');
});

run('挑战模式计时结束判定', () => {
  g.startGame('challenge', []);
  g.G.time = g.G.challengeEnd - 0.01;
  runFrames(5);
  if (g.G.state !== 'over') throw new Error('挑战结束未结算: ' + g.G.state);
});

run('死亡结算', () => {
  g.startGame('endless', []);
  g.damagePlayer(1e9);
  if (g.G.state !== 'over') throw new Error('state=' + g.G.state);
  g.el('btnRetry').onclick();
  if (g.G.state !== 'playing') throw new Error('重开失败: ' + g.G.state);
});

run('返回菜单 / 重置存档', () => {
  g.backToMenu();
  if (g.G.state !== 'menu') throw new Error('state=' + g.G.state);
  g.SAVE.gold = 500;
  g.doResetSave();
  if (g.SAVE.gold !== 0) throw new Error('重置失败');
});

console.log('\n结论: ' + (process.exitCode ? '存在失败项' : '运行时冒烟测试全部通过'));
