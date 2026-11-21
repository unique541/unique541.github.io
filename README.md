---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 3b8ddf290b7a1c33bf8fdf1e3c983246_9fb823b8d03111f1a443525400393706
    ReservedCode1: dXZn1xD6EfPCnzXm8hnZY4poc2dljxwxU3GR/zkau7GLI+5aI6lrmlZHI6lXdyIruyOvt8BhDWtUu4tJUbLwigesaYxGDkmSJX/Bgx5Vir+S8hiRQzPQED6maMnvotEyK4Pg49id9biqgFDm9xojtCEhS8pU8zMNIYPFoId11fvSdeSahDv1kcjU6FM=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 3b8ddf290b7a1c33bf8fdf1e3c983246_9fb823b8d03111f1a443525400393706
    ReservedCode2: dXZn1xD6EfPCnzXm8hnZY4poc2dljxwxU3GR/zkau7GLI+5aI6lrmlZHI6lXdyIruyOvt8BhDWtUu4tJUbLwigesaYxGDkmSJX/Bgx5Vir+S8hiRQzPQED6maMnvotEyK4Pg49id9biqgFDm9xojtCEhS8pU8zMNIYPFoId11fvSdeSahDv1kcjU6FM=
---

﻿# breezebox

由个人维护的纯静态资源站：精选软件 · 系统工具 · 游戏资源 · 在线音乐，一站下载。

## GitHub Pages 部署方法

1. 将本目录推送到 GitHub 仓库（例如 `https://github.com/<your>/<repo>.git`）。
2. 在仓库 **Settings → Pages** 中，将部署来源（Build and deployment）设为 **Deploy from a branch**，分支选择 `main`，目录选择 `/ (root)`。
3. 保存后等待 1~2 分钟，GitHub 会自动构建并发布，站点地址为 `https://<your>.github.io/<repo>/`。
4. 之后每次 `git push`，Pages 会自动更新。

> 站点为纯静态，不依赖 `start_server.py` 或任何后端路由；`start_server.py` 仅保留用于本地预览（`python start_server.py`）。

## downloads 目录放置规则

页面中的下载/播放链接均为相对 `downloads/` 的路径，实体文件需自行放入本仓库的 `downloads/` 目录，**结构必须与数据快照中的 `rel_path` 一致**：

| 内容 | 放置位置 |
|---|---|
| 顶层资源文件 / 各合集文件 | `downloads/` 下镜像桌面「U盘备份」的目录结构（`downloads/合集名/...`） |
| 自创软件 | `downloads/自制软件/`（如 `downloads/自制软件/NovaLauncher_Setup.exe`） |
| 音乐 | `downloads/音乐/`（如 `downloads/音乐/海阔天空.flac`） |

`downloads/.gitkeep` 用于保留目录；实体文件较大，是否提交到仓库由你自行决定（可改用 Git LFS 或其它托管方式，仅需保证线上 `downloads/` 下文件路径与快照一致）。

## 外链托管（links.json）

线上空间有限（GitHub Pages 无法容纳音乐 14.81GB / U盘备份 43.85GB），推荐用国内网盘托管实体，站点只做跳转：

编辑 `assets/data/links.json`，键为资源的**相对路径**（与 `resources.json` / `children.json` / `music.json` 中的 `rel_path` 完全一致），值为网盘分享链接：

```json
{
  "音乐/海阔天空.flac": "https://pan.baidu.com/s/1xxxxxx 提取码: abcd",
  "自制软件/setup.exe": "https://pan.quark.cn/s/xxxxxxx",
  "某个合集/某文件.zip": "https://www.123pan.com/s/xxxxxxx"
}
```

- 以 `_` 开头的键（如 `_comment`、`_format`）为说明项，程序自动忽略。
- 页面上所有下载 / 播放地址按**三级优先级**解析（`assets/js/api.js` 的 `API.resolve`）：
  1. `links.json` 中有该路径的外链 → 使用外链，新窗口打开（`rel="noopener noreferrer"`）；
  2. 无外链，但 `downloads/` 下确实存在该实体文件（由 `assets/data/available.json` 判定）→ 使用 `downloads/` 相对路径；
  3. 两者都没有 → 按钮置灰显示「暂无下载 · 待上传」/「待托管」，点击不发出任何请求，不会产生 404。
- 修改 `links.json` 后**无需**重新运行 `build_static.py`，刷新页面即可生效（浏览器缓存已禁用）。

## 本地预览

页面通过 `fetch` 读取 `assets/data/*.json`，因此**必须用 HTTP 方式打开**，直接双击 `index.html`（`file://`）会因浏览器安全策略导致数据加载失败：

```
python -m http.server 8000
```

然后访问 `http://localhost:8000/index.html`（或沿用 `python start_server.py`）。修改数据后刷新即可，无需重启服务。

## 更新数据方法（build_static.py）

资源/音乐有增删改后，在本目录运行：

```
python build_static.py
```

脚本会扫描桌面「U盘备份」与网站内「自制软件」「音乐」，重新生成数据快照：

- `assets/data/resources.json` — 顶层资源列表
- `assets/data/children.json` — 各合集内部文件清单
- `assets/data/music.json` — 音乐列表（含相对 `downloads/` 的播放/下载地址）
- `assets/data/available.json` — `downloads/` 下**实际存在**的文件相对路径清单（供前端静态判断，缺失则按钮置灰）

生成后把改动提交推送即可。新增实体请放入 `downloads/` 对应目录；使用网盘托管则登记到 `assets/data/links.json`，两者都没有的资源页面会显示「待托管」，不会报 404。

## 目录结构

```
├── index.html / library.html / detail.html / music.html  页面
├── assets/
│   ├── css/style.css        样式
│   ├── js/                  页面脚本（api.js 为静态数据源封装）
│   └── data/                静态数据（resources.json / children.json / music.json / links.json / available.json）
├── downloads/               下载/播放实体文件（自行放置）
├── 自制软件/ 音乐/           本地数据源（实体可不上传，靠 build_static.py 生成快照）
├── build_static.py          数据快照生成脚本
└── start_server.py          本地预览服务（页面脚本不依赖）
```

