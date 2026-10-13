/* ============================================================
   黑洞与小镇 / black hole & town
   无尽回响 Endless Echo
   ============================================================
   玩法:
     主地图上满足条件(至少 3 个技能, 且至少 1 个技能达到 3 级)后,
     每 3~5 分钟随机刷出一个黑洞。走进黑洞会被传送到"回声小镇"——
     一张绝对安全的城镇地图(不刷怪、不掉血), 里面住着几位 NPC。
     和 NPC 对话可接下"回主地图完成"的战斗任务, 完成后再回来交差,
     即可解锁带冷却的特殊能力(翅膀加速、靴子无敌穿行等)。

   数据落点:
     G.bh          本模块在主地图/城镇间共享的状态
     SAVE.quests   各 NPC 任务进度
     SAVE.specials 已解锁的特殊能力
     P.specials    本局中特殊能力的冷却/持续时间
   ============================================================ */

/* ---------------- 触发条件与节奏 ---------------- */
const BH_TRIGGER_SKILLS = 3;      // 至少拥有 3 个技能
const BH_TRIGGER_LEVEL = 3;       // 且至少 1 个技能达到 3 级
const BH_RESPAWN_MIN = 180;       // 下一次黑洞最早 3 分钟
const BH_RESPAWN_MAX = 300;       // 最晚 5 分钟
const BH_PORTAL_LIFE = 150;       // 黑洞存在 150 秒后自行消失
const BH_ENTER_RADIUS = 46;       // 走进这个距离就被吸入
const BH_BANNER_LIFE = 4.2;       // 出现时的醒目提示持续秒数

/* 黑洞出现时的提示语(随机取一条, 避免每次都一样) */
const BH_ALERTS = [
  ['附近有异响，好像有什么东西', '跟着屏幕边缘的紫色箭头走'],
  ['空气突然变重了…', '地图上出现了一个黑洞，倒计时内有效'],
  ['远处传来低沉的嗡鸣', '朝紫色箭头方向前进'],
  ['空间被撕开了一道口子', '走进黑洞可以去往回声小镇'],
];

/* ---------------- 特殊能力 ---------------- */
const SPECIALS = {
  wing: {
    id: 'wing', name: '风之翼', icon: '🪽', key: '1',
    desc: '展开风翼，移动速度 +90%，持续 5 秒',
    cd: 14, dur: 5,
    activate() { P.wingT = this.dur; toast('🪽 风之翼展开！'); sfx('mut'); },
    update(dt) { if (P.wingT > 0) P.wingT -= dt; },
  },
  boots: {
    id: 'boots', name: '踏空靴', icon: '👟', key: '2',
    desc: '2.5 秒内无敌，并可无视碰撞穿过怪物群',
    cd: 16, dur: 2.5,
    activate() { P.bootsT = this.dur; toast('👟 踏空靴启动！无敌穿行'); sfx('shop'); },
    update(dt) { if (P.bootsT > 0) P.bootsT -= dt; },
  },
  sight: {
    id: 'sight', name: '鹰眼', icon: '👁️', key: '3', passive: true,
    desc: '暴击率 +12%（被动）',
  },
  magnet: {
    id: 'magnet', name: '磁石', icon: '🧲', key: '4', passive: true,
    desc: '拾取范围 +60（被动）',
  },
  furnace: {
    id: 'furnace', name: '熔炉', icon: '🔥', key: '5', passive: true,
    desc: '所有伤害 +12%（被动）',
  },
};

/* ---------------- NPC 与任务 ---------------- */
const NPCS = [
  {
    id: 'hunter', name: '猎手 阿岩', emoji: '🏹', x: -175, y: -140,
    request: '东边的精英怪快把猎场占满了。替我干掉一只精英怪，这把风之翼就归你。',
    thanks: '干净利落！风之翼归你了 —— 想跑得快，就朝风的方向。',
    quest: { kind: 'elite', goal: 1, text: '击杀精英怪' },
    reward: 'wing',
  },
  {
    id: 'smith', name: '铁匠 老铸', emoji: '🔨', x: 175, y: -140,
    request: '我要 30 块怪物晶核来重锻炉火。你替我去外面清一波怪，我这双踏空靴就送你。',
    thanks: '炉火重燃！这双踏空靴给你 —— 踩上去，怪物撞不着你。',
    quest: { kind: 'kill', goal: 30, text: '击杀怪物' },
    reward: 'boots',
  },
  {
    id: 'traveler', name: '旅行者 图娅', emoji: '🧭', x: 195, y: 165,
    request: '我在这小镇待太久了，想知道外面还能不能撑。你在外面活过 120 秒再回来告诉我。',
    thanks: '你活着回来了，眼里有光。这枚鹰眼徽记送你 —— 看得清，才活得久。',
    quest: { kind: 'survive', goal: 120, text: '在主地图存活' },
    reward: 'sight',
  },
  {
    id: 'scholar', name: '学者 灰笔', emoji: '📖', x: -190, y: 170,
    request: '我在研究回响的磁性。你带 200 金币回来，我教你聚拢经验的法子。',
    thanks: '钱够了。记住：万物皆可吸引，包括经验。这枚磁石给你。',
    quest: { kind: 'gold', goal: 200, text: '累计获得金币' },
    reward: 'magnet',
  },
  {
    id: 'elder', name: '镇长 索恩', emoji: '🎩', x: 0, y: -195,
    request: '想证明你配得上这座镇子？撑过 300 秒再说。熔炉的火只认硬骨头。',
    thanks: '你撑住了。把这炉余烬带上 —— 让每一击都更重。',
    quest: { kind: 'survive', goal: 300, text: '在主地图存活' },
    reward: 'furnace',
  },
];

/* ---------------- 城镇状态 ---------------- */
const T = {
  x: 0, y: 0, r: 15,
  near: null,          // 当前可交互的 NPC
  // 南门: 必须放在玩家能够到的范围里。围墙把玩家夹在 y <= 212-15 = 197,
  // 交互判定为 exit.r + r*0.8 = 46px, 所以出口中心距墙不能超过约 40px。
  exit: { x: 0, y: 232, r: 34 },
  anim: 0,
};

function townNpcState(npc) {
  return (SAVE.quests && SAVE.quests[npc.id]) || null;
}

function ensureSaveSlots() {
  if (!SAVE.quests || typeof SAVE.quests !== 'object') SAVE.quests = {};
  if (!SAVE.specials || typeof SAVE.specials !== 'object') SAVE.specials = {};
}

/* 任务是否达成(只判断进度, 不发放奖励) */
function questDone(q) { return !!q && q.cur >= q.goal; }

/* 任务进度推进(在主地图的 update 里调用) */
function questTick(dt) {
  ensureSaveSlots();
  for (const npc of NPCS) {
    const st = SAVE.quests[npc.id];
    if (!st || st.done) continue;
    const q = st.quest;
    switch (q.kind) {
      case 'survive': q.cur += dt; break;                       // 存活时长实时累加
      case 'kill':    q.cur = G.kills - q.base; break;          // 击杀数增量
      case 'elite':   q.cur = G.diffCount - q.base; break;      // 精英击杀增量
      case 'gold':    q.cur = G.runGold - q.base; break;        // 本局金币增量
      default: break;
    }
    if (q.cur > q.goal) q.cur = q.goal;
    if (questDone(q)) { st.done = true; }
  }
}

/* ---------------- 主地图: 黑洞的生成与吸入 ---------------- */
function bhEligible() {
  if (!P || !P.skills) return false;
  if (P.skills.length < BH_TRIGGER_SKILLS) return false;
  return P.skills.some(s => s.lv >= BH_TRIGGER_LEVEL);
}

