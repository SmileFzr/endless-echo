/**
 * 全技能 / 全变异 / 全宠物 压力测试。
 * 对每个技能: 强制装备到 Lv1 与 Lv11(带每一种变异), 连续施放并跑帧,
 * 捕获任何异常(NaN、undefined 引用、越界等)。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);

/* ---------- DOM 桩 ---------- */
const elements = new Map();
function makeEl(id) {
  const cls = new Set();
  return { id, tagName: 'DIV', dataset: {}, children: [], style: {},
    textContent: '', innerHTML: '', disabled: false, className: '',
    classList: { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)), contains: c => cls.has(c) },
    appendChild(c) { this.children.push(c); return c; }, removeChild() {},
    addEventListener() {}, removeEventListener() {},
    getContext: () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => (t[k] = v, true) }) };
}
const document = {
  getElementById(id) { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
  createElement(t) { const e = makeEl('c-' + t); e.tagName = String(t).toUpperCase(); return e; },
  querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, body: makeEl('body'),
};
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
  setTimeout: (fn, ms) => { timers.push({ fn, at: now + (ms || 0) }); return timers.length; },
  clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  performance: { now: () => now }, addEventListener() {}, removeEventListener() {} };
sb.window = sb; sb.globalThis = sb; sb.self = sb;
const ctx = vm.createContext(sb);
vm.runInContext(order.map(n => fs.readFileSync(path.join(ROOT, 'js', n), 'utf8')).join('\n;\n'), ctx, { filename: 'bundle.js' });

const g = vm.runInContext(`({
  get G(){ return G; }, get P(){ return P; },
  SKILLS, PETS, ENEMY_TYPES,
  startGame, updateSkills, updatePets, updateBullets, updateEnemies, updateEffects, updateOrbs,
  spawnOne, spawnElite, hurtEnemy, gainExp, recalcStats, nearestEnemy, randomEnemies,
  get enemies(){ return enemies; }, get bullets(){ return bullets; },
  get effects(){ return effects; }, get orbs(){ return orbs; },
  get eBullets(){ return eBullets; }
})`, ctx);

function frames(n) {
  for (let i = 0; i < n; i++) {
    now += 16;
    const q = rafQ; rafQ = [];
    for (const cb of q) cb(now);
    for (let k = timers.length - 1; k >= 0; k--) if (timers[k].at <= now) { const f = timers[k].fn; timers.splice(k, 1); f(); }
  }
}

/* 数值健康检查 */
function badNumbers(label) {
  const probs = [];
  const P = g.P;
  if (!isFinite(P.x) || !isFinite(P.y)) probs.push('P 坐标 ' + P.x + ',' + P.y);
  if (!isFinite(P.hp) || !isFinite(P.maxHp)) probs.push('P 血量 ' + P.hp + '/' + P.maxHp);
  if (!isFinite(g.G.time)) probs.push('G.time ' + g.G.time);
  for (const e of g.enemies) {
    if (!isFinite(e.x) || !isFinite(e.y)) { probs.push('敌人坐标 NaN'); break; }
    if (!isFinite(e.hp)) { probs.push('敌人血量 ' + e.hp); break; }
  }
  for (const b of g.bullets) {
    if (!isFinite(b.x) || !isFinite(b.y)) { probs.push('子弹坐标 NaN kind=' + b.kind); break; }
  }
  if (probs.length) console.log('   ✘ [' + label + '] ' + probs.join('; '));
  return probs.length === 0;
}

let failures = 0;
const skillIds = Object.keys(g.SKILLS);
console.log('=== 技能压力测试: ' + skillIds.length + ' 个技能 × (Lv1 / Lv10 / 每种变异) ===');
for (const id of skillIds) {
  const def = g.SKILLS[id];
  const cases = [{ lv: 1, mut: null, label: 'Lv1' }, { lv: 10, mut: null, label: 'Lv10' }];
  (def.muts || []).forEach((m, mi) => cases.push({ lv: 11, mut: mi, label: 'Lv11 变异' + (mi + 1) }));
  for (const c of cases) {
    try {
      g.startGame('endless', []);
      // 造一批敌人和玩家技能
      for (let i = 0; i < 12; i++) g.spawnOne();
      g.P.skills = [{ id, lv: c.lv, mut: c.mut, cd: 0 }];
      g.recalcStats();
      // 直接把 cd 压到 0, 强制连续施放
      for (let k = 0; k < 40; k++) {
        g.P.skills[0].cd = 0;
        g.updateSkills(0.016);
        g.updateBullets(0.016);
        g.updateEnemies(0.016);
        g.updateEffects(0.016);
        g.updateOrbs(0.016);
      }
      if (!badNumbers(id + ' ' + c.label)) failures++;
    } catch (e) {
      console.log('   ✘ [' + id + ' ' + c.label + '] 抛异常: ' + (e && e.message));
      failures++;
    }
  }
}
console.log('   技能测试完成, 失败 ' + failures + ' 项');

console.log('');
console.log('=== 宠物压力测试 ===');
for (const id of Object.keys(g.PETS)) {
  for (const lv of [1, 11, 20]) {
    try {
      g.startGame('endless', [id]);
      if (!g.P.pets.length) { console.log('   ✘ 宠物 ' + id + ' 未出战'); failures++; continue; }
      for (let i = 0; i < 10; i++) g.spawnOne();
      g.P.pets[0].lv = lv;
      if (lv >= 11) g.P.pets[0].mut = true;
      for (let k = 0; k < 60; k++) {
        g.P.pets[0].cd = 0;
        g.updatePets(0.016);
        g.updateBullets(0.016);
        g.updateEnemies(0.016);
        g.updateEffects(0.016);
      }
      if (!badNumbers('pet ' + id + ' lv' + lv)) failures++;
    } catch (e) {
      console.log('   ✘ [宠物 ' + id + ' lv' + lv + '] 抛异常: ' + (e && e.message));
      failures++;
    }
  }
}
console.log('   宠物测试完成');

console.log('');
console.log('=== 精英怪全流程 ===');
try {
  g.startGame('endless', []);
  g.spawnElite();
  g.P.level = 30;
  for (let k = 0; k < 300; k++) {
    g.updateEnemies(0.016); g.updateBullets(0.016); g.updateEffects(0.016);
    for (const e of g.enemies) if (e.elite) g.hurtEnemy(e, 50);
  }
  badNumbers('elite');
  console.log('   精英怪血量倍率 G.hpMult = ' + g.G.hpMult.toFixed(3) + ', 难度 G.diffCount = ' + g.G.diffCount);
} catch (e) { console.log('   ✘ 精英流程异常: ' + e.message); failures++; }

console.log('');
console.log('=== 大量敌人时的上限保护 ===');
try {
  g.startGame('endless', []);
  g.G.time = 600;   // 10 分钟, 生成量最大
  for (let k = 0; k < 400; k++) {
    g.G.spawnTimer = 0;
    g.updateEnemies(0.016);
    if (g.enemies.length > 320) { console.log('   ⚠ 敌人数超过 320 上限: ' + g.enemies.length); break; }
  }
  console.log('   10 分钟后敌人数 = ' + g.enemies.length + ' (设计上限 320)');
} catch (e) { console.log('   ✘ 异常: ' + e.message); failures++; }

console.log('');
console.log(failures === 0 ? '结论: 未发现崩溃/NaN 类 bug' : '结论: 发现 ' + failures + ' 项问题');
