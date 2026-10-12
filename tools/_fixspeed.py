# -*- coding: utf-8 -*-
"""修正精英补丁: 该行匹配的应是"已被风之翼补丁改过"的文本"""
import io

P = r"C:\Users\smile\Documents\deepseek-harness\default-workspace\endless-echo\tools\split.py"
lines = io.open(P, encoding="utf-8").read().split("\n")

# 找到新增的 10c 减速补丁(它的 find 串是旧文本, 要换成改后的文本)
i = next(i for i, l in enumerate(lines) if 'P.speed * (P.wingT > 0 ? 1.9 : 1);   // 风之翼加速' in l
         and l.strip().startswith('("'))
print("原 find 串:", lines[i].strip()[:90])
lines[i] = '        ("  const spd = P.speed * (P.wingT > 0 ? 1.9 : 1);   // 风之翼加速",'
# 它的 replace 串也要跟着改成基于新文本
print("原 replace:", lines[i + 1].strip()[:90])
lines[i + 1] = ('         "  const slowMul = P.slowT > 0 ? 0.55 : 1;           // 被冰弹减速\\\\n"\n'
                '         "  const spd = P.speed * (P.wingT > 0 ? 1.9 : 1) * slowMul;   // 风之翼加速"),')
# 删掉原来多出来的那一行(它把 replace 拆成了两行)
if 'P.x += mx * spd * dt' in lines[i + 2]:
    del lines[i + 2]

io.open(P, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
print("已修正")
