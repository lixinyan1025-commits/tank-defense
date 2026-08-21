# 坦克防线

《坦克防线》是一款桌面浏览器优先的俯视角像素坦克游戏。玩家需要守护“浪尖核心”，利用可破坏砖墙、钢墙、水域、草地和随机技能击退五波敌军。

在线试玩：<https://lixinyan1025-commits.github.io/tank-defense/>

单文件 HTML 版：<https://lixinyan1025-commits.github.io/tank-defense/tank-defense.html>

## 已实现玩法

- WASD/方向键四方向移动，空格发射炮弹。
- 玩家生命、基地耐久、得分、连击及胜负结算。
- 普通、快速、重装、狙击、反弹和 Boss 坦克。
- 巡逻、追踪、转向、射击和破墙等敌人行为。
- 砖墙、钢墙、水域和草地四类地形。
- 地图中央由砖墙组成的 LXY 标识。
- 地图底图显示完整“浪尖大学社区”。
- 17 种技能：分裂、反弹、穿透、冰冻、闪电、火焰、混乱、减速、空袭、僚机、地雷、修墙、传送、回血、护盾、超频和 EMP。
- 开局直接投放 6 个随机战术箱，拾取时显示“空格发射”或“Q 释放”。
- 右侧战术模块持续显示最近拾取、当前弹药、当前主动技能、剩余次数和详细操作方法。
- 玩家攻击不会误伤浪尖核心，方向键和空格不会再带动网页滚动。
- 第五波出现非坦克 Boss“潮汐巨兽”，会蓄力发射八方向潮汐弹幕。
- 击毁敌人积累“LXY 浪尖共鸣”，满值自动清除敌弹、控场并修复基地。
- 中央 LXY 使用更清晰的 5×7 大字点阵，签名砖带青色描边和额外耐久。
- 程序化像素美术、粒子反馈、震屏和 Web Audio 合成音效。
- GitHub Pages 自动部署工作流。

## 操作

- `W/A/S/D` 或方向键：移动
- `Space`：射击
- `Q`：使用主动技能
- `P` 或 `Esc`：暂停/继续

## 本地运行

需要 Node.js 24 或兼容版本。

```bash
npm install
npm run dev
```

浏览器打开终端输出的本地地址。

## 测试与构建

```bash
npm test
npm run build
npm run build:html
npm run preview
```

生产文件输出到 `dist/`。执行 `npm run build:html` 会额外生成可独立交付的 `dist/tank-defense.html`，游戏代码、样式和图标都内嵌在这个 HTML 文件中。

## GitHub Pages 部署

仓库名称建议使用 `tank-defense`，默认分支为 `main`。推送后：

1. 在 GitHub 仓库的 Settings → Pages 中，将 Source 设置为 GitHub Actions。
2. 推送到 `main`。
3. `.github/workflows/deploy-pages.yml` 会自动测试、构建并部署。
4. 当前项目地址为 <https://lixinyan1025-commits.github.io/tank-defense/>。

若仓库名不是 `tank-defense`，请同步修改 `vite.config.ts` 中的 `base`。

## 文档

- [完整技术设计文档](docs/坦克防线-网页游戏技术设计文档.md)
- [素材与许可记录](ASSET_LICENSES.md)