function updateBlackHole(dt) {
  bhUpdateBanner(dt);
  if (G.mode !== 'endless' && G.mode !== 'challenge') return;
  ensureSaveSlots();
  if (!G.bh) G.bh = { timer: null, portal: null, townReturn: false, announced: false };

  // 条件刚达成时给一次提示
  if (!G.bh.announced && bhEligible()) {
    G.bh.announced = true;
    G.bh.timer = rnd(BH_RESPAWN_MIN, BH_RESPAWN_MAX);
    toast('🕳 回响开始扭曲…黑洞即将出现');
  }
  if (!G.bh.announced) return;

  // 黑洞已存在: 倒计时 + 检测吸入
  if (G.bh.portal) {
    const po = G.bh.portal;
    po.life -= dt;
    po.spin += dt * 0.8;
    const d = Math.hypot(P.x - po.x, P.y - po.y);
    if (d < BH_ENTER_RADIUS + P.r) { enterTown(); return; }
    if (po.life <= 0) { G.bh.portal = null; G.bh.timer = rnd(BH_RESPAWN_MIN, BH_RESPAWN_MAX); toast('🕳 黑洞消散了…'); }
    return;
  }

  G.bh.timer -= dt;
  if (G.bh.timer > 0) return;

  // 生成黑洞: 出现在玩家视野附近但不重叠
  const a = Math.random() * TAU;
  const dist = rnd(420, 780);
  G.bh.portal = { x: P.x + Math.cos(a) * dist, y: P.y + Math.sin(a) * dist, life: BH_PORTAL_LIFE, spin: 0 };
  G.bh.townReturn = false;
  bhShowBanner();                                   // 醒目提示(在视野外时也能知道)
  sfx('elite');
  G.shake = Math.max(G.shake, 8);
}

/* ---------------- 黑洞出现的醒目提示 ---------------- */
function bhShowBanner() {
  const pickAlert = BH_ALERTS[(Math.random() * BH_ALERTS.length) | 0];
  G.bh.banner = {
    title: pickAlert[0],
    sub: pickAlert[1],
    life: BH_BANNER_LIFE,
  };
  sfx('elite');
}

/* 每帧推进提示的计时(即使暂停在升级界面也要能走完) */
function bhUpdateBanner(dt) {
  const b = G.bh && G.bh.banner;
  if (!b) return;
  b.life -= dt;
  if (b.life > 0) return;
  G.bh.banner = null;
  // 提示期间如果升级了, 等提示结束再弹三选一, 免得糊在一起
  if (G.pendingLvUps > 0 && G.state === 'playing') showLevelUp();
}

function drawBhBanner() {
  const b = G.bh && G.bh.banner;
  if (!b) return;
  const total = BH_BANNER_LIFE;
  const fadeIn = 0.3, fadeOut = 0.8;
  let a = 1;
  if (b.life > total - fadeIn) a = (total - b.life) / fadeIn;      // 淡入
  else if (b.life < fadeOut) a = b.life / fadeOut;                 // 淡出
  a = clamp(a, 0, 1) * 0.97;

  const cx = W / 2;
  const cy = Math.max(136, H * 0.22);
  const bw = Math.min(W - 40, 460), bh2 = 76;
  const x0 = cx - bw / 2, y0 = cy - bh2 / 2;

  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  // 底板
  ctx.fillStyle = 'rgba(10,8,22,0.93)';
  ctx.strokeStyle = 'rgba(190,130,255,0.9)';
  ctx.lineWidth = 2;
  const r = 14;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.lineTo(x0 + bw - r, y0); ctx.quadraticCurveTo(x0 + bw, y0, x0 + bw, y0 + r);
  ctx.lineTo(x0 + bw, y0 + bh2 - r); ctx.quadraticCurveTo(x0 + bw, y0 + bh2, x0 + bw - r, y0 + bh2);
  ctx.lineTo(x0 + r, y0 + bh2); ctx.quadraticCurveTo(x0, y0 + bh2, x0, y0 + bh2 - r);
  ctx.lineTo(x0, y0 + r); ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
  ctx.closePath();
  ctx.shadowColor = 'rgba(190,130,255,0.85)'; ctx.shadowBlur = 22;
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;

  // 标题
  ctx.font = fnt(17, 'bold');
  ctx.fillStyle = '#e8d4ff';
  ctx.fillText('🕳  ' + b.title, cx, cy - 14);
  // 副标题
  ctx.font = fnt(12.5);
  ctx.fillStyle = 'rgba(220,200,255,0.78)';
  ctx.fillText(b.sub + '　·　' + Math.ceil(b.life) + ' 秒后消散', cx, cy + 14);
  ctx.restore();
}

/* ---------------- 进出城镇 ---------------- */
function enterTown() {
  T.x = 0; T.y = 190;          // 从南门进入
  T.near = null;
  // 防御: 正常流程里 updateBlackHole 已初始化 G.bh, 但直接调用也不该崩
  if (!G.bh) G.bh = { timer: null, portal: null, townReturn: false, announced: false };
  G.bh.townReturn = true;
  G.bh.portal = null;          // 离开主地图期间黑洞不再存在
  G.bh.timer = rnd(BH_RESPAWN_MIN, BH_RESPAWN_MAX);
  G.state = 'town';
  el('hud').classList.add('hidden');
  el('townBar').classList.remove('hidden');
  el('btnTownAct').classList.remove('hidden');   // 城镇里才显示"交谈"按钮
  // 提示条上写着"点这里", 所以也要能点(手机上没有 F 键)
  const _pr = el('townPrompt');
  if (_pr && !_pr._bound) { _pr._bound = true; _pr.onclick = () => townInteract(); }
  el('ui').classList.add('town');                // 让技能栏上移, 给按钮让位
  sfx('shop');
  toast('🌆 回声小镇 · 这里很安全');
  syncSpecialBars();
}

function leaveTown() {
  G.state = 'playing';
  el('townBar').classList.add('hidden');
  el('townPrompt').classList.add('hidden');
  el('btnTownAct').classList.add('hidden');      // 回荒野必须收起, 否则挡住技能栏
  el('ui').classList.remove('town');
  closeNPCDialog();
  el('hud').classList.remove('hidden');
  // 从黑洞旁边出来, 避免立刻又被吸进去
  if (G.bh && G.bh.portal) {
    const a = Math.random() * TAU;
    P.x = G.bh.portal.x + Math.cos(a) * 260;
    P.y = G.bh.portal.y + Math.sin(a) * 260;
  }
  G.bh.townReturn = false;
  toast('回到荒野');
  sfx('shop');
}

/* ---------------- 城镇内的交互 ---------------- */
function updateTown(dt) {
  T.anim += dt;
  // 移动(复用虚拟摇杆与键盘)
  let mx = 0, my = 0;
  if (input.keys.has('a') || input.keys.has('arrowleft'))  mx -= 1;
  if (input.keys.has('d') || input.keys.has('arrowright')) mx += 1;
  if (input.keys.has('w') || input.keys.has('arrowup'))    my -= 1;
  if (input.keys.has('s') || input.keys.has('arrowdown'))  my += 1;
  if (input.joy.active) { const jx = input.joy.dx / 62, jy = input.joy.dy / 62; if (Math.hypot(jx, jy) > 0.08) { mx = jx; my = jy; } }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const speed = 230;
  T.x += mx * speed * dt;
  T.y += my * speed * dt;

  // 城镇边界(矩形围墙)
  const BX = 232, BY = 212;

  // 建筑碰撞(简单矩形推开)
  for (const b of townBuildings) {
    const hw = b.w / 2 + T.r * 0.6, hh = b.h / 2 + T.r * 0.6;
    const dx = T.x - b.x, dy = T.y - b.y;
    if (Math.abs(dx) < hw && Math.abs(dy) < hh) {
      const ox = hw - Math.abs(dx), oy = hh - Math.abs(dy);
      if (ox < oy) T.x = b.x + Math.sign(dx || 1) * hw;
      else T.y = b.y + Math.sign(dy || 1) * hh;
    }
  }

  // 边界钳制放在建筑碰撞之后, 否则被建筑推开时可能被推出围墙
  T.x = clamp(T.x, -BX + T.r, BX - T.r);
  T.y = clamp(T.y, -BY + T.r, BY - T.r);

  // 最近的 NPC
  let best = null, bd = 62;
  for (const npc of NPCS) {
    const d = Math.hypot(T.x - npc.x, T.y - npc.y);
    if (d < bd) { bd = d; best = npc; }
  }
  T.near = best;
  const exitD = Math.hypot(T.x - T.exit.x, T.y - T.exit.y);
  const atExit = exitD < T.exit.r + T.r * 0.8;

  // 交互提示条
  const prompt = el('townPrompt');
  if (best) {
    const st = townNpcState(best);
    const mark = !st ? '❗ 有新委托' : (st.done && !st.claimed ? '✅ 可交差' : (st.claimed ? '　' : '…进行中'));
    prompt.textContent = '按 F / 点这里 与 ' + best.name + ' 交谈　' + mark;
    prompt.classList.remove('hidden');
  } else if (atExit) {
    prompt.textContent = '按 F / 点这里 离开小镇，回到荒野';
    prompt.classList.remove('hidden');
  } else {
    prompt.classList.add('hidden');
  }
  el('btnTownAct').textContent = (atExit && !best) ? '离 开 小 镇' : '交 谈';

  syncSpecialBars();
}

