# 无尽回响 · Endless Echo

一个纯前端（零依赖、零构建）的 Roguelike 生存小游戏。手机、平板、桌面浏览器都能直接玩。

拖动屏幕控制角色移动，攻击全自动；击杀怪物掉落经验球，升级后三选一强化；
每 10 级刷新精英怪；地图上会随机出现传送商店；金币可以孵化生肖宠物。

## 在线试玩

部署到 GitHub Pages 后访问：`https://<你的用户名>.github.io/<仓库名>/`

## 本地运行

不需要安装任何依赖，任选一种方式：

```bash
# 方式一：直接用浏览器打开 index.html（双击即可）
# 方式二：起一个静态服务器（推荐，避免个别浏览器的本地文件限制）
python -m http.server 8000
# 然后访问 http://localhost:8000
```

## 目录结构

```
.
├── index.html          # 页面结构（引入 css/ 与 js/）
├── css/
│   └── style.css       # 全部样式
├── js/
│   ├── utils.js        # 常量与工具函数（TAU / rnd / clamp / fmtTime ...）
│   ├── audio.js        # Web Audio 音频引擎：循环 BGM + 音效合成
│   ├── game.js         # 游戏状态、数值成长、战斗与推进逻辑
│   ├── pets.js         # 宠物表（生肖伙伴）
│   ├── skills.js       # 技能表与属性表
│   ├── render.js       # 全部 Canvas 绘制
│   └── ui.js           # DOM 界面交互与主循环
└── tools/
    ├── split.py        # 从单文件版本拆分出 index.html / css / js
    ├── verify.py       # 校验拆分没有丢代码（逐行比对 + 语法检查）
    └── smoke-test.js   # 用 DOM 桩在 Node 里跑运行时冒烟测试
```

> `js/` 里的 7 个文件都是**经典 script**，按 `index.html` 中的顺序加载、共享同一个全局作用域，
> 顺序不能随意调换（数组里是依赖顺序：工具函数 → 音频 → 核心逻辑 → 数据表 → 绘制 → 界面）。

## 玩法说明

| 操作 | 说明 |
| --- | --- |
| 移动 | 按住屏幕任意位置拖动（虚拟摇杆），或键盘 `WASD` / 方向键 |
| 攻击 | 全自动，无需操作 |
| 升级 | 每次升级弹出三选一：新技能 / 技能升级 / 属性强化 |
| 技能 | 最多 6 个，每个可叠到 10 层；第 11 层触发**变异**（二选一改变机制） |
| 精英怪 | 每 10 级刷新一只，击杀后小怪永久增强，屏幕边缘有红色箭头指示 |
| 传送商店 | 地图上随机出现，用局内金币购买临时强化 |
| 宠物蛋 | 主菜单进入，用金币孵化随机生肖宠物，最多 2 只出战 |
| 暂停 | 右上角 ⏸ 按钮或 `ESC` |
| 音效 | 右上角 🔊 按钮开关 |

- **无尽模式**：活下去，越久越强。
- **挑战模式**：存活 15 分钟即为通关。

进度保存在浏览器 `localStorage`（键名 `endless_echo_save_v2`），主菜单与暂停界面都可以重置存档。

## 开发工具

改动源码后重新拆分与校验：

```bash
python tools/split.py       # 重新生成 index.html / css/ / js/
python tools/verify.py      # 校验：代码无丢失、HTML 结构一致、node --check 通过
node tools/smoke-test.js    # 运行时冒烟测试（无需浏览器）
```

`tools/split.py` 顶部的 `SRC` 指向单文件版本 `game3.2.html`，需要按你的实际路径修改。

## 兼容性

- 使用 Canvas 2D、Web Audio、Pointer/Touch 事件与 `env(safe-area-inset-*)`。
- 建议使用较新的 Chrome / Edge / Safari / Firefox。
- 表情符号作为素材渲染，系统需要支持彩色 emoji 字体。

## 许可

[MIT](LICENSE)
