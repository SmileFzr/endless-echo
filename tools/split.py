# -*- coding: utf-8 -*-
"""
把单文件游戏 game3.2.html 拆分为 index.html + css/ + js/

  <style>...</style>    -> css/style.css
  <script>...</script>  -> js/utils.js  js/audio.js  js/game.js
                           js/pets.js   js/skills.js js/render.js js/ui.js
                           以及手写模块 js/blackhole.js(黑洞小镇玩法)

拆分依据是源码里本来就有的 4 个分节注释:
  1) /* ---------- 音频 ---------- */   -> audio.js
  2) /* ---------- Canvas ---------- */ -> 之后是"游戏状态/数值/战斗逻辑", 属 game.js
  3) /* ---------- 宠物 ---------- */   -> 之后是技能表, 属 skills.js
  4) /* ---------- 技能 ---------- */   -> 之后是宠物表, 属 pets.js
  第 4 个分节之后直到文件末尾            -> 全部 Canvas 绘制函数, 属 render.js
第一个分节之前的内容                    -> utils.js (常量与工具函数)
"""
import io
import json
import os
import re

SRC = r"C:\Users\smile\Desktop\game3.2.html"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------- 读取源码 ----------
with io.open(SRC, "r", encoding="utf-8", newline="") as f:
    text = f.read().replace("\r\n", "\n").replace("\r", "\n")
lines = text.split("\n")

style_open = next(i for i, l in enumerate(lines, 1) if l.strip() == "<style>")
style_close = next(i for i, l in enumerate(lines, 1) if l.strip() == "</style>")
script_open = next(i for i, l in enumerate(lines, 1) if l.strip() == "<script>")
script_close = next(i for i, l in enumerate(lines, 1) if l.strip() == "</script>")

css_body = lines[style_open:style_close - 1]
js_body = lines[script_open:script_close - 1]
print("style %d-%d   script %d-%d   total %d lines" %
      (style_open, style_close, script_open, script_close, len(lines)))

# ---------- 识别分节注释 ----------
SECTION_RE = re.compile(r"^/\*(.*?)\*/$")


def section_title(line):
    """识别 '/* ---------- 标题 ---------- */' 或 '/* ===== 标题 ===== */'"""
    m = SECTION_RE.match(line.strip())
    if not m:
        return None
    inner = m.group(1)
    if "----" not in inner and "====" not in inner:
        return None
    title = re.sub(r"^[=\-\s]+", "", inner.strip())
    title = re.sub(r"[=\-\s★]+$", "", title)
    return title.strip() or None


# 源码里的 4 个分节注释(按出现顺序)切出前 5 段:
#   1) 音频   -> audio.js   NOTE_FREQ 与音乐/音效合成器
#   2) Canvas -> 游戏状态、数值、战斗逻辑、精灵缓存 -> game.js
#   3) 宠物   -> pets.js    PETS 宠物表
#   4) 技能   -> SKILLS 技能表、PASSIVES、ENEMY_TYPES 等配置表 -> skills.js
#   第 4 个分节之后是"战斗逻辑 + 绘制 + 界面"混在一起, 再按标志行切开:
#     从 SPRITE_MARKER(精灵缓存)起 -> 绘制部分 render.js
#     从 UI_MARKER(UI 元素引用)起 -> 界面与主循环 ui.js
#   第 1 个分节之前的内容是常量与工具函数 -> utils.js
SECTION_MODULES = ["audio", "game", "pets", "skills"]
LAST_MODULE = "skills"

MODULE_ORDER = ["utils", "audio", "game", "pets", "skills", "render", "ui"]
MODULE_HEADER = {
    "utils": ("utils.js", "常量与工具函数 / constants & helpers"),
    "audio": ("audio.js", "音频引擎：背景音乐与音效 / audio engine"),
    "game": ("game.js", "游戏状态与核心逻辑 / state, combat & progression"),
    "pets": ("pets.js", "宠物表：生肖伙伴 / pets"),
    "skills": ("skills.js", "技能与属性配置表 / skills & passives"),
    "render": ("render.js", "Canvas 绘制 / rendering"),
    "ui": ("ui.js", "界面交互与主循环 / UI & main loop"),
}

