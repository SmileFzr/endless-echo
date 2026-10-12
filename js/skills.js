/* ============================================================
   技能与属性配置表 / skills & passives
   无尽回响 Endless Echo
   ============================================================ */

/* ---------- 技能 ---------- */
const SKILLS = {
  homing: { name:'追踪弹', icon:'🎯', tag:'追踪', col:'#5cc8ff',
    cd: s => Math.max(0.34, 1.6 - 0.09 * s.lv),
    info: s => `伤害 ${Math.round(6 + 4 * s.lv)} · 数量 ${1 + Math.floor(s.lv / 2)}`,
    muts: [{ name:'裂变', desc:'命中后分裂为 3 枚小弹，各造成 50% 伤害' }, { name:'超载', desc:'伤害 +80%，弹速 +50%，体积增大' }],
    fire(s) { const n = 1 + Math.floor(s.lv / 2), dmg = (6 + 4 * s.lv) * P.dmgMult, over = s.mut === 'overload';
      for (let i = 0; i < n; i++) { const t = nearestEnemy(P.x, P.y); const a = t ? Math.atan2(t.y - P.y, t.x - P.x) : Math.random() * TAU; const sp = over ? 480 : 320;
        bullets.push({ kind:'homing', x:P.x, y:P.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, r:over?9:6, size:over?26:18, dmg:dmg*(over?1.8:1), life:3.5, sprite:'🔵', mut:s.mut, hits:0, maxHits:1, turn:over?7:6 }); }
    }
  },
  rocket: { name:'火箭炮', icon:'🚀', tag:'范围', col:'#ff8a4c',
    cd: s => Math.max(0.95, 3.0 - 0.15 * s.lv),
    info: s => `伤害 ${Math.round(12 + 8 * s.lv)} · 爆炸半径 ${Math.round(60 + 3 * s.lv)}`,
    muts: [{ name:'弹跳', desc:'爆炸后弹向最近敌人再炸一次，最多弹 2 次' }, { name:'集束', desc:'一次发射 3 枚火箭，扇形散开' }],
    fire(s) { const dmg = (12 + 8 * s.lv) * P.dmgMult, rad = 60 + 3 * s.lv; const cluster = s.mut === 'cluster', n = cluster ? 3 : 1;
      const t = nearestEnemy(P.x, P.y); const base = t ? Math.atan2(t.y - P.y, t.x - P.x) : Math.random() * TAU;
      for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.34;
        bullets.push({ kind:'rocket', x:P.x, y:P.y, vx:Math.cos(a)*300, vy:Math.sin(a)*300, r:8, size:22, dmg, rad, life:2.6, sprite:'🚀', mut:s.mut, bounces:s.mut === 'bounce' ? 2 : 0 }); }
    }
  },
  bomb: { name:'炸弹', icon:'💣', tag:'范围', col:'#ff5f6d',
    cd: s => Math.max(0.75, 2.5 - 0.12 * s.lv),
    info: s => `伤害 ${Math.round(16 + 9 * s.lv)} · 半径 ${Math.round(65 + 2.5 * s.lv)}`,
    muts: [{ name:'连锁', desc:'爆炸会引爆范围内其他炸弹' }, { name:'雷区', desc:'炸弹落地即爆，范围 +40%' }],
    fire(s) { const n = 1 + Math.floor(s.lv / 4); const dmg = (16 + 9 * s.lv) * P.dmgMult; const rad = (65 + 2.5 * s.lv) * (s.mut === 'mine' ? 1.4 : 1); const instant = s.mut === 'mine';
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, d = rnd(40, 200);
        bullets.push({ kind:'bomb', x:P.x+Math.cos(a)*d, y:P.y+Math.sin(a)*d, vx:0, vy:0, r:9, size:22, dmg, rad, life:instant?0.12:1.1, sprite:'💣', mut:s.mut, exploded:false }); }
    }
  },
  sword: { name:'飞剑', icon:'🗡️', tag:'穿透', col:'#a8e6ff',
    cd: s => Math.max(0.38, 1.4 - 0.07 * s.lv),
    info: s => `伤害 ${Math.round(9 + 5 * s.lv)} · 穿透 ${3 + Math.floor(s.lv / 2)}`,
    muts: [{ name:'剑阵', desc:'命中后留在原地旋转 2 秒' }, { name:'巨剑', desc:'体积翻倍，伤害 +60%，穿透无限' }],
    fire(s) { const n = 1 + Math.floor(s.lv / 4); const dmg = (9 + 5 * s.lv) * P.dmgMult, giant = s.mut === 'giant';
      const t = nearestEnemy(P.x, P.y); const base = t ? Math.atan2(t.y - P.y, t.x - P.x) : Math.random() * TAU;
      for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.3;
        bullets.push({ kind:'sword', x:P.x, y:P.y, vx:Math.cos(a)*520, vy:Math.sin(a)*520, r:giant?20:11, size:giant?44:24, dmg:dmg*(giant?1.6:1), life:giant?1.3:0.95, sprite:'🗡️', rot:a+Math.PI/2, pierce:giant?999:(3+Math.floor(s.lv/2)), hitIds:[], mut:s.mut }); }
    }
  },
  boomerang: { name:'回旋镖', icon:'🪃', tag:'穿透', col:'#ffe08a',
    cd: s => Math.max(0.7, 2.2 - 0.1 * s.lv),
    info: s => `伤害 ${Math.round(8 + 4.5 * s.lv)} · 数量 ${1 + Math.floor(s.lv / 5)}`,
    muts: [{ name:'永旋', desc:'永久环绕玩家旋转，伤害 +30%' }, { name:'巨型', desc:'体积 +100%，伤害 +80%' }],
    fire(s) { const n = 1 + Math.floor(s.lv / 5); const giant = s.mut === 'giant', eternal = s.mut === 'eternal';
      const dmg = (8 + 4.5 * s.lv) * P.dmgMult * (giant?1.8:1) * (eternal?1.3:1);
      for (let i = 0; i < n; i++) { const a = eternal ? (i / n) * TAU : Math.random() * TAU;
        bullets.push({ kind:'boom', x:P.x, y:P.y, vx:0, vy:0, r:giant?26:13, size:giant?52:26, dmg, life:eternal?9999:3.5, sprite:'🪃', mut:s.mut, phase:0, startA:a, orbitA:a, hitIds:[], rot:0, orbitR:110, orbitSpd:2.6 }); }
    }
  },
  lightning: { name:'雷劈', icon:'⚡', tag:'锁敌', col:'#ffe66d',
    cd: s => Math.max(0.55, 2.0 - 0.1 * s.lv),
    info: s => `伤害 ${Math.round(12 + 7 * s.lv)} · 落雷 ${2 + Math.floor(s.lv / 2)} 道`,
    muts: [{ name:'雷暴', desc:'落雷频率翻倍，单次伤害 -20%' }, { name:'静电', desc:'被劈中的敌人向 70 范围传导 50% 伤害' }],
    fire(s) { const storm = s.mut === 'storm'; const n = (2 + Math.floor(s.lv / 2)) * (storm ? 2 : 1);
      const dmg = (12 + 7 * s.lv) * P.dmgMult * (storm ? 0.8 : 1);
      const targets = randomEnemies(n);
      if (targets.length === 0) { effects.push({ kind:'bolt', x:P.x+rnd(-150,150), y:P.y+rnd(-150,150), life:0.25, max:0.25 }); return; }
      for (const e of targets) { effects.push({ kind:'bolt', x:e.x, y:e.y, life:0.22, max:0.22, r:42 + 2 * s.lv }); aoeDamage(e.x, e.y, 42 + 2 * s.lv, dmg);
        if (s.mut === 'static') { aoeDamage(e.x, e.y, 70, dmg * 0.5, e); effects.push({ kind:'staticRing', x:e.x, y:e.y, life:0.4, max:0.4, r:70 }); } }
    }
  },
  raincloud: { name:'雨云', icon:'🌧️', tag:'锁敌', col:'#8ab4ff',
    cd: s => Math.max(1.4, 4.0 - 0.15 * s.lv),
    info: s => `持续 ${Math.round(6 + 3.5 * s.lv)}/秒 · 半径 ${Math.round(70 + 3 * s.lv)}`,
    muts: [{ name:'酸雨', desc:'范围内敌人受到的所有伤害 +30%' }, { name:'追猎云', desc:'雨云缓慢追踪敌人，持续 +100%' }],
    fire(s) { const hunt = s.mut === 'hunt'; const targets = randomEnemies(2), n = Math.max(1, targets.length);
      for (let i = 0; i < n; i++) { const t = targets[i]; const x = t ? t.x : P.x + rnd(-200, 200), y = t ? t.y : P.y + rnd(-200, 200);
        effects.push({ kind:'rain', x, y, life:(3 + 0.2 * s.lv) * (hunt ? 2 : 1), max:(3 + 0.2 * s.lv) * (hunt ? 2 : 1), r:70 + 3 * s.lv, dps:(6 + 3.5 * s.lv) * P.dmgMult, tick:0, mut:s.mut, sprite:'🌧️' }); }
    }
  },
  talisman: { name:'飞符', icon:'🔮', tag:'锁敌', col:'#c99cff',
    cd: s => Math.max(0.5, 1.8 - 0.08 * s.lv),
    info: s => `伤害 ${Math.round(10 + 6 * s.lv)} · 数量 ${2 + Math.floor(s.lv / 2)}`,
    muts: [{ name:'万符阵', desc:'飞符数量翻倍' }, { name:'符爆', desc:'命中后产生范围爆炸' }],
    fire(s) { const many = s.mut === 'many'; const n = (2 + Math.floor(s.lv / 2)) * (many ? 2 : 1);
      const dmg = (10 + 6 * s.lv) * P.dmgMult;
      for (let i = 0; i < n; i++) { const t = nearestEnemy(P.x, P.y); const a = t ? Math.atan2(t.y - P.y, t.x - P.x) + rnd(-0.5, 0.5) : Math.random() * TAU;
        bullets.push({ kind:'tal', x:P.x, y:P.y, vx:Math.cos(a)*380, vy:Math.sin(a)*380, r:8, size:20, dmg, life:2.0, sprite:'🔮', mut:s.mut, rot:0, hitIds:[] }); }
    }
  },
  immovable: { name:'不动明王', icon:'🧘', tag:'站桩', col:'#7ef7c8', passive: true,
    info: s => `静止时 伤害 +${s.lv * 6}%  急速 +${(s.lv * 4).toFixed(0)}%`,
    muts: [{ name:'扎根', desc:'静止时每秒回复 2% 最大生命，减伤 20%' }, { name:'怒目', desc:'静止时攻击频率 +100%' }],
    fire() {}
  },
  expgain: { name:'经验加倍', icon:'📈', tag:'成长', col:'#6ef77a', passive: true,
    info: s => `经验获取 +${s.lv * 10}%`,
    muts: [{ name:'顿悟', desc:'经验球 25% 概率变为双倍' }, { name:'掠夺', desc:'击杀时 18% 概率额外 +2 经验' }],
    fire() {}
  },
  pickup: { name:'磁力拾取', icon:'🧲', tag:'成长', col:'#ff9ecf', passive: true,
    info: s => `拾取范围 +${s.lv * 12}`,
    muts: [{ name:'吸附', desc:'全场经验球缓慢飞向你' }, { name:'丰收', desc:'拾取时 20% 概率产生额外经验球' }],
    fire() {}
  },
};
const PASSIVES = [
  { id:'maxhp', name:'生命强化', icon:'❤️', desc:'最大生命 +22 并回复 22' },
  { id:'speed', name:'疾行', icon:'👟', desc:'移动速度 +7%' },
  { id:'dmg', name:'力量', icon:'💪', desc:'所有伤害 +8%' },
  { id:'cdr', name:'急速', icon:'⏱️', desc:'技能冷却 -6%' },
  { id:'armor', name:'护甲', icon:'🛡️', desc:'受到伤害 -5%' },
  { id:'regen', name:'再生', icon:'💚', desc:'每秒回复 +0.5 生命' },
  { id:'crit', name:'会心', icon:'⭐', desc:'暴击率 +4%' },
  { id:'pickup', name:'感应', icon:'🔆', desc:'拾取范围 +14' },
];
const ENEMY_TYPES = {
  normal: { sprite:'👾', hp:11, speed:72,  r:15, dmg:9,  exp:1, size:30 },
  fast:   { sprite:'🦇', hp:8,  speed:138, r:12, dmg:7,  exp:1, size:26 },
  swarm:  { sprite:'🐛', hp:6,  speed:98,  r:11, dmg:5,  exp:1, size:22 },
  ranged: { sprite:'🧿', hp:14, speed:62,  r:15, dmg:8,  exp:2, size:30, ranged:true, range:320, shootCd:2.2 },
  tank:   { sprite:'🐗', hp:42, speed:52,  r:22, dmg:16, exp:3, size:44 },
  bomber: { sprite:'💀', hp:16, speed:110, r:14, dmg:22, exp:2, size:28, explode:true },
  elite:  { sprite:'👹', hp:260, speed:66, r:36, dmg:26, exp:0, size:72, elite:true },
};
