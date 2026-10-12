/* ============================================================
   界面交互与主循环 / UI & main loop
   无尽回响 Endless Echo
   ============================================================ */

const el = id => document.getElementById(id);
const elLv = el('lvTxt'), elExp = el('expTxt'), elFill = el('expFill');
const elHpFill = el('hpFill'), elHpTxt = el('hpTxt');
const elTime = el('timeTxt'), elKill = el('killTxt'), elGold = el('goldTxt');
const elSkillbar = el('skillbar'), elPetbar = el('petbar');
let _lastSkillSig = '', _lastPetSig = '';
function updateHUD() {
  if (!P) return;
  elLv.textContent = 'Lv.' + P.level;
  elExp.textContent = Math.floor(P.exp) + ' / ' + P.expNext;
  elFill.style.width = clamp(P.exp / P.expNext * 100, 0, 100) + '%';
  const hpPct = clamp(P.hp / P.maxHp, 0, 1);
  elHpFill.style.width = (hpPct * 100) + '%';
  elHpFill.style.background = hpPct > 0.5 ? 'linear-gradient(90deg,#4ade80,#22c55e)' : hpPct > 0.25 ? 'linear-gradient(90deg,#fbbf24,#f59e0b)' : 'linear-gradient(90deg,#ef4444,#dc2626)';
  elHpTxt.textContent = Math.ceil(P.hp) + ' / ' + Math.round(P.maxHp);
  elTime.textContent = fmtTime(G.time);
  elKill.textContent = G.kills;
  elGold.textContent = G.runGold;
  const sig = P.skills.map(s => s.id + s.lv + (s.mut || '')).join(',');
  if (sig !== _lastSkillSig) {
    _lastSkillSig = sig;
    elSkillbar.innerHTML = '';
    for (const s of P.skills) {
      const def = SKILLS[s.id];
      const d = document.createElement('div');
      d.className = 'sk' + (s.mut ? ' mut' : '');
      d.innerHTML = `${def.icon}<span class="lvb">${s.lv}</span>` + (s.mut ? `<span class="mt">变</span>` : '');
      elSkillbar.appendChild(d);
    }
  }
  const psig = (P.pets || []).map(p => p.id + p.lv + (p.mut ? 'm' : '')).join(',');
  if (psig !== _lastPetSig) {
    _lastPetSig = psig;
    elPetbar.innerHTML = '';
    for (const pet of (P.pets || [])) {
      const def = PETS[pet.id];
      if (!def) continue;
      const d = document.createElement('div');
      d.className = 'petslot' + (pet.mut ? ' mut' : '');
      d.innerHTML = `${def.emoji}<span class="plv">${pet.lv}</span>`;
      elPetbar.appendChild(d);
    }
  }
}
function showLevelUp() {
  if (G.pendingLvUps <= 0) return;
  G.state = 'levelup';
  const opts = genOptions(3);
  const list = el('optList');
  list.innerHTML = '';
  el('luSub').textContent = `LEVEL ${P.level} · 选择一项强化`;
  for (const o of opts) {
    const btn = document.createElement('button');
    btn.className = 'opt';
    let icon, name, desc, pill = '';
    if (o.t === 'new') { const d = SKILLS[o.id]; icon = d.icon; name = d.name; desc = d.info({ lv:1, mut:null }); pill = `<span class="tagpill">${d.tag}</span><span class="newp">NEW</span>`; }
    else if (o.t === 'up' || o.t === 'up2') { const d = SKILLS[o.id], s = getSkill(o.id); icon = d.icon; name = d.name; desc = d.info({ lv:s.lv + 1, mut:s.mut }); pill = `<span class="tagpill">${d.tag}</span>`; }
    else if (o.t === 'mut') { const d = SKILLS[o.id], m = d.muts[o.mi]; icon = '✨'; name = `${d.name} · ${m.name}`; desc = m.desc; pill = `<span class="mutp">变异</span>`; }
    else if (o.t === 'pas') { const p = PASSIVES.find(x => x.id === o.id); icon = p.icon; name = p.name; desc = p.desc; pill = `<span class="tagpill">属性</span>`; }
    const cur = (o.t === 'up' || o.t === 'up2') ? `Lv.${getSkill(o.id).lv} → ${getSkill(o.id).lv + 1}` : '';
    btn.innerHTML = `<div class="ic">${icon}</div><div class="tx"><div class="nm">${name}${pill}<span class="lvpill">${cur}</span></div><div class="ds">${desc}</div></div>`;
    btn.onclick = () => applyOption(o);
    list.appendChild(btn);
  }
  el('levelup').classList.remove('hidden');
}
function genOptions(n) {
  const pool = [];
  const skillFull = P.skills.length >= 6;
  for (const s of P.skills) {
    if (s.lv < 10) pool.push({ t:'up', id:s.id, w:12 });
    else if (s.lv === 10 && !s.mut) { const d = SKILLS[s.id]; d.muts.forEach((m, i) => pool.push({ t:'mut', id:s.id, mi:i, w:30 })); }
    else if (s.lv < 20 && s.mut) pool.push({ t:'up2', id:s.id, w:9 });
  }
  if (!skillFull) for (const id in SKILLS) if (!P.skills.some(s => s.id === id)) pool.push({ t:'new', id, w:11 });
  const pasW = skillFull ? 16 : 7;
  for (const p of PASSIVES) pool.push({ t:'pas', id:p.id, w:pasW });
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    let total = 0;
    for (const o of pool) total += o.w;
    let r = Math.random() * total, idx = 0;
    for (let k = 0; k < pool.length; k++) { r -= pool[k].w; if (r <= 0) { idx = k; break; } }
    out.push(pool[idx]); pool.splice(idx, 1);
  }
  return out;
}
function applyOption(o) {
  el('levelup').classList.add('hidden');
  if (o.t === 'new') { P.skills.push({ id:o.id, lv:1, mut:null, cd:0 }); toast(`获得新技能：${SKILLS[o.id].name}`); }
  else if (o.t === 'up' || o.t === 'up2') getSkill(o.id).lv++;
  else if (o.t === 'mut') {
    const s = getSkill(o.id);
    const nm = SKILLS[o.id].muts[o.mi].name;
    s.mut = nm === '裂变' ? 'split' : nm === '超载' ? 'overload' : nm === '弹跳' ? 'bounce' : nm === '集束' ? 'cluster' : nm === '连锁' ? 'chain' : nm === '雷区' ? 'mine' : nm === '剑阵' ? 'array' : nm === '巨剑' ? 'giant' : nm === '永旋' ? 'eternal' : nm === '巨型' ? 'giant' : nm === '雷暴' ? 'storm' : nm === '静电' ? 'static' : nm === '酸雨' ? 'acid' : nm === '追猎云' ? 'hunt' : nm === '万符阵' ? 'many' : nm === '符爆' ? 'explode' : nm === '扎根' ? 'root' : nm === '怒目' ? 'rage' : nm === '顿悟' ? 'insight' : nm === '掠夺' ? 'plunder' : nm === '吸附' ? 'attract' : nm === '丰收' ? 'harvest' : 'mut';
    s.lv = 11;
    effects.push({ kind:'ring', x:P.x, y:P.y, life:0.6, max:0.6, r:220, col:'#ffb347' });
    toast(`✨ ${SKILLS[o.id].name} 变异：${nm}`); sfx('mut');
  } else if (o.t === 'pas') P.up[o.id] = (P.up[o.id] || 0) + 1;
  recalcStats(); _lastSkillSig = '';
  G.pendingLvUps--;
  if (G.pendingLvUps > 0) showLevelUp(); else G.state = 'playing';
  updateHUD();
}
const SHOP_ITEMS = [
  { id:'hp', icon:'❤️', name:'生命强化', desc:'最大生命 +25，回复 25', base:18 },
  { id:'spd', icon:'👟', name:'疾行', desc:'移动速度 +6%', base:20 },
  { id:'dmg', icon:'💪', name:'力量', desc:'所有伤害 +7%', base:26 },
  { id:'cdr', icon:'⏱️', name:'急速', desc:'技能冷却 -5%', base:28 },
  { id:'pick', icon:'🧲', name:'磁力', desc:'拾取范围 +16', base:16 },
  { id:'armor', icon:'🛡️', name:'护甲', desc:'受到伤害 -4%', base:24 },
  { id:'size', icon:'🔻', name:'缩小', desc:'自身体积 -4%', base:30 },
];
let shopBought = {};
function openShop() { G.state = 'shop'; el('shop').classList.remove('hidden'); sfx('shop'); renderShop(); }
function renderShop() {
  el('shopGold').textContent = G.runGold;
  const list = el('shopList'); list.innerHTML = '';
  for (const it of SHOP_ITEMS) {
    const bought = shopBought[it.id] || 0;
    const price = Math.round(it.base * Math.pow(1.34, bought));
    const can = G.runGold >= price;
    const btn = document.createElement('button');
    btn.className = 'shopitem' + (can ? '' : ' dis');
    btn.innerHTML = `<div class="ic">${it.icon}</div><div><div class="nm">${it.name}${bought ? ` <span style="opacity:.5;font-size:11px">×${bought}</span>` : ''}</div><div class="ds">${it.desc}</div></div><div class="price">💰 ${price}</div>`;
    if (can) btn.onclick = () => buyShop(it, price);
    list.appendChild(btn);
  }
}
function buyShop(it, price) {
  if (G.runGold < price) return;
  G.runGold -= price;
  shopBought[it.id] = (shopBought[it.id] || 0) + 1;
  switch (it.id) {
    case 'hp': P.up.maxhp += 1; break;
    case 'spd': P.up.speed += 1; break;
    case 'dmg': P.up.dmg += 1; break;
    case 'cdr': P.up.cdr += 1; break;
    case 'pick': P.up.pickup += 1; break;
    case 'armor': P.up.armor += 1; break;
    case 'size': P.sizeScale = Math.max(0.62, P.sizeScale - 0.04); P.r = 15 * P.sizeScale; break;
  }
  recalcStats(); renderShop(); updateHUD(); sfx('coin');
}
el('btnShopClose').onclick = () => { el('shop').classList.add('hidden'); G.state = 'playing'; };
let toastT = 0;
function toast(msg) { const t = el('toast'); t.textContent = msg; t.style.opacity = '1'; clearTimeout(toastT); toastT = setTimeout(() => { t.style.opacity = '0'; }, 1800); }
function pauseGame(smart) {
  // smart 模式仅在"离开时间很短"时静默暂停, 不弹菜单(避免误触打断)
  if (G.state !== 'playing' && G.state !== 'levelup' && G.state !== 'shop') return;
  G._silent = !!smart;
  G._prevState = (G.state === 'playing') ? 'playing' : G.state;
  G.state = 'paused';
  el('levelup').classList.add('hidden'); el('shop').classList.add('hidden');
  if (!G._silent) el('pauseVeil').classList.remove('hidden');
  if (audioReady && musicOn) musicGain.gain.value = 0.08;
}
function resumeGame(force) {
  // 因切后台而自动暂停的, 由 visibilitychange 统一处理; 这里响应手动"继续"
  if (!force && G._autoPaused) return;
  G._silent = false;
  el('pauseVeil').classList.add('hidden');
  const prev = G._prevState || 'playing';
  G._prevState = null;
  if (prev === 'levelup' && G.pendingLvUps > 0) showLevelUp();
  else if (prev === 'shop') openShop();
  else G.state = 'playing';
  if (audioReady && musicOn) musicGain.gain.value = 0.26;
}
// 切后台/锁屏时自动暂停(同时 audio.js 会停掉 BGM 调度器)
// 离开 <3 秒: 视为误触, 静默暂停, 回来直接继续, 不打断操作
// 离开 >=3 秒: 停下来等玩家点"继续", 免得回来发现角色已经死了
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (G.state === 'playing') {
        G._autoPaused = true;
        G._hiddenAt = performance.now();
        pauseGame(true);          // 先静默暂停, 不弹菜单
        clearTimeout(G._pauseReveal);
        G._silent = true;
        // 真的离开久了, 再把暂停菜单显示出来
        G._pauseReveal = setTimeout(() => {
          if (G._autoPaused && G.state === 'paused') {
            G._silent = false;
            el('pauseVeil').classList.remove('hidden');
          }
        }, 3000);
      }
    } else if (G._autoPaused) {
      clearTimeout(G._pauseReveal);
      G._autoPaused = false;
      const away = performance.now() - (G._hiddenAt || 0);
      if (G.state === 'paused' && G._silent && away < 3000) {
        G._silent = false;
        G.state = 'playing';                       // 短暂离开: 直接继续
        el('pauseVeil').classList.add('hidden');
        if (audioReady && musicOn) musicGain.gain.value = 0.26;
      } else if (G.state === 'paused') {
        G._silent = false;
        el('pauseVeil').classList.remove('hidden');  // 离开久了: 等玩家点继续
      }
    }
  });
}
function backToMenu() {
  if (typeof closeNPCDialog === 'function') closeNPCDialog();
  if (typeof closeCodex === 'function') el('codex').classList.add('hidden');
  el('townBar').classList.add('hidden');
  el('townPrompt').classList.add('hidden');
  el('btnTownAct').classList.add('hidden');
  el('ui').classList.remove('town');
  el('pauseVeil').classList.add('hidden'); el('resetVeil').classList.add('hidden');
  el('over').classList.add('hidden');
  el('hud').classList.add('hidden'); el('menu').classList.remove('hidden');
  G.state = 'menu'; P = null;
  if (audioReady && musicOn) musicGain.gain.value = 0.26;
}
function requestReset() { el('pauseVeil').classList.add('hidden'); el('resetVeil').classList.remove('hidden'); }
function doResetSave() {
  if (typeof closeNPCDialog === 'function') closeNPCDialog();
  el('codex').classList.add('hidden');
  el('townBar').classList.add('hidden');
  el('townPrompt').classList.add('hidden');
  el('btnTownAct').classList.add('hidden');
  el('ui').classList.remove('town');
  // 特殊能力(S.D. 的城镇奖励)与任务进度保留, 不被重置存档清掉
  SAVE = { gold:0, up:{ hp:0, spd:0, dmg:0, cdr:0, size:0 }, best:0, pets:[], selected:[],
           specials: (SAVE && SAVE.specials) || {}, quests: (SAVE && SAVE.quests) || {} };
  writeSave(); selectedPets = [];
  el('resetVeil').classList.add('hidden'); el('pauseVeil').classList.add('hidden');
  el('over').classList.add('hidden');
  el('hud').classList.add('hidden'); el('menu').classList.remove('hidden');
  G.state = 'menu'; P = null;
  if (audioReady && musicOn) musicGain.gain.value = 0.26;
  toast('✅ 存档已重置');
}
el('btnPause').onclick = (e) => { e.stopPropagation(); pauseGame(); };
el('btnTownAct').onclick = () => townInteract();
el('btnCodex').onclick = () => openCodex();
el('btnCodexBack').onclick = () => closeCodex();
if (typeof updateHudSpecials === 'function') updateHudSpecials();
el('btnResume').onclick = () => resumeGame();
el('btnRestart').onclick = () => {
  el('pauseVeil').classList.add('hidden');
  if (audioReady && musicOn) musicGain.gain.value = 0.26;
  const ids = selectedPets.length > 0 ? selectedPets.slice() : (SAVE.selected || []).slice();
  startGame(G.mode, ids);
};
el('btnBackMenu').onclick = () => backToMenu();
el('btnResetFromPause').onclick = () => requestReset();
el('btnResetFromMenu').onclick = () => el('resetVeil').classList.remove('hidden');
el('btnResetCancel').onclick = () => {
  el('resetVeil').classList.add('hidden');
  if (G.state === 'paused') el('pauseVeil').classList.remove('hidden');
};
el('btnResetConfirm').onclick = () => doResetSave();
el('btnAudio').onclick = (e) => {
  e.stopPropagation(); initAudio();
  if (musicOn || sfxOn) {
    musicOn = false; sfxOn = false;
    if (audioReady) { musicGain.gain.value = 0; sfxGain.gain.value = 0; }
    el('btnAudio').textContent = '🔇'; toast('音效已关闭');
  } else {
    musicOn = true; sfxOn = true;
    if (audioReady) { musicGain.gain.value = (G.state === 'paused') ? 0.08 : 0.26; sfxGain.gain.value = 0.5; if (actx.state === 'suspended') actx.resume(); }
    el('btnAudio').textContent = '🔊'; toast('音效已开启');
  }
};
const HATCH_COST = 100;
let pendingMode = 'endless', selectedPets = [];
function renderPetHome(highlightId) {
  el('petGold').textContent = SAVE.gold;
  const grid = el('petGrid'); grid.innerHTML = '';
  for (const id of Object.keys(PETS)) {
    const def = PETS[id];
    const owned = SAVE.pets.includes(id);
    const slot = document.createElement('div');
    slot.className = 'pet-slot' + (owned ? '' : ' locked');
    slot.innerHTML = owned ? `${def.emoji}<div class="nm">${def.name}</div>` : `❓<div class="nm">???</div>`;
    if (owned) slot.onclick = () => showPetDetail(id);
    else slot.onclick = () => toast('尚未解锁 · 孵化蛋试试运气');
    grid.appendChild(slot);
  }
  if (SAVE.pets.length >= Object.keys(PETS).length) {
    el('btnHatch').disabled = true; el('btnHatch').textContent = '已 收 集 全 部';
  } else {
    el('btnHatch').disabled = SAVE.gold < HATCH_COST;
    el('btnHatch').textContent = `孵 化 蛋 · ${HATCH_COST} 💰`;
  }
  if (highlightId) showPetDetail(highlightId);
}
function showPetDetail(id) {
  const def = PETS[id];
  if (!def) return;
  el('petDetail').innerHTML = `<div class="dname">${def.emoji} ${def.name} · <span class="dskill">${def.skill}</span></div><div>${def.desc}</div><div class="dmut">🐾 变异：${def.mutText}</div>`;
}
function openPetHome() { G.state = 'petHome'; renderPetHome(); el('petHome').classList.remove('hidden'); }
el('btnPets').onclick = () => openPetHome();
el('btnPetHomeBack').onclick = () => { el('petHome').classList.add('hidden'); G.state = 'menu'; };
el('btnHatch').onclick = () => {
  if (SAVE.gold < HATCH_COST) { toast('金币不足'); return; }
  const locked = Object.keys(PETS).filter(id => !SAVE.pets.includes(id));
  if (locked.length === 0) { toast('全部已解锁'); return; }
  SAVE.gold -= HATCH_COST;
  const newPet = pick(locked);
  SAVE.pets.push(newPet); writeSave();
  el('petGold').textContent = SAVE.gold;
  showHatchAnimation(newPet);
};
function showHatchAnimation(petId) {
  const def = PETS[petId];
  const veil = el('hatchVeil'), egg = el('hatchEgg'), nameEl = el('hatchName'), descEl = el('hatchDesc');
  egg.textContent = '🥚'; egg.className = 'hatchEgg shake';
  nameEl.className = 'hatchName'; descEl.className = 'hatchDesc';
  nameEl.textContent = ''; descEl.textContent = '';
  veil.classList.remove('hidden'); sfx('hit');
  setTimeout(() => { egg.className = 'hatchEgg pop'; egg.textContent = def.emoji; sfx('levelup'); }, 900);
  setTimeout(() => { nameEl.textContent = `${def.emoji} ${def.name} · ${def.skill}`; nameEl.classList.add('on'); descEl.textContent = def.desc; descEl.classList.add('on'); }, 1200);
  setTimeout(() => { veil.classList.add('hidden'); renderPetHome(petId); }, 2900);
}
function openPetSelect() {
  selectedPets = selectedPets.filter(id => SAVE.pets.includes(id)).slice(0, 2);
  if (selectedPets.length === 0) selectedPets = SAVE.pets.slice(0, 2);
  renderPetSelect(); el('petSelect').classList.remove('hidden'); G.state = 'petSelect';
}
function renderPetSelect() {
  const grid = el('petSelectGrid'); grid.innerHTML = '';
  for (const id of SAVE.pets) {
    const def = PETS[id];
    const on = selectedPets.includes(id);
    const slot = document.createElement('div');
    slot.className = 'pet-slot' + (on ? ' on' : '');
    slot.innerHTML = `${def.emoji}<div class="nm">${def.name}</div>`;
    slot.onclick = () => togglePetSelect(id);
    grid.appendChild(slot);
  }
  if (selectedPets.length > 0) {
    const id = selectedPets[selectedPets.length - 1], def = PETS[id];
    el('petSelectDetail').innerHTML = `<div class="dname">${def.emoji} ${def.name} · <span class="dskill">${def.skill}</span></div><div>${def.desc}</div><div class="dmut">🐾 变异：${def.mutText}</div>`;
  } else {
    el('petSelectDetail').innerHTML = `<div class="dname">未选择宠物</div><div style="opacity:.6">点击宠物图标选择出战（最多 2 只）</div>`;
  }
}
function togglePetSelect(id) {
  const i = selectedPets.indexOf(id);
  if (i >= 0) selectedPets.splice(i, 1);
  else { if (selectedPets.length >= 2) { toast('最多出战 2 只宠物'); return; } selectedPets.push(id); }
  renderPetSelect();
}
el('btnPetStart').onclick = () => {
  SAVE.selected = selectedPets.slice(); writeSave();
  el('petSelect').classList.add('hidden');
  startGame(pendingMode, selectedPets.slice());
};
el('btnPetSelectBack').onclick = () => { el('petSelect').classList.add('hidden'); G.state = 'menu'; };
function startGame(mode, petIds) {
  initAudio();
  if (audioReady && actx.state === 'suspended') actx.resume().catch(() => {});
  if (audioReady && musicOn) musicGain.gain.value = 0.26;
  G.state = 'playing'; G.mode = mode;
  G.time = 0; G.kills = 0; G.runGold = 0; G.hpMult = 1; G.diffCount = 0;
  G.unlocked = ['normal']; G.nextEliteLv = 10; G.eliteAlive = false;
  G.pendingLvUps = 0; G.spawnTimer = 0; G.shopTimer = 26; G.shake = 0;
  G._prevState = null;
  enemies = []; bullets = []; eBullets = []; orbs = []; effects = []; texts = []; portals = [];
  shopBought = {};
  P = createPlayer(); recalcStats(); P.hp = P.maxHp;
  P.pets = [];
  (petIds || []).forEach((id, i) => {
    if (!PETS[id]) return;
    P.pets.push({ id, lv:1, mut:false, cd:rnd(0.2, 0.8), x:P.x + Math.cos(i * Math.PI) * 48, y:P.y + Math.sin(i * Math.PI) * 48, steal:0, breathT:0, breathTick:0, breathAngle:0 });
  });
  P.wingT = 0; P.bootsT = 0; P.specials = {};   // 特殊能力计时
  P._monkeyT = 0; P._monkeyCast = 0; P._pigT = 0; P._horseTrail = 0;
  if (typeof backfillSeenPets === 'function') backfillSeenPets();   // 图鉴: 已解锁的宠物记为已遇到
  const starters = ['homing', 'sword', 'lightning', 'bomb'];
  P.skills.push({ id:pick(starters), lv:1, mut:null, cd:0.5 });
  el('menu').classList.add('hidden'); el('over').classList.add('hidden');
  el('levelup').classList.add('hidden'); el('shop').classList.add('hidden');
  el('petHome').classList.add('hidden'); el('petSelect').classList.add('hidden');
  el('pauseVeil').classList.add('hidden'); el('resetVeil').classList.add('hidden');
  el('hud').classList.remove('hidden');
  _lastSkillSig = ''; _lastPetSig = '';
  updateHUD();
  toast(mode === 'challenge' ? '挑战模式 · 存活 15 分钟' : '无尽模式 · 尽量活下去');
}
function gameOver() {
  G.state = 'over';
  SAVE.gold += G.runGold;
  if (G.time > SAVE.best) SAVE.best = G.time;
  writeSave();
  showResult('你 死 了', 'GAME OVER'); sfx('over');
  if (audioReady && musicOn) musicGain.gain.value = 0.26;
}
function challengeWin() {
  G.state = 'over';
  const bonus = 120;
  G.runGold += bonus; SAVE.gold += G.runGold;
  if (G.time > SAVE.best) SAVE.best = G.time;
  writeSave();
  showResult('挑 战 成 功', 'SURVIVED'); sfx('win');
  if (audioReady && musicOn) musicGain.gain.value = 0.26;
}
function showResult(title, sub) {
  el('overTitle').textContent = title; el('overSub').textContent = sub;
  el('rTime').textContent = fmtTime(G.time);
  el('rKill').textContent = G.kills;
  el('rLv').textContent = P.level;
  el('rGold').textContent = G.runGold;
  el('rTotal').textContent = SAVE.gold;
  el('over').classList.remove('hidden'); el('hud').classList.add('hidden');
  el('levelup').classList.add('hidden'); el('shop').classList.add('hidden');
  el('pauseVeil').classList.add('hidden');
}
document.querySelectorAll('[data-mode]').forEach(b => {
  b.onclick = () => {
    pendingMode = b.dataset.mode;
    if (SAVE.pets.length > 0) openPetSelect();
    else startGame(pendingMode, []);
  };
});
el('btnHelp').onclick = () => el('help').classList.remove('hidden');
el('btnHelpBack').onclick = () => el('help').classList.add('hidden');
el('btnRetry').onclick = () => {
  const ids = selectedPets.length > 0 ? selectedPets.slice() : (SAVE.selected || []).slice();
  startGame(G.mode, ids);
};
el('btnMenu').onclick = () => backToMenu();
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.05) dt = 0.05;
  if (G.state === 'playing') update(dt);
  else if (G.state === 'town') updateTown(dt);
  if (P) render();
  else { ctx.fillStyle = '#07070e'; ctx.fillRect(0, 0, W, H); }
}
requestAnimationFrame(frame);
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (e.target === canvas) e.preventDefault(); }, { passive: false });
