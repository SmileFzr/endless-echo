/**
 * 精英怪系统测试:
 *   1) 8 种新精英 + 原幽影 = 9 种, 各自有名字/图标/倍率
 *   2) spawnElite 会随机抽类型, 并按倍率调整血量/速度/伤害/体型
 *   3) 每种特性真的生效(吸血/复活/冰弹/咆哮/毒雾/闪现/冰冻/石甲)
 *   4) 图鉴: 只收怪物, 分"普通怪物"与"精英怪物"两类, 不再显示宠物
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
  const el = { id, tagName: 'DIV', dataset: {}, children: [], style: {}, disabled: false, className: '', _html: '', _text: '', _sig: undefined,
    classList: { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)), contains: c => cls.has(c) },
    appendChild(c) { this.children.push(c); return c; }, removeChild() {}, clearRefs() { this.children = []; },
    addEventListener() {}, removeEventListener() {},
    getContext: () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => (t[k] = v, true) }) };
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); if (!this._html) this.clearRefs(); } });
  Object.defineProperty(el, 'textContent', { get() { return this._text; }, set(v) { this._text = String(v); } });
  return el;
}
const document = { hidden: false, head: makeEl('head'),
  getElementById(id) { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
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

const g = vm.runInContext(`({
  get G(){ return G; }, get P(){ return P; }, get SAVE(){ return SAVE; }, set SAVE(v){ SAVE = v; },
  ELITE_TYPES, ENEMY_TYPES, PETS, startGame, spawnElite, updateEliteTraits, hurtEnemy, killEnemy,
  eliteDefOf, openCodex, renderCodex, dbgCodexAll, updateEnemies, el,
  get enemies(){ return enemies; }, get eBullets(){ return eBullets; },
  seenList: k => seenList(k), markSeen: (k, id) => markSeen(k, id)
})`, ctx);

function run(ms) {
  const frames = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < frames; i++) {
    now += 16;
    const q = rafQ; rafQ = [];
    for (const cb of q) cb(now);
    for (let k = timers.length - 1; k >= 0; k--) if (timers[k].at <= now) { const f = timers[k].fn; timers.splice(k, 1); f(); }
  }
}
let fails = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fails++; };
function resetGame() {
  g.SAVE = { gold: 0, up: { hp: 0, spd: 0, dmg: 0, cdr: 0, size: 0 }, best: 0, pets: [], selected: [], specials: {}, quests: {}, seenEnemies: [], seenPets: [] };
  g.startGame('endless', []);
}

console.log('=== 1. 精英种类 ===');
const E = g.ELITE_TYPES;
ok(E.length === 9, '精英共 ' + E.length + ' 种(幽影 + 8 种新精英)');
const names = E.map(d => d.name);
console.log('   ' + E.map(d => d.sprite + d.name).join('  '));
['妖怪', '僵尸', '毛怪', '吸血鬼', '霸王龙'].forEach(n => ok(names.indexOf(n) >= 0, '包含「' + n + '」'));
ok(new Set(E.map(d => d.id)).size === E.length, 'id 无重复');
ok(new Set(E.map(d => d.name)).size === E.length, '名字无重复');
ok(E.every(d => d.sprite && d.hpMul > 0 && d.spdMul > 0 && d.dmgMul > 0 && d.rMul > 0), '每种都有图标与有效倍率');
const traits = E.map(d => d.trait).filter(Boolean);
ok(new Set(traits).size === traits.length, '特性各不相同: ' + traits.join(', '));

console.log('');
console.log('=== 2. 生成时按类型套用倍率 ===');
resetGame();
const byId = {};
for (let i = 0; i < 400; i++) {
  g.enemies.length = 0;
  g.G.diffCount = 0;
  g.spawnElite();
  const e = g.enemies.find(x => x.elite);
  if (!e) continue;
  byId[e.eliteDef] = byId[e.eliteDef] || e;
}
const spawnedIds = Object.keys(byId);
ok(spawnedIds.length >= 7, '400 次生成覆盖到 ' + spawnedIds.length + ' 种精英(随机抽取)');
for (const id of spawnedIds.slice(0, 3)) {
  const e = byId[id], d = g.eliteDefOf(id);
  ok(e.name === d.name && e.sprite === d.sprite, id + ' 的图标/名字正确: ' + d.sprite + d.name);
  ok(Math.abs(e.maxHp / (200 + g.P.level * 35) - d.hpMul) < 0.05, id + ' 血量倍率生效 (x' + d.hpMul + ')');
  ok(!!e.eliteTrait === !!d.trait, id + ' 特性标记正确: ' + (d.trait || '无'));
}

// 霸王龙应该比幽魂更肉更大
const rex = (() => { g.enemies.length = 0; for (let i = 0; i < 200; i++) { g.enemies.length = 0; g.spawnElite(); const e = g.enemies.find(x => x.elite); if (e && e.eliteDef === 'rex') return e; } return null; })();
ok(rex && rex.maxHp > 0, '能生成出霸王龙');
if (rex) console.log('   霸王龙: 血 ' + Math.round(rex.maxHp) + ' 体型 r=' + Math.round(rex.r) + ' 速度 ' + rex.speed.toFixed(0));

console.log('');
console.log('=== 3. 各种特性是否生效 ===');
// 直接构造一只指定类型的精英(不依赖随机刷出)
function makeElite(id) {
  const base = g.ENEMY_TYPES.elite;
  const d = g.eliteDefOf(id);
  const hp = (200 + g.P.level * 35) * d.hpMul;
  const e = {
    type: 'elite', eliteDef: d.id, name: d.name, x: g.P.x + 300, y: g.P.y, vx: 0, vy: 0,
    r: base.r * d.rMul, size: base.size * d.rMul, hp, maxHp: hp,
    speed: base.speed * d.spdMul, dmg: base.dmg * d.dmgMul, exp: 0,
    sprite: d.sprite, elite: true, dead: false, atkCd: 0, flash: 0, acid: 0, burn: 0, poison: 0,
    eliteTrait: d.trait, revived: false, shootCd: 1.5, roarCd: 4, poisonTick: 0, chargeT: 0,
  };
  g.enemies.length = 0;
  g.enemies.push(e);
  return e;
}

// 吸血鬼: 血量会自己涨
resetGame();
{
  const v = makeElite('vampire');
  if (v) {
    v.hp = v.maxHp * 0.5;
    const before = v.hp;
    g.updateEliteTraits(v, 1.0, 10, 0, 200);
    ok(v.hp > before, '🧛 吸血鬼: 1 秒后回血 ' + Math.round(before) + ' → ' + Math.round(v.hp));
  } else ok(false, '没能生成吸血鬼');
}

// 树妖: 靠近会受伤
resetGame();
{
  const t = makeElite('treant');
  if (t) {
    t.x = g.P.x; t.y = g.P.y;
    g.P.invuln = 0;
    const hp0 = g.P.hp;
    g.updateEliteTraits(t, 0.6, 0, 0, 10);
    ok(g.P.hp < hp0, '🌳 树妖: 贴身 0.6 秒后掉血 ' + hp0 + ' → ' + Math.round(g.P.hp));
  } else ok(false, '没能生成树妖');
}

// 幽魂: 会发射冰弹
resetGame();
{
  const w = makeElite('wraith');
  if (w) {
    w.shootCd = 0;
    g.eBullets.length = 0;
    g.updateEliteTraits(w, 0.1, 100, 0, 300);
    ok(g.eBullets.length > 0 && g.eBullets[0].chill === true, '👻 幽魂: 发射了带减速的冰弹');
  } else ok(false, '没能生成幽魂');
}

// 霸王龙: 咆哮会让小怪变快
resetGame();
{
  const r = makeElite('rex');
  if (r) {
    g.enemies.push({ type: 'normal', x: 100, y: 0, r: 15, size: 30, hp: 10, maxHp: 10, speed: 100, dmg: 5, exp: 1, dead: false, atkCd: 0, flash: 0, acid: 0, burn: 0 });
    const mob = g.enemies[g.enemies.length - 1];
    const sp0 = mob.speed;
    r.roarCd = 0;
    g.updateEliteTraits(r, 0.1, 10, 0, 300);
    ok(mob.speed > sp0, '🦖 霸王龙: 咆哮后小怪速度 ' + sp0 + ' → ' + mob.speed.toFixed(0));
  } else ok(false, '没能生成霸王龙');
}

// 妖怪: 会瞬移到玩家附近
resetGame();
{
  const y = makeElite('yokai');
  if (y) {
    y.x = g.P.x + 900; y.y = g.P.y;
    y.blinkCd = 0;
    g.updateEliteTraits(y, 0.1, 900, 0, 900);
    const d = Math.hypot(y.x - g.P.x, y.y - g.P.y);
    ok(d < 400, '🎭 妖怪: 瞬移到玩家附近, 距离 ' + Math.round(d) + 'px');
  } else ok(false, '没能生成妖怪');
}

// 石像鬼: 石甲减伤
resetGame();
{
  const s = makeElite('gargoyle');
  if (s) {
    s.eliteTrait = 'shield';
    s.hp = s.maxHp;
    const before = s.hp;
    g.hurtEnemy(s, 100);
    const takenShield = before - s.hp;
    // 对照: 幽影无减伤
    const s2 = makeElite('shadow');
    s2.hp = s2.maxHp;
    const b2 = s2.hp;
    g.hurtEnemy(s2, 100);
    const takenPlain = b2 - s2.hp;
    ok(takenShield < takenPlain, '🗿 石像鬼: 同样 100 点伤害, 石甲只掉 ' + takenShield + ' (普通精英掉 ' + takenPlain + ')');
  } else ok(false, '没能生成石像鬼');
}

// 僵尸: 第一次死亡会复活
resetGame();
{
  const u = makeElite('undead');
  if (u) {
    u.hp = 1;
    g.killEnemy(u);
    ok(!u.dead, '🧟 僵尸: 第一次死亡后复活了');
    ok(u.hp > 0 && u.revived === true, '🧟 僵尸: 以 ' + Math.round(u.hp) + ' 血复活');
    g.killEnemy(u);
    ok(u.dead === true, '🧟 僵尸: 第二次死亡才真正倒下');
  } else ok(false, '没能生成僵尸');
}

// 毛怪: 挨打后可能冻住玩家
resetGame();
{
  const m = makeElite('yeti');
  if (m) {
    let froze = 0;
    for (let i = 0; i < 60; i++) {
      g.P.slowT = 0;
      m._hitFlag = true;
      g.updateEliteTraits(m, 0.1, 10, 0, 50);
      if (g.P.slowT > 0) froze++;
    }
    ok(froze > 0 && froze < 60, '🦍 毛怪: 60 次挨打触发 ' + froze + ' 次冰冻(概率性)');
  } else ok(false, '没能生成毛怪');
}

console.log('');
console.log('=== 4. 图鉴: 只收怪物, 分普通/精英两类 ===');
resetGame();
g.dbgCodexAll();
g.openCodex();
const body = elements.get('codexBody');
// 收集所有区块标题与卡片
const secs = [], cards = [];
(function walk(node) {
  for (const c of node.children) {
    if (c.className && c.className.indexOf('codexsec') >= 0) secs.push(c.textContent || c.innerHTML);
    if (c.className && c.className.indexOf('codexitem') >= 0) cards.push(c);
    walk(c);
  }
})(body);
const secText = secs.join(' | ');
ok(secText.indexOf('普通怪物') >= 0, '有「普通怪物」分类: ' + secText.replace(/<[^>]*>/g, ''));
ok(secText.indexOf('精英怪物') >= 0, '有「精英怪物」分类');
ok(secText.indexOf('宠物') < 0, '图鉴里已经没有宠物分类');
ok(cards.length === 6 + 9, '图鉴条目 = 普通 6 + 精英 9 = ' + cards.length);
const eliteCards = cards.filter(c => c.className.indexOf('elite') >= 0);
ok(eliteCards.length === 9, '精英卡片 ' + eliteCards.length + ' 个');
ok(cards.every(c => c.className.indexOf('pet') < 0), '没有任何宠物卡片');
const prog = elements.get('codexProg').innerHTML;
ok(/15\s*\/\s*15/.test(prog.replace(/<[^>]*>/g, '')), '进度显示 15 / 15: ' + prog.replace(/<[^>]*>/g, ' '));

console.log('');
console.log(fails === 0 ? '结论: 精英系统与图鉴全部通过 ✔' : '结论: ' + fails + ' 项失败 ✘');
process.exitCode = fails ? 1 : 0;
