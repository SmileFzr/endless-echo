/* ============================================================
   游戏状态与核心逻辑 / state, combat & progression
   无尽回响 Endless Echo
   ============================================================ */

/* ---------- Canvas ---------- */
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
resize();

const _spriteCache = {};
function getSprite(emoji, size) {
  const key = emoji + '|' + size;
  if (_spriteCache[key]) return _spriteCache[key];
  const px = Math.ceil(size * 2);
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  g.font = `${px * 0.84}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, px / 2, px / 2);
  _spriteCache[key] = cv; return cv;
}
function drawSprite(emoji, x, y, size, rot, alpha) {
  const img = getSprite(emoji, size);
  if (rot || alpha !== undefined) {
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  } else ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}

const G = { state:'menu', mode:'endless', time:0, kills:0, runGold:0, hpMult:1, diffCount:0, unlocked:['normal'], nextEliteLv:10, eliteAlive:false, pendingLvUps:0, spawnTimer:0, shopTimer:28, shake:0, challengeEnd:15*60 };
let P = null;
let enemies = [], bullets = [], eBullets = [], orbs = [], effects = [], texts = [], portals = [];
const SAVE_KEY = 'endless_echo_save_v2';
let SAVE = { gold:0, up:{ hp:0, spd:0, dmg:0, cdr:0, size:0 }, best:0, pets:[], selected:[] };
function loadSave() { try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const d = JSON.parse(raw); SAVE = Object.assign(SAVE, d); SAVE.up = Object.assign({ hp:0, spd:0, dmg:0, cdr:0, size:0 }, d.up || {}); if (!Array.isArray(SAVE.pets)) SAVE.pets = []; if (!Array.isArray(SAVE.selected)) SAVE.selected = []; } } catch (e) {} }
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) {} }
loadSave();

const input = { keys: new Set(), joy: { active:false, ox:0, oy:0, dx:0, dy:0, id:null } };
window.addEventListener('keydown', e => { input.keys.add(e.key.toLowerCase()); if (e.key === 'f' || e.key === 'F') townInteract();   // 城镇里与 NPC 交谈 / 离开
  if (e.key === 'Escape') { if (G.state === 'playing') pauseGame(); else if (G.state === 'paused') resumeGame(); } if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault(); });
window.addEventListener('keyup', e => input.keys.delete(e.key.toLowerCase()));
function canMoveByDrag() {
  // 这些状态都可以用摇杆/拖拽移动(回声小镇复用同一套摇杆)
  return G.state === 'playing' || G.state === 'town';
}
function getPointer(e) { const t = e.touches ? e.touches[0] : e; return { x:t.clientX, y:t.clientY, id:t.identifier !== undefined ? t.identifier : 'm' }; }
canvas.addEventListener('touchstart', e => { e.preventDefault(); if (!canMoveByDrag()) return; if (input.joy.active) return; const p = getPointer(e); input.joy.active = true; input.joy.id = p.id; input.joy.ox = p.x; input.joy.oy = p.y; input.joy.dx = 0; input.joy.dy = 0; }, { passive: false });
canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!input.joy.active) return; for (const t of e.touches) if (t.identifier === input.joy.id) { input.joy.dx = t.clientX - input.joy.ox; input.joy.dy = t.clientY - input.joy.oy; const d = Math.hypot(input.joy.dx, input.joy.dy), max = 62; if (d > max) { input.joy.dx = input.joy.dx / d * max; input.joy.dy = input.joy.dy / d * max; } } }, { passive: false });
function endTouch(e) { if (!input.joy.active) return; let still = false; for (const t of (e.touches || [])) if (t.identifier === input.joy.id) still = true; if (!still) { input.joy.active = false; input.joy.dx = 0; input.joy.dy = 0; } }
canvas.addEventListener('touchend', endTouch, { passive: false });
canvas.addEventListener('touchcancel', endTouch, { passive: false });
let mouseDown = false;
canvas.addEventListener('mousedown', e => { if (!canMoveByDrag()) return; mouseDown = true; input.joy.active = true; input.joy.ox = e.clientX; input.joy.oy = e.clientY; input.joy.dx = 0; input.joy.dy = 0; });
window.addEventListener('mousemove', e => { if (!mouseDown) return; input.joy.dx = e.clientX - input.joy.ox; input.joy.dy = e.clientY - input.joy.oy; const d = Math.hypot(input.joy.dx, input.joy.dy); if (d > 62) { input.joy.dx = input.joy.dx / d * 62; input.joy.dy = input.joy.dy / d * 62; } });
window.addEventListener('mouseup', () => { mouseDown = false; input.joy.active = false; input.joy.dx = 0; input.joy.dy = 0; });

function createPlayer() {
  const baseHp = 100 + SAVE.up.hp * 22;
  return { x:0, y:0, r:15, hp:baseHp, maxHp:baseHp, baseSpeed:205 * (1 + SAVE.up.spd * 0.05), speed:205, level:1, exp:0, expNext:expForLevel(1), pickupRange:82, dmgMult:1, cdr:0, crit:0.05, regen:0, dmgReduce:0, expMult:1, stillTime:0, moving:false, skills:[], pets:[], invuln:0, hurtFlash:0, slowT:0, up:{ maxhp:0, speed:0, dmg:0, cdr:0, armor:0, regen:0, crit:0, pickup:0 }, sizeScale:1 - SAVE.up.size * 0.04 };
}
function expForLevel(lv) { return Math.floor(4 + lv * 2.6 + Math.pow(lv, 1.42)); }
function recalcStats() {
  let dmg = 1, spd = 1, cdr = 0, pick = 82, expm = 1, hpBonus = 0, armor = 0, regen = 0, crit = 0.05;
  // 注意: 永久强化 SAVE.up.hp / .spd 已在 createPlayer() 里计入 baseHp / baseSpeed,
  //       这里不能重复加, 否则每点永久生命实际 +32 而不是 +22。
  dmg += SAVE.up.dmg * 0.05; cdr += SAVE.up.cdr * 0.03;
  const u = P.up;
  dmg += u.dmg * 0.08; spd += u.speed * 0.07; cdr += u.cdr * 0.06; pick += u.pickup * 14;
  hpBonus += u.maxhp * 22; armor += u.armor * 0.05; regen += u.regen * 0.5; crit += u.crit * 0.04;
  // 被动生肖宠物: 🐴马 提速 / 🐔鸡 提暴击 / 🐮牛 减伤+加血
  if (P.pets) {
    for (const pet of P.pets) {
      if (pet.id === 'horse') spd += Math.min(0.24, pet.lv * 0.02) * (pet.mut ? 2 : 1);
      if (pet.id === 'rooster') crit += Math.min(0.30, pet.lv * 0.02);
      if (pet.id === 'ox') { armor += Math.min(0.30, pet.lv * 0.02) * (pet.mut ? 2 : 1); hpBonus += pet.lv * 8; }
    }
  }
  for (const s of P.skills) {
    if (s.id === 'expgain') expm += s.lv * 0.10;
    if (s.id === 'pickup') pick += s.lv * 12;
    if (s.id === 'immovable') { const still = P.stillTime > 0.35; if (still) { dmg += s.lv * 0.06; cdr += s.lv * 0.04; if (s.mut === 'root') { regen += P.maxHp * 0.02; armor += 0.20; } if (s.mut === 'rage') cdr += 0.5; } }
  }
  cdr = Math.min(cdr, 0.72);
  P.dmgMult = dmg;
  P.speed = P.baseSpeed * spd * (P.slowT > 0 ? 0.55 : 1);   // 幽魂冰弹减速
  P.cdr = cdr; P.pickupRange = pick;
  P.expMult = expm; P.dmgReduce = Math.min(armor, 0.75); P.regen = regen; P.crit = Math.min(crit, 0.85);
  const newMax = (100 + SAVE.up.hp * 22) + hpBonus;
  if (newMax > P.maxHp) P.hp += newMax - P.maxHp;
  P.maxHp = newMax; P.hp = Math.min(P.hp, P.maxHp);
}
function nearestEnemy(x, y) {
  let best = null, bd = Infinity;
  for (const e of enemies) { if (e.dead) continue; const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd) { bd = d; best = e; } }
  return best;
}
function randomEnemies(n) {
  if (enemies.length === 0) return [];
  const arr = []; const copy = enemies.slice();
  for (let i = 0; i < n && copy.length; i++) { const k = Math.floor(Math.random() * copy.length); arr.push(copy[k]); copy.splice(k, 1); }
  return arr;
}
function aoeDamage(x, y, r, dmg, exclude) {
  const r2 = r * r;
  for (const e of enemies) { if (e === exclude || e.dead) continue; const dx = e.x - x, dy = e.y - y; if (dx * dx + dy * dy < r2) hurtEnemy(e, dmg); }
}

/* ============================================================
   ★ 修复：对精英怪伤害 ×1.4
   ============================================================ */
function hurtEnemy(e, dmg, isCrit) {
  if (P._god) dmg = 1e9;          // 调试无敌同时开启一击必杀

  if (e.dead) return;
  if (e.acid > 0) dmg *= 1.3;
  if (e.burn > 0) dmg *= (1 + e.burn * 0.05);
  if (e.poison > 0) dmg *= (1 + e.poison * 0.04);   // 中毒状态增伤
  if (e.elite) dmg *= 1.4;  // ★ 新增：对精英怪伤害加成
  if (e.eliteTrait === 'shield') dmg *= 0.6;
  const d = Math.max(1, Math.round(dmg));
  e.hp -= d; e.flash = 0.09;
  if (texts.length < 30) texts.push({ x:e.x+rnd(-8,8), y:e.y-e.r-4, v:-46, life:0.55, max:0.55, t:String(d), crit:!!isCrit });
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  if (e.dead) return;
  if (e.elite && e.eliteTrait === 'undead' && !e.revived) {
    e.revived = true;
    e.hp = Math.max(1, Math.round(e.maxHp * 0.5));
    e.flash = 0.3;
    effects.push({ kind:'boom', x:e.x, y:e.y, life:0.5, max:0.5, r:150, col:'#8ef07a' });
    aoeDamage(e.x, e.y, 150, e.dmg * 0.8);
    if (Math.hypot(P.x - e.x, P.y - e.y) < 150 + P.r) damagePlayer(e.dmg * 0.6);
    toast('☠ ' + e.name + ' 又站起来了！');
    sfx('mut');
    return;
  }
  e.dead = true; G.kills++; sfx('kill');
  markSeen('enemy', e.elite ? e.eliteDef : e.type);   // 图鉴: 见过即记录
  if (e.elite) { G.eliteAlive = false; onEliteKilled(e); return; }
  if (orbs.length < 200) {
    const n = e.exp;
    for (let i = 0; i < Math.min(n, 4); i++) orbs.push({ x:e.x+rnd(-10,10), y:e.y+rnd(-10,10), vx:rnd(-40,40), vy:rnd(-40,40), v:e.exp/Math.min(n,4), r:5, life:30, pulling:false, spin:Math.random()*TAU });
  }
  let goldGain = e.explode ? 3 : 1;
  const pigLv = (P.pets || []).reduce((m, p) => p.id === 'pig' ? Math.max(m, p.lv) : m, 0);
  // 最多 +1 枚, 且随等级提高触发概率(20 级时约 +45%)
  if (pigLv > 0) {
    const chance = Math.min(0.45, 0.10 + pigLv * 0.018);
    const bonus = 1 + (Math.random() < chance ? 1 : 0);
    goldGain = Math.round(goldGain * bonus);
  }
  G.runGold += goldGain;
  if (e.explode) { effects.push({ kind:'boom', x:e.x, y:e.y, life:0.35, max:0.35, r:70, col:'#ff5f6d' }); if (Math.hypot(P.x - e.x, P.y - e.y) < 70 + P.r) damagePlayer(e.dmg * 0.7); G.shake = Math.max(G.shake, 6); }
  if (effects.length < 100) effects.push({ kind:'poof', x:e.x, y:e.y, life:0.28, max:0.28, r:e.r });
  const eg = getSkill('expgain');
  if (eg && eg.mut === 'plunder' && Math.random() < 0.18) gainExp(2);
}
function getSkill(id) { return P.skills.find(s => s.id === id); }

/* ============================================================
   ★ 修复：精英怪独立血量公式
   ============================================================ */
function spawnElite() {
  const t = ENEMY_TYPES.elite;
  const a = Math.random() * TAU;
  const d = Math.max(W, H) * 0.5 + 80;
  const x = P.x + Math.cos(a) * d;
  const y = P.y + Math.sin(a) * d;
  // ★ 新公式：基础血量随玩家等级线性增长 + 随时间温和增长
  const m = G.time / 60;
  const eliteHp = (200 + P.level * 35) * (1 + m * 0.12) * G.hpMult;
  // 10级 3分钟：(200+350) * 1.36 = 748
  // 20级 7分钟：(200+700) * 1.84 = 1656
  const def = ELITE_TYPES[(Math.random() * ELITE_TYPES.length) | 0];
  enemies.push({
    type:'elite', eliteDef:def.id, name:def.name, x, y, vx:0, vy:0,
    r: t.r * def.rMul, size: t.size * def.rMul,
    hp: eliteHp * def.hpMul, maxHp: eliteHp * def.hpMul,
    speed: t.speed * def.spdMul * (1 + G.diffCount * 0.04),
    dmg: t.dmg * def.dmgMul * (1 + G.diffCount * 0.08),
    exp:0, sprite:def.sprite, elite:true, dead:false, atkCd:0, flash:0, acid:0, burn:0,
    eliteTrait:def.trait, revived:false, shootCd:1.5, roarCd:4, poisonTick:0
  });
  markSeen('enemy', def.id);   // 图鉴: 精英一出现就算遇到过
  G.eliteAlive = true;
  toast('⚠ 精英怪降临：' + def.name + '！屏幕边缘有红色箭头');
  G.shake = 12; sfx('elite');
}
function onEliteKilled(e) {
  G.diffCount++; G.hpMult *= 1.10;
  const order = ['fast', 'swarm', 'ranged', 'tank', 'bomber'];
  for (const k of order) if (!G.unlocked.includes(k)) { G.unlocked.push(k); break; }
  const bonusGold = 40 + G.diffCount * 15;
  G.runGold += bonusGold;
  if (orbs.length < 200) for (let i = 0; i < 14; i++) orbs.push({ x:e.x+rnd(-40,40), y:e.y+rnd(-40,40), vx:rnd(-90,90), vy:rnd(-90,90), v:8, r:8, life:40, pulling:false, spin:0, big:true });
  effects.push({ kind:'boom', x:e.x, y:e.y, life:0.6, max:0.6, r:200, col:'#ffd76a' });
  G.shake = 18; sfx('eliteKill');
  P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.3);
  toast(`精英已灭 · 小怪强化 +10% · 金币 +${bonusGold}`);
}
function eliteDefOf(id) {
  for (const d of ELITE_TYPES) if (d.id === id) return d;
  return ELITE_TYPES[0];
}
/* 推进一个冷却计时。必须用 undefined 判断, 不能写 (x || 默认值):
   因为 0 || 默认值 === 默认值, 会让归零后的冷却被重置, 永远触发不了。 */
function cdTick(obj, key, dt) {
  if (typeof obj[key] !== 'number') obj[key] = 0;
  obj[key] -= dt;
  return obj[key];
}
function getHpScale() { const m = G.time / 60; return 1 + m * 0.62 + m * m * 0.052; }
function updateSpawn(dt) {
  G.spawnTimer -= dt;
  if (G.spawnTimer > 0) return;
  const m = G.time / 60;
  G.spawnTimer = Math.max(0.075, 0.55 - m * 0.026);
  let count = 1 + Math.floor(m * 0.28);
  if (G.diffCount > 0) count += Math.floor(G.diffCount * 0.6);
  count = Math.min(count, 7);
  for (let i = 0; i < count; i++) { if (enemies.length >= 320) break; spawnOne(); }
}
function spawnOne() {
  const avail = [['normal', 10]];
  if (G.unlocked.includes('fast'))   avail.push(['fast', 7]);
  if (G.unlocked.includes('swarm'))  avail.push(['swarm', 8]);
  if (G.unlocked.includes('ranged')) avail.push(['ranged', 5]);
  if (G.unlocked.includes('tank'))   avail.push(['tank', 3]);
  if (G.unlocked.includes('bomber')) avail.push(['bomber', 4]);
  let total = 0;
  for (const a of avail) total += a[1];
  let r = Math.random() * total, type = 'normal';
  for (const a of avail) { r -= a[1]; if (r <= 0) { type = a[0]; break; } }
  const t = ENEMY_TYPES[type];
  const a = Math.random() * TAU;
  const d = Math.max(W, H) * 0.58 + rnd(40, 180);
  const hpScale = getHpScale() * G.hpMult;
  const hp = t.hp * hpScale;
  const m = G.time / 60;
  enemies.push({ type, x:P.x+Math.cos(a)*d, y:P.y+Math.sin(a)*d, vx:0, vy:0, r:t.r, size:t.size, hp, maxHp:hp,
    speed:t.speed * (1 + Math.min(m * 0.02, 0.5)), dmg:t.dmg * (1 + m * 0.045),
    exp:t.exp, sprite:t.sprite, elite:false, dead:false, atkCd:rnd(0, 0.6), flash:0, acid:0, burn:0,
    ranged:t.ranged, range:t.range, shootCd:t.shootCd, explode:t.explode, wob:Math.random()*TAU });
}
function updatePlayer(dt) {
  let mx = 0, my = 0;
  if (input.keys.has('a') || input.keys.has('arrowleft'))  mx -= 1;
  if (input.keys.has('d') || input.keys.has('arrowright')) mx += 1;
  if (input.keys.has('w') || input.keys.has('arrowup'))    my -= 1;
  if (input.keys.has('s') || input.keys.has('arrowdown'))  my += 1;
  if (input.joy.active) { const jx = input.joy.dx / 62, jy = input.joy.dy / 62; if (Math.hypot(jx, jy) > 0.08) { mx = jx; my = jy; } }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  P.moving = len > 0.1;
  if (P.moving) P.stillTime = 0; else P.stillTime += dt;
  const spd = P.speed * (P.wingT > 0 ? 1.9 : 1);   // 风之翼加速
  P.x += mx * spd * dt; P.y += my * spd * dt;
  if (P.invuln > 0) P.invuln -= dt;
  if (P.hurtFlash > 0) P.hurtFlash -= dt;
  if (P.slowT > 0) P.slowT -= dt;                   // 冰弹减速剩余时间
  recalcStats();
  if (P.regen > 0) P.hp = Math.min(P.maxHp, P.hp + P.regen * dt);
  if (P.bootsT <= 0) for (const e of enemies) {   // 踏空靴生效时不与怪物碰撞
    if (e.dead) continue;
    const dx = e.x - P.x, dy = e.y - P.y, rr = e.r + P.r;
    if (dx * dx + dy * dy < rr * rr) {
      if (e.atkCd <= 0) { e.atkCd = 0.85; damagePlayer(e.dmg); }
      const d = Math.hypot(dx, dy) || 1;
      e.x += dx / d * 3; e.y += dy / d * 3;
    }
  }
}
function damagePlayer(dmg) {
  if (P.invuln > 0) return;
  // 调试无敌(控制台 dbgGod / dbgNoDamage 打开时)
  if (P._god || P._noDamage) return;
  P.hp -= Math.max(1, dmg * (1 - P.dmgReduce));
  P.invuln = 0.42; P.hurtFlash = 0.22;
  G.shake = Math.max(G.shake, 5); sfx('hurt');
  if (P.hp <= 0) { P.hp = 0; gameOver(); }
}
function updateSkills(dt) {
  for (const s of P.skills) {
    const def = SKILLS[s.id];
    if (!def || def.passive) continue;
    s.cd -= dt;
    if (s.cd <= 0) { s.cd = def.cd(s) * (1 - P.cdr); def.fire(s); sfx('shoot'); }
  }
}
function updatePets(dt) {
  if (!P.pets || P.pets.length === 0) return;
  for (let i = 0; i < P.pets.length; i++) {
    const pet = P.pets[i];
    const def = PETS[pet.id];
    if (!def) continue;
    const baseA = G.time * 1.3 + i * Math.PI;
    const tx = P.x + Math.cos(baseA) * 48, ty = P.y + Math.sin(baseA) * 48;
    const k = Math.min(1, dt * 7);
    pet.x += (tx - pet.x) * k; pet.y += (ty - pet.y) * k;
    const newLv = clamp(Math.ceil(P.level / 2), 1, 20);
    if (newLv > pet.lv) pet.lv = newLv;
    if (pet.lv >= 11 && !pet.mut) { pet.mut = true; effects.push({ kind:'ring', x:pet.x, y:pet.y, life:0.6, max:0.6, r:120, col:'#ffb347' }); toast(`✨ 宠物 ${def.name} 变异觉醒！`); sfx('mut'); }
    if (def.update) def.update(pet, dt);
    if (def.cd && !def.passive) { pet.cd -= dt; if (pet.cd <= 0) { pet.cd = def.cd(pet.lv) * (1 - P.cdr); def.fire(pet); } }
  }
}
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    switch (b.kind) {
      case 'homing': {
        const t = b.target && !b.target.dead ? b.target : nearestEnemy(b.x, b.y);
        b.target = t;
        if (t) { const a = Math.atan2(t.y - b.y, t.x - b.x), cur = Math.atan2(b.vy, b.vx); let diff = a - cur; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU; const na = cur + clamp(diff, -b.turn * dt, b.turn * dt); const sp = Math.hypot(b.vx, b.vy); b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp; }
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.rot = Math.atan2(b.vy, b.vx);
        for (const e of enemies) {
          if (e.dead) continue;
          const dx = e.x - b.x, dy = e.y - b.y, rr = e.r + b.r;
          if (dx * dx + dy * dy < rr * rr) {
            const crit = Math.random() < P.crit;
            hurtEnemy(e, crit ? b.dmg * 2 : b.dmg, crit);
            b.hits++;
            if (b.mut === 'split') for (let k = 0; k < 3; k++) { const a2 = Math.random() * TAU; bullets.push({ kind:'homing', x:b.x, y:b.y, vx:Math.cos(a2)*340, vy:Math.sin(a2)*340, r:4.5, size:14, dmg:b.dmg*0.5, life:1.6, sprite:'🔵', mut:null, hits:0, maxHits:1, turn:7, isSplit:true }); }
            if (b.hits >= b.maxHits) b.life = -1;
            break;
          }
        }
        break;
      }
      case 'rocket': {
        b.x += b.vx * dt; b.y += b.vy * dt; b.rot = Math.atan2(b.vy, b.vx);
        let hit = false;
        for (const e of enemies) { if (e.dead) continue; const dx = e.x - b.x, dy = e.y - b.y, rr = e.r + b.r; if (dx * dx + dy * dy < rr * rr) { hit = true; break; } }
        if (hit || b.life <= 0) { explodeRocket(b); b.life = -1; }
        break;
      }
      case 'bomb': {
        if (b.life <= 0 || b.mut === 'mine') { if (!b.exploded) { b.exploded = true; explodeBomb(b); b.life = -1; } }
        break;
      }
      case 'sword': {
        b.x += b.vx * dt; b.y += b.vy * dt;
        for (const e of enemies) {
          if (e.dead || b.hitIds.includes(e)) continue;
          const dx = e.x - b.x, dy = e.y - b.y, rr = e.r + b.r;
          if (dx * dx + dy * dy < rr * rr) {
            b.hitIds.push(e);
            const crit = Math.random() < P.crit;
            hurtEnemy(e, crit ? b.dmg * 2 : b.dmg, crit);
            if (b.mut === 'array') effects.push({ kind:'swordArray', x:b.x, y:b.y, life:2.0, max:2.0, r:46, dps:b.dmg * 1.6, tick:0, rot:0 });
            if (b.hitIds.length >= b.pierce) { b.life = -1; break; }
          }
        }
        break;
      }
      case 'boom': {
        if (b.mut === 'eternal') {
          b.orbitA = (b.orbitA || b.startA) + b.orbitSpd * dt;
          b.x = P.x + Math.cos(b.orbitA) * b.orbitR; b.y = P.y + Math.sin(b.orbitA) * b.orbitR;
          b.rot += dt * 14;
          if (!b.hitIds) b.hitIds = [];
          b.tickCd = (b.tickCd || 0) - dt;
          if (b.tickCd <= 0) { b.tickCd = 0.28; b.hitIds = []; }
          for (const e of enemies) { if (e.dead || b.hitIds.includes(e)) continue; const dx = e.x - b.x, dy = e.y - b.y, rr = e.r + b.r; if (dx * dx + dy * dy < rr * rr) { b.hitIds.push(e); hurtEnemy(e, b.dmg); } }
        } else {
          b.phase += dt;
          if (b.phase < 0.45) { const sp = 340; b.x += Math.cos(b.startA) * sp * dt; b.y += Math.sin(b.startA) * sp * dt; }
          else { const a = Math.atan2(P.y - b.y, P.x - b.x), sp = 460; b.x += Math.cos(a) * sp * dt; b.y += Math.sin(a) * sp * dt; if (Math.hypot(P.x - b.x, P.y - b.y) < 20) b.life = -1; }
          b.rot += dt * 16;
          if (!b.hitIds) b.hitIds = [];
          b.tickCd = (b.tickCd || 0) - dt;
          if (b.tickCd <= 0) { b.tickCd = 0.22; b.hitIds = []; }
          for (const e of enemies) { if (e.dead || b.hitIds.includes(e)) continue; const dx = e.x - b.x, dy = e.y - b.y, rr = e.r + b.r; if (dx * dx + dy * dy < rr * rr) { b.hitIds.push(e); hurtEnemy(e, b.dmg); } }
        }
        break;
      }
      case 'tal': {
        b.x += b.vx * dt; b.y += b.vy * dt; b.rot += dt * 6;
        for (const e of enemies) {
          if (e.dead) continue;
          const dx = e.x - b.x, dy = e.y - b.y, rr = e.r + b.r;
          if (dx * dx + dy * dy < rr * rr) {
            const crit = Math.random() < P.crit;
            hurtEnemy(e, crit ? b.dmg * 2 : b.dmg, crit);
            if (b.mut === 'explode') { effects.push({ kind:'boom', x:b.x, y:b.y, life:0.3, max:0.3, r:72, col:'#c99cff' }); aoeDamage(b.x, b.y, 72, b.dmg * 0.7, e); }
            b.life = -1; break;
          }
        }
        break;
      }
    }
    if (b.life <= 0) bullets.splice(i, 1);
  }
}
function explodeRocket(b) {
  effects.push({ kind:'boom', x:b.x, y:b.y, life:0.3, max:0.3, r:b.rad, col:'#ff8a4c' });
  aoeDamage(b.x, b.y, b.rad, b.dmg);
  G.shake = Math.max(G.shake, 4);
  if (b.bounces > 0) { const t = nearestEnemy(b.x, b.y); if (t) { const a = Math.atan2(t.y - b.y, t.x - b.x); bullets.push({ kind:'rocket', x:b.x, y:b.y, vx:Math.cos(a)*340, vy:Math.sin(a)*340, r:8, size:22, dmg:b.dmg*0.8, rad:b.rad, life:1.2, sprite:'🚀', mut:null, bounces:b.bounces-1, rot:a }); } }
}
function explodeBomb(b) {
  effects.push({ kind:'boom', x:b.x, y:b.y, life:0.32, max:0.32, r:b.rad, col:'#ff5f6d' });
  aoeDamage(b.x, b.y, b.rad, b.dmg);
  G.shake = Math.max(G.shake, 3);
  if (b.mut === 'chain') { for (const o of bullets) { if (o === b || o.kind !== 'bomb' || o.exploded) continue; if (Math.hypot(o.x - b.x, o.y - b.y) < b.rad) { o.exploded = true; o.life = -1; setTimeout(() => { if (G.state === 'playing') { effects.push({ kind:'boom', x:o.x, y:o.y, life:0.32, max:0.32, r:o.rad, col:'#ff9f43' }); aoeDamage(o.x, o.y, o.rad, o.dmg); } }, 60); } } }
}
function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    if (e.flash > 0) e.flash -= dt;
    if (e.acid > 0) e.acid -= dt;
    if (e.burn > 0) e.burn -= dt * 0.5;
    if (e.poison > 0) {
      // 中毒: 每 0.5 秒结算一次持续伤害, 并逐秒衰减
      e.poison -= dt * 0.5;
      e.poisonTick = (e.poisonTick || 0) - dt;
      if (e.poisonTick <= 0) {
        e.poisonTick = 0.5;
        const pd = Math.max(1, Math.round(e.poison * 3));
        e.hp -= pd; e.flash = 0.06;
        if (texts.length < 30) texts.push({ x: e.x + rnd(-6, 6), y: e.y - e.r - 4, v: -40, life: 0.5, max: 0.5, t: String(pd), crit: false });
        if (e.hp <= 0) { e.poison = 0; killEnemy(e); }
      }
    }
    if (e.atkCd > 0) e.atkCd -= dt;
    const dx = P.x - e.x, dy = P.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (e.ranged) {
      const want = e.range * 0.75;
      let move = 0;
      if (dist > want) move = 1;
      else if (dist < want * 0.6) move = -1;
      e.x += (dx / dist) * e.speed * move * dt;
      e.y += (dy / dist) * e.speed * move * dt;
      e.shootCd -= dt;
      if (e.shootCd <= 0 && dist < e.range * 1.4) { e.shootCd = ENEMY_TYPES.ranged.shootCd; const a = Math.atan2(dy, dx); eBullets.push({ x:e.x, y:e.y, vx:Math.cos(a)*220, vy:Math.sin(a)*220, r:8, dmg:e.dmg, life:3.5, sprite:'🔴' }); }
    } else if (e.elite) {
      const moveA = Math.atan2(dy, dx);
      let sp = e.speed;
      if (dist > 1500) sp = e.speed * 4;
      else if (dist > 800) sp = e.speed * 2.5;
      else if (dist > 400) sp = e.speed * 1.5;
      e.x += Math.cos(moveA) * sp * dt; e.y += Math.sin(moveA) * sp * dt;
      if (cdTick(e, 'chargeCd', dt) <= 0 && dist < 420) {
        e.chargeCd = 4.5; e.chargeT = 0.55;
        effects.push({ kind:'ring', x:e.x, y:e.y, life:0.4, max:0.4, r:110, col:'#ff5f6d' });
      }
      if (e.chargeT > 0) {
        e.chargeT -= dt;
        e.x += (dx / dist) * e.speed * 4.5 * dt; e.y += (dy / dist) * e.speed * 4.5 * dt;
        // 冲锋期间持续刷新无敌帧, 避免一次冲锋被反复结算伤害
        if (P.invuln < 0.12) P.invuln = 0.12;
      }
      if (typeof updateEliteTraits === 'function') updateEliteTraits(e, dt, dx, dy, dist);
    } else {
      e.wob += dt * 2.4;
      const moveA = Math.atan2(dy, dx) + Math.sin(e.wob) * 0.25;
      e.x += Math.cos(moveA) * e.speed * dt;
      e.y += Math.sin(moveA) * e.speed * dt;
    }
    if (dist > 2000) { e.x = P.x + (dx / dist) * 1200; e.y = P.y + (dy / dist) * 1200; }
  }
}
function updateEBullets(dt) {
  for (let i = eBullets.length - 1; i >= 0; i--) {
    const b = eBullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    const dx = P.x - b.x, dy = P.y - b.y;
    if (dx * dx + dy * dy < (P.r + b.r) ** 2) {
      damagePlayer(b.dmg);
      if (b.chill) {
        P.slowT = Math.max(P.slowT || 0, 2.5);
        effects.push({ kind:'ring', x:P.x, y:P.y, life:0.4, max:0.4, r:44, col:'#8ad4ff' });
      }
      eBullets.splice(i, 1); continue;
    }
    if (b.life <= 0) eBullets.splice(i, 1);
  }
}
function updateOrbs(dt) {
  const pr = P.pickupRange;
  const magnet = getSkill('pickup');
  const globalPull = magnet && magnet.mut === 'attract';
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    o.life -= dt;
    if (o.life <= 0) { orbs.splice(i, 1); continue; }
    const dx = P.x - o.x, dy = P.y - o.y, d = Math.hypot(dx, dy) || 1;
    if (o.pulling || d < pr || globalPull) { o.pulling = true; const sp = clamp(1400 - d * 1.5, 500, 1400); o.x += (dx / d) * sp * dt; o.y += (dy / d) * sp * dt; }
    else { o.x += o.vx * dt; o.y += o.vy * dt; o.vx *= 0.92; o.vy *= 0.92; }
    o.spin += dt * 4;
    if (d < P.r + 14) {
      let v = o.v * P.expMult;
      const eg = getSkill('expgain');
      if (eg && eg.mut === 'insight' && Math.random() < 0.25) v *= 2;
      gainExp(v);
      const pk = getSkill('pickup');
      if (pk && pk.mut === 'harvest' && Math.random() < 0.20) orbs.push({ x:o.x+rnd(-20,20), y:o.y+rnd(-20,20), vx:rnd(-60,60), vy:rnd(-60,60), v:o.v, r:5, life:20, pulling:false, spin:0 });
      orbs.splice(i, 1);
    }
  }
}
function gainExp(amount) {
  P.exp += amount;
  while (P.exp >= P.expNext) {
    P.exp -= P.expNext; P.level++; P.expNext = expForLevel(P.level);
    G.pendingLvUps++; sfx('levelup');
    if (P.level >= G.nextEliteLv && !G.eliteAlive) { G.nextEliteLv += 10; spawnElite(); }
  }
  if (G.pendingLvUps > 0 && G.state === 'playing' && !(G.bh && G.bh.banner)) showLevelUp();
  updateHUD();
}
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const f = effects[i];
    f.life -= dt;
    if (f.kind === 'rain') {
      f.tick -= dt;
      if (f.tick <= 0) { f.tick = 0.25; aoeDamage(f.x, f.y, f.r, f.dps * 0.25); for (const e of enemies) { if (e.dead) continue; const dx = e.x - f.x, dy = e.y - f.y; if (dx * dx + dy * dy < f.r * f.r && f.mut === 'acid') e.acid = 0.6; } }
      if (f.mut === 'hunt') { const t = nearestEnemy(f.x, f.y); if (t) { const a = Math.atan2(t.y - f.y, t.x - f.x); f.x += Math.cos(a) * 90 * dt; f.y += Math.sin(a) * 90 * dt; } }
    }
    if (f.kind === 'swordArray') { f.tick -= dt; f.rot += dt * 8; if (f.tick <= 0) { f.tick = 0.22; aoeDamage(f.x, f.y, f.r, f.dps * 0.22); } }
    if (f.kind === 'firewall') { f.tick -= dt; if (f.tick <= 0) { f.tick = 0.25; aoeDamage(f.x, f.y, f.r, f.dps * 0.25); } }
    if (f.life <= 0) effects.splice(i, 1);
  }
  if (effects.length > 150) effects.splice(0, effects.length - 150);
  for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life -= dt; t.y += t.v * dt; t.v *= 0.94; if (t.life <= 0) texts.splice(i, 1); }
  for (let i = portals.length - 1; i >= 0; i--) {
    const p = portals[i];
    p.life -= dt; p.spin += dt;
    if (p.life <= 0) { portals.splice(i, 1); continue; }
    const d = Math.hypot(P.x - p.x, P.y - p.y);
    if (d < 46 + P.r) { portals.splice(i, 1); openShop(); return; }
  }
}
function updatePortals(dt) {
  G.shopTimer -= dt;
  if (G.shopTimer <= 0 && portals.length < 2) { G.shopTimer = rnd(38, 52); const a = Math.random() * TAU, d = rnd(500, 950); portals.push({ x:P.x + Math.cos(a) * d, y:P.y + Math.sin(a) * d, life:40, spin:0, r:34 }); toast('💰 传送商店已出现'); }
}
function update(dt) {
  if (P && (!isFinite(P.x) || !isFinite(P.y))) { P.x = 0; P.y = 0; }
  if (isNaN(G.time)) G.time = 0;
  G.time += dt;
  if (G.mode === 'challenge' && G.time >= G.challengeEnd) { challengeWin(); return; }
  updatePlayer(dt); updatePets(dt); updateSkills(dt); updateEnemies(dt);
  updateSpecials(dt);   // 特殊能力冷却(黑洞小镇的奖励)
  questTick(dt);        // 推进 NPC 战斗任务进度
  updateBullets(dt); updateEBullets(dt); updateOrbs(dt); updateSpawn(dt);
  updateEffects(dt); updatePortals(dt);
  updateBlackHole(dt);  // 黑洞随机事件: 生成与吸入
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 42);
  updateHUD();
}
