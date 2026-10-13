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
# 生肖宠物扩展表: 紧跟 js/pets.js 之后加载(源码 js/pets-extra.js)
PETS_EXTRA = "js/pets-extra.js"
# 控制台调试指令: 手写模块, 必须排在所有脚本之后
DEBUG_CMDS = "js/debug-cmds.js"
# 精英类型表: 手写模块, 必须排在 skills.js 之前(后续脚本会引用 ELITE_TYPES)
ELITE_TYPES = "js/elite-types.js"
# 黑洞模块需要的 DOM 片段(插入到 <div id="toast"></div> 之后)
TOWN_HTML = """<div id="townBar" class="hidden">
    <div class="town-head">
      <span class="town-name">🌆 回声小镇</span>
      <span class="town-note">绝对安全 · 南门可离开</span>
      <span class="town-note town-tip">拖动屏幕移动 · 靠近 NPC 按 F 交谈 · 南门离开</span>
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
  </div>
  <div class="veil hidden" id="codex">
    <div class="card codexcard">
      <div class="title" style="font-size:20px">图 鉴</div>
      <div class="sub">CODEX</div>
      <div class="codexprog" id="codexProg"></div>
      <div class="codexscroll" id="codexBody"></div>
      <div class="codexdetail" id="codexDetail"></div>
      <button class="btn primary" id="btnCodexBack" style="margin-top:14px">返 回</button>
    </div>
  </div>"""