# 绘制部分起点(精灵缓存与 drawSprite)
SPRITE_MARKER = "const _spriteCache = {};"
# 配置表结束 / 游戏逻辑起点(全局状态声明: 关卡状态 G 与存档)
LOGIC_START = "const G = { state:'menu'"
# 绘制正文起点(主渲染函数 render)
RENDER_START = "function render() {"
# 界面部分起点(UI 元素引用与主循环)
UI_MARKER = "const el = id => document.getElementById(id);"

# 黑洞小镇模块: 作为第 8 个 js 文件附加在最后(源码是 js/blackhole.js, 不是从单文件拆出来的)
BLACKHOLE = "js/blackhole.js"
# 黑洞模块需要的 DOM 片段(插入到 <div id="toast"></div> 之后)
TOWN_HTML = """<div id="townBar" class="hidden">
    <div class="town-head">
      <span class="town-name">🌆 回声小镇</span>
      <span class="town-note">绝对安全 · 南门可离开</span>
    </div>
    <div id="townSkills"></div>
  </div>
  <div id="townPrompt" class="hidden"></div>
  <button id="btnTownAct" class="town-act hidden">交 谈</button>
  <div class="veil hidden" id="npcDlg">
    <div class="card">
      <div class="title" id="dlgTitle" style="font-size:20px"></div>
      <div class="sub">TALK</div>
      <div class="dlg" id="dlgBody"></div>
      <div id="dlgActions"></div>
    </div>
  </div>"""

# 黑洞模块需要的样式(追加到 css/style.css 末尾)
TOWN_CSS = """
  /* ---------- 黑洞小镇 ---------- */
  #townBar{position:absolute;top:0;left:0;right:0;padding:calc(8px + env(safe-area-inset-top)) 12px 8px;
    display:flex;align-items:flex-start;gap:10px;pointer-events:none;z-index:4}
  #townBar.hidden{display:none!important}
  .town-head{display:flex;flex-direction:column;gap:2px}
  .town-name{font-size:14px;font-weight:800;color:#ffe9b0;text-shadow:0 2px 8px #000;letter-spacing:1px}
  .town-note{font-size:10.5px;opacity:.6}
  #townSkills,#hudSpecials{display:flex;gap:6px;pointer-events:auto;margin-left:auto}
  #hudSpecials{margin-left:0;justify-content:flex-end;margin-top:5px;min-height:0}
  .spkey{position:relative;width:34px;height:34px;border-radius:9px;cursor:pointer;
    background:rgba(20,20,36,.85);border:1px solid rgba(255,255,255,.18);color:#e8e8f0;
    font-size:16px;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;
    transition:.15s;padding:0}
  .spkey:hover{background:rgba(255,255,255,.16)}
  .spkey .k{position:absolute;bottom:0;right:2px;font-size:8.5px;font-weight:700;color:#ffd76a}
  .spkey .cd{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.62);border-radius:8px;font-size:12px;font-weight:800;color:#ffd76a}
  .spkey.cooling{border-color:rgba(255,215,106,.5)}
  .spkey.passive{border-color:rgba(126,247,200,.5);opacity:.92}
  .spnone{font-size:10.5px;opacity:.45;align-self:center}
  /* 城镇里技能栏上移, 给底部的"交谈"按钮让位 */
  #ui.town .skillbar{bottom:calc(88px + env(safe-area-inset-bottom))}
  #ui.town .petbar{bottom:calc(140px + env(safe-area-inset-bottom))}
  #townPrompt{position:absolute;left:50%;transform:translateX(-50%);
    bottom:calc(144px + env(safe-area-inset-bottom));padding:8px 14px;border-radius:10px;
    background:rgba(20,20,36,.9);border:1px solid rgba(255,215,106,.45);color:#ffe9b0;
    font-size:12.5px;font-weight:700;white-space:nowrap;pointer-events:none;z-index:4}
  #townPrompt.hidden{display:none!important}
  .town-act{position:absolute;left:50%;transform:translateX(-50%);
    bottom:calc(20px + env(safe-area-inset-bottom));
    padding:12px 30px;border-radius:13px;
    background:linear-gradient(90deg,#4f46e5,#7c3aed);border:1px solid #8b5cf6;color:#fff;
    font-size:15px;font-weight:700;letter-spacing:2px;font-family:inherit;cursor:pointer;
    pointer-events:auto;z-index:6;box-shadow:0 6px 22px rgba(0,0,0,.55)}
  .town-act.hidden{display:none!important}
  .dlg{text-align:left;font-size:12.5px;line-height:1.8;margin:2px 0 6px}
  .dlg .dlgq{background:rgba(255,255,255,.05);border-left:3px solid #8b5cf6;
    border-radius:0 10px 10px 0;padding:10px 12px;color:#dcdcf0}
  .dlg .dlgmeta{font-size:11.5px;opacity:.7;margin-top:8px}
  #dlgActions .btn{margin-top:10px}
  /* 窄屏(手机竖屏)下让特殊能力条独占一行, 避免和技能栏挤在一起 */
  @media (max-width:430px){
    #hudSpecials{flex:1 0 100%;justify-content:flex-start;margin-top:4px}
  }
"""

