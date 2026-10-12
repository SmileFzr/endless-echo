/* ============================================================
   控制台调试指令 / debug commands
   无尽回响 Endless Echo
   ============================================================
   按 F12 打开控制台, 输入 dbgHelp() 查看全部指令。

   本文件由 tools/split.py 原样收录进产物(和 blackhole.js 一样属于手写模块),
   因此在 index.html 里必须排在 blackhole.js 之后加载 —— 它用到的
   PETS / ENEMY_TYPES / SKILLS 等都在前面的脚本里定义。
   ============================================================ */

/* ============================================================
   调试辅助(仅供试玩时在浏览器控制台使用, 不影响正常玩法)
   按 F12 打开控制台, 输入 dbgHelp() 查看全部指令
   ============================================================ */

/* ---- 内容解锁 ---- */
function dbgAllPets() {            // 解锁全部 12 只生肖宠物
  ensureSaveSlots();
  SAVE.pets = Object.keys(PETS).slice();
  SAVE.gold = Math.max(SAVE.gold, 9999);
  writeSave();
  if (G.state === 'petHome') renderPetHome();
  return '已解锁全部 ' + SAVE.pets.length + ' 只宠物, 金币 9999';
}

function dbgPets(list) {          // 直接带指定宠物出战, 例如 dbgPets('dragon','horse')
  const ids = [].concat(list && list.length ? list : ['dragon', 'horse']);
  if (!P) return '先开始一局';
  P.pets = ids.filter(id => PETS[id]).map((id, i) => ({
    id, lv: 1, mut: false, cd: rnd(0.2, 0.8),
    x: P.x + Math.cos(i * Math.PI) * 48, y: P.y + Math.sin(i * Math.PI) * 48,
    steal: 0, breathT: 0, breathTick: 0, breathAngle: 0,
  }));
  backfillSeenPets();
  return '出战宠物: ' + P.pets.map(p => PETS[p.id].emoji + PETS[p.id].name).join(' ');
}

function dbgPetLv(n) {            // 设置所有出战宠物的等级(>=11 自动变异)
  if (!P || !P.pets.length) return '先用 dbgPets() 带上宠物';
  const lv = n || 11;
  for (const p of P.pets) { p.lv = lv; if (lv >= 11) p.mut = true; }
  syncSpecialBars();
  return '宠物等级设为 ' + lv + (lv >= 11 ? '(已变异)' : '');
}

function dbgAllSkills() {         // 拿满 6 个技能并全部升到 10 级
  if (!P) return '先开始一局';
  const ids = Object.keys(SKILLS);
  P.skills = [];
  for (let i = 0; i < Math.min(6, ids.length); i++) P.skills.push({ id: ids[i], lv: 10, mut: null, cd: 0 });
  _lastSkillSig = '';
  recalcStats(); updateHUD();
  return '已装备 6 个技能(各 10 级): ' + P.skills.map(s => SKILLS[s.id].icon).join(' ');
}

function dbgAllSpecials() {       // 解锁并重置全部特殊能力(含被动)
  ensureSaveSlots();
  for (const id of Object.keys(SPECIALS)) SAVE.specials[id] = true;
  if (P) { P.specials = {}; for (const id of Object.keys(SPECIALS)) P.specials[id] = { cd: 0 }; }
  writeSave(); syncSpecialBars();
  return '已解锁全部 ' + Object.keys(SPECIALS).length + ' 个特殊能力';
}

function dbgCodexAll() {          // 图鉴全部点亮
  ensureSaveSlots();
  // 图鉴只收怪物: 普通怪 + 全部精英类型; 宠物另有"宠物蛋"图鉴, 这里一并点亮备用
  SAVE.seenEnemies = Object.keys(ENEMY_TYPES).filter(k => !ENEMY_TYPES[k].elite)
    .concat(ELITE_TYPES.map(d => d.id));
  SAVE.seenPets = Object.keys(PETS).slice();
  writeSave();
  if (G.state === 'codex') renderCodex();
  return '图鉴已全部点亮 (' + SAVE.seenEnemies.length + ' 怪 / ' + SAVE.seenPets.length + ' 宠物)';
}

