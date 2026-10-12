/* ============================================================
   常量与工具函数 / constants & helpers
   无尽回响 Endless Echo
   ============================================================ */

"use strict";
const TAU = Math.PI * 2;
const rnd  = (a, b) => a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const fmtTime = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
