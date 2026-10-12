# -*- coding: utf-8 -*-
"""
校验拆分结果:
  1) css/style.css 与源文件 <style> 内容一致
  2) 各 js 模块去掉文件头 banner 后, 按"源码中出现的顺序"拼起来, 与源文件
     <script> 内容在忽略空行的前提下完全一致 —— 即一行代码都没丢、没多
  3) index.html 结构与源文件一致(仅多了 css/js 引用)
  4) 用 node --check 对各模块做语法检查
"""
import io
import os
import re
import subprocess

SRC = r"C:\Users\smile\Desktop\game3.2.html"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = r"C:\Users\smile\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

lines = io.open(SRC, encoding="utf-8").read().replace("\r\n", "\n").split("\n")
so = next(i for i, l in enumerate(lines, 1) if l.strip() == "<style>")
sc = next(i for i, l in enumerate(lines, 1) if l.strip() == "</style>")
jo = next(i for i, l in enumerate(lines, 1) if l.strip() == "<script>")
jc = next(i for i, l in enumerate(lines, 1) if l.strip() == "</script>")


def rd(rel):
    with io.open(os.path.join(ROOT, rel), encoding="utf-8", newline="") as f:
        return f.read().replace("\r\n", "\n")


def sig(s):
    """只保留非空行, 去掉行尾空白"""
    return [l.rstrip() for l in s.split("\n") if l.strip()]


html, css = rd("index.html"), rd("css/style.css")
order = re.findall(r'<script src="js/([^"]+)"></script>', html)
ok = True

# ---- 1. CSS ----
r = ("\n".join(lines[so:sc - 1]).strip("\n") + "\n") == css
ok &= r
print("[%s] css/style.css == 源文件 <style> 内容" % ("OK  " if r else "FAIL"))

# ---- 2. JS: 按源码原始顺序拼接 ----
BANNER_RE = re.compile(r"\A/\* =+\n.*?\n.*?\n.*?=+ \*/\n\n", re.S)
bodies = {}
for name in order:
    b = rd("js/" + name)
    if not BANNER_RE.match(b):
        print("[FAIL] js/%s 缺少文件头注释" % name)
        ok = False
    bodies[name] = BANNER_RE.sub("", b, count=1)

# 源码中的出现顺序(与 split.py 的 MODULE_ORDER 一致)
SOURCE_ORDER = ["utils.js", "audio.js", "game.js", "pets.js",
                "skills.js", "render.js", "ui.js"]
assert set(SOURCE_ORDER) == set(order), (SOURCE_ORDER, order)

rebuilt = sig("\n".join(bodies[n] for n in SOURCE_ORDER))
original = sig("\n".join(lines[jo:jc - 1]))

# 拆分把同类代码归并到了不同文件, 因此行的先后顺序会变; 这里比较"行内容的多重集合"
# 是否完全相等: 既不丢代码, 也不多出代码。
from collections import Counter
ca, cb = Counter(rebuilt), Counter(original)
r = ca == cb
ok &= r
print("[%s] js 代码无丢失/无多余 (源 %d 行 / 拆分 %d 行)" %
      ("OK  " if r else "FAIL", len(original), len(rebuilt)))
if not r:
    for line, n in (cb - ca).items():
        print("     丢失或数量不足: %s" % line.encode("unicode_escape").decode()[:110])
    for line, n in (ca - cb).items():
        print("     多出: %s" % line.encode("unicode_escape").decode()[:110])

# ---- 3. HTML ----
exp = list(lines[:so - 1]) + ['<link rel="stylesheet" href="css/style.css">'] + \
      list(lines[sc:jo - 1]) + ['<script src="js/%s"></script>' % n for n in order] + \
      ["</body>", "</html>"]
r = sig("\n".join(exp)) == sig(html)
ok &= r
print("[%s] index.html 结构一致" % ("OK  " if r else "FAIL"))

# ---- 4. 语法检查 ----
for name in order:
    cp = subprocess.run([NODE, "--check", os.path.join(ROOT, "js", name)],
                        capture_output=True, text=True)
    r = cp.returncode == 0
    ok &= r
    print("[%s] node --check js/%s" % ("OK  " if r else "FAIL", name))
    if not r:
        print("      " + cp.stderr.strip()[:300].replace("\n", "\n      "))

# ---- 5. 统计 ----
print("")
print("文件清单:")
for rel in ["index.html", "css/style.css"] + ["js/" + n for n in SOURCE_ORDER]:
    t = rd(rel)
    print("   %-16s %6d bytes  %4d lines" % (rel, len(t.encode("utf-8")), t.count("\n")))
print("")
print("结论: " + ("全部校验通过" if ok else "存在问题"))