titles = [t for t in (section_title(l) for l in js_body) if t]
print("section headers (ascii): %r" % ([t.encode("unicode_escape").decode() for t in titles],))
assert len(titles) == len(SECTION_MODULES), "分节数量与预期不符: %r" % (titles,)

# ---------- 按分节切分 ----------
current = "utils"                       # 第一个分节之前: 常量与工具函数
module_lines = {m: [] for m in MODULE_ORDER}
seen = 0
for line in js_body:
    if section_title(line):
        current = SECTION_MODULES[seen]
        seen += 1
    module_lines[current].append(line)

# 最后一段: "技能"分节之后混合了配置表、战斗逻辑、绘制与界面, 按标志行切块
#   [SKILLS/PASSIVES/... 配置表] [战斗逻辑] [精灵缓存+drawSprite+drawGrid...] [界面]
#   其中配置表留在 skills.js, 战斗逻辑并入 game.js, 其后两块分别是 render.js 与 ui.js
# 最后一段: "技能"分节之后依次是配置表 -> 战斗逻辑 -> 绘制 -> 界面
#   [SKILLS / PASSIVES / ENEMY_TYPES 等纯配置表]     留 skills.js
#   [let P = null; 起的战斗与推进逻辑]               -> game.js
#   [function render() 起的全部绘制函数]             -> render.js
#   [const el = ... 起的界面逻辑与主循环]            -> ui.js
tail = module_lines[LAST_MODULE]

i_logic = next(i for i, l in enumerate(tail) if l.strip().startswith(LOGIC_START))
i_render = next(i for i, l in enumerate(tail) if l.strip().startswith(RENDER_START))
i_ui = next(i for i, l in enumerate(tail) if l.strip().startswith(UI_MARKER))
assert i_logic < i_render < i_ui, \
    "分界顺序异常: logic=%d render=%d ui=%d" % (i_logic, i_render, i_ui)

module_lines[LAST_MODULE] = tail[:i_logic]
module_lines["game"] += [""] + tail[i_logic:i_render]
module_lines["render"] = tail[i_render:i_ui]
module_lines["ui"] = tail[i_ui:]

used = [m for m in MODULE_ORDER if module_lines[m]]
print("module lines: %r" % [(m, len(module_lines[m])) for m in used])

BANNER = ("/* ============================================================\n"
          "   %s\n"
          "   无尽回响 Endless Echo\n"
          "   ============================================================ */\n")

