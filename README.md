# 演出中台

一个基于 `Express + React(Vite)` 的演出管理与播控小系统，支持文件上传、节目单维护、主持人口播词生成、当前演出展示与 PDF 导出。

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
  - 节目名/演出人员滚动展示
- 节目单导出
  - 一键导出 PDF
  - 打印节目单

## 项目结构

```text
backend/                 # Node/Express 后端
frontend/                # React 前端（Vite）
show_record/             # 演出记录 JSON 与当前演出状态
uploads/                 # 上传文件目录
README.md                # 项目说明
```

## 快速开始

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

- `show_record/musiclist.json`：当前节目单（播放页读取）
- `show_record/current_show.json`：当前演出状态
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