/* 主动交互(F 键或点击) */
function townInteract() {
  if (G.state !== 'town') return;
  if (T.near) { openNPCDialog(T.near); return; }
  if (Math.hypot(T.x - T.exit.x, T.y - T.exit.y) < T.exit.r + T.r * 0.8) leaveTown();
}

/* 未完成任务时, 对话框里只显示进度 */
function questProgressText(st) {
  const q = st.quest;
  const cur = Math.floor(Math.min(q.cur, q.goal));
  switch (q.kind) {
    case 'survive': return q.text + '：' + cur + ' / ' + q.goal + ' 秒';
    case 'kill':    return q.text + '：' + cur + ' / ' + q.goal + ' 只';
    case 'elite':   return q.text + '：' + cur + ' / ' + q.goal + ' 只';
    case 'gold':    return q.text + '：' + cur + ' / ' + q.goal + ' 枚（本局）';
    default:        return q.text;
  }
}

let _dlgNpc = null;
function openNPCDialog(npc) {
  _dlgNpc = npc;
  ensureSaveSlots();
  const st = SAVE.quests[npc.id];
  const title = el('dlgTitle'), body = el('dlgBody'), actions = el('dlgActions');
  title.textContent = npc.emoji + ' ' + npc.name;
  actions.innerHTML = '';

  const addBtn = (label, cls, fn) => {
    const b = document.createElement('button');
    b.className = 'btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.onclick = fn;
    actions.appendChild(b);
    return b;
  };

  if (!st) {
    body.innerHTML = '<div class="dlgq">“' + npc.request + '”</div>' +
      '<div class="dlgmeta">任务：' + npc.quest.text + ' ' + npc.quest.goal +
      '　→　奖励：' + SPECIALS[npc.reward].icon + ' ' + SPECIALS[npc.reward].name + '</div>';
    addBtn('接 下 委 托', 'primary', () => {
      SAVE.quests[npc.id] = {
        quest: {
          kind: npc.quest.kind, goal: npc.quest.goal, cur: 0,
          base: npc.quest.kind === 'survive' ? 0 : (npc.quest.kind === 'kill' ? G.kills : (npc.quest.kind === 'elite' ? G.diffCount : G.runGold)),
        },
        done: false, claimed: false,
      };
      writeSave();
      toast('已接下 ' + npc.name + ' 的委托');
      sfx('coin');
      openNPCDialog(npc);
    });
  } else if (st.claimed) {
    body.innerHTML = '<div class="dlgq">“' + npc.thanks + '”</div>' +
      '<div class="dlgmeta">该委托已完成，' + SPECIALS[npc.reward].name + ' 已在你身上。</div>';
  } else if (st.done) {
    const sp = SPECIALS[npc.reward];
    body.innerHTML = '<div class="dlgq">“' + npc.thanks + '”</div>' +
      '<div class="dlgmeta">获得特殊能力：' + sp.icon + ' ' + sp.name +
      '　' + (sp.passive ? '被动生效' : '冷却 ' + sp.cd + ' 秒') + '</div>';
    addBtn('领 取 奖 励', 'primary', () => {
      st.claimed = true;
      SAVE.specials[npc.reward] = true;
      writeSave();
      P.specials = P.specials || {};
      toast('✨ 获得特殊能力：' + sp.name);
      sfx('mut');
      syncSpecialBars();
      openNPCDialog(npc);
    });
  } else {
    body.innerHTML = '<div class="dlgq">“' + npc.request + '”</div>' +
      '<div class="dlgmeta">' + questProgressText(st) + '</div>' +
      '<div class="dlgmeta">提示：这条委托要回到荒野去完成。</div>';
  }
  addBtn('离 开', '', closeNPCDialog);
  el('npcDlg').classList.remove('hidden');
}

function closeNPCDialog() {
  _dlgNpc = null;
  el('npcDlg').classList.add('hidden');
  // 清掉按钮, 否则下次对话时旧按钮会残留在列表里(可能被误点)
  el('dlgActions').innerHTML = '';
  el('dlgBody').innerHTML = '';
}

/* ---------------- 特殊能力: 冷却与激活 ---------------- */
function ownedSpecials() {
  ensureSaveSlots();
  return Object.keys(SPECIALS).filter(id => SAVE.specials[id]);
}

function getSpecial(id) {
  const def = SPECIALS[id];
  P.specials = P.specials || {};
  if (!P.specials[id]) P.specials[id] = { cd: 0 };
  return { def, st: P.specials[id] };
}

function useSpecial(id) {
  if (G.state !== 'playing' || !P) return;
  const def = SPECIALS[id];
  if (!def || def.passive || !SAVE.specials[id]) return;
  const { st } = getSpecial(id);
  if (st.cd > 0) { toast(def.name + ' 冷却中 ' + st.cd.toFixed(1) + 's'); return; }
  st.cd = def.cd * (1 - P.cdr);
  if (def.activate) def.activate();
}

function updateSpecials(dt) {
  if (!P) return;
  ensureSaveSlots();
  for (const id of Object.keys(SPECIALS)) {
    const def = SPECIALS[id];
    if (!SAVE.specials[id]) continue;
    const { st } = getSpecial(id);
    if (st.cd > 0) st.cd = Math.max(0, st.cd - dt);
    if (def.update) def.update(dt);
  }
  // 翅膀/靴子的可见特效
  if (P.wingT > 0) effects.push({ kind: 'ring', x: P.x, y: P.y, life: 0.25, max: 0.25, r: 26, col: '#8ab4ff' });
  if (P.bootsT > 0) effects.push({ kind: 'ring', x: P.x, y: P.y, life: 0.25, max: 0.25, r: 30, col: '#ffd76a' });
  updatePassivePets(dt);
}

/* ---------------- 被动生肖宠物的效果 ----------------
   放在这里而不是 pets.js, 是因为这些效果依赖 RECALC 之后的属性,
   并且在 update 流程中执行; 数值部分由 recalcStats() 汇总。 */
function passivePetLv(id) {
  if (!P || !P.pets) return 0;
  let lv = 0;
  for (const p of P.pets) if (p.id === id) lv = Math.max(lv, p.lv);
  return lv;
}

function passivePetMut(id) {
  if (!P || !P.pets) return false;
  for (const p of P.pets) if (p.id === id && p.mut) return true;
  return false;
}

