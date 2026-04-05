# 演出中台

一个基于 `Express + React(Vite)` 的演出管理与播控小系统，支持文件上传、节目单维护、主持人口播词生成、当前演出展示与 PDF 导出。
# 演出中台

一个基于 `Express + React(Vite)` 的演出管理与播控小系统，支持文件上传、节目单维护、主持人口播词生成、当前演出展示与 PDF 导出。

## 系统音频输出与录制映射（跨平台）

本项目的录音实现位于 [backend/services/recordingService.js](backend/services/recordingService.js)，当前能力是“枚举录音输入设备”和“使用 ffmpeg 录制指定输入”，不是直接修改操作系统默认输出设备。若要实现“自动切换系统输出”，需要后端调用各平台自己的系统命令或工具。

### 能力边界

- ffmpeg：负责录制、转码、监测音量，不负责切换系统默认输出。
- 系统输出切换：必须依赖 macOS / Windows / Linux 各自的命令行工具或音频服务。
- 前端：只能发起切换请求，不能直接改系统音频路由。

### 平台映射方案

| 平台 | 列出输出设备 | 切换默认输出 | 常见录制对象 |
| --- | --- | --- | --- |
| macOS | `SwitchAudioSource -a` | `SwitchAudioSource -t output -s <name>` | BlackHole、Loopback、内建输出、麦克风输入 |
| Windows | `SoundVolumeView` / `NirCmd` | `SoundVolumeView` / `NirCmd` | VB-Cable、Voicemeeter、Stereo Mix、虚拟声卡输入 |
| Linux | `pactl list short sinks` / `wpctl status` | `pactl set-default-sink <sink>` / `wpctl set-default <id>` | `sink.monitor`、PulseAudio / PipeWire 虚拟输出 |

### 推荐落地方案

1. 后端新增“输出设备列表”接口，返回当前平台可用的 output/sink 列表。
2. 后端新增“切换默认输出”接口，参数为目标设备名或 id。
3. 前端在录音页增加“输出设备”选择框和“自动切换”开关。
4. 开关开启时，先切换系统输出，再启动录音；停止录音后按需恢复原输出。

### 平台建议

- macOS：优先使用 BlackHole 2ch 或 Loopback，再用 SwitchAudioSource 做输出切换。
- Windows：优先使用 SoundVolumeView 或 NirCmd，再配合 VB-Audio Virtual Cable / Voicemeeter。
- Linux：优先使用 PulseAudio / PipeWire，再用 pactl 或 wpctl 管理默认输出。

### 录音输入设备枚举

