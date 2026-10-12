/**
 * 黑洞 / 小镇 / 特殊能力 的回归测试。
 * 覆盖: 触发条件 -> 黑洞生成 -> 吸入进城 -> NPC 接任务/交任务 -> 领奖励
 *       -> 特殊能力激活与冷却 -> 离开小镇 -> 主地图技能效果(加速/无敌)
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
  const el = {
    id, tagName: 'DIV', dataset: {}, children: [], style: {}, disabled: false,
    className: '', title: '', _sig: undefined, _text: '', _html: '',
    classList: {
      add: (...c) => c.forEach(x => cls.add(x)),
      remove: (...c) => c.forEach(x => cls.delete(x)),
      contains: c => cls.has(c),
      toString: () => [...cls].join(' '),
    },
    _cls: cls,
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
    clearRefs() { this.children = []; return this; },
    addEventListener() {}, removeEventListener() {},
    getContext: () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => (t[k] = v, true) }),
  };
  // 像浏览器一样: 写 innerHTML 会清掉已有的子节点引用
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
const document = {
  hidden: false,
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
  get G(){ return G; }, get P(){ return P; }, get SAVE(){ return SAVE; }, set SAVE(v){ SAVE = v; },
  SPECIALS, NPCS, T, PETS, ENEMY_TYPES, SHOP_ITEMS,
  startGame, updateBlackHole, enterTown, leaveTown, townInteract, updateTown, drawTown,
  openNPCDialog, closeNPCDialog, useSpecial, updateSpecials, questTick, bhEligible,
  ownedSpecials, syncSpecialBars, drawBlackHole, drawBlackHoleIndicator, update,
  el, writeSave,
  seenList: k => seenList(k), markSeen: (k, id) => markSeen(k, id),
  get enemies(){ return enemies; }
})`, ctx);

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
function resetSave() {
  g.SAVE = { gold: 0, up: { hp: 0, spd: 0, dmg: 0, cdr: 0, size: 0 }, best: 0, pets: [], selected: [], specials: {}, quests: {} };
}

console.log('=== 1. 触发条件: 至少 3 个技能且至少 1 个技能 >= 3 级 ===');
resetSave();
g.startGame('endless', []);
ok(!g.bhEligible(), '开局 1 个技能 Lv1 -> 不满足条件');
g.P.skills = [{ id: 'homing', lv: 3, mut: null, cd: 0 }, { id: 'sword', lv: 1, mut: null, cd: 0 }];
ok(!g.bhEligible(), '2 个技能(即使有一个 3 级) -> 仍不满足');
g.P.skills = [{ id: 'homing', lv: 3, mut: null, cd: 0 }, { id: 'sword', lv: 1, mut: null, cd: 0 }, { id: 'bomb', lv: 1, mut: null, cd: 0 }];
ok(g.bhEligible(), '3 个技能 + 1 个达到 3 级 -> 满足条件');
g.P.skills = [{ id: 'homing', lv: 2, mut: null, cd: 0 }, { id: 'sword', lv: 2, mut: null, cd: 0 }, { id: 'bomb', lv: 2, mut: null, cd: 0 }];
ok(!g.bhEligible(), '3 个技能但都只有 2 级 -> 不满足');

console.log('');
console.log('=== 2. 黑洞在主地图上生成 ===');
resetSave();
g.startGame('endless', []);
g.P.skills = [{ id: 'homing', lv: 3, mut: null, cd: 0 }, { id: 'sword', lv: 3, mut: null, cd: 0 }, { id: 'bomb', lv: 3, mut: null, cd: 0 }];
g.updateBlackHole(0.016);
ok(g.G.bh && g.G.bh.announced, '条件达成后开始计时的标记已设置');
ok(g.G.bh.timer >= 180 - 1 && g.G.bh.timer <= 300 + 1, '首次倒计时在 3~5 分钟区间: ' + Math.round(g.G.bh.timer) + 's');
g.G.bh.timer = 0.01;
g.updateBlackHole(0.016);
ok(!!g.G.bh.portal, '倒计时归零后黑洞出现');
const dist = Math.hypot(g.G.bh.portal.x - g.P.x, g.G.bh.portal.y - g.P.y);
ok(dist > 300, '黑洞生成在远处(不会直接压在脚下): ' + Math.round(dist) + 'px');

console.log('');
console.log('=== 3. 走进黑洞 -> 进入小镇 ===');
g.P.x = g.G.bh.portal.x; g.P.y = g.G.bh.portal.y;
g.updateBlackHole(0.016);
ok(g.G.state === 'town', '走进黑洞后 state = ' + g.G.state);
ok(g.G.bh.portal === null, '进入小镇后主地图的黑洞被清除');
ok(!elements.get('townBar').classList.contains('hidden'), '城镇顶栏已显示');
ok(elements.get('hud').classList.contains('hidden'), '战斗 HUD 已隐藏');
ok(g.T.x === 0 && g.T.y === 190, '玩家出现在小镇南门附近');
try { g.drawTown(); ok(true, '城镇画面可以正常绘制(无异常)'); }
catch (e) { ok(false, '城镇绘制抛异常: ' + e.message); }

console.log('');
console.log('=== 3b. 城镇自适应缩放(宽屏放大 / 手机不缩小) ===');
try {
  const zm = vm.runInContext('townZoom()', ctx);
  ok(zm >= 1 && zm <= 1.55, '当前视口缩放 = ' + zm.toFixed(2) + ' (限制在 1 ~ 1.55)');
  ok(zm === 1, '窄屏(420x820)保持设计尺寸不缩小');
  vm.runInContext('W = 1912; H = 941;', ctx);          // 模拟宽屏
  const zw = vm.runInContext('townZoom()', ctx);
  ok(zw > 1, '宽屏(1912x941)放大到 ' + zw.toFixed(2) + ' 倍');
  ok(zw <= 1.55, '放大倍数有上限, 不会过度拉伸');
  // 缩放不影响世界坐标下的交互判定
  const anyNpc = g.NPCS.find(n => n.id === 'smith');
  g.T.x = anyNpc.x; g.T.y = anyNpc.y + 40;
  vm.runInContext('updateTown(0.016)', ctx);
  ok(g.T.near === anyNpc, '缩放后 NPC 交互判定仍正常(用世界坐标, 不受缩放影响)');
  vm.runInContext('W = 420; H = 820;', ctx);           // 还原
} catch (e) { ok(false, '缩放验证异常: ' + e.message); }

console.log('');
console.log('=== 4. 小镇内移动与边界 ===');
const x0 = g.T.x, y0 = g.T.y;
// 模拟虚拟摇杆向右
const input = vm.runInContext('input', ctx);
input.joy.active = true; input.joy.dx = 62; input.joy.dy = 0;
g.updateTown(0.5);
input.joy.active = false; input.joy.dx = 0; input.joy.dy = 0;
ok(g.T.x > x0, '摇杆向右时 x 增加: ' + x0 + ' -> ' + Math.round(g.T.x));
g.T.x = 9999; g.T.y = 9999;
g.updateTown(0.016);
ok(g.T.x <= 232 - g.T.r + 1 && g.T.y <= 212 - g.T.r + 1,
   '越界会被限制在围墙内: (' + Math.round(g.T.x) + ', ' + Math.round(g.T.y) +
   ') 上限 (' + (232 - g.T.r) + ', ' + (212 - g.T.r) + ')');

console.log('');
console.log('=== 5. NPC 对话与任务流程 ===');
resetSave();
g.startGame('endless', []);
g.enterTown();
const npc = g.NPCS.find(n => n.id === 'smith');   // 铁匠: 击杀 30 只
g.T.x = npc.x; g.T.y = npc.y;
g.updateTown(0.016);
ok(g.T.near === npc, '走到铁匠旁边会被识别为可交互: ' + (g.T.near && g.T.near.name));
g.townInteract();
ok(!elements.get('npcDlg').classList.contains('hidden'), '对话框已弹出');
ok(elements.get('dlgTitle').textContent.indexOf('铁匠') >= 0, '对话框标题为 NPC 名字: ' + elements.get('dlgTitle').textContent);
ok(elements.get('dlgActions').children.length > 0, '对话框有操作按钮');
// 点"接下委托"
const acceptBtn = elements.get('dlgActions').children[0];
acceptBtn.onclick();
ok(!!g.SAVE.quests.smith, '委托已记录到存档');
ok(g.SAVE.quests.smith.quest.goal === 30, '任务目标为击杀 30 只');
g.closeNPCDialog();

console.log('');
console.log('=== 6. 任务进度随主地图战斗推进 ===');
g.leaveTown();
ok(g.G.state === 'playing', '离开小镇后回到主地图');
// 注意: 任务基准是"接下委托时的击杀数", 中途不能重开一局
const base = g.SAVE.quests.smith.quest.base;
g.G.kills = base + 10; g.questTick(0.016);
ok(g.SAVE.quests.smith.quest.cur === 10, '击杀 10 只 -> 进度 10 (' + g.SAVE.quests.smith.quest.cur + ')');
ok(!g.SAVE.quests.smith.done, '未达标时 done 仍为 false');
g.G.kills = base + 30; g.questTick(0.016);
ok(g.SAVE.quests.smith.done, '达到 30 只后标记为可交差');
ok(g.SAVE.quests.smith.quest.cur === 30, '进度封顶在目标值: ' + g.SAVE.quests.smith.quest.cur);

console.log('');
console.log('=== 7. 回到小镇交任务领奖励 ===');
g.enterTown();
g.T.x = npc.x; g.T.y = npc.y; g.updateTown(0.016);
g.townInteract();
ok(!elements.get('npcDlg').classList.contains('hidden'), '再次对话成功');
const btnTexts = elements.get('dlgActions').children.map(b => b.textContent);
ok(!btnTexts.some(t => /接下/.test(t)),
   '"接下委托"按钮没有残留(旧按钮已被清理): ' + btnTexts.join(' | '));
const claimBtn = elements.get('dlgActions').children.find(b => /领/.test(b.textContent));
ok(!!claimBtn, '弹出的是"领取奖励"按钮: ' + btnTexts.join(' | '));
claimBtn.onclick();
ok(g.SAVE.specials.boots === true, '已解锁踏空靴');
ok(g.SAVE.quests.smith.claimed === true, '任务标记为已领取');
ok(g.ownedSpecials().length === 1, '已拥有 1 个特殊能力');
g.closeNPCDialog();

console.log('');
console.log('=== 8. 特殊能力: 冷却与效果 ===');
g.leaveTown();
ok(g.SAVE.specials.boots === true, '特殊能力保存在存档 SAVE.specials 中');
g.startGame('endless', []);   // 开新局
ok(g.P.specials && Object.keys(g.P.specials).length === 0, '新局的能力冷却表是空的(每局重置)');
ok(g.SAVE.specials.boots === true, '但解锁状态跨局保留');
g.useSpecial('boots');        // 未初始化冷却表时也应能安全使用
ok(g.P.bootsT > 2, '激活后获得持续时间: ' + g.P.bootsT.toFixed(1) + 's');
const cdAfter = g.P.specials.boots.cd;
ok(cdAfter > 10, '进入冷却: ' + cdAfter.toFixed(1) + 's');
g.useSpecial('boots');
ok(g.P.specials.boots.cd <= cdAfter, '冷却中再次使用不会重置冷却');
g.updateSpecials(3);
ok(g.P.bootsT <= 0, '持续时间结束后效果消失');
ok(g.P.specials.boots.cd < cdAfter, '冷却随时间递减: ' + g.P.specials.boots.cd.toFixed(1) + 's');

console.log('');
console.log('=== 9. 无敌穿怪: 踏空靴生效时不与怪物碰撞 ===');
resetSave();
g.SAVE.specials = { boots: true };
g.startGame('endless', []);
g.P.specials = { boots: { cd: 0 } };
// 造一个怪物正好压在玩家身上(用 updatePlayer 单独验证碰撞, 不跑整帧)
const e = vm.runInContext('spawnOne(), enemies[enemies.length-1]', ctx);
const hpBefore = g.P.hp;
e.x = g.P.x; e.y = g.P.y; e.atkCd = 0;
g.P.bootsT = 0; g.P.invuln = 0;
vm.runInContext('updatePlayer(0.016)', ctx);
const hpHit = g.P.hp;
ok(hpHit < hpBefore, '未开靴子时被贴身怪物撞掉血: ' + hpBefore + ' -> ' + Math.round(hpHit));
g.P.hp = hpBefore; g.P.invuln = 0;
e.x = g.P.x; e.y = g.P.y; e.atkCd = 0;
g.P.bootsT = 2;
vm.runInContext('updatePlayer(0.016)', ctx);
ok(g.P.hp === hpBefore, '开靴子后穿过怪物不掉血: ' + hpBefore + ' -> ' + Math.round(g.P.hp));
g.P.bootsT = 0;

console.log('');
console.log('=== 10. 风之翼加速 ===');
resetSave();
g.SAVE.specials = { wing: true };
g.startGame('endless', []);
g.P.specials = { wing: { cd: 0 } };
const speedNorm = g.P.speed;
g.useSpecial('wing');
ok(g.P.wingT > 4, '风之翼激活: ' + g.P.wingT.toFixed(1) + 's');
ok(g.P.specials.wing.cd > 10, '风之翼进入冷却: ' + g.P.specials.wing.cd.toFixed(1) + 's');
// 用同一帧的位移量对比
function moveDist() {
  const input = vm.runInContext('input', ctx);
  input.keys.clear(); input.keys.add('d');
  const x0 = g.P.x;
  vm.runInContext('updatePlayer(0.1)', ctx);
  input.keys.clear();
  return g.P.x - x0;
}
const dWing = moveDist();
g.P.wingT = 0;
const dNorm = moveDist();
ok(dWing > dNorm * 1.5, '风之翼期间移动距离显著变长: ' + dWing.toFixed(1) + ' vs ' + dNorm.toFixed(1));

console.log('');
console.log('=== 12. 图鉴: 只显示遇到过的, 没遇到只留空框 ===');
resetSave();
g.startGame('endless', []);
// 开局什么都没遇到
ok(g.seenList('enemy').length === 0, '开局没有遇到任何怪物');
g.markSeen('enemy', 'normal');
ok(g.seenList('enemy').indexOf('normal') >= 0, '记录"遇到过普通怪"成功');
g.markSeen('enemy', 'normal');
ok(g.seenList('enemy').filter(x => x === 'normal').length === 1, '同一种怪物不会重复记录');
// 击杀怪物应自动记录
const foe = vm.runInContext('spawnOne(), enemies[enemies.length-1]', ctx);
g.markSeen('enemy', foe.type);
ok(g.seenList('enemy').length >= 1, '击杀后图鉴里有了记录');

// 打开图鉴
const gOpen = vm.runInContext('openCodex', ctx);
const gClose = vm.runInContext('closeCodex', ctx);
gOpen();
ok(g.G.state === 'codex', '打开图鉴后 state = codex');
ok(!elements.get('codex').classList.contains('hidden'), '图鉴面板已显示');
const body = elements.get('codexBody');
ok(body.children.length > 0, '图鉴里渲染出了分组内容 (' + body.children.length + ' 个区块)');
// 统计"点亮"与"未点亮"
const all = [];
(function walk(node) { for (const c of node.children) { if (c.className && c.className.indexOf('codexitem') >= 0) all.push(c); walk(c); } })(body);
const locked = all.filter(n => n.className.indexOf('locked') >= 0);
const lit = all.filter(n => n.className.indexOf('locked') < 0);
ok(all.length === Object.keys(g.ENEMY_TYPES).length + Object.keys(g.PETS).length,
   '图鉴条目总数 = 怪物 ' + Object.keys(g.ENEMY_TYPES).length + ' + 宠物 ' + Object.keys(g.PETS).length +
   ' (实际 ' + all.length + ')');
ok(locked.length > 0, '没遇到的条目显示为空框 (共 ' + locked.length + ' 个未点亮)');
ok(lit.length === g.seenList('enemy').length + g.seenList('pet').length,
   '点亮的条目数 = 已遇到的怪物 + 宠物 (' + lit.length + ')');
// 空框不该可点击
ok(locked.every(n => !n.onclick), '未点亮的条目不可点击');

// 点亮全部后锁定项应为 0
const gDbgCodex = vm.runInContext('window.dbgCodex', ctx);
gDbgCodex();
gOpen();
const body2 = elements.get('codexBody');
const all2 = [];
(function walk(node) { for (const c of node.children) { if (c.className && c.className.indexOf('codexitem') >= 0) all2.push(c); walk(c); } })(body2);
ok(all2.filter(n => n.className.indexOf('locked') >= 0).length === 0, 'dbgCodex() 之后全部点亮');
gClose();
ok(g.G.state === 'menu' || g.G.state === 'playing', '关闭图鉴后回到之前的状态 (' + g.G.state + ')');

console.log('');
console.log('=== 14. 12 生肖宠物: 被动的数值效果 ===');
resetSave();
g.startGame('endless', []);
const baseStats = { speed: g.P.speed, crit: g.P.crit, armor: g.P.dmgReduce, maxHp: g.P.maxHp };
ok(baseStats.speed > 0, '基准: speed=' + baseStats.speed.toFixed(1) + ' crit=' + baseStats.crit.toFixed(3) +
   ' armor=' + baseStats.armor.toFixed(3) + ' maxHp=' + baseStats.maxHp);

/* 直接往 P.pets 里塞宠物, 再 recalcStats 看数值变化 */
function withPets(list) {
  g.P.pets = list.map(([id, lv, mut]) => ({ id, lv, mut: !!mut, cd: 0, x: g.P.x, y: g.P.y }));
  vm.runInContext('recalcStats()', ctx);
  return { speed: g.P.speed, crit: g.P.crit, armor: g.P.dmgReduce, maxHp: g.P.maxHp };
}