function updatePassivePets(dt) {
  if (!P.pets || !P.pets.length) return;

  // 🐑 羊: 持续回血, 变异后残血时回复翻倍
  const sheepLv = passivePetLv('sheep');
  if (sheepLv > 0) {
    let heal = 0.8 * sheepLv;
    if (passivePetMut('sheep') && P.hp < P.maxHp * 0.5) heal *= 2;
    P.hp = Math.min(P.maxHp, P.hp + heal * dt);
  }

  // 🐵 猴: 每 3 秒给所有技能减 0.6 秒冷却; 变异后每 5 秒额外施放一次技能
  const monkeyLv = passivePetLv('monkey');
  if (monkeyLv > 0) {
    P._monkeyT = (P._monkeyT || 0) - dt;
    if (P._monkeyT <= 0) {
      P._monkeyT = 3;
      for (const s of P.skills) { const def = SKILLS[s.id]; if (def && !def.passive) s.cd = Math.max(0, s.cd - 0.6); }
    }
    if (passivePetMut('monkey')) {
      P._monkeyCast = (P._monkeyCast || 0) - dt;
      if (P._monkeyCast <= 0) {
        P._monkeyCast = 5;
        const usable = P.skills.filter(s => { const d = SKILLS[s.id]; return d && !d.passive; });
        if (usable.length) {
          const s = usable[(Math.random() * usable.length) | 0];
          SKILLS[s.id].fire(s);
          effects.push({ kind: 'ring', x: P.x, y: P.y, life: 0.35, max: 0.35, r: 44, col: '#ffd76a' });
        }
      }
    }
  }
  // 🐴 马: 变异后额外留下一串加速残影
  if (passivePetMut('horse') && P.moving) {
    P._horseTrail = (P._horseTrail || 0) - dt;
    if (P._horseTrail <= 0) { P._horseTrail = 0.22; effects.push({ kind: 'ring', x: P.x, y: P.y, life: 0.3, max: 0.3, r: 20, col: '#cfe8ff' }); }
  }
  // 🐷 猪: 变异后每隔一会自动掉一枚大经验球(福气外溢)
  if (passivePetMut('pig')) {
    P._pigT = (P._pigT || 0) - dt;
    if (P._pigT <= 0) {
      P._pigT = 12;
      if (orbs.length < 200) orbs.push({ x: P.x + rnd(-30, 30), y: P.y + rnd(-30, 30), vx: 0, vy: 0, v: 6, r: 8, life: 30, pulling: false, spin: 0, big: true });
      effects.push({ kind: 'ring', x: P.x, y: P.y, life: 0.4, max: 0.4, r: 60, col: '#ffd76a' });
    }
  }
}

/* 特殊能力条: 城镇顶栏与主地图 HUD 共用同一套渲染 */
function syncSpecialBars() {
  syncOneBar(el('townSkills'));
  syncOneBar(el('hudSpecials'));
}

function syncOneBar(bar) {
  if (!bar) return;
  const owned = ownedSpecials();
  const sig = owned.join(',') + '|' + (P && P.specials ? owned.map(id => {
    const s = P.specials[id]; return s ? Math.ceil(s.cd * 10) : 0;
  }).join(',') : '');
  if (bar._sig === sig) return;
  bar._sig = sig;
  bar.innerHTML = '';
  for (const id of owned) {
    const def = SPECIALS[id];
    const st = P && P.specials && P.specials[id] ? P.specials[id] : { cd: 0 };
    const b = document.createElement('button');
    b.className = 'spkey' + (def.passive ? ' passive' : '') + (st.cd > 0 ? ' cooling' : '');
    b.innerHTML = def.icon + '<span class="k">' + def.key + '</span>' +
      (st.cd > 0 ? '<span class="cd">' + Math.ceil(st.cd) + '</span>' : '');
    if (!def.passive) b.onclick = () => useSpecial(id);
    b.title = def.name + '：' + def.desc;
    bar.appendChild(b);
  }
  if (!owned.length) bar.innerHTML = '<span class="spnone">还没有特殊能力 · 找镇上的人聊聊</span>';
}

/* ============================================================
   城镇绘制 —— 山谷里的小村庄
   美术参考: 层叠圆润山丘 + 草地渐变 + 弯曲小路 + emoji 房屋树木。
   注意: 这里只负责"画"。NPC 坐标、任务、对话、奖励、出口判定、
         建筑碰撞全部沿用 updateTown() 里的原逻辑, 没有改动。

   坐标约定: 冒号后带"世界"的用世界坐标(会被镜头平移/缩放);
             带"屏幕"的用屏幕坐标(固定在画面上, 拖动时不抖)。
   ============================================================ */

/* 房屋: x/y 与对应 NPC 相同, 绘制时整体上移一点,
   让"门口"正好落在 NPC 站的位置(也更接近参考图里房子在人上面的构图) */
const townBuildings = [
  { x: -175, y: -140, w: 78, h: 60, emoji: '🏡', label: '猎' },
  { x: 175, y: -140, w: 78, h: 60, emoji: '🏠', label: '炉' },
  { x: 195, y: 165, w: 70, h: 54, emoji: '🏡', label: '驿' },
  { x: -190, y: 170, w: 70, h: 54, emoji: '🏚️', label: '书' },
  { x: 0, y: -195, w: 88, h: 64, emoji: '🏠', label: '镇' },
];

const HOUSE_LIFT = 34;      // 房屋相对 NPC 上移的距离
let townSkyH = 0;           // 天空带高度(每帧算一次, 给山丘用)

/* 城镇画面缩放: 小镇世界只有 464x424, 在宽屏上会显得很小。
   宽屏最多放大 1.55 倍; 窄屏(手机)保持 1.0, 维持原本设计尺寸不缩小。
   只影响画面, 碰撞与交互仍用世界坐标。 */
function townZoom() {
  return clamp(Math.min(W / 720, H / 660), 1, 1.55);
}

/* 矮胖的小山丘(屏幕坐标): 用圆弧把尖角磨圆, 看起来软一点 */
function villageHill(top, bottom, color, phase, amp, rad) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-60, bottom);
  const n = 7, span = W + 120;
  for (let k = 0; k <= n; k++) {
    const x = -60 + (span * k) / n;
    const y = top + Math.sin(k * 1.9 + phase) * amp;
    ctx.lineTo(x, y);
    ctx.arc(x, y, rad, Math.PI, Math.PI * 1.72);
  }
  ctx.lineTo(W + 60, bottom);
  ctx.closePath();
  ctx.fill();
}

/* 弯曲的小路(世界坐标) */
function villagePath(points, width, color) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let k = 1; k + 2 < points.length; k += 2) {
    const c1 = points[k], c2 = points[k + 1], to = points[k + 2];
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], to[0], to[1]);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function townHash(n) {
  const t = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return t - Math.floor(t);
}