/* ---- 数值与进度 ---- */
function dbgGold(n) {             // 给自己金币, 默认 5000, 例如 dbgGold(20000)
  if (!P) return '先开始一局';
  const v = n || 5000;
  G.runGold += v; SAVE.gold += v; writeSave(); updateHUD();
  return '局内金币 ' + G.runGold + ' / 存档金币 ' + SAVE.gold;
}

function dbgLv(n) {               // 直接升到 n 级(触发升级三选一)
  if (!P) return '先开始一局';
  const target = n || 20;
  let guard = 0;
  while (P.level < target && guard++ < 500) { P.exp = P.expNext; gainExp(0); }
  updateHUD();
  return '当前等级 ' + P.level + ' (待选升级 ' + G.pendingLvUps + ' 次)';
}

function dbgLevelUp(n) {          // 立刻弹 n 次升级三选一
  if (!P) return '先开始一局';
  G.pendingLvUps += (n || 1);
  if (G.state === 'playing') showLevelUp();
  return '待选升级 ' + G.pendingLvUps + ' 次';
}

function dbgGod(on) {             // 无敌/秒杀开关, 不传参数则切换
  if (!P) return '先开始一局';
  P._god = (on === undefined) ? !P._god : !!on;
  // 不直接改 P.dmgMult / P.dmgReduce —— 它们每次 recalcStats() 都会被重算覆盖。
  // 改为在 damagePlayer() / hurtEnemy() 里判断 _god 标记, 这样也不会破坏你的成长数值。
  return '无敌模式: ' + (P._god ? '开 (完全不掉血 + 一击必杀)' : '关 (恢复正常)');
}

function dbgNoDamage(on) {        // 只免伤, 不秒杀(想正常打怪又不想死时用)
  if (!P) return '先开始一局';
  P._noDamage = (on === undefined) ? !P._noDamage : !!on;
  return '免伤(不秒杀): ' + (P._noDamage ? '开 —— 你不会掉血, 但怪也要正常打' : '关');
}

function dbgHeal() { if (!P) return '先开始一局'; P.hp = P.maxHp; P.invuln = 3; return '已回满血 + 3 秒无敌'; }