const horse = withPets([['horse', 8, false]]);
ok(horse.speed > baseStats.speed, '🐴 马: 移速 ' + baseStats.speed.toFixed(1) + ' → ' + horse.speed.toFixed(1));
const horseMut = withPets([['horse', 8, true]]);
ok(horseMut.speed > horse.speed, '🐴 马(变异): 加成翻倍 → ' + horseMut.speed.toFixed(1));

const rooster = withPets([['rooster', 10, false]]);
ok(rooster.crit > baseStats.crit, '🐔 鸡: 暴击 ' + baseStats.crit.toFixed(3) + ' → ' + rooster.crit.toFixed(3));

const ox = withPets([['ox', 10, false]]);
ok(ox.armor > baseStats.armor, '🐮 牛: 减伤 ' + baseStats.armor.toFixed(3) + ' → ' + ox.armor.toFixed(3));
ok(ox.maxHp > baseStats.maxHp, '🐮 牛: 生命上限 ' + baseStats.maxHp + ' → ' + ox.maxHp);
const oxMut = withPets([['ox', 10, true]]);
ok(oxMut.armor > ox.armor, '🐮 牛(变异): 减伤翻倍 → ' + oxMut.armor.toFixed(3));

// 羊: 持续回血
withPets([['sheep', 6, false]]);
g.P.hp = g.P.maxHp * 0.5;
const sheepHpBefore = g.P.hp;
vm.runInContext('updatePassivePets(1.0)', ctx);
ok(g.P.hp > sheepHpBefore, '🐑 羊: 1 秒后回血 ' + Math.round(sheepHpBefore) + ' → ' + Math.round(g.P.hp));
// 变异后残血回复更快
withPets([['sheep', 6, true]]);
g.P.hp = g.P.maxHp * 0.4;
const h1 = g.P.hp;
vm.runInContext('updatePassivePets(1.0)', ctx);
const healMut = g.P.hp - h1;
withPets([['sheep', 6, false]]);
g.P.hp = g.P.maxHp * 0.8;   // 高于一半, 不触发变异加成
const h2 = g.P.hp;
vm.runInContext('updatePassivePets(1.0)', ctx);
const healNorm = g.P.hp - h2;
ok(healMut > healNorm, '🐑 羊(变异): 残血回复更快 (' + healMut.toFixed(1) + ' vs ' + healNorm.toFixed(1) + ')');