function drawTown() {
  const zoom = townZoom();
  const halfW = W / (2 * zoom), halfH = H / (2 * zoom);
  const left = T.x - halfW, right = T.x + halfW;
  const top = T.y - halfH, bottom = T.y + halfH;
  // 山脚线: 贴着当前视口的上缘, 这样山丘始终在"地面之后"
  const horizon = top + 30;
  townSkyH = Math.max(H * 0.20, Math.min(H * 0.34, H / 2 + (-horizon) * zoom));

  /* ---------- 1) 天空(屏幕坐标) ---------- */
  // 必须铺满整屏: 地面只画到视口下缘附近, 中间若留空会露出上一帧的残留
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#dff2f3');
  sky.addColorStop(0.45, '#eaf6e6');
  sky.addColorStop(0.80, '#cfebc9');
  sky.addColorStop(1, '#b6ddb0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  /* ---------- 2) 草地(世界坐标) ---------- */
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-T.x, -T.y);

  const gTop = horizon, gBot = bottom + 40;
  const ground = ctx.createLinearGradient(0, gTop, 0, bottom);
  ground.addColorStop(0, '#9bc783');
  ground.addColorStop(1, '#6fa56d');
  ctx.fillStyle = ground;
  ctx.fillRect(left - 60, gTop, (right - left) + 120, gBot - gTop);

  // 淡草皮格子, 避免地面是一整块纯色
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  const cx0 = Math.floor((left - 60) / 56) * 56;
  for (let x = cx0; x < right + 60; x += 56) {
    for (let y = Math.floor(gTop / 56) * 56; y < gBot; y += 56) {
      if (((x / 56) + (y / 56)) % 2 === 0) ctx.fillRect(x, y, 56, 56);
    }
  }

  /* ---------- 3) 远端地面(世界): 盖住山脚, 让山丘"只是背景" ---------- */
  ctx.fillStyle = '#a5c99c';
  ctx.fillRect(left - 80, gTop - 26, (right - left) + 160, 26);
  ctx.fillStyle = '#83b47d';
  ctx.fillRect(left - 80, gTop - 13, (right - left) + 160, 13);

  /* ---------- 4) 山丘(屏幕坐标): 山脚正好压住 gTop ---------- */
  ctx.restore();
  const hz = townSkyH;
  villageHill(hz - 96, hz + 8, '#a5c99c', 0.6, 26, 44);
  villageHill(hz - 46, hz + 8, '#83b47d', 2.1, 18, 36);

  /* ---------- 5) 世界坐标: 小路 / 花草 / 房屋 / 树木 / NPC / 玩家 ---------- */
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-T.x, -T.y);

  const MAIN = [[-210, 150], [-140, 190], [-40, 120], [0, 40], [40, -40],
                [140, -96], [210, -136]];
  villagePath(MAIN, 44, 'rgba(0,0,0,0.10)');
  villagePath(MAIN, 36, '#d9c49b');

  for (const b of townBuildings) {
    const by = b.y - HOUSE_LIFT;
    const spur = [[b.x, by + 46], [b.x - 10, by + 76], [b.x - 4, by + 100], [b.x, by + 118]];
    villagePath(spur, 11, 'rgba(0,0,0,0.08)');
    villagePath(spur, 9, '#e8d6b2');
  }

  // 花草点缀(位置来自确定性哈希, 不会闪烁)
  for (let k = 0; k < 150; k++) {
    const x = left - 30 + townHash(k) * ((right - left) + 60);
    const y = gTop + 10 + townHash(k + 977) * (gBot - gTop - 20);
    let nearHouse = false;
    for (const b of townBuildings) {
      if (Math.hypot(x - b.x, y - (b.y - HOUSE_LIFT)) < 62) { nearHouse = true; break; }
    }
    if (nearHouse) continue;
    ctx.globalAlpha = 0.5 + (k % 4) * 0.1;
    ctx.fillStyle = k % 3 ? '#f9edbb' : '#fff4df';
    ctx.beginPath();
    ctx.arc(x, y, k % 3 === 0 ? 2.5 : 1.6, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(70,120,70,0.32)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let k = 0; k < 50; k++) {
    const x = left - 20 + townHash(k + 31) * ((right - left) + 40);
    const y = gTop + 16 + townHash(k + 613) * (gBot - gTop - 30);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 2, y - 6, x + 5, y - 11);
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - 2, y - 6, x - 4, y - 9);
    ctx.stroke();
  }

  // 房屋
  for (const b of townBuildings) {
    const by = b.y - HOUSE_LIFT;
    ctx.fillStyle = 'rgba(40,70,50,0.22)';
    ctx.beginPath();
    ctx.ellipse(b.x, by + b.h * 0.42, b.w * 0.46, 9, 0, 0, TAU);
    ctx.fill();
    drawSprite(b.emoji, b.x, by, b.h * 0.94);
    const lx = b.x + b.w * 0.34, ly = by - b.h * 0.34;
    ctx.fillStyle = 'rgba(53,65,61,0.78)';
    ctx.beginPath(); ctx.arc(lx, ly, 12, 0, TAU); ctx.fill();
    ctx.font = fnt(12, 'bold');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff8e9';
    ctx.fillText(b.label, lx, ly + 0.5);
  }

  // 果树与树丛
  const trees = [
    ['🌳', -218, -30, 54], ['🌲', 222, -44, 50], ['🍎', -224, 74, 46],
    ['🌳', 216, 88, 48], ['🌲', -46, 186, 44], ['🌳', 62, 174, 42],
  ];
  for (const [emoji, x, y, size] of trees) {
    ctx.fillStyle = 'rgba(40,70,50,0.20)';
    ctx.beginPath(); ctx.ellipse(x, y + size * 0.38, size * 0.30, 7, 0, 0, TAU); ctx.fill();
    drawSprite(emoji, x, y, size);
  }

  // 南门(出口)
  const pulse = 0.5 + Math.sin(T.anim * 3) * 0.5;
  ctx.strokeStyle = 'rgba(90,180,220,' + (0.55 + pulse * 0.35) + ')';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(T.exit.x, T.exit.y, T.exit.r, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(150,225,255,' + (0.16 + pulse * 0.14) + ')';
  ctx.beginPath(); ctx.arc(T.exit.x, T.exit.y, T.exit.r, 0, TAU); ctx.fill();
  drawSprite('🚪', T.exit.x, T.exit.y, 34);
  ctx.font = fnt(11, 'bold');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(30,50,40,0.75)'; ctx.lineWidth = 3;
  ctx.strokeText('离开小镇', T.exit.x, T.exit.y + T.exit.r + 13);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('离开小镇', T.exit.x, T.exit.y + T.exit.r + 13);

  // 村民
  for (const npc of NPCS) {
    const st = townNpcState(npc);
    const here = T.near === npc;
    const bob = Math.sin(T.anim * 2.4 + npc.x * 0.05) * 2.2;

    ctx.fillStyle = 'rgba(40,70,50,0.28)';
    ctx.beginPath(); ctx.ellipse(npc.x, npc.y + 17, 11, 4, 0, 0, TAU); ctx.fill();

    if (here) {
      const pl = 0.5 + Math.sin(T.anim * 6) * 0.5;
      ctx.strokeStyle = 'rgba(255,196,86,' + (0.6 + pl * 0.4) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(npc.x, npc.y + bob, 27 + pl * 3, 0, TAU); ctx.stroke();
    }
    drawSprite(npc.emoji, npc.x, npc.y + bob, 38);

    let mark = null, col = '#ffd76a';
    if (!st) mark = '❗';
    else if (st.done && !st.claimed) { mark = '✅'; col = '#4ade80'; }
    if (mark) {
      ctx.font = fnt(17, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(npc.x + 20, npc.y - 24, 10.5, 0, TAU); ctx.fill();
      ctx.fillStyle = col; ctx.fillText(mark, npc.x + 20, npc.y - 23);
    }

    // 名牌: 绿色药丸底 + 白字(参考图里村民名签的做法)
    ctx.font = fnt(11, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(npc.name).width;
    const pw = tw + 14, ph = 17, py = npc.y + 30;
    ctx.fillStyle = 'rgba(63,101,87,0.82)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(npc.x - pw / 2, py - ph / 2, pw, ph, 9);
    else ctx.rect(npc.x - pw / 2, py - ph / 2, pw, ph);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(npc.name, npc.x, py + 0.5);
  }

  // 玩家
  ctx.fillStyle = 'rgba(40,70,50,0.30)';
  ctx.beginPath(); ctx.ellipse(T.x, T.y + 16, 12, 4, 0, 0, TAU); ctx.fill();
  drawSprite('🧙', T.x, T.y, 38);

  ctx.restore();

  /* ---------- 6) 阳光、云、薄雾(屏幕坐标) ---------- */
  const sunX = W * 0.85, sunY = Math.max(38, townSkyH * 0.30), sunR = Math.min(W, H) * 0.052;
  const halo = ctx.createRadialGradient(sunX, sunY, sunR * 0.4, sunX, sunY, sunR * 4.2);
  halo.addColorStop(0, 'rgba(255,236,166,0.85)');
  halo.addColorStop(0.35, 'rgba(255,236,166,0.22)');
  halo.addColorStop(1, 'rgba(255,236,166,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(sunX - sunR * 4.2, sunY - sunR * 4.2, sunR * 8.4, sunR * 8.4);
  ctx.fillStyle = '#ffda7b';
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, TAU); ctx.fill();

  const drift = Math.sin(T.anim * 0.18) * 0.5 + 0.5;
  ctx.globalAlpha = 0.72;
  ctx.font = fnt(Math.round(Math.min(W, H) * 0.070));
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('☁️', W * (0.12 + drift * 0.05), Math.max(30, townSkyH * 0.30));
  ctx.fillText('☁️', W * (0.58 + drift * 0.09), Math.max(24, townSkyH * 0.17));
  ctx.globalAlpha = 1;

  const mist = ctx.createLinearGradient(0, townSkyH - 8, 0, townSkyH + 54);
  mist.addColorStop(0, 'rgba(255,255,255,0.28)');
  mist.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, townSkyH - 8, W, 62);

  /* ---------- 7) 标题与提示(屏幕坐标)
     顶部被 DOM 的 HUD 占着(经验条 / 统计 / 特殊技能图标), 窄屏上会和标题重叠。
     所以先量出 HUD 实际占用的矩形, 再把文字放进空档; 放不下就整体下移。 ---------- */
  // 顶部文字平时交给 DOM 的 #townBar(不会和技能图标打架);
  // 万一 townBar 不在(结构变动), 才在画布上兜底画一次。
  if (!hudRect('townBar')) drawTownTopText();
}

/* 量一个 DOM 元素在屏幕坐标里的矩形(取不到或不可见就返回 null) */
function hudRect(id) {
  if (typeof document === 'undefined' || !document.getElementById) return null;
  const e = document.getElementById(id);
  if (!e || typeof e.getBoundingClientRect !== 'function') return null;
  const r = e.getBoundingClientRect();
  if (!r || r.width <= 0 || r.height <= 0) return null;
  if (e.classList && e.classList.contains && e.classList.contains('hidden')) return null;
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
}

/* 真正会挡住字的东西: 经验条那一片、右上角统计与技能、以及提示 toast */
function hudBlockers() {
  const out = [];
  for (const id of ['expwrap', 'stats', 'hudSpecials', 'petbar']) {
    const r = hudRect(id);
    if (r) out.push(r);
  }
  // #hud 里也可能有没包住的按钮(音效/暂停)
  const btn = hudRect('btnAudio') || hudRect('btnPause');
  if (btn) out.push({ top: btn.top - 2, bottom: btn.bottom + 2, left: btn.left - 2, right: btn.right + 2 });

  // toast: #toast 有淡出动画, 正在淡出(opacity<0.1)就不算
  const tEl = (typeof document !== 'undefined' && document.getElementById)
    ? document.getElementById('toast') : null;
  if (tEl && typeof tEl.getBoundingClientRect === 'function') {
    const op = parseFloat((tEl.style && tEl.style.opacity) || '0');
    if (!(op >= 0 && op < 0.1)) {
      const tr = tEl.getBoundingClientRect();
      if (tr && tr.height > 0) out.push({ top: tr.top - 4, bottom: tr.bottom + 4, left: tr.left - 4, right: tr.right + 4 });
    }
  }
  return out;
}

/* 居中的一条药丸: 返回它占的矩形 */
function pillBox(cx, cy, w, h) {
  return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 };
}
function boxHits(box, blockers) {
  for (const b of blockers) {
    if (!(box.right < b.left || box.left > b.right || box.bottom < b.top || box.top > b.bottom)) return true;
  }
  return false;
}

