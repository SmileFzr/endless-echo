/**
 * 调试指令测试: 验证 window.dbg* 系列在控制台可用且真的生效。
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
const logs = [];
const sb = { Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, Promise,
  isFinite, isNaN, parseInt, parseFloat, Float32Array, Infinity, NaN,
  console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('WARN ' + a.join(' ')) },
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
  startGame, PETS, SKILLS, SPECIALS, ENEMY_TYPES, window,
  get enemies(){ return enemies; }, seenList: k => seenList(k)
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

const EXPECTED = ['dbgAllPets', 'dbgHatch', 'dbgAllSkills', 'dbgAllSpecials', 'dbgCodexAll',
  'dbgGold', 'dbgLv', 'dbgLevelUp', 'dbgGod', 'dbgHeal', 'dbgKills',
  'dbgPets', 'dbgPetLv', 'dbgSpawn', 'dbgKillElite', 'dbgClearFoes',
  'dbgBH', 'dbgGoto', 'dbgTown', 'dbgShop', 'dbgSeen', 'dbgHelp'];

console.log('=== 1. 指令是否都挂到 window 上了 ===');
const missing = EXPECTED.filter(k => typeof g.window[k] !== 'function');
ok(missing.length === 0, EXPECTED.length + ' 条指令全部可用' + (missing.length ? ' (缺少: ' + missing.join(', ') + ')' : ''));

console.log('');
console.log('=== 2. dbgHelp() 能列出帮助 ===');
logs.length = 0;
const helpRet = g.window.dbgHelp();
ok(logs.length > 10, '帮助输出了 ' + logs.length + ' 行');
ok(/调试指令/.test(logs.join('\n')), '帮助里包含标题');
ok(typeof helpRet === 'string' && /条指令/.test(helpRet), '返回值: ' + helpRet);

console.log('');
console.log('=== 3. 开局后各指令真的生效 ===');
g.SAVE = { gold: 0, up: { hp: 0, spd: 0, dmg: 0, cdr: 0, size: 0 }, best: 0, pets: [], selected: [], specials: {}, quests: {} };
g.startGame('endless', []);

// 宠物
ok(g.window.dbgAllPets().indexOf('12') >= 0, 'dbgAllPets: ' + g.window.dbgAllPets());
ok(g.SAVE.pets.length === Object.keys(g.PETS).length, '存档里宠物 = ' + g.SAVE.pets.length + ' 只');
const rPets = g.window.dbgPets('dragon', 'tiger');
ok(/龙/.test(rPets), 'dbgPets 至少带上指定的宠物: ' + rPets);
ok(g.window.dbgPetLv(11).indexOf('变异') >= 0, 'dbgPetLv(11): ' + g.window.dbgPetLv(11));
ok(g.P.pets.every(p => p.lv === 11 && p.mut), '宠物确实 11 级且已变异');

// 技能
ok(g.window.dbgAllSkills().indexOf('6') >= 0, 'dbgAllSkills: ' + g.window.dbgAllSkills());
ok(g.P.skills.length === 6 && g.P.skills.every(s => s.lv === 10), '6 个技能都是 10 级');

// 特殊能力
ok(g.window.dbgAllSpecials().indexOf('5') >= 0, 'dbgAllSpecials: ' + g.window.dbgAllSpecials());
ok(Object.keys(g.SAVE.specials).length === Object.keys(g.SPECIALS).length, '特殊能力全部解锁');

// 金币 / 等级
const goldBefore = g.G.runGold;
g.window.dbgGold(2000);
ok(g.G.runGold === goldBefore + 2000, 'dbgGold(2000): 局内金币 ' + goldBefore + ' → ' + g.G.runGold);
g.window.dbgLv(15);
ok(g.P.level === 15, 'dbgLv(15): 等级 = ' + g.P.level);
const pendBefore = g.G.pendingLvUps;
g.window.dbgLevelUp(3);
ok(g.G.pendingLvUps === pendBefore + 3, 'dbgLevelUp(3): 待选 ' + g.G.pendingLvUps + ' 次');
g.G.state = 'playing'; g.G.pendingLvUps = 0;

// 无敌/秒杀
ok(g.window.dbgGod(true).indexOf('开') >= 0, 'dbgGod(true): ' + g.window.dbgGod(true));
ok(g.P._god === true, '无敌标记已设置');
g.window.dbgGod(false);
ok(g.P._god === false, 'dbgGod(false) 可关闭');

// 回血
g.P.hp = 10;
ok(g.window.dbgHeal().indexOf('回满') >= 0, 'dbgHeal: ' + g.window.dbgHeal());
ok(g.P.hp === g.P.maxHp, '血量已回满');

// 击杀数
const kBefore = g.G.kills;
g.window.dbgKills(25);
ok(g.G.kills === kBefore + 25, 'dbgKills(25): 击杀数 ' + kBefore + ' → ' + g.G.kills);
run(50);
ok(true, '推进一帧不报错(任务进度会顺带更新)');

// 刷怪
const rSpawn = g.window.dbgSpawn('tank', 5);
ok(g.enemies.filter(e => e.type === 'tank' && !e.dead).length === 5, 'dbgSpawn(tank,5) 精确生成 5 只坦克: ' + rSpawn);
ok(g.window.dbgSpawn('elite').indexOf('精英') >= 0, 'dbgSpawn(elite): ' + g.window.dbgSpawn('elite'));
ok(g.enemies.some(e => e.elite && !e.dead), '场上确实有精英怪');
ok(g.window.dbgSpawn('不存在的怪').indexOf('未知') >= 0, 'dbgSpawn 对未知类型给出提示');
const rKill = g.window.dbgKillElite();
ok(g.enemies.every(e => !e.elite || e.dead) || rKill.indexOf('已击杀') >= 0, 'dbgKillElite: ' + rKill);
const nFoes = g.enemies.filter(e => !e.dead).length;
ok(g.window.dbgClearFoes() === nFoes, 'dbgClearFoes 返回清掉的数量 ' + nFoes);

// 商店 / 图鉴 / 场景
ok(g.window.dbgShop().indexOf('商店') >= 0, 'dbgShop: ' + g.window.dbgShop());
g.G.state = 'playing';
ok(g.window.dbgCodexAll().indexOf('点亮') >= 0, 'dbgCodexAll: ' + g.window.dbgCodexAll());
ok(g.seenList('enemy').length === Object.keys(g.ENEMY_TYPES).length, '图鉴怪物全点亮');
ok(g.seenList('pet').length === Object.keys(g.PETS).length, '图鉴宠物全点亮');
const seen = g.window.dbgSeen();
ok(seen && Array.isArray(seen.怪物) && Array.isArray(seen.宠物), 'dbgSeen 返回结构正确');
ok(g.window.dbgTown().indexOf('小镇') >= 0, 'dbgTown: ' + g.window.dbgTown());
ok(g.G.state === 'town', '确实进了小镇');
g.G.state = 'playing';

// 黑洞
g.G.bh = { timer: 9999, portal: null, townReturn: false, announced: true };
ok(g.window.dbgBH().indexOf('黑洞') >= 0, 'dbgBH: ' + g.window.dbgBH());
run(100);
ok(!!g.G.bh.portal, '黑洞已生成');
ok(g.window.dbgGoto().indexOf('传送') >= 0, 'dbgGoto: ' + g.window.dbgGoto());
run(100);
ok(g.G.state === 'town', 'dbgGoto 后进入了小镇');

// 孵化
g.G.state = 'menu';
g.SAVE.pets = [];   // 先清空, 才有可孵化的宠物
const rHatch = g.window.dbgHatch();
ok(/孵化出/.test(rHatch), 'dbgHatch: ' + rHatch);

console.log('');
console.log(fails === 0 ? '结论: 调试指令全部可用 ✔' : '结论: ' + fails + ' 项失败 ✘');
process.exitCode = fails ? 1 : 0;
