# 单文件版本归档 / Original single-file releases

这里存放**拆分之前**的原始单文件版本，作为项目演进的"源头存档"。

仓库根目录的 `index.html` + `css/` + `js/` 是由 `tools/split.py` 从这些单文件**自动拆分**出来的，
拆分时还会通过 `PATCHES` 表应用一批修复（详见根目录 README）。

## 已归档

| 文件 | 版本 | 说明 |
| --- | --- | --- |
| `game3.2.html` | **v1.5.3** | 加入黑洞随机事件 + 回声小镇的版本。也是 `js/`、`css/`、`index.html` 的拆分来源 |

## 尚未归档

早期版本（仅有普通小怪的初版、加入精英怪的版本、加入宠物的版本、加入多种怪物的版本）
当初是在**手机上的 DeepSeek App** 里对话生成的，没有导出成文件传到电脑，
因此仓库里暂时没有它们的源码。如果以后从手机导出，放在这个目录即可。

## 怎么用

```bash
# 重新从单文件版本生成 index.html / css/ / js/
# 编辑 tools/split.py 顶部的 SRC 指向本目录的文件
python tools/split.py
python tools/verify.py     # 校验拆分没有丢代码
```

## 文件格式说明

这些单文件把 HTML、CSS、JS 全部内联在一个 `<html>` 里：

```
<style> ... 全部 CSS ... </style>
<script> ... 全部 JS ... </script>
```

`tools/split.py` 按里面的分节注释（`/* ---------- 音频 ---------- */` 等）和关键函数位置
把它切成 `utils / audio / game / pets / skills / render / ui / blackhole` 八个模块。