function drawTownTopText() {
  const cx = W / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  const small = W < 560;
  const titleSize = small ? 12.5 : 15;
  const tipSize = small ? 10 : 11;
  const titleText = '🌿 回声小镇 · 山谷里的村庄';
  const tipText = '拖动屏幕移动　靠近 NPC 按 F 交谈　南门离开';

  ctx.font = fnt(titleSize, 'bold');
  const titleW = ctx.measureText(titleText).width + (small ? 24 : 34);
  const titleH = small ? 24 : 30;
  ctx.font = fnt(tipSize);
  const tipW = ctx.measureText(tipText).width + (small ? 18 : 22);
  const tipH = small ? 19 : 22;

  const blockers = hudBlockers();

  /* 先试: 两行都放在最上面一行的空档里(左有经验条, 右有统计/技能)。
     提示比标题宽, 所以以提示的宽度判断能不能塞进空档。 */
  let titleY = -1, tipY = -1;

  // 空档 = 左边 HUD 的右缘 与 右上角 HUD 的左缘 之间
  let gapL = 0, gapR = W;
  for (const b of blockers) {
    if (b.top < 48 && b.bottom > 0) {          // 只算屏幕顶部那一行的
      if (b.left < W * 0.5) gapL = Math.max(gapL, b.right);
      else gapR = Math.min(gapR, b.left);
    }
  }
  const fits = (gapR - gapL) >= Math.max(titleW, tipW) + 8;
  if (fits) {
    const t1 = small ? 24 : 30;
    const s1 = t1 + titleH / 2 + 3 + tipH / 2;
    if (!boxHits(pillBox(cx, t1, titleW, titleH), blockers) &&
        !boxHits(pillBox(cx, s1, tipW, tipH), blockers)) {
      titleY = t1; tipY = s1;
    }
  }

  /* 塞不下(手机竖屏): 从上往下找一个不重叠的位置 */
  if (titleY < 0) {
    let y = (small ? 20 : 26) + titleH / 2;
    const maxY = H - 40 - tipH;
    for (let guard = 0; guard < 60; guard++) {
      const tb = pillBox(cx, y, titleW, titleH);
      const sb = pillBox(cx, y + titleH / 2 + 3 + tipH / 2, tipW, tipH);
      if (!boxHits(tb, blockers) && !boxHits(sb, blockers)) break;
      y += stepTowardNextBlocker(cx, y, Math.max(titleW, tipW), blockers);
      if (y > maxY) { y = maxY; break; }
    }
    titleY = y;
    tipY = y + titleH / 2 + 3 + tipH / 2;
  }

  /* 标题 */
  ctx.font = fnt(titleSize, 'bold');
  ctx.fillStyle = 'rgba(255,248,233,0.90)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - titleW / 2, titleY - titleH / 2, titleW, titleH, titleH / 2);
  else ctx.rect(cx - titleW / 2, titleY - titleH / 2, titleW, titleH);
  ctx.fill();
  ctx.fillStyle = '#3b5545';
  ctx.fillText(titleText, cx, titleY + 0.5);

  /* 操作提示 */
  ctx.font = fnt(tipSize);
  ctx.fillStyle = 'rgba(255,248,233,0.78)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - tipW / 2, tipY - tipH / 2, tipW, tipH, tipH / 2);
  else ctx.rect(cx - tipW / 2, tipY - tipH / 2, tipW, tipH);
  ctx.fill();
  ctx.fillStyle = '#3d5a4c';
  ctx.fillText(tipText, cx, tipY + 0.5);
}

/* 当前位置撞上了障碍, 一步跨到该障碍下方(没有则跨 12px) */
function stepTowardNextBlocker(cx, y, w, blockers) {
  const box = pillBox(cx, y, w, 30);
  let best = Infinity;
  for (const b of blockers) {
    const overlapX = !(box.right < b.left || box.left > b.right);
    if (overlapX && b.bottom > box.top) best = Math.min(best, b.bottom);
  }
  if (!isFinite(best)) return 12;
  return Math.max(6, best + 6 - (y - 15));
}

