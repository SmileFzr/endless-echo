/* ============================================================
   Canvas 绘制 / rendering
   无尽回响 Endless Echo
   ============================================================ */

/* canvas 字体助手: 带中文字体回退, 并缓存上一次的值。
   system-ui 在 Windows Chrome 上会映射到 Segoe UI, 没有中文字形,
   导致 canvas 上的中文渲染成方块。 */
const CANVAS_FONT_FAMILY = "'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'WenQuanYi Micro Hei', system-ui, sans-serif";
let _lastFont = '';
function fnt(px, weight) {
  const f = (weight ? weight + ' ' : '') + px + 'px ' + CANVAS_FONT_FAMILY;
  if (f !== _lastFont) { ctx.font = f; _lastFont = f; }
  return f;
}
/* 虚拟摇杆: 正常游戏与回声小镇共用 */
function drawJoystick() {
  if (!input.joy.active) return;
  if (G.state !== 'playing' && G.state !== 'town') return;
  ctx.save();
  ctx.globalAlpha = 0.28; ctx.strokeStyle = '#7c8cff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(input.joy.ox, input.joy.oy, 58, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#7c8cff';
  ctx.beginPath(); ctx.arc(input.joy.ox + input.joy.dx, input.joy.oy + input.joy.dy, 24, 0, TAU); ctx.fill();
  ctx.restore();
}
function render() {
  if (G.state === 'town') { drawTown(); drawJoystick(); return; }
  ctx.fillStyle = '#07070e';
  ctx.fillRect(0, 0, W, H);
  if (!P) return;
  const shx = G.shake > 0 ? rnd(-G.shake, G.shake) : 0;
  const shy = G.shake > 0 ? rnd(-G.shake, G.shake) : 0;
  ctx.save();
  ctx.translate(W / 2 + shx, H / 2 + shy);
  ctx.translate(-P.x, -P.y);
  drawGrid(); drawPortals();
  if (typeof drawBlackHole === 'function') drawBlackHole();   // 黑洞随机事件
  drawOrbs(); drawEffects(false);
  drawEnemies(); drawPets(); drawBullets(); drawEBullets();
  drawPlayer(); drawEffects(true); drawTexts();
  ctx.restore();
  if (P.hurtFlash > 0) { ctx.fillStyle = `rgba(255,40,60,${P.hurtFlash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  drawJoystick();
  drawPortalArrows();
  drawEliteIndicator();
  if (typeof drawBlackHoleIndicator === 'function') drawBlackHoleIndicator();
  if (typeof drawBhBanner === 'function') drawBhBanner();   // 黑洞出现的醒目提示
}
function drawGrid() {
  const gs = 110;
  const left = P.x - W / 2 - 60, right = P.x + W / 2 + 60;
  const top = P.y - H / 2 - 60, bottom = P.y + H / 2 + 60;
  ctx.strokeStyle = 'rgba(90,90,150,0.13)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(left / gs) * gs; x < right; x += gs) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
  for (let y = Math.floor(top / gs) * gs; y < bottom; y += gs) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
  ctx.stroke();
}
function drawPlayer() {
  ctx.strokeStyle = 'rgba(110,231,255,0.10)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(P.x, P.y, P.pickupRange, 0, TAU); ctx.stroke();
  if (P.stillTime > 0.35) { const pulse = 0.5 + Math.sin(G.time * 5) * 0.5; ctx.strokeStyle = `rgba(126,247,200,${0.28 + pulse * 0.28})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(P.x, P.y, P.r + 12 + pulse * 4, 0, TAU); ctx.stroke(); }
  const hpPct = clamp(P.hp / P.maxHp, 0, 1);
  const ringR = P.r + 11;
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.beginPath(); ctx.arc(P.x, P.y, ringR, 0, TAU); ctx.stroke();
  if (hpPct > 0.001) { const hpCol = hpPct > 0.5 ? '#4ade80' : hpPct > 0.25 ? '#fbbf24' : '#ef4444'; ctx.strokeStyle = hpCol; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(P.x, P.y, ringR, -Math.PI / 2, -Math.PI / 2 + TAU * hpPct); ctx.stroke(); ctx.lineCap = 'butt'; }
  const size = 42 * P.sizeScale;
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(P.x, P.y + size * 0.42, size * 0.34, size * 0.13, 0, 0, TAU); ctx.fill();
  drawSprite('🧙', P.x, P.y, size, 0);
  if (P.invuln > 0) { ctx.strokeStyle = `rgba(255,255,255,${P.invuln * 1.6})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(P.x, P.y, P.r + 6, 0, TAU); ctx.stroke(); }
}
function drawPets() {
  if (!P.pets || P.pets.length === 0) return;
  for (const pet of P.pets) {
    if (pet.id === 'dragon' && pet.breathT > 0) {
      const range = 130 + pet.lv * 4, arc = 0.7;
      ctx.save(); ctx.translate(pet.x, pet.y); ctx.rotate(pet.breathAngle);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, range);
      g.addColorStop(0, 'rgba(255,255,180,0.85)'); g.addColorStop(0.45, 'rgba(255,150,50,0.62)'); g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, range, -arc, arc); ctx.closePath(); ctx.fill();
      const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, range * 0.6);
      g2.addColorStop(0, 'rgba(255,255,255,0.7)'); g2.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, range * 0.6, -arc * 0.7, arc * 0.7); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  for (const pet of P.pets) {
    const def = PETS[pet.id];
    if (!def) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(pet.x, pet.y + 13, 11, 3.5, 0, 0, TAU); ctx.fill();
    if (pet.mut) { const pulse = 0.5 + Math.sin(G.time * 4 + pet.x) * 0.5; ctx.strokeStyle = `rgba(255,179,71,${0.55 + pulse * 0.35})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pet.x, pet.y, 22, 0, TAU); ctx.stroke(); }
    drawSprite(def.emoji, pet.x, pet.y, 34, 0);
  }
}
function drawEnemies() {
  for (const e of enemies) {
    if (e.dead) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(e.x, e.y + e.size * 0.40, e.size * 0.32, e.size * 0.12, 0, 0, TAU); ctx.fill();
    if (e.elite) {
      const pulse = 0.5 + Math.sin(G.time * 4) * 0.5;
      ctx.strokeStyle = `rgba(255,90,90,${0.5 + pulse * 0.4})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10 + pulse * 3, 0, TAU); ctx.stroke();
    }
    drawSprite(e.sprite, e.x, e.y, e.size, 0);
    if (e.flash > 0) { ctx.save(); ctx.globalAlpha = e.flash * 6; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.9, 0, TAU); ctx.fill(); ctx.restore(); }
    if (e.acid > 0) { ctx.strokeStyle = 'rgba(140,255,120,0.65)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, TAU); ctx.stroke(); }
    if (e.burn > 0.2) { ctx.strokeStyle = `rgba(255,140,50,${Math.min(0.9, 0.4 + e.burn * 0.12)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 5, 0, TAU); ctx.stroke(); }
    // ★ 精英怪血条：加粗加长
    // 精英怪血条: 环绕本体的圆环(线宽沿用原来的 10)
    if (e.elite) {
      const ringR = e.r + 14, lw = 10;
      const start = -Math.PI / 2;
      const hpPct = clamp(e.hp / e.maxHp, 0, 1);
      ctx.beginPath(); ctx.arc(e.x, e.y, ringR, 0, TAU);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = lw + 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(e.x, e.y, ringR, 0, TAU);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = lw; ctx.stroke();
      if (hpPct > 0.002) {
        const grad = ctx.createLinearGradient(e.x - ringR, e.y, e.x + ringR, e.y);
        grad.addColorStop(0, '#ff4d5e'); grad.addColorStop(1, '#ff8c42');
        ctx.beginPath();
        ctx.arc(e.x, e.y, ringR, start, start + TAU * hpPct);
        ctx.strokeStyle = grad; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
        ctx.lineCap = 'butt';
      }
      ctx.font = fnt(11, 'bold');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const hpText = Math.ceil(e.hp) + ' / ' + Math.round(e.maxHp);
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 3;
      ctx.strokeText(hpText, e.x, e.y - ringR - 13);
      ctx.fillStyle = '#fff';
      ctx.fillText(hpText, e.x, e.y - ringR - 13);
    }
  }
}
function drawBullets() {
  for (const b of bullets) {
    if (b.kind === 'boom' && b.mut === 'eternal') { drawSprite(b.sprite, b.x, b.y, b.size, b.rot || 0); continue; }
    if (b.kind === 'bomb') { const s = b.life < 0.4 ? 1 + Math.sin(G.time * 40) * 0.18 : 1; drawSprite(b.sprite, b.x, b.y, b.size * s, 0); }
    else drawSprite(b.sprite, b.x, b.y, b.size, b.rot || 0);
  }
}
function drawEBullets() {
  for (const b of eBullets) { ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(b.x - b.r * 0.28, b.y - b.r * 0.28, b.r * 0.35, 0, TAU); ctx.fill(); }
}
function drawOrbs() {
  for (const o of orbs) {
    const pulse = 1 + Math.sin(G.time * 6 + o.spin) * 0.13;
    const r = o.r * pulse * (o.big ? 1.5 : 1);
    const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * 2.6);
    g.addColorStop(0, 'rgba(120,240,255,0.95)'); g.addColorStop(0.45, 'rgba(90,140,255,0.55)'); g.addColorStop(1, 'rgba(80,100,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, r * 2.6, 0, TAU); ctx.fill();
    ctx.fillStyle = o.big ? '#ffe66d' : '#9ef0ff'; ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, TAU); ctx.fill();
  }
}
function drawPortals() {
  for (const p of portals) {
    const pulse = 0.5 + Math.sin(p.spin * 3) * 0.5;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 70);
    g.addColorStop(0, `rgba(255,215,106,${0.4 + pulse * 0.25})`); g.addColorStop(1, 'rgba(255,215,106,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 70, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,215,106,${0.55 + pulse * 0.35})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, 34 + pulse * 4, 0, TAU); ctx.stroke();
    drawSprite('💰', p.x, p.y, 40, Math.sin(p.spin) * 0.15);
  }
}
function drawPortalArrows() {
  if (!portals.length) return;
  for (const p of portals) {
    const sx = p.x - P.x + W / 2, sy = p.y - P.y + H / 2;
    const margin = 46;
    if (sx > margin && sx < W - margin && sy > margin && sy < H - margin) continue;
    const cx = W / 2, cy = H / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const rx = Math.min(W / 2 - margin, H / 2 - margin);
    const ax = cx + Math.cos(a) * rx, ay = cy + Math.sin(a) * rx;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
function drawEliteIndicator() {
  let elite = null;
  for (const e of enemies) if (e.elite && !e.dead) { elite = e; break; }
  if (!elite || !P) return;
  const sx = elite.x - P.x + W / 2, sy = elite.y - P.y + H / 2;
  const margin = 70;
  const inScreen = sx > margin && sx < W - margin && sy > margin && sy < H - margin;
  if (inScreen) {
    const pulse = 0.5 + Math.sin(G.time * 6) * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.35 + pulse * 0.35;
    ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = 3;
    // 圈要跟着体型走, 永远画在血量圆环(半径 r+14)之外
    const markR = elite.r + 20 + pulse * 7;
    ctx.beginPath(); ctx.arc(sx, sy, markR, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.font = fnt(13, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff4d5e'; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
    // 名字放到圆环下方, 避开圆环上方的血量数字
    const labelY = sy + elite.r + 34;
    ctx.strokeText('精英', sx, labelY); ctx.fillText('精英', sx, labelY);
    ctx.restore();
    return;
  }
  const cx = W / 2, cy = H / 2;
  const ddx = sx - cx, ddy = sy - cy;
  const angle = Math.atan2(ddy, ddx);
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const halfW = W / 2 - margin, halfH = H / 2 - margin;
  let scale;
  if (Math.abs(cosA) * halfH > Math.abs(sinA) * halfW) scale = Math.abs(halfW / cosA);
  else scale = Math.abs(halfH / sinA);
  const ax = cx + cosA * scale, ay = cy + sinA * scale;
  const dist = Math.round(Math.hypot(elite.x - P.x, elite.y - P.y) / 10);
  ctx.save();
  const pulse = 0.5 + Math.sin(G.time * 5) * 0.5;
  ctx.globalAlpha = 0.35 + pulse * 0.35;
  ctx.fillStyle = '#ff4d5e';
  ctx.beginPath(); ctx.arc(ax, ay, 32 + pulse * 6, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.translate(ax, ay); ctx.rotate(angle);
  ctx.shadowColor = '#ff4d5e'; ctx.shadowBlur = 14;
  ctx.fillStyle = '#ff4d5e';
  ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-10, -12); ctx.lineTo(-10, 12); ctx.closePath(); ctx.fill();
  ctx.restore();
  const tx = ax - Math.cos(angle) * 34, ty = ay - Math.sin(angle) * 34;
  ctx.save();
  ctx.font = fnt(13, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.strokeText('精英', tx, ty);
  ctx.fillStyle = '#ff4d5e'; ctx.fillText('精英', tx, ty);
  ctx.font = fnt(10, 'bold'); ctx.lineWidth = 3;
  ctx.strokeText(dist + 'm', tx, ty + 14);
  ctx.fillStyle = '#ffb0b8'; ctx.fillText(dist + 'm', tx, ty + 14);
  ctx.restore();
}
function drawEffects(front) {
  for (const f of effects) {
    const t = clamp(f.life / f.max, 0, 1);
    if (!front && (f.kind === 'rain' || f.kind === 'swordArray' || f.kind === 'firewall')) {
      if (f.kind === 'rain') {
        ctx.globalAlpha = 0.13 + (1 - t) * 0.10; ctx.fillStyle = '#5b7fff'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.55; ctx.strokeStyle = '#8ab4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1; drawSprite('🌧️', f.x, f.y - f.r * 0.55, 28);
      } else if (f.kind === 'firewall') {
        const pulse = 0.5 + Math.sin(G.time * 8) * 0.5;
        ctx.globalAlpha = 0.32 + pulse * 0.18; ctx.fillStyle = '#ff6a1e'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.6; ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.save(); ctx.translate(f.x, f.y);
        ctx.globalAlpha = 0.35 + t * 0.4;
        for (let i = 0; i < 4; i++) { const a = f.rot + i * Math.PI / 2; ctx.save(); ctx.rotate(a + Math.PI / 2); ctx.translate(0, -f.r * 0.55); drawSprite('🗡️', 0, 0, 20, 0); ctx.restore(); }
        ctx.globalAlpha = 0.18 + t * 0.12; ctx.fillStyle = '#a8e6ff'; ctx.beginPath(); ctx.arc(0, 0, f.r, 0, TAU); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      }
      continue;
    }
    if (front) {
      if (f.kind === 'bolt') {
        ctx.save(); ctx.globalAlpha = t;
        ctx.strokeStyle = '#fff59d'; ctx.lineWidth = 5;
        ctx.beginPath();
        const maxLen = Math.min(400, Math.abs(f.y - (f.y - 420)));
        const topY = f.y - maxLen;
        let cx = f.x + rnd(-6, 6);
        ctx.moveTo(cx, topY);
        for (let y = topY, count = 0; y < f.y && count < 10; y += 40, count++) { cx += rnd(-18, 18); ctx.lineTo(cx, y); }
        ctx.lineTo(f.x, f.y); ctx.stroke();
        ctx.globalAlpha = t * 0.6; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      }
      if (f.kind === 'boom') {
        const r = f.r * (1 - t * 0.45);
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        g.addColorStop(0, `rgba(255,255,255,${t * 0.85})`);
        g.addColorStop(0.4, f.col ? hexA(f.col, t * 0.7) : `rgba(255,180,80,${t * 0.7})`);
        g.addColorStop(1, f.col ? hexA(f.col, 0) : 'rgba(255,120,60,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
      }
      if (f.kind === 'ring') { ctx.strokeStyle = hexA(f.col || '#ffffff', t * 0.8); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - t), 0, TAU); ctx.stroke(); }
      if (f.kind === 'staticRing') { ctx.strokeStyle = `rgba(180,220,255,${t * 0.8})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - t * 0.3), 0, TAU); ctx.stroke(); }
      if (f.kind === 'poof') { ctx.globalAlpha = t * 0.6; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.4 - t * 0.6), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      if (f.kind === 'pounce') { ctx.save(); ctx.globalAlpha = t * 0.7; ctx.strokeStyle = '#ff8c42'; ctx.lineWidth = 5; ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
      if (f.kind === 'reflect') { ctx.save(); ctx.globalAlpha = t; ctx.strokeStyle = '#7ec8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.restore(); }
    }
  }
}
function hexA(hex, a) { const r = parseInt(hex.slice(1, 3), 16); const g = parseInt(hex.slice(3, 5), 16); const b = parseInt(hex.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})`; }
function drawTexts() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of texts) {
    const a = clamp(t.life / t.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = t.crit ? fnt(17, 'bold') : fnt(13, 'bold');
    ctx.fillStyle = t.crit ? '#ffd76a' : '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 3;
    ctx.strokeText(t.t, t.x, t.y); ctx.fillText(t.t, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}
