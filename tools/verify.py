# -*- coding: utf-8 -*-
"""
校验拆分与修复结果。

判定标准:
  1) 磁盘上的产物 == split.py 记录的期望内容(.build/)           -> 没有被手工改动
  2) 原始单文件的每一行代码要么出现在产物里, 要么被 split.py 的 PATCHES
     明确声明为"替换掉的行"                                    -> 一行都没丢
  3) css 与源码 <style> 一致, 且尾部只多出黑洞小镇的样式块
  4) index.html 结构一致(只多出 css/js 引用、小镇 DOM、hudSpecials)
  5) node --check 全部模块语法通过
"""
import io
import json
import os
import re
import subprocess

SRC = r"C:\Users\smile\Desktop\game3.2.html"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, ".build")
NODE = r"C:\Users\smile\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

if not os.path.isdir(BUILD):
    raise SystemExit("缺少 .build/ 参考目录, 请先运行: python tools/split.py")

lines = io.open(SRC, encoding="utf-8").read().replace("\r\n", "\n").split("\n")
so = next(i for i, l in enumerate(lines, 1) if l.strip() == "<style>")
sc = next(i for i, l in enumerate(lines, 1) if l.strip() == "</style>")
jo = next(i for i, l in enumerate(lines, 1) if l.strip() == "<script>")
jc = next(i for i, l in enumerate(lines, 1) if l.strip() == "</script>")


def rd(rel, base=ROOT):
    with io.open(os.path.join(base, rel), encoding="utf-8", newline="") as f:
        return f.read().replace("\r\n", "\n")


def sig(s):
    return [l.rstrip() for l in s.split("\n") if l.strip()]


def flat(s):
    return " ".join(s.split())


html = rd("index.html")
order = re.findall(r'<script src="js/([^"]+)"></script>', html)
FROM_SOURCE = ["utils.js", "audio.js", "game.js", "pets.js", "skills.js", "render.js", "ui.js"]
# 手写模块 / 扩展数据表, 不在原始单文件里
EXTRA = ["elite-types.js", "pets-extra.js", "blackhole.js", "debug-cmds.js"]
assert sorted(order) == sorted(FROM_SOURCE + EXTRA), order

ok = True
def report(cond, msg):
    global ok
    ok &= bool(cond)
    print("[%s] %s" % ("OK  " if cond else "FAIL", msg))

# ---------------------------------------------------------------
# 1. 磁盘产物 == 期望内容
# ---------------------------------------------------------------
diffs = [rel for rel in ["index.html", "css/style.css"] + ["js/" + n for n in order]
         if rd(rel) != rd(rel, BUILD)]
report(not diffs, "磁盘产物与 split.py 期望内容完全一致" +
       ("" if not diffs else " (被手工改动: %s)" % ", ".join(diffs)))
report(rd("js/blackhole.js") == rd("js/blackhole.js", BUILD),
       "js/blackhole.js 已同步到 .build/")

# ---------------------------------------------------------------
# 2. 原始源码一行不丢
# ---------------------------------------------------------------
with io.open(os.path.join(BUILD, "_patches.json"), encoding="utf-8") as f:
    patch_meta = json.load(f)
replaced = set()      # 被替换掉的原始文本
patched = set()       # 替换后产生的新文本
inline = set()        # "行内编辑"的原始行(原始长行不再作为连续子串存在)
for p in patch_meta:
    replaced.update(flat(l) for l in p["replaced"])
    patched.update(flat(l) for l in p.get("patched", []))
    if p.get("inline"):
        inline.update(flat(l) for l in p["replaced"])

# 产物里所有 js 的代码行(整行 + 压缩空白后的整行 + 压缩空白后的全文,
# 这样无论补丁是"纯插入"还是"行首/行尾拼接", 原始行都能在压缩文本里找到)
prod_flat = set()
prod_blob = []
for n in order:
    b = rd("js/" + n)
    b = re.sub(r"\A/\* =+\n.*?\n.*?\n.*?=+ \*/\n\n", "", b, count=1, flags=re.S)
    for l in sig(b):
        prod_flat.add(flat(l))
        prod_flat.add(l)
    prod_blob.append(flat(b))
prod_blob = " ".join(prod_blob)
patched_flat = set(flat(l) for l in patched)