/* ---------------- 主地图上的黑洞绘制与指示 ---------------- */
function drawBlackHole() {
  if (!G.bh || !G.bh.portal) return;
  const p = G.bh.portal;
  const pulse = 0.5 + Math.sin(p.spin * 2.2) * 0.5;
  const fading = p.life < 20 ? (0.35 + 0.65 * Math.abs(Math.sin(p.life * 3))) : 1;

  ctx.save();
  ctx.globalAlpha = fading;
  // 引力涟漪
  for (let i = 3; i >= 1; i--) {
    ctx.strokeStyle = 'rgba(160,110,255,' + (0.10 + pulse * 0.10) * (4 - i) / 3 + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, BH_ENTER_RADIUS + i * 22 + pulse * 8, 0, TAU);
    ctx.stroke();
  }
  // 事件视界
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, BH_ENTER_RADIUS);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.62, 'rgba(40,10,70,0.95)');
  g.addColorStop(0.86, 'rgba(150,80,255,' + (0.55 + pulse * 0.3) + ')');
  g.addColorStop(1, 'rgba(120,60,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(p.x, p.y, BH_ENTER_RADIUS, 0, TAU); ctx.fill();
  // 吸积盘
  ctx.strokeStyle = 'rgba(220,180,255,' + (0.5 + pulse * 0.4) + ')';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, BH_ENTER_RADIUS * 1.5, BH_ENTER_RADIUS * 0.42, p.spin, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // 文字提示
  ctx.save();
  ctx.globalAlpha = fading;
  ctx.font = fnt(12, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
  const tip = '走进去 · ' + Math.ceil(p.life) + 's 后消散';
  ctx.strokeText(tip, p.x, p.y + BH_ENTER_RADIUS + 20);
  ctx.fillStyle = '#d9b8ff';
  ctx.fillText(tip, p.x, p.y + BH_ENTER_RADIUS + 20);
  ctx.restore();
}

/* 黑洞在屏幕外时, 边缘给出醒目的紫色指引(比精英怪的红色箭头更大更亮) */
function drawBlackHoleIndicator() {
  if (!G.bh || !G.bh.portal || !P) return;
  const p = G.bh.portal;
  const sx = p.x - P.x + W / 2, sy = p.y - P.y + H / 2;
  const margin = 64;
  if (sx > margin && sx < W - margin && sy > margin && sy < H - margin) return;
  const cx = W / 2, cy = H / 2;
  const a = Math.atan2(sy - cy, sx - cx);
  const halfW = W / 2 - margin, halfH = H / 2 - margin;
  const cosA = Math.cos(a), sinA = Math.sin(a);
  const scale = Math.abs(cosA) * halfH > Math.abs(sinA) * halfW
    ? Math.abs(halfW / (cosA || 1e-6)) : Math.abs(halfH / (sinA || 1e-6));
  const ax = cx + cosA * scale, ay = cy + sinA * scale;
  const pulse = 0.5 + Math.sin(G.time * 5) * 0.5;
  const dist = Math.round(Math.hypot(p.x - P.x, p.y - P.y) / 10);

  ctx.save();
  // 脉冲光晕, 让它一眼就能看见
  ctx.globalAlpha = 0.22 + pulse * 0.22;
  const halo = ctx.createRadialGradient(ax, ay, 0, ax, ay, 46 + pulse * 10);
  halo.addColorStop(0, 'rgba(190,130,255,0.95)');
  halo.addColorStop(1, 'rgba(160,110,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(ax, ay, 46 + pulse * 10, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // 箭头: 大号 + 白色描边 + 轻微脉冲, 在纯黑背景上很扎眼
  ctx.save();
  ctx.globalAlpha = 0.7 + pulse * 0.3;
  ctx.translate(ax, ay); ctx.rotate(a);
  const beat = 1 + pulse * 0.18;          // 呼吸式缩放
  ctx.scale(beat, beat);
  ctx.shadowColor = '#c79bff'; ctx.shadowBlur = 18;
  ctx.fillStyle = '#c79bff';
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';   // 白色描边, 更容易看清
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(-12, -15); ctx.lineTo(-12, 15); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // 标签: 黑洞 + 距离(往屏幕内侧偏移, 避免被切掉)
  const tx = ax - Math.cos(a) * 44, ty = ay - Math.sin(a) * 44;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = fnt(14, 'bold');
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.92)';
  ctx.strokeText('黑洞', tx, ty);
  ctx.fillStyle = pulse > 0.5 ? '#e8d4ff' : '#c79bff';
  ctx.fillText('黑洞', tx, ty);
  ctx.font = fnt(11, 'bold'); ctx.lineWidth = 3;
  ctx.strokeText(dist + 'm', tx, ty + 16);
  ctx.fillStyle = '#d9b8ff';
  ctx.fillText(dist + 'm', tx, ty + 16);
  ctx.restore();
}

/* ---------------- 城镇里的特殊能力条刷新(有冷却时每帧更新) ---------------- */
function updateHudSpecials() {
  if (G.state === 'town' || G.state === 'playing') syncSpecialBars();
}

/* ============================================================
   图鉴的"已遇到"记录
   ============================================================ */

/* 记录见过的怪物 / 宠物, 供主菜单图鉴使用 */
function markSeen(kind, id) {
  if (!id) return;
  ensureSaveSlots();
  const key = kind === 'enemy' ? 'seenEnemies' : 'seenPets';
  const list = SAVE[key] || (SAVE[key] = []);
  if (list.indexOf(id) < 0) { list.push(id); writeSave(); }
}

function seenList(kind) {
  ensureSaveSlots();
  const list = SAVE[kind === 'enemy' ? 'seenEnemies' : 'seenPets'];
  return Array.isArray(list) ? list : [];
}

/* 兼容老存档: 已经解锁或正在出战的宠物, 视为已见过 */
function backfillSeenPets() {
  if (!P || !P.pets) return;
  let changed = false;
  ensureSaveSlots();
  const list = SAVE.seenPets || (SAVE.seenPets = []);
  for (const p of P.pets) {
    if (p && p.id && list.indexOf(p.id) < 0) { list.push(p.id); changed = true; }
  }
  if (changed) writeSave();
}

/* ============================================================
   图鉴 / codex
   只显示已经遇到过的宠物与怪物; 没遇到的只留一个空框
   ============================================================ */

/* 图鉴里面板与卡片是动态生成的; 小地图样式只在有元素时才注入 */
function codexEnsureStyle() {
  if (document.getElementById('codexStyle')) return;
  const st = document.createElement('style');
  st.id = 'codexStyle';
  st.textContent = '.codexmini{display:block;font-size:10px;opacity:.55;margin-top:1px}';
  document.head.appendChild(st);
}

function openCodex() {
  G._codexPrev = G.state;
  G.state = 'codex';
  renderCodex();
  el('codex').classList.remove('hidden');
}

function closeCodex() {
  el('codex').classList.add('hidden');
  G.state = G._codexPrev === 'playing' ? 'playing' : 'menu';
  G._codexPrev = null;
}

function codexItem(emoji, name, sub, cls, seenId, kind) {
  const seen = seenId === null || seenList(kind).indexOf(seenId) >= 0;
  const d = document.createElement('div');
  d.className = 'codexitem' + (cls ? ' ' + cls : '') + (seen ? '' : ' locked');
  if (seen) {
    d.innerHTML = '<div class="ce">' + emoji + '</div>' +
                  '<div class="cn">' + name + '</div>' +
                  '<div class="cs">' + sub + '</div>';
    if (seenId !== null) d.onclick = () => codexDetail(kind, seenId);
  } else {
    d.innerHTML = '<div class="ce">❓</div><div class="cn">???</div><div class="cs">尚未遇到</div>';
  }
  return d;
}

function codexSection(parent, title, hint) {
  const h = document.createElement('div');
  h.className = 'codexsec';
  h.innerHTML = title + (hint ? '<span>' + hint + '</span>' : '');
  parent.appendChild(h);
  const grid = document.createElement('div');
  grid.className = 'codexgrid';
  parent.appendChild(grid);
  return grid;
}

function renderCodex() {
  codexEnsureStyle();
  const body = el('codexBody');
  if (!body) return;
  body.innerHTML = '';

  // 图鉴只收怪物(宠物在"宠物蛋"里已有自己的图鉴)
  // 普通怪 = ENEMY_TYPES 里非 elite 的; 精英 = ELITE_TYPES 全部
  const normal = Object.keys(ENEMY_TYPES).filter(k => !ENEMY_TYPES[k].elite);
  const elites = ELITE_TYPES.map(d => d.id);
  const seenE = seenList('enemy');
  const cntN = normal.filter(k => seenE.indexOf(k) >= 0).length;
  const cntL = elites.filter(k => seenE.indexOf(k) >= 0).length;
  const total = normal.length + elites.length;
  el('codexProg').innerHTML =
    '已记录 <b>' + (cntN + cntL) + ' / ' + total + '</b>' +
    '　（普通 ' + cntN + '/' + normal.length + '　·　精英 ' + cntL + '/' + elites.length + '）' +
    '<br><span style="opacity:.7">遇到过的才会点亮，没遇到的只留一个空框</span>';

  // 普通怪物
  const g1 = codexSection(body, '普通怪物', '共 ' + normal.length + ' 种');
  for (const k of normal) {
    const t = ENEMY_TYPES[k];
    const label = k === 'normal' ? '基础近战'
      : t.ranged ? '远程射手' : t.explode ? '自爆单位'
      : k === 'tank' ? '重装坦克' : k === 'fast' ? '高速突进' : k === 'swarm' ? '群体虫潮' : '近战';
    g1.appendChild(codexItem(t.sprite, k, label, 'enemy', k, 'enemy'));
  }

  // 精英怪物
  const g2 = codexSection(body, '精英怪物', '共 ' + elites.length + ' 种 · 每 10 级刷新');
  for (const id of elites) {
    const d = eliteDefOf(id);
    g2.appendChild(codexItem(d.sprite, d.name, '精英', 'enemy elite', id, 'enemy'));
  }

  codexDetail('enemy', normal.find(k => seenE.indexOf(k) >= 0) || null);
}

/* 判断一个 id 是不是精英类型(shadow/yokai/... 而不是普通怪) */
function isEliteId(id) {
  return ELITE_TYPES.some(d => d.id === id);
}

function codexDetail(kind, id) {
  const box = el('codexDetail');
  if (!box) return;
  if (!id) {
    box.innerHTML = '<div class="cdname">点击卡片查看详情</div>' +
      '<div class="cdrow">先去遇到它们，图鉴里才会点亮。</div>';
    return;
  }
  if (kind === 'pet') {
    const p = PETS[id];
    if (!p) return;
    box.innerHTML = '<div class="cdname">' + p.emoji + ' ' + p.name + ' · <span class="cdskill">' + p.skill + '</span></div>' +
      '<div class="cdrow">' + p.desc + '</div>' +
      '<div class="cdrow" style="color:#ffb347;margin-top:3px">🐾 变异：' + p.mutText + '</div>';
  } else if (isEliteId(id)) {
    // 精英: 数值 = 基准值 × 该类型的倍率; 简介用 ELITE_TYPES 里的 desc
    const d = eliteDefOf(id);
    const b = ENEMY_TYPES.elite;
    const r1 = (v) => Math.round(v * 10) / 10;
    box.innerHTML = '<div class="cdname">' + d.sprite + ' ' + d.name + ' · <span class="cdskill">精英怪</span></div>' +
      '<div class="cdrow">生命 ' + Math.round(b.hp * d.hpMul) + '（×' + d.hpMul.toFixed(2) + '）' +
      '　速度 ' + r1(b.speed * d.spdMul) + '（×' + d.spdMul.toFixed(2) + '）</div>' +
      '<div class="cdrow" style="margin-top:2px">接触伤害 ' + Math.round(b.dmg * d.dmgMul) +
      '（×' + d.dmgMul.toFixed(2) + '）　体型 ×' + d.rMul.toFixed(2) + '</div>' +
      '<div class="cdrow" style="color:#ffb347;margin-top:3px">✦ ' + d.desc + '</div>' +
      '<div class="cdrow" style="color:#9aa4b2;margin-top:2px">每 10 级随机刷出一种；击杀后小怪永久强化</div>';
  } else {
    const t = ENEMY_TYPES[id];
    if (!t) return;
    box.innerHTML = '<div class="cdname">' + t.sprite + ' ' + (t.elite ? '精英怪' : id) + '</div>' +
      '<div class="cdrow">生命 ' + t.hp + '　速度 ' + t.speed + '　接触伤害 ' + t.dmg + '　经验 ' + t.exp + '</div>' +
      '<div class="cdrow" style="margin-top:3px">' +
      (t.elite ? '每 10 级刷新一只；击杀后小怪永久强化，并解锁新的小怪种类'
               : (t.ranged ? '保持距离发射子弹' :
                  t.explode ? '贴近后自爆，死亡时造成范围伤害' :
                  id === 'tank' ? '血量与伤害都很高的重装单位' :
                  id === 'fast' ? '移动极快的突进单位' :
                  id === 'swarm' ? '血量很低但数量众多的群体单位' : '最基础的近战单位')) +
      '</div>';
  }
}

/* 说明: canvas 字体助手 fnt() / CANVAS_FONT_FAMILY 由 js/render.js 提供,
   本文件直接用即可(不再重复声明, 否则 const 重复声明会报错)。 */

/* ============================================================
   精英怪特性 / elite traits
   各种精英的独有机制集中在这里, 由 game.js 的 updateEnemies 每帧调用。
   放在本文件是为了避开对那段冲锋逻辑的字符串改写(容易与其它补丁冲突)。
   ============================================================ */
function updateEliteTraits(e, dt, dx, dy, dist) {
  if (!e.elite || !e.eliteTrait) return;
  const t = e.eliteTrait;

  // 吸血鬼: 持续汲取生命
  if (t === 'lifesteal') {
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.012 * dt);
  }

  // 霸王龙: 周期性咆哮, 加速周围小怪
  if (t === 'roar') {
    if (typeof e.roarCd !== 'number') e.roarCd = 4;
    if (cdTick(e, 'roarCd', dt) <= 0) {
      e.roarCd = 9;
      effects.push({ kind: 'ring', x: e.x, y: e.y, life: 0.6, max: 0.6, r: 260, col: '#ff8c42' });
      G.shake = Math.max(G.shake, 7);
      sfx('elite');
      for (const o of enemies) { if (!o.dead && !o.elite) o.speed *= 1.12; }
      toast('🦖 ' + e.name + ' 咆哮了，小怪变快！');
    }
  }

  // 幽魂: 远程吐息冰弹(命中减速)
  // 注意: 不能写 (e.shootCd || 1.5) —— 0 || 1.5 === 1.5, 冷却会永远归不到零
  if (t === 'frostshot') {
    if (typeof e.shootCd !== 'number') e.shootCd = 1.5;
    if (cdTick(e, 'shootCd', dt) <= 0 && dist < 700) {
      e.shootCd = 3.2;
      const fa = Math.atan2(dy, dx);
      eBullets.push({
        x: e.x, y: e.y, vx: Math.cos(fa) * 250, vy: Math.sin(fa) * 250,
        r: 9, dmg: e.dmg * 0.7, life: 4, sprite: '❄️', chill: true,
      });
    }
  }

  // 树妖: 周身毒雾, 靠近持续掉血
  if (t === 'poison') {
    e.poisonTick = (e.poisonTick || 0) - dt;
    if (e.poisonTick <= 0) {
      e.poisonTick = 0.5;
      if (dist < e.r + 130) {
        damagePlayer(e.dmg * 0.22);
        effects.push({ kind: 'ring', x: e.x, y: e.y, life: 0.45, max: 0.45, r: e.r + 130, col: '#8ef07a' });
      }
    }
  }

  // 妖怪: 飘忽闪现, 瞬移到你附近再扑上来
  if (t === 'trick') {
    if (typeof e.blinkCd !== 'number') e.blinkCd = 3;
    if (cdTick(e, 'blinkCd', dt) <= 0 && dist > 120) {
      e.blinkCd = 5;
      const a = Math.random() * TAU;
      effects.push({ kind: 'ring', x: e.x, y: e.y, life: 0.35, max: 0.35, r: e.r + 20, col: '#c99cff' });
      e.x = P.x + Math.cos(a) * 150;
      e.y = P.y + Math.sin(a) * 150;
      effects.push({ kind: 'ring', x: e.x, y: e.y, life: 0.35, max: 0.35, r: e.r + 20, col: '#c99cff' });
      sfx('mut');
    }
  }

  // 毛怪: 被打中后有机会把你冻住一小会(hurtEnemy 里留下 _hitFlag)
  if (t === 'slowhit' && e._hitFlag) {
    e._hitFlag = false;
    if (Math.random() < 0.25) {
      P.slowT = Math.max(P.slowT || 0, 1.6);
      effects.push({ kind: 'ring', x: P.x, y: P.y, life: 0.4, max: 0.4, r: 44, col: '#cfe8ff' });
    }
  }
}

