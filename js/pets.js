/* ============================================================
   宠物表：生肖伙伴 / pets
   无尽回响 Endless Echo
   ============================================================ */

/* ---------- 宠物 ---------- */
const PETS = {
  rat: { id:'rat', name:'鼠', emoji:'🐭', skill:'鼠窃', desc:'偷取金币，累计 10 枚掉落大经验球', mutText:'【窃运】偷窃时 30% 概率额外掉落小经验球', cd: lv => Math.max(0.55, 1.6 - lv * 0.05),
    fire(pet) {
      const t = nearestEnemy(pet.x, pet.y); if (!t) return;
      const dmg = (5 + 3 * pet.lv) * P.dmgMult;
      hurtEnemy(t, dmg); G.runGold += 1;
      pet.steal = (pet.steal || 0) + 1;
      effects.push({ kind:'poof', x:t.x, y:t.y-6, life:0.28, max:0.28, r:t.r*0.8 });
      sfx('hit');
      if (pet.mut && Math.random() < 0.30) orbs.push({ x:t.x, y:t.y, vx:rnd(-30,30), vy:rnd(-30,30), v:2, r:5, life:22, pulling:false, spin:0 });
      if (pet.steal >= 10) { pet.steal = 0; orbs.push({ x:t.x, y:t.y, vx:0, vy:0, v:12, r:9, life:35, pulling:false, spin:0, big:true }); effects.push({ kind:'ring', x:t.x, y:t.y, life:0.4, max:0.4, r:50, col:'#ffd76a' }); sfx('coin'); }
    }
  },
  tiger: { id:'tiger', name:'虎', emoji:'🐯', skill:'猛虎扑食', desc:'扑向血量最高的敌人，击杀则重置冷却', mutText:'【余威】扑击落点产生范围爆炸', cd: lv => Math.max(2.4, 5.5 - lv * 0.16),
    fire(pet) {
      let target = null, maxHp = 0;
      for (const e of enemies) { if (e.dead) continue; if (e.hp > maxHp) { maxHp = e.hp; target = e; } }
      if (!target) return;
      effects.push({ kind:'pounce', x1:pet.x, y1:pet.y, x2:target.x, y2:target.y, life:0.32, max:0.32 });
      pet.x = target.x; pet.y = target.y;
      const dmg = (35 + 22 * pet.lv) * P.dmgMult;
      hurtEnemy(target, dmg);
      effects.push({ kind:'boom', x:target.x, y:target.y, life:0.35, max:0.35, r:75, col:'#ff8c42' });
      sfx('kill'); G.shake = Math.max(G.shake, 5);
      if (pet.mut) aoeDamage(target.x, target.y, 110, dmg * 0.55);
      if (target.dead) { pet.cd = 0; effects.push({ kind:'ring', x:pet.x, y:pet.y, life:0.4, max:0.4, r:70, col:'#ffd76a' }); }
    }
  },
  dragon: { id:'dragon', name:'龙', emoji:'🐲', skill:'龙息', desc:'朝最近敌人喷吐火焰，灼烧叠加', mutText:'【余烬】龙息结束留下 3 秒火墙', cd: lv => Math.max(3.5, 7.5 - lv * 0.18),
    fire(pet) { pet.breathT = 3.0; pet.breathTick = 0; pet.breathAngle = 0; const t = nearestEnemy(pet.x, pet.y); if (t) pet.breathAngle = Math.atan2(t.y - pet.y, t.x - pet.x); },
    update(pet, dt) {
      if (pet.breathT > 0) {
        pet.breathT -= dt;
        const t = nearestEnemy(pet.x, pet.y);
        if (t) { const na = Math.atan2(t.y - pet.y, t.x - pet.x); let diff = na - pet.breathAngle; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU; pet.breathAngle += clamp(diff, -3 * dt, 3 * dt); }
        pet.breathTick -= dt;
        if (pet.breathTick <= 0) {
          pet.breathTick = 0.15;
          const range = 130 + pet.lv * 4, arc = 0.7;
          for (const e of enemies) {
            if (e.dead) continue;
            const dx = e.x - pet.x, dy = e.y - pet.y;
            if (Math.hypot(dx, dy) > range) continue;
            const a = Math.atan2(dy, dx); let df = a - pet.breathAngle;
            while (df > Math.PI) df -= TAU; while (df < -Math.PI) df += TAU;
            if (Math.abs(df) < arc) { const dmg = (4 + 3 * pet.lv) * P.dmgMult; e.burn = Math.min(5, (e.burn || 0) + 1); hurtEnemy(e, dmg); }
          }
        }
        if (pet.breathT <= 0 && pet.mut) { const range = 130 + pet.lv * 4; effects.push({ kind:'firewall', x:pet.x + Math.cos(pet.breathAngle) * range * 0.55, y:pet.y + Math.sin(pet.breathAngle) * range * 0.55, r:range * 0.55, life:3.0, max:3.0, tick:0, dps:(10 + 5 * pet.lv) * P.dmgMult }); }
      }
    }
  },
  dog: { id:'dog', name:'狗', emoji:'🐶', skill:'忠犬护主', desc:'拦截靠近玩家的敌方子弹并反弹伤害', mutText:'【忠魂】反弹子弹伤害 +100% 并穿透', passive: true,
    update(pet, dt) {
      for (let i = eBullets.length - 1; i >= 0; i--) {
        const b = eBullets[i];
        const dToPet = Math.hypot(b.x - pet.x, b.y - pet.y);
        const dToPly = Math.hypot(b.x - P.x, b.y - P.y);
        if (dToPet < 44 && dToPly < 260) {
          const t = nearestEnemy(pet.x, pet.y);
          if (t) {
            const dmg = b.dmg * (1.8 + pet.lv * 0.12) * (pet.mut ? 2 : 1);
            hurtEnemy(t, dmg);
            effects.push({ kind:'reflect', x1:pet.x, y1:pet.y, x2:t.x, y2:t.y, life:0.22, max:0.22 });
            sfx('hit');
            if (pet.mut) { const dx = t.x - pet.x, dy = t.y - pet.y, len = Math.hypot(dx, dy) || 1;
              for (const e of enemies) { if (e.dead || e === t) continue;
                const px = e.x - pet.x, py = e.y - pet.y;
                const proj = (px * dx + py * dy) / (len * len);
                if (proj < 0 || proj > 1.5) continue;
                const cx = pet.x + dx * proj, cy = pet.y + dy * proj;
                if (Math.hypot(e.x - cx, e.y - cy) < 30) hurtEnemy(e, dmg * 0.7);
              }
            }
          }
          eBullets.splice(i, 1);
          effects.push({ kind:'ring', x:pet.x, y:pet.y, life:0.3, max:0.3, r:46, col:'#7ec8ff' });
        }
      }
    }
  },
  // 其余 8 只生肖由 js/pets-extra.js 提供并在此合并
  ...(typeof PETS_EXTRA !== 'undefined' ? PETS_EXTRA : {}),
};