# ---------------------------------------------------------------
# 对拆分结果应用的修复(不改动原始单文件, 但每次重新拆分都会自动带上)
# ---------------------------------------------------------------
PATCHES = {
    # 1) HTML 里写死的经验阈值 "0 / 8" 与游戏公式 expForLevel(1)=7 不一致
    #    另外给 HUD 增加特殊能力按钮条(黑洞模块的 <script> 由 script_order 统一追加)
    "index.html": [
        ('<span id="expTxt">0 / 8</span>',
         '<span id="expTxt">0 / 7</span>'),
        ('<div class="hudbtns">',
         '<div id="hudSpecials"></div>\n'
         '        <div class="hudbtns">'),
    ],
    # 2) BGM 调度器用 setInterval 创建后从无清理入口: 静音/切后台后仍每 40ms
    #    创建振荡器节点空转; 切后台时浏览器还会限流导致恢复后音频卡顿
    "js/audio.js": [
        ("function startMusic() { if (!audioReady || musicTimer) return; musicStep = 0; "
         "musicNextTime = actx.currentTime + 0.12; musicTimer = setInterval(musicScheduler, 40); }",
         "function startMusic() { if (!audioReady || musicTimer) return; musicStep = 0; "
         "musicNextTime = actx.currentTime + 0.12; musicTimer = setInterval(musicScheduler, 40); }\n"
         "function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }"),
        ("function musicScheduler() { if (!audioReady || !musicOn) return; if (actx.state !== 'running') return;",
         "function musicScheduler() { if (!audioReady || !musicOn) { stopMusic(); return; } "
         "if (typeof document !== 'undefined' && document.hidden) { stopMusic(); return; } "
         "if (actx.state !== 'running') return;"),
        ("document.addEventListener('keydown', initAudio);",
         "document.addEventListener('keydown', initAudio);\n"
         "// 切到后台时停掉 BGM 调度器, 回到前台再平滑续上\n"
         "document.addEventListener('visibilitychange', () => {\n"
         "  if (!audioReady) return;\n"
         "  if (document.hidden) stopMusic();\n"
         "  else if (musicOn && actx.state === 'running') startMusic();\n"
         "});"),
    ],
    # 4) 永久强化被重复计算 / 系数不一致:
    #    createPlayer() 已把 SAVE.up.hp*22 算进 maxHp、SAVE.up.spd*5% 算进 baseSpeed,
    #    但 recalcStats() 又加了一次 SAVE.up.hp*10(导致每点永久生命实际 +32 而不是 +22)
    #    和 SAVE.up.spd*4%(速度被算两遍)。这里去掉重复项, 局内强化 P.up.* 保持不变。
    "js/game.js": [
        ("  dmg += SAVE.up.dmg * 0.05; spd += SAVE.up.spd * 0.04; cdr += SAVE.up.cdr * 0.03; hpBonus += SAVE.up.hp * 10;",
         "  // 注意: 永久强化 SAVE.up.hp / .spd 已在 createPlayer() 里计入 baseHp / baseSpeed,\n"
         "  //       这里不能重复加, 否则每点永久生命实际 +32 而不是 +22。\n"
         "  dmg += SAVE.up.dmg * 0.05; cdr += SAVE.up.cdr * 0.03;"),
        # 4b) 敌人上限在循环外只判断一次, 极端情况下会突破 320
        ("  if (enemies.length > 320) return;\n  for (let i = 0; i < count; i++) spawnOne();",
         "  for (let i = 0; i < count; i++) { if (enemies.length >= 320) break; spawnOne(); }"),
        # 4c) 精英怪冲锋没有无敌帧, 一次冲锋可能连续撞中两次
        ("      if (e.chargeT > 0) { e.chargeT -= dt; e.x += (dx / dist) * e.speed * 4.5 * dt; e.y += (dy / dist) * e.speed * 4.5 * dt; }",
         "      if (e.chargeT > 0) {\n"
         "        e.chargeT -= dt;\n"
         "        e.x += (dx / dist) * e.speed * 4.5 * dt; e.y += (dy / dist) * e.speed * 4.5 * dt;\n"
         "        // 冲锋期间持续刷新无敌帧, 避免一次冲锋被反复结算伤害\n"
         "        if (P.invuln < 0.12) P.invuln = 0.12;\n"
         "      }"),
        # 4d) 接入黑洞 / 城镇 / 特殊能力(实现在 js/blackhole.js)
        ("  updatePlayer(dt); updatePets(dt); updateSkills(dt); updateEnemies(dt);",
         "  updatePlayer(dt); updatePets(dt); updateSkills(dt); updateEnemies(dt);\n"
         "  updateSpecials(dt);   // 特殊能力冷却(黑洞小镇的奖励)\n"
         "  questTick(dt);        // 推进 NPC 战斗任务进度"),
        ("  updateEffects(dt); updatePortals(dt);",
         "  updateEffects(dt); updatePortals(dt);\n"
         "  updateBlackHole(dt);  // 黑洞随机事件: 生成与吸入"),
        # 4e) 翅膀加速: 直接放大移动速度
        ("  P.x += mx * P.speed * dt; P.y += my * P.speed * dt;",
         "  const spd = P.speed * (P.wingT > 0 ? 1.9 : 1);   // 风之翼加速\n"
         "  P.x += mx * spd * dt; P.y += my * spd * dt;"),
        # 4f) 踏空靴: 无敌 + 无视怪物碰撞
        ("  for (const e of enemies) {\n    if (e.dead) continue;\n    const dx = e.x - P.x, dy = e.y - P.y, rr = e.r + P.r;",
         "  if (P.bootsT <= 0) for (const e of enemies) {   // 踏空靴生效时不与怪物碰撞\n"
         "    if (e.dead) continue;\n"
         "    const dx = e.x - P.x, dy = e.y - P.y, rr = e.r + P.r;"),
        # 4g) 城镇里的交互键(该 keydown 监听在 game.js 中)
        #     属于"行内编辑": 在这条长语句中间插入一个判断, 因此标 inline
        ("if (e.key === 'Escape') { if (G.state === 'playing') pauseGame();",
         "if (e.key === 'f' || e.key === 'F') townInteract();   // 城镇里与 NPC 交谈 / 离开\n"
         "  if (e.key === 'Escape') { if (G.state === 'playing') pauseGame();",
         "inline"),
        # 4h) 黑洞提示横幅显示期间先不弹升级三选一, 免得两件事糊在一起;
        #     横幅结束后由 bhUpdateBanner() 补弹
        ("  if (G.pendingLvUps > 0 && G.state === 'playing') showLevelUp();",
         "  if (G.pendingLvUps > 0 && G.state === 'playing' && !(G.bh && G.bh.banner)) showLevelUp();"),
    ],
    # 7) 绘制: 城镇画面分支与黑洞绘制(render() 定义在 render.js)
    "js/render.js": [
        ("function render() {\n  ctx.fillStyle = '#07070e';\n  ctx.fillRect(0, 0, W, H);\n  if (!P) return;",
        "function render() {\n  if (G.state === 'town') { drawTown(); return; }\n"
        "  ctx.fillStyle = '#07070e';\n  ctx.fillRect(0, 0, W, H);\n  if (!P) return;"),
        ("  drawGrid(); drawPortals(); drawOrbs(); drawEffects(false);",
        "  drawGrid(); drawPortals();\n"
        "  if (typeof drawBlackHole === 'function') drawBlackHole();   // 黑洞随机事件\n"
        "  drawOrbs(); drawEffects(false);"),
        ("  drawPortalArrows();\n  drawEliteIndicator();",
        "  drawPortalArrows();\n  drawEliteIndicator();\n"
        "  if (typeof drawBlackHoleIndicator === 'function') drawBlackHoleIndicator();\n"
        "  if (typeof drawBhBanner === 'function') drawBhBanner();   // 黑洞出现的醒目提示"),
    ],
    # 5) 虎宠残留字段 pounceT: 定义了但从未被读取
    "js/ui.js": [
        ("steal:0, pounceT:0, breathT:0", "steal:0, breathT:0", "inline"),
        # 5a) 回主菜单 / 重置存档时也要收起小镇界面(否则小镇顶栏会残留在菜单上)
        ("function backToMenu() {\n  el('pauseVeil').classList.add('hidden'); el('resetVeil').classList.add('hidden');",
         "function backToMenu() {\n"
         "  if (typeof closeNPCDialog === 'function') closeNPCDialog();\n"
         "  el('townBar').classList.add('hidden');\n"
         "  el('townPrompt').classList.add('hidden');\n"
         "  el('btnTownAct').classList.add('hidden');\n"
         "  el('ui').classList.remove('town');\n"
         "  el('pauseVeil').classList.add('hidden'); el('resetVeil').classList.add('hidden');"),
        ("function doResetSave() {",
         "function doResetSave() {\n"
         "  if (typeof closeNPCDialog === 'function') closeNPCDialog();\n"
         "  el('townBar').classList.add('hidden');\n"
         "  el('townPrompt').classList.add('hidden');\n"
         "  el('btnTownAct').classList.add('hidden');\n"
         "  el('ui').classList.remove('town');"),
        # 5b) startGame 里初始化特殊能力计时(实现在 blackhole.js)
        ("  const starters = ['homing', 'sword', 'lightning', 'bomb'];",
         "  P.wingT = 0; P.bootsT = 0; P.specials = {};   // 特殊能力计时\n"
         "  const starters = ['homing', 'sword', 'lightning', 'bomb'];"),
        # 3b) F 键交互, 进入小镇后按 F 和 NPC 说话 / 从南门离开
        # 3c) 重置存档时保留已解锁的特殊能力与任务进度(否则重置会把小镇奖励一起抹掉)
        ("  SAVE = { gold:0, up:{ hp:0, spd:0, dmg:0, cdr:0, size:0 }, best:0, pets:[], selected:[] };\n  writeSave(); selectedPets = [];",
        "  // 特殊能力(S.D. 的城镇奖励)与任务进度保留, 不被重置存档清掉\n"
        "  SAVE = { gold:0, up:{ hp:0, spd:0, dmg:0, cdr:0, size:0 }, best:0, pets:[], selected:[],\n"
        "           specials: (SAVE && SAVE.specials) || {}, quests: (SAVE && SAVE.quests) || {} };\n"
        "  writeSave(); selectedPets = [];"),
        # 3d) 主循环: 城镇场景走自己的 update
        ("  if (G.state === 'playing') update(dt);",
        "  if (G.state === 'playing') update(dt);\n  else if (G.state === 'town') updateTown(dt);"),
        # 6a) render() 里城镇走独立画面
        # 6b) 主地图上绘制黑洞(在传送商店之后, 处于世界坐标里)
        # 6c) 屏幕边缘的黑洞方向指示
        # 6d) 每帧刷新特殊能力条(冷却倒计时)
        ("el('btnPause').onclick = (e) => { e.stopPropagation(); pauseGame(); };",
        "el('btnPause').onclick = (e) => { e.stopPropagation(); pauseGame(); };\n"
        "el('btnTownAct').onclick = () => townInteract();\n"
        "if (typeof updateHudSpecials === 'function') updateHudSpecials();"),
        # --- 以下为合并进来的另一组 ui.js 补丁 ---
        # 3) 切到后台/锁屏时游戏不会暂停: 生存类游戏里玩家回来后往往已经死了。
        #    策略: 切走就暂停(一定不会白死); 离开不到 3 秒且没弹菜单的, 回来静默继续;
        #    离开久了或已经弹出暂停菜单的, 等玩家自己点继续。手动暂停不受影响。
        ("function pauseGame() {\n  if (G.state !== 'playing' && G.state !== 'levelup' && G.state !== 'shop') return;",
        "function pauseGame(smart) {\n"
        "  // smart 模式仅在\"离开时间很短\"时静默暂停, 不弹菜单(避免误触打断)\n"
        "  if (G.state !== 'playing' && G.state !== 'levelup' && G.state !== 'shop') return;\n"
        "  G._silent = !!smart;"),
        ("  el('pauseVeil').classList.remove('hidden');\n  if (audioReady && musicOn) musicGain.gain.value = 0.08;\n}",
        "  if (!G._silent) el('pauseVeil').classList.remove('hidden');\n"
        "  if (audioReady && musicOn) musicGain.gain.value = 0.08;\n}"),
        ("function resumeGame() {\n  el('pauseVeil').classList.add('hidden');",
        "function resumeGame(force) {\n"
        "  // 因切后台而自动暂停的, 由 visibilitychange 统一处理; 这里响应手动\"继续\"\n"
        "  if (!force && G._autoPaused) return;\n"
        "  G._silent = false;\n"
        "  el('pauseVeil').classList.add('hidden');"),
        ("  if (audioReady && musicOn) musicGain.gain.value = 0.26;\n}\nfunction backToMenu()",
        "  if (audioReady && musicOn) musicGain.gain.value = 0.26;\n"
        "}\n"
        "// 切后台/锁屏时自动暂停(同时 audio.js 会停掉 BGM 调度器)\n"
        "// 离开 <3 秒: 视为误触, 静默暂停, 回来直接继续, 不打断操作\n"
        "// 离开 >=3 秒: 停下来等玩家点\"继续\", 免得回来发现角色已经死了\n"
        "if (typeof document !== 'undefined') {\n"
        "  document.addEventListener('visibilitychange', () => {\n"
        "    if (document.hidden) {\n"
        "      if (G.state === 'playing') {\n"
        "        G._autoPaused = true;\n"
        "        G._hiddenAt = performance.now();\n"
        "        pauseGame(true);          // 先静默暂停, 不弹菜单\n"
        "        clearTimeout(G._pauseReveal);\n"
        "        G._silent = true;\n"
        "        // 真的离开久了, 再把暂停菜单显示出来\n"
        "        G._pauseReveal = setTimeout(() => {\n"
        "          if (G._autoPaused && G.state === 'paused') {\n"
        "            G._silent = false;\n"
        "            el('pauseVeil').classList.remove('hidden');\n"
        "          }\n"
        "        }, 3000);\n"
        "      }\n"
        "    } else if (G._autoPaused) {\n"
        "      clearTimeout(G._pauseReveal);\n"
        "      G._autoPaused = false;\n"
        "      const away = performance.now() - (G._hiddenAt || 0);\n"
        "      if (G.state === 'paused' && G._silent && away < 3000) {\n"
        "        G._silent = false;\n"
        "        G.state = 'playing';                       // 短暂离开: 直接继续\n"
        "        el('pauseVeil').classList.add('hidden');\n"
        "        if (audioReady && musicOn) musicGain.gain.value = 0.26;\n"
        "      } else if (G.state === 'paused') {\n"
        "        G._silent = false;\n"
        "        el('pauseVeil').classList.remove('hidden');  // 离开久了: 等玩家点继续\n"
        "      }\n"
        "    }\n"
        "  });\n"
        "}\n"
        "function backToMenu()"),
        # --- 以下为合并进来的另一组 ui.js 补丁 ---
    ],
}