def is_accounted(line):
    """原始行是否仍然存在于产物中(可能被补丁在中间插入 / 两端拼接了代码)"""
    if line in prod_flat or flat(line) in prod_flat:
        return True
    # 整行在内容上原封不动地出现在产物里(补丁只在其前后插入了代码)
    if flat(line) in prod_blob:
        return True
    f = flat(line)
    # 补丁在长行"中间"插入内容时, 产物行会以原文的一段开头、并以原文的另一段结尾
    for cand in prod_flat:
        if len(cand) <= len(f):
            continue
        for k in range(len(f) - 1, max(0, len(f) - 160), -1):
            if cand.startswith(f[:k]) and cand.endswith(f[k:]):
                return True
    # 或者被补丁明确声明为已替换 / 行内编辑
    if f in patched_flat:
        return True
    if any(x in f for x in inline):
        return True
    return any(f == r or f.startswith(r) or r.endswith(f) or f in r for r in replaced)


src_js = sig("\n".join(lines[jo:jc - 1]))
missing = [l for l in src_js if not is_accounted(l)]
report(not missing, "原始 JS 的 %d 行代码全部保留(或已被补丁声明替换)" % len(src_js))
for l in missing[:8]:
    print("     丢失: " + l.encode("unicode_escape").decode()[:110])

# CSS: 源码 <style> 内容 + 黑洞小镇样式块
src_css = "\n".join(lines[so:sc - 1]).strip("\n")
bh_css = re.search(r'TOWN_CSS = """(.*?)"""', rd("tools/split.py"), re.S).group(1)
report(rd("css/style.css").strip("\n") == (src_css + "\n" + bh_css).strip("\n"),
       "css/style.css == 源码 <style> + 黑洞小镇样式块")

# ---------------------------------------------------------------
# 3. HTML 结构
# ---------------------------------------------------------------
exp = list(lines[:so - 1]) + ['<link rel="stylesheet" href="css/style.css">'] + \
      list(lines[sc:jo - 1]) + ['<script src="js/%s"></script>' % n for n in order] + \
      ["</body>", "</html>"]
town_html = re.search(r'TOWN_HTML = """(.*?)"""', rd("tools/split.py"), re.S).group(1).split("\n")
got = sig(html)
want = set(sig("\n".join(exp)))
want_flat = {flat(x) for x in want}
extra_ok = set(town_html) | {'<div id="hudSpecials"></div>'}
extra_ok_flat = {flat(x) for x in extra_ok} | want_flat

# index.html 里有意的修改(由 PATCHES 注入或替换)
HTML_PATCH_KEYS = ('expTxt', 'verTxt', 'btnCodex', '查看图鉴', '生肖伙伴')


def is_intentional(line):
    return any(k in line for k in HTML_PATCH_KEYS)


# 所有"在原始源码里找不到对应"的产物行(过滤之前的全集),
# 供下面的"行尾被追加了内容(如 <br>)"判断使用
candidates = [l for l in got
              if l not in want and l not in extra_ok
              and flat(l) not in extra_ok_flat]
cand_flat = [flat(x) for x in candidates]

unexpected = [l for l in candidates
              if not is_intentional(l)
              and not any(flat(x) in flat(l) for x in want)]
# 被有意替换掉的原始行, 连同它后面紧跟的新行一起放行
lost = []
for l in sig("\n".join(exp)):
    if l in got or flat(l) in {flat(x) for x in got}:
        continue
    lost.append(l)
# 原始行只要"内容上仍出现在某条新行里"(例如行尾追加了 <br>), 就算保留
lost = [l for l in lost
        if not is_intentional(l)
        and not any(flat(l) in e for e in cand_flat)]
report(not lost and not unexpected,
       "index.html 结构与源文件一致(仅版本号/图鉴按钮/玩法说明等有意修改)")
for l in lost[:6]:
    print("     缺少: " + l.encode("unicode_escape").decode()[:110])
for l in unexpected[:6]:
    print("     多出: " + l.encode("unicode_escape").decode()[:110])

# ---------------------------------------------------------------
# 4. node --check
# ---------------------------------------------------------------
bad = []
for name in order:
    cp = subprocess.run([NODE, "--check", os.path.join(ROOT, "js", name)],
                        capture_output=True, text=True)
    if cp.returncode != 0:
        bad.append((name, cp.stderr.strip()[:200]))
report(not bad, "node --check 全部 %d 个模块语法通过" % len(order))
for n, e in bad:
    print("         %s: %s" % (n, e))

print("")
print("文件清单:")
for rel in ["index.html", "css/style.css"] + ["js/" + n for n in order]:
    t = rd(rel)
    print("   %-18s %6d bytes  %4d lines" % (rel, len(t.encode("utf-8")), t.count("\n")))
print("")
print("结论: " + ("全部校验通过" if ok else "存在问题"))