# 黑洞模块需要的样式(追加到 css/style.css 末尾)
TOWN_CSS = """
  /* ---------- 黑洞小镇 ---------- */
  #townBar{position:absolute;top:0;left:0;right:0;padding:calc(8px + env(safe-area-inset-top)) 12px 8px;
    display:flex;align-items:flex-start;gap:10px;pointer-events:none;z-index:4}
  /* 窄屏: 左侧文字允许压缩换行, 免得把右上角的技能图标挤出屏幕 */
  #townBar .town-head{flex:1 1 auto;min-width:0;text-shadow:0 1px 6px rgba(20,45,30,.55)}
  #townBar .town-name,#townBar .town-note{white-space:normal;overflow-wrap:break-word}
  #townBar #townSkills{flex:0 0 auto;margin-left:auto}
  #townBar.hidden{display:none!important}
  .town-head{display:flex;flex-direction:column;gap:2px}
  .town-name{font-size:14px;font-weight:800;color:#ffe9b0;text-shadow:0 2px 8px #000;letter-spacing:1px}
  .town-note{font-size:10.5px;opacity:.6}
  .town-tip{margin-top:3px;opacity:.72;letter-spacing:.3px}
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
  /* 提示条文案写着"点这里", 所以它必须真的能点: pointer-events 要 auto */
  #townPrompt{position:absolute;left:50%;transform:translateX(-50%);
    bottom:calc(144px + env(safe-area-inset-bottom));padding:8px 14px;border-radius:10px;
    background:rgba(20,20,36,.9);border:1px solid rgba(255,215,106,.45);color:#ffe9b0;
    font-size:12.5px;font-weight:700;white-space:nowrap;pointer-events:auto;cursor:pointer;
    z-index:5;-webkit-tap-highlight-color:transparent;transition:transform .12s,background .12s}
  #townPrompt:active{transform:translateX(-50%) scale(.96);background:rgba(40,40,64,.95)}
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
  /* 主菜单底部的版本号 */
  .ver{font-size:10.5px;opacity:.28;letter-spacing:1px;margin-top:10px;
    font-family:ui-monospace,Menlo,Consolas,monospace}
  /* ---------- 图鉴 ---------- */
  .codexcard{max-width:560px}
  .codexprog{font-size:11.5px;opacity:.62;margin:2px 0 10px;text-align:center;line-height:1.9}
  .codexscroll{text-align:left;max-height:58vh;overflow-y:auto;padding-right:4px;
    -webkit-overflow-scrolling:touch}
  .codexsec{font-size:12.5px;font-weight:800;color:#ffd76a;letter-spacing:1px;
    margin:10px 0 8px;padding-left:6px;border-left:3px solid #ffd76a}
  .codexsec:first-child{margin-top:2px}
  .codexsec span{font-weight:400;opacity:.5;font-size:11px;margin-left:6px;color:#e8e8f0}
  .codexgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
  .codexitem{padding:8px 6px;border-radius:11px;background:rgba(255,255,255,.045);
    border:1px solid rgba(255,255,255,.1);text-align:center;transition:.15s;cursor:pointer}
  .codexitem:hover{background:rgba(255,255,255,.1)}
  .codexitem .ce{font-size:26px;line-height:1.25}
  .codexitem .cn{font-size:11.5px;font-weight:700;margin-top:2px}
  .codexitem .cs{font-size:10px;opacity:.6;margin-top:2px;line-height:1.4;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .codexitem.enemy{border-color:rgba(255,120,120,.28)}
  .codexitem.elite{border-color:rgba(255,90,90,.6);background:rgba(255,80,80,.07)}
  .codexitem.locked{opacity:.34;filter:grayscale(1);cursor:default}
  .codexitem.locked .cn{color:#8a8a9a}
  .codexdetail{margin-top:10px;padding:11px 12px;border-radius:11px;
    background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
    font-size:12px;line-height:1.75;min-height:58px}
  .codexdetail .cdname{font-size:13.5px;font-weight:800;color:#ffd76a;margin-bottom:3px}
  .codexdetail .cdrow{opacity:.8}
  .codexdetail .cdskill{color:#8ab4ff;font-weight:700}
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
        # 主菜单显示版本号(以后改版本只需改这里)
        ('<button class="btn tiny" id="btnResetFromMenu">',
         '<div class="ver" id="verTxt">v1.8.2</div>\n'
         '      <button class="btn tiny" id="btnResetFromMenu">'),
        # 主菜单加"查看图鉴"按钮
        ('<button class="btn" id="btnHelp">玩 法 说 明</button>',
         '<button class="btn" id="btnCodex">📖 查 看 图 鉴</button>\n'
         '      <button class="btn" id="btnHelp">玩 法 说 明</button>'),
        # 玩法说明里补一句图鉴
        ('▸ 按 <b>⏸暂停按钮</b> 或 ESC 可暂停/继续',
         '▸ 按 <b>⏸暂停按钮</b> 或 ESC 可暂停/继续<br>\n'
         '        ▸ 主菜单 <b>📖 查看图鉴</b> 记录遇到过的怪物与宠物'),
        # 宠物蛋文案: 12 只已经补齐
        ('<div class="sub">收集 12 生肖伙伴</div>',
         '<div class="sub">收集 12 生肖伙伴（已补齐）</div>'),
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
        # 4a2) 被动生肖宠物的属性加成(马/鸡/牛)
        ("  for (const s of P.skills) {\n    if (s.id === 'expgain') expm += s.lv * 0.10;",
         "  // 被动生肖宠物: 🐴马 提速 / 🐔鸡 提暴击 / 🐮牛 减伤+加血\n"
         "  if (P.pets) {\n"
         "    for (const pet of P.pets) {\n"
         "      if (pet.id === 'horse') spd += Math.min(0.24, pet.lv * 0.02) * (pet.mut ? 2 : 1);\n"
         "      if (pet.id === 'rooster') crit += Math.min(0.30, pet.lv * 0.02);\n"
         "      if (pet.id === 'ox') { armor += Math.min(0.30, pet.lv * 0.02) * (pet.mut ? 2 : 1); hpBonus += pet.lv * 8; }\n"
         "    }\n"
         "  }\n"
         "  for (const s of P.skills) {\n    if (s.id === 'expgain') expm += s.lv * 0.10;"),
        # 4a3) 猪: 金币掉落加成(刻意保守, 避免破坏商店经济)
        ("  G.runGold += e.explode ? 3 : 1;",
         "  let goldGain = e.explode ? 3 : 1;\n"
         "  const pigLv = (P.pets || []).reduce((m, p) => p.id === 'pig' ? Math.max(m, p.lv) : m, 0);\n"
         "  // 最多 +1 枚, 且随等级提高触发概率(20 级时约 +45%)\n"
         "  if (pigLv > 0) {\n"
         "    const chance = Math.min(0.45, 0.10 + pigLv * 0.018);\n"
         "    const bonus = 1 + (Math.random() < chance ? 1 : 0);\n"
         "    goldGain = Math.round(goldGain * bonus);\n"
         "  }\n"
         "  G.runGold += goldGain;"),
        # 4a4) 中毒状态(蛇宠物): 增伤 + 每 0.5 秒持续掉血
        ("  if (e.acid > 0) dmg *= 1.3;\n  if (e.burn > 0) dmg *= (1 + e.burn * 0.05);",
         "  if (e.acid > 0) dmg *= 1.3;\n"
         "  if (e.burn > 0) dmg *= (1 + e.burn * 0.05);\n"
         "  if (e.poison > 0) dmg *= (1 + e.poison * 0.04);   // 中毒状态增伤"),
        ("    if (e.flash > 0) e.flash -= dt;\n    if (e.acid > 0) e.acid -= dt;\n    if (e.burn > 0) e.burn -= dt * 0.5;",
         "    if (e.flash > 0) e.flash -= dt;\n"
         "    if (e.acid > 0) e.acid -= dt;\n"
         "    if (e.burn > 0) e.burn -= dt * 0.5;\n"
         "    if (e.poison > 0) {\n"
         "      // 中毒: 每 0.5 秒结算一次持续伤害, 并逐秒衰减\n"
         "      e.poison -= dt * 0.5;\n"
         "      e.poisonTick = (e.poisonTick || 0) - dt;\n"
         "      if (e.poisonTick <= 0) {\n"
         "        e.poisonTick = 0.5;\n"
         "        const pd = Math.max(1, Math.round(e.poison * 3));\n"
         "        e.hp -= pd; e.flash = 0.06;\n"
         "        if (texts.length < 30) texts.push({ x: e.x + rnd(-6, 6), y: e.y - e.r - 4, v: -40, life: 0.5, max: 0.5, t: String(pd), crit: false });\n"
         "        if (e.hp <= 0) { e.poison = 0; killEnemy(e); }\n"
         "      }\n"
         "    }"),
        # 4a5) 记录"见过的怪物"(图鉴用)
        #      精英必须记具体类型(rex/undead/...), 因为 e.type 永远是 'elite',
        #      而图鉴查的是具体 id, 记 e.type 会导致精英永远点不亮。
        ("  e.dead = true; G.kills++; sfx('kill');",
         "  e.dead = true; G.kills++; sfx('kill');\n"
         "  markSeen('enemy', e.elite ? e.eliteDef : e.type);   // 图鉴: 见过即记录"),
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
        # 11a) 精英生成: 随机抽一种类型, 按其倍率与特性初始化
        ("  enemies.push({\n"
         "    type:'elite', x, y, vx:0, vy:0, r:t.r, size:t.size,\n"
         "    hp: eliteHp, maxHp: eliteHp,\n"
         "    speed: t.speed * (1 + G.diffCount * 0.04),\n"
         "    dmg: t.dmg * (1 + G.diffCount * 0.08),\n"
         "    exp:0, sprite:t.sprite, elite:true, dead:false, atkCd:0, flash:0, acid:0, burn:0\n"
         "  });",
         "  const def = ELITE_TYPES[(Math.random() * ELITE_TYPES.length) | 0];\n"
         "  enemies.push({\n"
         "    type:'elite', eliteDef:def.id, name:def.name, x, y, vx:0, vy:0,\n"
         "    r: t.r * def.rMul, size: t.size * def.rMul,\n"
         "    hp: eliteHp * def.hpMul, maxHp: eliteHp * def.hpMul,\n"
         "    speed: t.speed * def.spdMul * (1 + G.diffCount * 0.04),\n"
         "    dmg: t.dmg * def.dmgMul * (1 + G.diffCount * 0.08),\n"
         "    exp:0, sprite:def.sprite, elite:true, dead:false, atkCd:0, flash:0, acid:0, burn:0,\n"
         "    eliteTrait:def.trait, revived:false, shootCd:1.5, roarCd:4, poisonTick:0\n"
         "  });\n"
         "  markSeen('enemy', def.id);   // 图鉴: 精英一出现就算遇到过"),
        # 11b) 提示里带上精英名字
        ("  toast('⚠ 精英怪降临！屏幕边缘有红色箭头');",
         "  toast('⚠ 精英怪降临：' + def.name + '！屏幕边缘有红色箭头');"),
        # 11c) 精英独有机制(实现在 blackhole.js 的 updateEliteTraits)
        #      顺带修掉原有的 chargeCd 反模式: 原写法 (e.chargeCd || 3) 归零后会被 ||
        #      重置成 3, 于是 <= 0 永不成立 —— 精英的蓄力冲撞从来没触发过。
        #      (这个缺陷在原始单文件 game3.2.html 里就存在)
        ("      e.chargeCd = (e.chargeCd || 3) - dt;\n"
         "      if (e.chargeCd <= 0 && dist < 420) { e.chargeCd = 4.5; e.chargeT = 0.55; effects.push({ kind:'ring', x:e.x, y:e.y, life:0.4, max:0.4, r:110, col:'#ff5f6d' }); }\n"
         "      if (e.chargeT > 0) {\n"
         "        e.chargeT -= dt;\n"
         "        e.x += (dx / dist) * e.speed * 4.5 * dt; e.y += (dy / dist) * e.speed * 4.5 * dt;\n"
         "        // 冲锋期间持续刷新无敌帧, 避免一次冲锋被反复结算伤害\n"
         "        if (P.invuln < 0.12) P.invuln = 0.12;\n"
         "      }",
         "      if (cdTick(e, 'chargeCd', dt) <= 0 && dist < 420) {\n"
         "        e.chargeCd = 4.5; e.chargeT = 0.55;\n"
         "        effects.push({ kind:'ring', x:e.x, y:e.y, life:0.4, max:0.4, r:110, col:'#ff5f6d' });\n"
         "      }\n"
         "      if (e.chargeT > 0) {\n"
         "        e.chargeT -= dt;\n"
         "        e.x += (dx / dist) * e.speed * 4.5 * dt; e.y += (dy / dist) * e.speed * 4.5 * dt;\n"
         "        // 冲锋期间持续刷新无敌帧, 避免一次冲锋被反复结算伤害\n"
         "        if (P.invuln < 0.12) P.invuln = 0.12;\n"
         "      }\n"
         "      if (typeof updateEliteTraits === 'function') updateEliteTraits(e, dt, dx, dy, dist);"),
        # 11d) 石像鬼石甲: 受到伤害 -40%
        ("  const d = Math.max(1, Math.round(dmg));\n"
         "  e.hp -= d; e.flash = 0.09;",
         "  if (e.eliteTrait === 'shield') dmg *= 0.6;\n"
         "  const d = Math.max(1, Math.round(dmg));\n"
         "  e.hp -= d; e.flash = 0.09;"),
        # 11e) 僵尸: 第一次死亡会半血复活并炸出毒雾
        ("function killEnemy(e) {\n  if (e.dead) return;",
         "function killEnemy(e) {\n"
         "  if (e.dead) return;\n"
         "  if (e.elite && e.eliteTrait === 'undead' && !e.revived) {\n"
         "    e.revived = true;\n"
         "    e.hp = Math.max(1, Math.round(e.maxHp * 0.5));\n"
         "    e.flash = 0.3;\n"
         "    effects.push({ kind:'boom', x:e.x, y:e.y, life:0.5, max:0.5, r:150, col:'#8ef07a' });\n"
         "    aoeDamage(e.x, e.y, 150, e.dmg * 0.8);\n"
         "    if (Math.hypot(P.x - e.x, P.y - e.y) < 150 + P.r) damagePlayer(e.dmg * 0.6);\n"
         "    toast('☠ ' + e.name + ' 又站起来了！');\n"
         "    sfx('mut');\n"
         "    return;\n"
         "  }"),
        # 11f) 精英类型查询与冷却推进(图鉴/调试/特性用)
        ("function getHpScale() {",
         "function eliteDefOf(id) {\n"
         "  for (const d of ELITE_TYPES) if (d.id === id) return d;\n"
         "  return ELITE_TYPES[0];\n"
         "}\n"
         "/* 推进一个冷却计时。必须用 undefined 判断, 不能写 (x || 默认值):\n"
         "   因为 0 || 默认值 === 默认值, 会让归零后的冷却被重置, 永远触发不了。 */\n"
         "function cdTick(obj, key, dt) {\n"
         "  if (typeof obj[key] !== 'number') obj[key] = 0;\n"
         "  obj[key] -= dt;\n"
         "  return obj[key];\n"
         "}\n"
         "function getHpScale() {"),
        # 11g) 冰弹减速: 作用在 recalcStats 的最终速度上, 并每帧递减
        ("  P.dmgMult = dmg; P.speed = P.baseSpeed * spd; P.cdr = cdr; P.pickupRange = pick;",
         "  P.dmgMult = dmg;\n"
         "  P.speed = P.baseSpeed * spd * (P.slowT > 0 ? 0.55 : 1);   // 幽魂冰弹减速\n"
         "  P.cdr = cdr; P.pickupRange = pick;"),
        # 11h) 减速计时初值
        ("invuln:0, hurtFlash:0,", "invuln:0, hurtFlash:0, slowT:0,"),
        ("  if (P.hurtFlash > 0) P.hurtFlash -= dt;",
         "  if (P.hurtFlash > 0) P.hurtFlash -= dt;\n"
         "  if (P.slowT > 0) P.slowT -= dt;                   // 冰弹减速剩余时间"),
        # 11i) 冰弹命中玩家 -> 减速(幽魂)
        ("    if (dx * dx + dy * dy < (P.r + b.r) ** 2) { damagePlayer(b.dmg); eBullets.splice(i, 1); continue; }",
         "    if (dx * dx + dy * dy < (P.r + b.r) ** 2) {\n"
         "      damagePlayer(b.dmg);\n"
         "      if (b.chill) {\n"
         "        P.slowT = Math.max(P.slowT || 0, 2.5);\n"
         "        effects.push({ kind:'ring', x:P.x, y:P.y, life:0.4, max:0.4, r:44, col:'#8ad4ff' });\n"
         "      }\n"
         "      eBullets.splice(i, 1); continue;\n"
         "    }"),
        # 12) 调试无敌: dbgGod() 或 dbgNoDamage() 打开时完全不掉血
        ("function damagePlayer(dmg) {\n  if (P.invuln > 0) return;",
         "function damagePlayer(dmg) {\n"
         "  if (P.invuln > 0) return;\n"
         "  // 调试无敌(控制台 dbgGod / dbgNoDamage 打开时)\n"
         "  if (P._god || P._noDamage) return;"),
        # 13) 调试秒杀: dbgGod() 打开时一击必杀
        ("function hurtEnemy(e, dmg, isCrit) {",
         "function hurtEnemy(e, dmg, isCrit) {\n"
         "  if (P._god) dmg = 1e9;          // 调试无敌同时开启一击必杀\n"),
        # 16) 城镇里也要能用摇杆走路
        #     摇杆监听原来只在 G.state === 'playing' 时生效, 城镇是 'town', 被挡掉了。
        #     updateTown() 本来就在读 input.joy, 放开判断即可。
        ("function getPointer(e) {", "function canMoveByDrag() {\n"
         "  // 这些状态都可以用摇杆/拖拽移动(回声小镇复用同一套摇杆)\n"
         "  return G.state === 'playing' || G.state === 'town';\n"
         "}\n"
         "function getPointer(e) {"),
        ("canvas.addEventListener('touchstart', e => { e.preventDefault(); if (G.state !== 'playing') return;",
         "canvas.addEventListener('touchstart', e => { e.preventDefault(); if (!canMoveByDrag()) return;"),
        ("canvas.addEventListener('mousedown', e => { if (G.state !== 'playing') return;",
         "canvas.addEventListener('mousedown', e => { if (!canMoveByDrag()) return;"),
    ],
    # 8) 生肖宠物扩展(兔/蛇/马/羊/猴/鸡/猪/牛): 由 js/pets-extra.js 提供,
    #    合并进 PETS 表, 让"12 生肖"名实相符
    "js/pets.js": [
        ("        }\n      }\n    }\n  },\n};",
         "        }\n      }\n    }\n  },\n"
         "  // 其余 8 只生肖由 js/pets-extra.js 提供并在此合并\n"
         "  ...(typeof PETS_EXTRA !== 'undefined' ? PETS_EXTRA : {}),\n"
         "};"),
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
        # 7b) 精英血条由矩形改为圆环(线宽沿用原来的 10)
        ("    if (e.elite) {\n"
         "      const w = 120, h = 10;\n"
         "      const x = e.x - w / 2, y = e.y - e.r - 26;\n"
         "      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);\n"
         "      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x, y, w, h);\n"
         "      const hpPct = clamp(e.hp / e.maxHp, 0, 1);\n"
         "      const grad = ctx.createLinearGradient(x, y, x + w, y);\n"
         "      grad.addColorStop(0, '#ff4d5e'); grad.addColorStop(1, '#ff8c42');\n"
         "      ctx.fillStyle = grad;\n"
         "      ctx.fillRect(x, y, w * hpPct, h);\n"
         "      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;\n"
         "      ctx.strokeRect(x, y, w, h);\n"
         "      // 血量数字\n"
         "      ctx.font = 'bold 11px system-ui';\n"
         "      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';\n"
         "      ctx.fillStyle = '#fff';\n"
         "      ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 3;\n"
         "      const hpText = Math.ceil(e.hp) + ' / ' + Math.round(e.maxHp);\n"
         "      ctx.strokeText(hpText, e.x, y - 8);\n"
         "      ctx.fillText(hpText, e.x, y - 8);\n"
         "    }",
         "    // 精英怪血条: 环绕本体的圆环(线宽沿用原来的 10)\n"
         "    if (e.elite) {\n"
         "      const ringR = e.r + 14, lw = 10;\n"
         "      const start = -Math.PI / 2;\n"
         "      const hpPct = clamp(e.hp / e.maxHp, 0, 1);\n"
         "      ctx.beginPath(); ctx.arc(e.x, e.y, ringR, 0, TAU);\n"
         "      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = lw + 3; ctx.stroke();\n"
         "      ctx.beginPath(); ctx.arc(e.x, e.y, ringR, 0, TAU);\n"
         "      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = lw; ctx.stroke();\n"
         "      if (hpPct > 0.002) {\n"
         "        const grad = ctx.createLinearGradient(e.x - ringR, e.y, e.x + ringR, e.y);\n"
         "        grad.addColorStop(0, '#ff4d5e'); grad.addColorStop(1, '#ff8c42');\n"
         "        ctx.beginPath();\n"
         "        ctx.arc(e.x, e.y, ringR, start, start + TAU * hpPct);\n"
         "        ctx.strokeStyle = grad; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();\n"
         "        ctx.lineCap = 'butt';\n"
         "      }\n"
         "      ctx.font = 'bold 11px system-ui';\n"
         "      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';\n"
         "      const hpText = Math.ceil(e.hp) + ' / ' + Math.round(e.maxHp);\n"
         "      ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 3;\n"
         "      ctx.strokeText(hpText, e.x, e.y - ringR - 13);\n"
         "      ctx.fillStyle = '#fff';\n"
         "      ctx.fillText(hpText, e.x, e.y - ringR - 13);\n"
         "    }"),
        # 14) 精英标记与血量文字重叠(这段在原始源码里)
        #     脉冲圈半径 46~54 压在血量圆环(半径 r+14=50)上; "精英" 文字在 sy-62,
        #     血量文字在 e.y-ringR-13 也约等于 sy-63, 两行字完全叠在一起。
        #     改法: 圈放大到 62~69, 血量留在圆环上方, 精英名字移到圆环下方。
        ("    ctx.beginPath(); ctx.arc(sx, sy, 46 + pulse * 8, 0, TAU); ctx.stroke();",
         "    // 圈要跟着体型走, 永远画在血量圆环(半径 r+14)之外\n"
         "    const markR = elite.r + 20 + pulse * 7;\n"
         "    ctx.beginPath(); ctx.arc(sx, sy, markR, 0, TAU); ctx.stroke();"),
        ("    ctx.strokeText('精英', sx, sy - 62); ctx.fillText('精英', sx, sy - 62);",
         "    // 名字放到圆环下方, 避开圆环上方的血量数字\n"
         "    const labelY = sy + elite.r + 34;\n"
         "    ctx.strokeText('精英', sx, labelY); ctx.fillText('精英', sx, labelY);"),
        # 15) canvas 字体加中文字体回退(见 fnt 助手)
        ("function render() {\n  if (G.state === 'town') { drawTown(); return; }",
         '/* canvas 字体助手: 带中文字体回退, 并缓存上一次的值。\n   system-ui 在 Windows Chrome 上会映射到 Segoe UI, 没有中文字形,\n   导致 canvas 上的中文渲染成方块。 */\nconst CANVAS_FONT_FAMILY = "\'Microsoft YaHei\', \'PingFang SC\', \'Hiragino Sans GB\', \'Noto Sans CJK SC\', \'WenQuanYi Micro Hei\', system-ui, sans-serif";\nlet _lastFont = \'\';\nfunction fnt(px, weight) {\n  const f = (weight ? weight + \' \' : \'\') + px + \'px \' + CANVAS_FONT_FAMILY;\n  if (f !== _lastFont) { ctx.font = f; _lastFont = f; }\n  return f;\n}\nfunction render() {\n  if (G.state === \'town\') { drawTown(); return; }'),
        ("      ctx.font = 'bold 11px system-ui';\n      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';\n      const hpText",
         "      ctx.font = fnt(11, 'bold');\n      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';\n      const hpText"),
        ("    ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';\n    ctx.fillStyle = '#ff4d5e'; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;\n    // 名字放到圆环下方",
         "    ctx.font = fnt(13, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';\n    ctx.fillStyle = '#ff4d5e'; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;\n    // 名字放到圆环下方"),
        ("  ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';\n  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.9)';",
         "  ctx.font = fnt(13, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';\n  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.9)';"),
        ("  ctx.font = 'bold 10px system-ui'; ctx.lineWidth = 3;",
         "  ctx.font = fnt(10, 'bold'); ctx.lineWidth = 3;"),
        ("    ctx.font = t.crit ? 'bold 17px system-ui' : 'bold 13px system-ui';",
         "    ctx.font = t.crit ? fnt(17, 'bold') : fnt(13, 'bold');"),
        # 16b) 摇杆在城镇里也要显示(canMoveByDrag 定义在 game.js)
        # 16b) 摇杆抽成 drawJoystick(), 城镇与正常游戏都调用
        #      (城镇分支是 drawTown(); return;, 提前返回后原本画不到摇杆)
        ("  if (input.joy.active && G.state === 'playing') {\n"
         "    ctx.save();\n"
         "    ctx.globalAlpha = 0.28; ctx.strokeStyle = '#7c8cff'; ctx.lineWidth = 3;\n"
         "    ctx.beginPath(); ctx.arc(input.joy.ox, input.joy.oy, 58, 0, TAU); ctx.stroke();\n"
         "    ctx.globalAlpha = 0.5; ctx.fillStyle = '#7c8cff';\n"
         "    ctx.beginPath(); ctx.arc(input.joy.ox + input.joy.dx, input.joy.oy + input.joy.dy, 24, 0, TAU); ctx.fill();\n"
         "    ctx.restore();\n"
         "  }",
         "  drawJoystick();"),
        # 城镇分支加了绘制调用
        ("function render() {\n  if (G.state === 'town') { drawTown(); return; }",
         "function render() {\n"
         "  if (G.state === 'town') { drawTown(); drawJoystick(); return; }"),
        # 函数本体加在 render() 前面
        ("function render() {\n  if (G.state === 'town')",
         "/* 虚拟摇杆: 正常游戏与回声小镇共用 */\n"
         "function drawJoystick() {\n"
         "  if (!input.joy.active) return;\n"
         "  if (G.state !== 'playing' && G.state !== 'town') return;\n"
         "  ctx.save();\n"
         "  ctx.globalAlpha = 0.28; ctx.strokeStyle = '#7c8cff'; ctx.lineWidth = 3;\n"
         "  ctx.beginPath(); ctx.arc(input.joy.ox, input.joy.oy, 58, 0, TAU); ctx.stroke();\n"
         "  ctx.globalAlpha = 0.5; ctx.fillStyle = '#7c8cff';\n"
         "  ctx.beginPath(); ctx.arc(input.joy.ox + input.joy.dx, input.joy.oy + input.joy.dy, 24, 0, TAU); ctx.fill();\n"
         "  ctx.restore();\n"
         "}\n"
         "function render() {\n  if (G.state === 'town')"),
    ],
    # 5) 虎宠残留字段 pounceT: 定义了但从未被读取
    "js/ui.js": [
        ("steal:0, pounceT:0, breathT:0", "steal:0, breathT:0", "inline"),
        # 5a) 回主菜单 / 重置存档时也要收起小镇界面(否则小镇顶栏会残留在菜单上)
        ("function backToMenu() {\n  el('pauseVeil').classList.add('hidden'); el('resetVeil').classList.add('hidden');",
         "function backToMenu() {\n"
         "  if (typeof closeNPCDialog === 'function') closeNPCDialog();\n"
         "  if (typeof closeCodex === 'function') el('codex').classList.add('hidden');\n"
         "  el('townBar').classList.add('hidden');\n"
         "  el('townPrompt').classList.add('hidden');\n"
         "  el('btnTownAct').classList.add('hidden');\n"
         "  el('ui').classList.remove('town');\n"
         "  el('pauseVeil').classList.add('hidden'); el('resetVeil').classList.add('hidden');"),
        ("function doResetSave() {",
         "function doResetSave() {\n"
         "  if (typeof closeNPCDialog === 'function') closeNPCDialog();\n"
         "  el('codex').classList.add('hidden');\n"
         "  el('townBar').classList.add('hidden');\n"
         "  el('townPrompt').classList.add('hidden');\n"
         "  el('btnTownAct').classList.add('hidden');\n"
         "  el('ui').classList.remove('town');"),
        # 5b) startGame 里初始化特殊能力计时 + 记录出战宠物(图鉴)
        ("  const starters = ['homing', 'sword', 'lightning', 'bomb'];",
         "  P.wingT = 0; P.bootsT = 0; P.specials = {};   // 特殊能力计时\n"
         "  P._monkeyT = 0; P._monkeyCast = 0; P._pigT = 0; P._horseTrail = 0;\n"
         "  if (typeof backfillSeenPets === 'function') backfillSeenPets();   // 图鉴: 已解锁的宠物记为已遇到\n"
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
        "el('btnCodex').onclick = () => openCodex();\n"
        "el('btnCodexBack').onclick = () => closeCodex();\n"
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
# 精英类型表排在最先(所有后续脚本地引用 ELITE_TYPES)
script_order = ["elite-types.js"]
for mod in used:
    filename, label = MODULE_HEADER[mod]
    body = "\n".join(tidy(module_lines[mod]))
    manifest.append(("js/%s" % filename, (BANNER % label) + "\n" + body + "\n"))
    # 宠物扩展表必须排在 pets.js 之前(pets.js 求值时要读取 PETS_EXTRA)
    if mod == "pets":
        script_order.append("pets-extra.js")
    script_order.append(filename)

# 黑洞小镇模块: 源码已存在于 js/blackhole.js。
# 它不由本脚本生成, 但把它的当前内容也记进"期望内容", 这样 verify.py 能发现手工改动。
with io.open(os.path.join(ROOT, BLACKHOLE), encoding="utf-8", newline="") as f:
    manifest.append((BLACKHOLE, f.read().replace("\r\n", "\n")))

# 生肖宠物扩展表: 源码在 js/pets-extra.js, 必须紧跟 js/pets.js 之后加载
with io.open(os.path.join(ROOT, PETS_EXTRA), encoding="utf-8", newline="") as f:
    manifest.append((PETS_EXTRA, f.read().replace("\r\n", "\n")))

# 精英类型表: 手写模块
with io.open(os.path.join(ROOT, ELITE_TYPES), encoding="utf-8", newline="") as f:
    manifest.append((ELITE_TYPES, f.read().replace("\r\n", "\n")))

# 控制台调试指令: 最后加载(依赖前面所有模块的全局函数)
with io.open(os.path.join(ROOT, DEBUG_CMDS), encoding="utf-8", newline="") as f:
    manifest.append((DEBUG_CMDS, f.read().replace("\r\n", "\n")))

# 黑洞小镇模块: 源码已存在于 js/blackhole.js
script_order.append("blackhole.js")
script_order.append("debug-cmds.js")

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