当前项目已有录音输入设备枚举接口，位于 [backend/routes/recordingRoutes.js](backend/routes/recordingRoutes.js#L132)。前端录音页位于 [frontend/src/pages/RecordingPage.jsx](frontend/src/pages/RecordingPage.jsx)，后续可以在这里扩展输出设备选择和自动切换。

## 功能概览
- 文件上传与列表查看（支持音频文件）
- 音乐播放页节目单管理
  - 新增节目
  - 修改节目
  - 删除节目
  - 拖拽排序
- 主持人口播词
  - 手动编辑
  - 调用 AI 接口生成候选示例并选择
- 演出管理
  - 保存演出（`.json`）
  - 设为当前演出
  - 首页展示当前演出跑马灯
- 首页展示
  - 当前表演节目
  - 视频直播占位窗口（前端占位图）
- 节目单导出
  - 一键导出 PDF
  - 打印节目单

## 项目结构

```text
backend/                 # Node/Express 后端
runtime/  # 运行时 JSON 配置
frontend/                # React 前端（Vite）
show_record/             # 历史演出记录 JSON
uploads/                 # 上传文件目录
README.md                # 项目说明
```


### 1) 安装依赖

在项目根目录执行：

```bash
npm install
npm --prefix frontend install
```

### 2) 开发模式启动

```bash
npm run dev
```

默认：

- 后端：`http://localhost:3000`
- 前端：Vite 开发服务（通常 `http://localhost:5173`）
- 接口文档：`http://localhost:3000/docs`

### 3) 生产构建（前端）

```bash
npm run build
```

## 可选环境变量（AI 口播词）

未配置时将自动使用内置示例模板。

- `AI_API_KEY` 或 `OPENAI_API_KEY`
- `AI_API_BASE_URL` 或 `OPENAI_BASE_URL`（默认 `https://api.openai.com/v1`）
- `AI_API_MODEL` 或 `OPENAI_MODEL`（默认 `gpt-4o-mini`）

## 常用接口（摘要）

- `POST /upload` 上传文件
- `GET /files` 已上传文件列表
- `GET /musiclist` 获取当前节目单
- `POST /musiclist/save` 保存节目单/演出
- `POST /musiclist/export-pdf` 导出节目单 PDF
- `GET /show/current` 获取当前演出
- `GET /shows` 获取已保存演出列表
- `POST /show/current` 切换当前演出
- `POST /ai/host-script-suggestions` 生成主持人口播词候选

## 接口预览

项目已接入 Swagger UI，可在服务启动后访问：

```bash
http://localhost:3000/docs
```

原始 OpenAPI JSON：

```bash
http://localhost:3000/docs/openapi.json
```

文档页支持：

- 在线查看所有后端接口
- 查看请求参数、响应结构和示例
- 直接在页面中发起接口测试

## 数据文件说明

- `runtime/musiclist.json`：当前节目单（播放页读取）
- `runtime/current_show.json`：当前演出状态
- `runtime/user_settings.json`：用户设置
- `runtime/live_state.json`：实时播控状态
- `show_record/*.json`：按演出名称保存的历史节目单

## 说明

- PDF 导出使用后端 `pdfkit` 生成。
- 首页视频直播窗口目前为占位图，暂未接入真实流媒体功能。

## 部署建议（PM2 + Nginx）

以下为常见 Linux 服务器部署思路（示例）：

### 1) 服务器准备

- 安装 Node.js（建议 LTS）
- 安装 PM2：

```bash
npm install -g pm2
```

### 2) 拉取代码并安装依赖

```bash
git clone <your-repo-url> FileTransfer
cd FileTransfer
npm install
npm --prefix frontend install
npm run build
```

### 3) 环境变量

按需设置（可写入 shell profile 或 PM2 ecosystem 文件）：

```bash
export NODE_ENV=production
export AI_API_KEY=your_key
export AI_API_BASE_URL=https://api.openai.com/v1
export AI_API_MODEL=gpt-4o-mini
```

### 4) 使用 PM2 启动

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

默认后端端口为 `3000`。

### 5) Nginx 反向代理（示例）

```nginx
server {
  listen 80;
  server_name your-domain.com;

  client_max_body_size 200m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

配置后执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 6) 常用运维命令

```bash
pm2 status
pm2 logs show-console
pm2 restart ecosystem.config.js --env production
pm2 restart show-console
pm2 stop show-console
```

## 首次上线检查清单

- 代码与依赖
  - 已执行 `npm install` 与 `npm --prefix frontend install`
  - 已执行 `npm run build`，且 `frontend/dist` 已生成
- 环境变量
  - `NODE_ENV=production`
  - AI 相关变量按需配置（未配置可使用内置模板）
- 进程与端口
  - `pm2 status` 显示 `show-console` 为 `online`
  - 服务监听端口为 `3000`
  - 云服务器安全组/防火墙已放行 `80/443`（以及需要的管理端口）
- Nginx
  - `sudo nginx -t` 校验通过
  - `sudo systemctl reload nginx` 成功
  - 域名可访问首页，接口请求正常转发
- PM2 自启
  - 已执行 `pm2 save`
  - 已执行 `pm2 startup` 并按提示完成系统命令
  - 服务器重启后服务可自动拉起
- 功能验收
  - 上传文件与列表展示正常
  - 保存演出并设为当前演出正常
  - 首页跑马灯显示当前演出与当前节目
  - PDF 导出可下载并正常打开

## 本地环境文件说明（dev / prd）

为便于本地开发与部署，本仓库提供简单的环境文件支持：

- 根目录（后端）：
  - `.env.dev` — 开发环境变量（默认加载）
  - `.env.prd` — 生产环境变量（当 `NODE_ENV=production` 时默认加载）

  后端在启动时会尝试载入根目录下的 `.env.dev` / `.env.prd`（也可通过 `ENV_FILE` 指定自定义文件名）。该加载使用 `dotenv`，请在需要时安装：

  ```bash
  npm install dotenv --save
  ```

- 前端（Vite）：
  - `frontend/.env.development` — Vite 开发时使用
  - `frontend/.env.production` — Vite 打包/预览时使用

  主要变量：
  - `VITE_API_BASE_URL` — API 基础路径（开发时示例：`http://localhost:3000/v1`）
  - `VITE_API_PORT` — 用于前端在多个候选 ws 地址尝试时的后端端口（默认 `3000`）

使用示例：

```bash
# 开发（默认会加载 .env.dev）
npm run dev

# 本地以 production 模式启动后端（会尝试加载 .env.prd）
NODE_ENV=production ENV_FILE=.env.prd npm run server
```

