/* ============================================================
   精英怪类型表 / elite types
   无尽回响 Endless Echo
   ============================================================
   基础数值沿用 ENEMY_TYPES.elite, 每种精英再乘自己的倍率并附带一个特性。
   生成时随机抽一种, 外观/机制/数值都不一样。

   本文件在 index.html 里排在 skills.js 之前加载(后者尾部会引用 ELITE_TYPES
   做兜底判断), 是手写模块, 不会被 tools/split.py 覆盖。
   ============================================================ */

var ELITE_TYPES = [
  { id:'shadow',   name:'幽影',   sprite:'👹', hpMul:1.00, spdMul:1.00, dmgMul:1.00, rMul:1.00,
    trait:null,         desc:'最基础的精英，会蓄力冲撞' },

  { id:'yokai',    name:'妖怪',   sprite:'🎭', hpMul:0.85, spdMul:1.30, dmgMul:1.10, rMul:0.92,
    trait:'trick',      desc:'飘忽不定，会瞬移到你身边扑击' },

  { id:'undead',   name:'僵尸',   sprite:'🧟', hpMul:1.20, spdMul:0.75, dmgMul:1.15, rMul:1.06,
    trait:'undead',     desc:'死后会以半血复活一次，并炸开一片毒雾' },

  { id:'yeti',     name:'毛怪',   sprite:'🦍', hpMul:1.70, spdMul:0.80, dmgMul:1.30, rMul:1.22,
    trait:'slowhit',    desc:'皮糙肉厚，挨打时有概率把你冻住' },

  { id:'vampire',  name:'吸血鬼', sprite:'🧛', hpMul:0.95, spdMul:1.15, dmgMul:1.20, rMul:1.00,
    trait:'lifesteal',  desc:'吸血：持续回复自身生命，冲撞时更快' },

  { id:'rex',      name:'霸王龙', sprite:'🦖', hpMul:2.40, spdMul:1.05, dmgMul:1.60, rMul:1.55,
    trait:'roar',       desc:'体型巨大的王者，会咆哮加速周围小怪' },

  { id:'wraith',   name:'幽魂',   sprite:'👻', hpMul:0.70, spdMul:1.45, dmgMul:1.05, rMul:0.88,
    trait:'frostshot',  desc:'远程吐息冰弹，命中会减缓你的移动' },

  { id:'treant',   name:'树妖',   sprite:'🌳', hpMul:2.10, spdMul:0.62, dmgMul:1.10, rMul:1.35,
    trait:'poison',     desc:'周身散播毒雾，靠近就持续中毒' },

  { id:'gargoyle', name:'石像鬼', sprite:'🗿', hpMul:1.55, spdMul:0.95, dmgMul:1.25, rMul:1.12,
    trait:'shield',     desc:'石甲：受到的伤害 -40%，且免疫减速' },
];
