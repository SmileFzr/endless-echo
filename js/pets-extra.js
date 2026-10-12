/* ============================================================
   生肖宠物扩展表 / extra zodiac pets
   无尽回响 Endless Echo
   ============================================================
   这几只(兔/蛇/马/羊/猴/鸡/猪/牛)是补齐"十二生肖"时新增的。
   单独放一个文件, 是因为它们由 tools/split.py 合并进 js/pets.js 的 PETS 表
   (js/pets.js 是从单文件拆分出来的产物, 直接改会被下一次拆分覆盖)。

   每个技能都按现有 4 只的数值体系设计:
     - 主动技能用 cd(lv) 控制冷却, fire(pet) 施放, update(pet, dt) 做多段效果
     - 被动技能不写 fire/cd, 效果在 blackhole.js 的 updatePassivePets()
       与 game.js 的 recalcStats() 里结算
   ============================================================ */

const PETS_EXTRA = {

  rabbit: { id:'rabbit', name:'兔', emoji:'🐰', skill:'狡兔三跃',
    desc:'连续跃击最近的敌人三次，每次伤害递增',
    mutText:'【月影】跃击期间获得闪避无敌，落地再额外延长 0.5 秒',
    cd: lv => Math.max(1.8, 4.2 - lv * 0.12),
    fire(pet) { pet.hops = 3; pet.hopT = 0; pet.hopDmg = 1; if (pet.mut) P.invuln = Math.max(P.invuln, 0.35); },
    update(pet, dt) {
      if (!pet.hops) return;
      pet.hopT -= dt;
      if (pet.hopT > 0) return;
      pet.hopT = 0.18;
      const t = nearestEnemy(pet.x, pet.y);
      if (t) {
        effects.push({ kind:'pounce', x1:pet.x, y1:pet.y, x2:t.x, y2:t.y, life:0.2, max:0.2 });
        pet.x = t.x; pet.y = t.y;
        hurtEnemy(t, (10 + 6 * pet.lv) * pet.hopDmg * P.dmgMult);
        effects.push({ kind:'poof', x:t.x, y:t.y, life:0.22, max:0.22, r:t.r + 6 });
        sfx('hit');
        pet.hopDmg = Math.min(3, pet.hopDmg + 0.5);
      }
      if (--pet.hops <= 0) {
        if (pet.mut) { P.invuln = Math.max(P.invuln, 0.5); effects.push({ kind:'ring', x:pet.x, y:pet.y, life:0.4, max:0.4, r:70, col:'#cfe8ff' }); }
        pet.hopDmg = 1;
      }
    }
  },

  snake: { id:'snake', name:'蛇', emoji:'🐍', skill:'蛇吻剧毒',
    desc:'咬击敌人并附加剧毒，中毒会持续掉血并放大后续伤害',
    mutText:'【扩散】中毒的敌人把毒素传给 90 范围内的同伴',
    cd: lv => Math.max(0.9, 2.2 - lv * 0.07),
    fire(pet) {
      const t = nearestEnemy(pet.x, pet.y); if (!t) return;
      hurtEnemy(t, (8 + 5 * pet.lv) * P.dmgMult);
      t.poison = Math.min(8, (t.poison || 0) + 2 + pet.lv * 0.3);
      effects.push({ kind:'ring', x:t.x, y:t.y, life:0.3, max:0.3, r:t.r + 8, col:'#8ef07a' });
      sfx('hit');
      if (pet.mut) {
        for (const e of enemies) {
          if (e.dead || e === t) continue;
          if (Math.hypot(e.x - t.x, e.y - t.y) < 90) e.poison = Math.min(8, (e.poison || 0) + 1.5);
        }
      }
    }
  },

  horse: { id:'horse', name:'马', emoji:'🐴', skill:'千里疾风',
    desc:'被动：移动速度随宠物等级提升',
    mutText:'【踏云】移速加成翻倍，并留下加速残影',
    passive: true },

  sheep: { id:'sheep', name:'羊', emoji:'🐑', skill:'祥和之息',
    desc:'被动：持续恢复玩家生命',
    mutText:'【暖阳】生命低于一半时回复速度翻倍',
    passive: true },

  monkey: { id:'monkey', name:'猴', emoji:'🐵', skill:'灵猴妙手',
    desc:'被动：每 3 秒为所有技能减少 0.6 秒冷却',
    mutText:'【分身】每 5 秒额外施放一次随机技能',
    passive: true },

  rooster: { id:'rooster', name:'鸡', emoji:'🐔', skill:'金鸡报晓',
    desc:'被动：提升暴击率',
    mutText:'【晨鸣】额外提高暴击伤害',
    passive: true },

  pig: { id:'pig', name:'猪', emoji:'🐷', skill:'福猪拱财',
    desc:'被动：怪物掉落的金币更多，偶尔额外掉 1 枚',
    mutText:'【财源】每隔一会掉落一枚大经验球',
    passive: true },

  ox: { id:'ox', name:'牛', emoji:'🐮', skill:'蛮牛铁甲',
    desc:'被动：减少受到的伤害并提升生命上限',
    mutText:'【铜皮】减伤翻倍',
    passive: true },
};