/* ============================================================
   黑洞相关的调试入口(供 js/debug-cmds.js 挂到 window)
   ============================================================ */

/* 立刻召唤一个黑洞(走正常生成流程, 距离/寿命与正式玩法一致) */
function debugSpawnBlackHole() {
  if (!P) { console.warn('先点「无尽模式」开始游戏, 再执行这条命令'); return null; }
  G.bh = G.bh || { timer: null, portal: null, townReturn: false, announced: false };
  G.bh.announced = true;   // 跳过"3 个技能且 1 个到 3 级"的条件
  G.bh.portal = null;      // 清掉旧的, 让主循环立刻重新生成
  G.bh.timer = 0;
  return '下一帧会在你附近生成黑洞';
}

/* 直接传送到黑洞旁边(等它生成后一步进城) */
function debugGotoBlackHole() {
  if (!P) { console.warn('先点「无尽模式」开始游戏, 再执行这条命令'); return null; }
  if (!G.bh || !G.bh.portal) debugSpawnBlackHole();
  let tries = 0;
  const wait = () => {
    if (G.bh && G.bh.portal) { P.x = G.bh.portal.x; P.y = G.bh.portal.y; return; }
    if (++tries < 30) setTimeout(wait, 16);
  };
  wait();
  return '正在传送到黑洞…';
}