function dbgSpawn(type, n) {      // 刷怪: dbgSpawn('tank',5) / dbgSpawn('elite') / dbgSpawn('elite:rex')
  if (!P) return '先开始一局';
  const t = type || 'normal';

  // 精英: 可指定类型, 例如 dbgSpawn('elite:rex') 或 dbgSpawn('elite:僵尸')
  if (t === 'elite' || t.indexOf('elite:') === 0) {
    const want = t.indexOf('elite:') === 0 ? t.slice(6) : null;
    let wantDef = null;
    if (want) {
      wantDef = ELITE_TYPES.find(d => d.id === want || d.name === want);
      if (!wantDef) {
        return '未知精英: ' + want + '\n可用: ' + ELITE_TYPES.map(d => d.id + '(' + d.name + ')').join(', ');
      }
    }
    // 不指定类型时随机; 指定了就一直抽到该类型为止
    for (let i = 0; i < (wantDef ? 400 : 1); i++) {
      // 抽错的会被 pop 丢掉, 但 spawnElite() 已经把它们记进图鉴了 —— 先备份再还原
      const seenBefore = SAVE.seenEnemies ? SAVE.seenEnemies.slice() : null;
      spawnElite();
      const e = enemies[enemies.length - 1];
      if (!wantDef || e.eliteDef === wantDef.id) {
        return '已刷新 ' + e.sprite + e.name + ' (血 ' + Math.round(e.maxHp) +
               ' / 速 ' + Math.round(e.speed) + ' / 机制 ' + (e.eliteTrait || '冲撞') + ')';
      }
      enemies.pop();                              // 抽错了丢回去重抽
      if (seenBefore) SAVE.seenEnemies = seenBefore;   // 顺便把它从图鉴记录里撤掉
    }
    return '没能刷出指定的精英: ' + want;
  }

  if (!ENEMY_TYPES[t]) {
    return '未知怪物类型: ' + t + '\n可用: ' + Object.keys(ENEMY_TYPES).join(', ') +
           '\n精英: elite 或 elite:<' + ELITE_TYPES.map(d => d.id).join('|') + '>';
  }
  const cnt = n || 1;
  const def = ENEMY_TYPES[t];
  const hpScale = getHpScale() * G.hpMult;
  const m = G.time / 60;
  // 精确生成指定类型(不走 spawnOne 的权重随机, 调试时才能确定拿到什么)
  for (let i = 0; i < cnt; i++) {
    const a = Math.random() * TAU;
    const d = Math.max(W, H) * 0.35 + rnd(40, 160);   // 比正常刷怪近一些, 方便立刻看到
    enemies.push({
      type: t, x: P.x + Math.cos(a) * d, y: P.y + Math.sin(a) * d, vx: 0, vy: 0,
      r: def.r, size: def.size, hp: def.hp * hpScale, maxHp: def.hp * hpScale,
      speed: def.speed * (1 + Math.min(m * 0.02, 0.5)), dmg: def.dmg * (1 + m * 0.045),
      exp: def.exp, sprite: def.sprite, elite: false, dead: false, atkCd: rnd(0, 0.6),
      flash: 0, acid: 0, burn: 0, ranged: def.ranged, range: def.range,
      shootCd: def.shootCd, explode: def.explode, wob: Math.random() * TAU,
    });
  }
  const same = enemies.filter(e => e.type === t && !e.dead).length;
  return '已刷 ' + cnt + ' 只 ' + t + ' (该类目前共 ' + same + ' 只)';
}

function dbgClearFoes() {         // 清空场上所有怪物, 返回清掉的数量
  let n = 0;
  for (const e of enemies) { if (!e.dead) n++; e.dead = true; }
  return n;
}

function dbgKills(n) {            // 直接累加击杀数(推进 NPC 任务用)
  if (!P) return '先开始一局';
  const v = n || 30;
  G.kills += v;
  return '击杀数 +' + v + ' → ' + G.kills + ' (任务进度会在下一帧更新)';
}

/* ---- 场景跳转 ---- */
function dbgShop() {              // 立刻打开传送商店
  if (!P) return '先开始一局';
  openShop(); return '已打开传送商店 (金币 ' + G.runGold + ')';
}

function dbgHatch() {             // 直接孵化一只还没解锁的宠物
  ensureSaveSlots();
  const locked = Object.keys(PETS).filter(id => SAVE.pets.indexOf(id) < 0);
  if (!locked.length) return '12 只已经全部解锁了';
  const id = locked[(Math.random() * locked.length) | 0];
  SAVE.pets.push(id); writeSave();
  showHatchAnimation(id);
  return '孵化出: ' + PETS[id].emoji + PETS[id].name + ' (' + PETS[id].skill + ')';
}

function dbgKillElite() {         // 秒掉场上的精英怪(测圆环血条/掉落)
  const e = enemies.find(x => x.elite && !x.dead);
  if (!e) { spawnElite(); return '场上没有精英, 已替你刷一只';
  }
  hurtEnemy(e, 1e9);
  return '已击杀精英怪';
}