def tidy(rows):
    """去掉首尾空行, 连续空行压缩为一行"""
    rows = list(rows)
    while rows and rows[0].strip() == "":
        rows.pop(0)
    while rows and rows[-1].strip() == "":
        rows.pop()
    out, blank = [], 0
    for r in rows:
        if r.strip() == "":
            blank += 1
            if blank > 1:
                continue
        else:
            blank = 0
        out.append(r)
    return out


# ---------- 写文件 ----------
manifest = [("css/style.css", "\n".join(css_body).strip("\n") + "\n" + TOWN_CSS)]
script_order = []
for mod in used:
    filename, label = MODULE_HEADER[mod]
    body = "\n".join(tidy(module_lines[mod]))
    manifest.append(("js/%s" % filename, (BANNER % label) + "\n" + body + "\n"))
    script_order.append(filename)

# 黑洞小镇模块: 源码已存在于 js/blackhole.js, 作为最后一个脚本加载。
# 它不由本脚本生成, 但把它的当前内容也记进"期望内容", 这样 verify.py 能发现手工改动。
with io.open(os.path.join(ROOT, BLACKHOLE), encoding="utf-8", newline="") as f:
    manifest.append((BLACKHOLE, f.read().replace("\r\n", "\n")))

# 黑洞小镇模块: 源码已存在于 js/blackhole.js, 作为最后一个脚本加载
script_order.append("blackhole.js")