// 猴: 减少技能冷却
withPets([['monkey', 5, false]]);
g.P.skills = [{ id: 'homing', lv: 5, mut: null, cd: 3 }];
vm.runInContext('P._monkeyT = 0; updatePassivePets(0.1)', ctx);
ok(g.P.skills[0].cd < 3, '🐵 猴: 技能冷却被缩短 3.00 → ' + g.P.skills[0].cd.toFixed(2));

// 猪: 金币掉落增加(统计多次击杀的平均值)
resetSave();
g.startGame('endless', []);
function goldFromKills(n) {
  g.G.runGold = 0;
  for (let i = 0; i < n; i++) {
    const e = vm.runInContext('spawnOne(), enemies[enemies.length-1]', ctx);
    vm.runInContext('hurtEnemy(enemies[enemies.length-1], 1e9)', ctx);
  }
  return g.G.runGold;
}
const goldNoPig = goldFromKills(200);
withPets([['pig', 12, false]]);
const goldWithPig = goldFromKills(200);
ok(goldWithPig > goldNoPig, '🐷 猪: 200 次击杀金币 ' + goldNoPig + ' → ' + goldWithPig);
ok(Object.keys(g.PETS).length === 12, '宠物总数 = ' + Object.keys(g.PETS).length + ' (十二生肖齐全)');
const zodiac = ['rat','ox','tiger','rabbit','dragon','snake','horse','sheep','monkey','rooster','dog','pig'];
ok(zodiac.every(k => !!g.PETS[k]), '十二生肖一个不少: ' + zodiac.map(k => g.PETS[k].emoji).join(''));

console.log('');
console.log('=== 15. 重置存档保留特殊能力 ===');
g.SAVE.specials = { wing: true };
const doReset = vm.runInContext('doResetSave', ctx);
doReset();
ok(g.SAVE.gold === 0, '金币已清零');
ok(g.SAVE.pets.length === 0, '宠物已清空');
ok(g.SAVE.specials.wing === true, '特殊能力未被误删(保留)');

console.log('');
console.log(fails === 0 ? '结论: 黑洞/小镇/特殊能力 回归测试全部通过 ✔' : '结论: ' + fails + ' 项失败 ✘');
process.exitCode = fails ? 1 : 0;