function dbgHelp() {              // 列出全部调试指令
  const rows = [
    ['内容解锁', ''],
    ['dbgAllPets()', '解锁全部 12 只生肖宠物'],
    ['dbgHatch()', '直接孵化一只未解锁的宠物(看动画)'],
    ['dbgAllSkills()', '拿满 6 个技能并全部升到 10 级'],
    ['dbgAllSpecials()', '解锁全部特殊能力(含被动)'],
    ['dbgCodexAll()', '图鉴全部点亮'],
    ['', ''],
    ['数值与进度', ''],
    ['dbgGold(n)', '给自己 n 金币(默认 5000)'],
    ['dbgLv(n)', '直接升到 n 级(默认 20)'],
    ['dbgLevelUp(n)', '立刻弹 n 次升级三选一'],
    ['dbgGod(on)', '★ 无敌+秒杀: 完全不掉血, 一击必杀'],
    ['dbgNoDamage(on)', '★ 只免伤不秒杀: 你不掉血, 但怪要正常打'],
    ['dbgHeal()', '回满血 + 3 秒无敌'],
    ['dbgKills(n)', '击杀数 +n(推进 NPC 委托)'],
    ['', ''],
    ['宠物与怪物', ''],
    ["dbgPets('dragon','horse')", '指定宠物出战'],
    ['dbgPetLv(n)', '出战宠物设为 n 级(>=11 变异)'],
    ["dbgSpawn('tank',5)", '在附近刷 5 只坦克; dbgSpawn(\'elite\') 刷精英'],
    ['dbgKillElite()', '秒掉场上精英怪(测圆环血条)'],
    ['dbgClearFoes()', '清空场上所有怪物'],
    ['', ''],
    ['场景跳转', ''],
    ['dbgBH()', '召唤黑洞'],
    ['dbgGoto()', '传送到黑洞并进入小镇'],
    ['dbgTown()', '直接进入回声小镇'],
    ['dbgShop()', '立刻打开传送商店'],
    ['dbgSeen()', '查看图鉴当前已遇到的条目'],
  ];
  console.log('%c=== 无尽回响 调试指令 ===', 'font-weight:bold;color:#7c3aed');
  for (const [cmd, desc] of rows) {
    if (!cmd) { console.log(''); continue; }
    if (!desc) { console.log('%c' + cmd, 'font-weight:bold;color:#ffd76a'); continue; }
    console.log('  %c' + cmd.padEnd(26) + '%c' + desc, 'color:#8ab4ff', 'color:#999');
  }
  console.log('');
  return '共 ' + rows.filter(r => r[0] && r[1]).length + ' 条指令';
}

/* 查看图鉴当前已遇到的条目 */
function dbgSeen() {
  ensureSaveSlots();
  return { 怪物: seenList('enemy'), 宠物: seenList('pet') };
}

/* 把全部调试入口挂到 window, 方便控制台调用(完整列表见 dbgHelp()) */
if (typeof window !== 'undefined') {
  // 内容解锁
  window.dbgAllPets = dbgAllPets;
  window.dbgHatch = dbgHatch;
  window.dbgAllSkills = dbgAllSkills;
  window.dbgAllSpecials = dbgAllSpecials;
  window.dbgCodexAll = dbgCodexAll;
  // 数值与进度
  window.dbgGold = dbgGold;
  window.dbgLv = dbgLv;
  window.dbgLevelUp = dbgLevelUp;
  window.dbgGod = dbgGod;
  window.dbgNoDamage = dbgNoDamage;
  window.dbgHeal = dbgHeal;
  window.dbgKills = dbgKills;
  // 宠物与怪物
  window.dbgPets = dbgPets;
  window.dbgPetLv = dbgPetLv;
  window.dbgSpawn = dbgSpawn;
  window.dbgKillElite = dbgKillElite;
  window.dbgClearFoes = dbgClearFoes;
  // 场景跳转(这几个定义在 blackhole.js)
  window.dbgBH = debugSpawnBlackHole;
  window.dbgGoto = debugGotoBlackHole;
  window.dbgTown = () => { if (P) enterTown(); return '已进入回声小镇'; };
  window.dbgShop = dbgShop;
  window.dbgSeen = dbgSeen;
  window.dbgHelp = dbgHelp;
  // 兼容旧名字
  window.dbgSpecials = dbgAllSpecials;
  window.dbgCodex = dbgCodexAll;
}