html = []
html.extend(lines[:style_open - 1])                 # <!DOCTYPE ... <title>
html.append('<link rel="stylesheet" href="css/style.css">')
# lines[style_close:script_open-1] 已包含 "</style>" 之后的 "</head>" 与 "<body>"
html.extend(lines[style_close:script_open - 1])     # </head> <body> 及 DOM 结构
# 插入小镇相关 DOM
i_toast = next(i for i, l in enumerate(html) if '<div id="toast"></div>' in l)
html[i_toast + 1:i_toast + 1] = TOWN_HTML.split("\n")
for name in script_order:
    html.append('<script src="js/%s"></script>' % name)
html.append('</body>')
html.append('</html>')
manifest.insert(1, ("index.html", "\n".join(html).rstrip("\n") + "\n"))

# ---------- 应用修复补丁 ----------
patch_meta = []
for rel, rules in PATCHES.items():
    paths = [p for p, _ in manifest]
    if rel not in paths:
        raise SystemExit("补丁目标文件不存在: %s" % rel)
    idx = paths.index(rel)
    content = manifest[idx][1]
    for old, new, *rest in rules:
        # 第三个元素 "inline" 表示这是"行内编辑"(在长语句中间插/删一段),
        # 原始长行不再作为连续子串存在, 由 verify.py 用"行内编辑"白名单豁免。
        inline = bool(rest and rest[0] == "inline")
        if old not in content:
            raise SystemExit("补丁未匹配(源码可能已改动): %s -> %s" %
                             (rel, old.split("\n")[0][:60]))
        if content.count(old) != 1:
            raise SystemExit("补丁匹配到多处, 需更精确: %s" % rel)
        content = content.replace(old, new, 1)
        # 记录被替换掉的行与替换后的行, 供 verify.py 核对"没有牵连其它代码"
        patch_meta.append({
            "file": rel,
            "replaced": [l.rstrip() for l in old.split("\n") if l.strip()],
            "patched": [l.rstrip() for l in new.split("\n") if l.strip()],
            "inline": inline,
        })
    manifest[idx] = (rel, content)
print("已应用 %d 个文件的修复补丁(共 %d 处替换)" %
      (len(PATCHES), len(patch_meta)))

# 把补丁元信息与期望内容一起留档, 供 verify.py 核对
meta_path = os.path.join(ROOT, ".build", "_patches.json")
os.makedirs(os.path.dirname(meta_path), exist_ok=True)
with io.open(meta_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(json.dumps(patch_meta, ensure_ascii=False, indent=2) + "\n")

for path, content in manifest:
    out = os.path.join(ROOT, path.replace("/", os.sep))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with io.open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    # 同时把"期望内容"留一份到 .build/, 供 verify.py 做逐字节比对
    # (该目录已在 .gitignore 中, 不会提交)
    ref = os.path.join(ROOT, ".build", path.replace("/", os.sep))
    os.makedirs(os.path.dirname(ref), exist_ok=True)
    with io.open(ref, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print("wrote %-16s %6d bytes  %4d lines" %
          (path, len(content.encode("utf-8")), content.count("\n")))
