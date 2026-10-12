# -*- coding: utf-8 -*-
"""
把单文件游戏 game3.2.html 拆分为 index.html + css/ + js/

  <style>...</style>    -> css/style.css
  <script>...</script>  -> js/utils.js  js/audio.js  js/game.js
                           js/skills.js js/pets.js   js/render.js

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
    "index.html": [
        ('<span id="expTxt">0 / 8</span>',
         '<span id="expTxt">0 / 7</span>'),
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
    # 3) 切到后台/锁屏时游戏不会暂停: 生存类游戏里玩家回来后往往已经死了。
    #    策略: 切走就暂停(一定不会白死); 离开不到 3 秒且没弹菜单的, 回来静默继续;
    #    离开久了或已经弹出暂停菜单的, 等玩家自己点继续。手动暂停不受影响。
    "js/ui.js": [
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
manifest = [("css/style.css", "\n".join(css_body).strip("\n") + "\n")]
script_order = []
for mod in used:
    filename, label = MODULE_HEADER[mod]
    body = "\n".join(tidy(module_lines[mod]))
    manifest.append(("js/%s" % filename, (BANNER % label) + "\n" + body + "\n"))
    script_order.append(filename)

html = []
html.extend(lines[:style_open - 1])                 # <!DOCTYPE ... <title>
html.append('<link rel="stylesheet" href="css/style.css">')
# lines[style_close:script_open-1] 已包含 "</style>" 之后的 "</head>" 与 "<body>"
html.extend(lines[style_close:script_open - 1])     # </head> <body> 及 DOM 结构
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
    for old, new in rules:
        if old not in content:
            raise SystemExit("补丁未匹配(源码可能已改动): %s -> %s" %
                             (rel, old.split("\n")[0][:60]))
        if content.count(old) != 1:
            raise SystemExit("补丁匹配到多处, 需更精确: %s" % rel)
        content = content.replace(old, new, 1)
        # 记录被替换掉的行, 供 verify.py 核对"没有牵连其它代码"
        patch_meta.append({
            "file": rel,
            "replaced": [l.rstrip() for l in old.split("\n") if l.strip()],
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
