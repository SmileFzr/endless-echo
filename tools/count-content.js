/**
 * 内容清点: 从源码里数出各类内容的实际数量, 并列出名称与关键数值。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);

/* 最小 DOM 桩, 只需要让脚本能跑完 */
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

const g = vm.runInContext(`({ ENEMY_TYPES, ELITE_TYPES, SKILLS, PASSIVES, PETS, SHOP_ITEMS, SPECIALS, NPCS,
  BH_TRIGGER_SKILLS, BH_TRIGGER_LEVEL, BH_RESPAWN_MIN, BH_RESPAWN_MAX, BH_PORTAL_LIFE,
  G })`, ctx);

const line = (s) => console.log(s);

line('================ 普通怪物 (ENEMY_TYPES 里非 elite 的) ================');
const keys = Object.keys(g.ENEMY_TYPES);
const normal = keys.filter(k => !g.ENEMY_TYPES[k].elite);
const eliteBase = keys.filter(k => g.ENEMY_TYPES[k].elite);   // 只作为精英数值模板
line('共 ' + normal.length + ' 种:');
for (const k of normal) {
  const t = g.ENEMY_TYPES[k];
  line('  ' + t.sprite + ' ' + k.padEnd(7) + ' 血 ' + String(t.hp).padStart(3) +
       '  速 ' + String(t.speed).padStart(3) + '  伤害 ' + String(t.dmg).padStart(2) +
       '  经验 ' + t.exp + (t.ranged ? '  远程' : '') + (t.explode ? '  自爆' : ''));
}
line('  → 初始只有 normal, 每击杀一只精英依次解锁一种: ' + g.G.unlocked.join(', '));

line('');
line('================ 精英怪物 (ELITE_TYPES) ================');
const ET = g.ELITE_TYPES;
const base = g.ENEMY_TYPES.elite;
line('共 ' + ET.length + ' 种(基准血量 ' + base.hp + ' / 伤害 ' + base.dmg + '):');
for (const d of ET) {
  line('  ' + d.sprite + ' ' + d.name.padEnd(4) + ' (' + d.id.padEnd(9) + ')' +
       ' 血×' + d.hpMul.toFixed(2) + ' 速×' + d.spdMul.toFixed(2) +
       ' 伤×' + d.dmgMul.toFixed(2) + ' 体型×' + d.rMul.toFixed(2) +
       '  机制:' + (d.trait || '冲撞'));
}
line('  → 每 10 级随机刷一种; 击杀后所有小怪永久增强, 精英血量 ×1.10/只');

line('');
line('================ 技能 (SKILLS) ================');
const sk = Object.keys(g.SKILLS);
const active = sk.filter(k => !g.SKILLS[k].passive);
const passive = sk.filter(k => g.SKILLS[k].passive);
line('共 ' + sk.length + ' 个: 主动 ' + active.length + ' 个, 被动 ' + passive.length + ' 个');
for (const k of sk) {
  const s = g.SKILLS[k];
  line('  ' + s.icon + ' ' + s.name.padEnd(5) + ' [' + s.tag + ']' +
       (s.passive ? ' (被动)' : '') + '  变异 ' + s.muts.length + ' 选 1: ' +
       s.muts.map(m => m.name).join(' / '));
}
const mutCount = sk.reduce((a, k) => a + g.SKILLS[k].muts.length, 0);
line('  → 变异总数 ' + mutCount + ' 个');
line('  → 最多同时携带 6 个技能, 每个最高 10 级(第 11 级触发变异), 变异后最高 20 级');

line('');
line('================ 属性强化 (升级三选一里的 PASSIVES) ================');
line('共 ' + g.PASSIVES.length + ' 项:');
for (const p of g.PASSIVES) line('  ' + p.icon + ' ' + p.name.padEnd(5) + '  ' + p.desc);

line('');
line('================ 宠物 (PETS) ================');
const pets = Object.keys(g.PETS);
line('共 ' + pets.length + ' 只:');
for (const k of pets) {
  const p = g.PETS[k];
  line('  ' + p.emoji + ' ' + p.name + '(' + p.skill + ')' + (p.passive ? ' [被动]' : '') + '  ' + p.desc);
}
line('  → 最多 2 只出战, 等级随玩家成长, 11 级自动变异');

line('');
line('================ 特殊能力 (黑洞小镇奖励) ================');
const sp = Object.keys(g.SPECIALS);
line('共 ' + sp.length + ' 个:');
for (const k of sp) {
  const s = g.SPECIALS[k];
  line('  ' + s.icon + ' ' + s.name.padEnd(4) + (s.passive ? ' [被动]' : ' [按键 ' + s.key + ', 冷却 ' + s.cd + 's]') + '  ' + s.desc);
}

line('');
line('================ NPC 与任务 ================');
line('共 ' + g.NPCS.length + ' 位:');
for (const n of g.NPCS) {
  line('  ' + n.emoji + ' ' + n.name.padEnd(9) + ' 委托: ' + n.quest.text + ' ' + n.quest.goal +
       '  → 奖励 ' + g.SPECIALS[n.reward].name);
}
const kinds = [...new Set(g.NPCS.map(n => n.quest.kind))];
line('  → 任务类型 ' + kinds.length + ' 种: ' + kinds.join(', '));

line('');
line('================ 传送商店 (SHOP_ITEMS) ================');
line('共 ' + g.SHOP_ITEMS.length + ' 项:');
for (const it of g.SHOP_ITEMS) line('  ' + it.icon + ' ' + it.name.padEnd(5) + '  ' + it.desc + '  (基础价 ' + it.base + ')');

line('');
line('================ 黑洞与小镇参数 ================');
line('  触发条件: 至少 ' + g.BH_TRIGGER_SKILLS + ' 个技能, 且其中至少 1 个达到 ' + g.BH_TRIGGER_LEVEL + ' 级');
line('  刷新间隔: ' + g.BH_RESPAWN_MIN + ' ~ ' + g.BH_RESPAWN_MAX + ' 秒 (' +
     (g.BH_RESPAWN_MIN / 60).toFixed(0) + ' ~ ' + (g.BH_RESPAWN_MAX / 60).toFixed(0) + ' 分钟)');
line('  黑洞存在: ' + g.BH_PORTAL_LIFE + ' 秒');

line('');
line('================ 汇总 ================');
line('  怪物 ' + normal.length + ' 种 + 精英 ' + ET.length + ' 种');
line('  技能 ' + sk.length + ' 个(含变异 ' + mutCount + ' 个)');
line('  属性强化 ' + g.PASSIVES.length + ' 项');
line('  宠物 ' + pets.length + ' 只');
line('  特殊能力 ' + sp.length + ' 个');
line('  NPC ' + g.NPCS.length + ' 位');
line('  商店商品 ' + g.SHOP_ITEMS.length + ' 项');
