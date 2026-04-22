# 演出中台

一个基于 Express + React(Vite) 的演出管理与播控小系统，覆盖文件上传、节目单维护、当前演出展示、录音控制、WebSocket 实时通信与 PDF 导出。

## 项目能力

- 文件上传与文件列表查看
- 音乐节目单管理
  - 新增、编辑、删除节目
  - 拖拽排序
  - 当前节目与当前演出联动显示
  - 节目单 PDF 导出
- 播控与实时状态
  - 当前演出状态保存与切换
  - 首页展示当前节目、当前演出与直播入口
  - 实时播控状态、效果触发、后端播放控制
- 录音与设备管理
  - 录音输入设备枚举
  - 录音输出设备枚举
  - 切换默认输出设备
  - 后端录音启动/停止
  - 录音列表与录音文件访问
- AI 辅助
  - 主持人口播词候选生成
  - 文本润色/修正接口
- 直播与移动端
  - 直播预览页
  - 直播推流页
  - 手机摄像头与手机控制页
  - WebRTC 相关接口
- 运维与诊断
  - 前端错误上报
  - Swagger 接口文档
  - PM2 进程管理

## 功能规划

- 多媒体在线直播平台推送
- 微信文件上传读取
- 优化音视频播放码率（预听、存储、在线）
- AI 接口调用
- 专业音频调音工具（未来规划）

## 技术栈

- 后端：Node.js、Express、WebSocket、ffmpeg、pdfkit、multer、swagger-ui-express
- 前端：React 19、Vite、React Router、Axios、mediasoup-client
- 运行目录：`uploads/`、`recordings/`、`runtime/`、`show_record/`

## 目录结构

```text
backend/      # Express 后端、路由、服务、中间件、OpenAPI
frontend/     # React + Vite 前端
runtime/      # 运行时 JSON 配置
recordings/   # 录音文件
show_record/  # 历史演出记录 JSON
uploads/      # 上传文件目录
certs/        # 本地 HTTPS 证书
```

## 页面路由

前端页面通过 `/page` 开头的路由访问：

- `/page` 首页
- `/page/upload` 文件上传页
- `/page/music` 节目单与播控页
- `/page/recording` 录音页
- `/page/live-stream` 直播推流页
- `/page/live-preview` 直播预览页
- `/page/settings` 设置页
- `/page/ws-demo` WebSocket 演示页

## 安装依赖

在项目根目录执行：

```bash
npm install
npm --prefix frontend install
```

## 本地开发

一键启动后端、前端和监控进程：

```bash
npm run dev
```

该命令等价于同时运行：

- `npm run server:dev`：后端热重载
- `node backend/monitorWorker.js`：监控进程
- `npm run client`：前端 Vite 开发服务

默认访问地址：

- 后端：`http://localhost:3000`
- 前端开发服务：通常是 `http://localhost:5173`
- 接口文档：`http://localhost:3000/docs`

## 常用脚本

```bash
npm run server        # 只启动后端
npm run server:dev    # 后端开发模式（watch）
npm run client        # 只启动前端 Vite
npm run build         # 构建前端生产包
npm test              # 运行后端测试
npm run pm2:start     # 使用 ecosystem.config.js 启动 PM2
npm run pm2:stop      # 停止 PM2
npm run pm2:restart   # 重启 PM2
npm run pm2:logs      # 查看 PM2 日志
```

## 接口预览

项目已接入 Swagger UI：

- 文档页：`http://localhost:3000/docs`
- OpenAPI JSON：`http://localhost:3000/docs/openapi.json`

文档覆盖的核心接口前缀包括：

- `/v1/upload`
- `/v1/files`
- `/v1/music/*`
- `/v1/recording/*`
- `/v1/show/*`
- `/v1/shows`
- `/v1/ai/*`
- `/v1/settings`
- `/v1/live/*`
- `/v1/mobile/*`
- `/v1/client-error`
- `/v1/webrtc`

其中录音相关接口包含输入/输出设备枚举、输出设备切换、录音启动/停止、录音列表和录音转换；AI 接口包含主持人口播词候选生成与文本修正。

## 环境变量

### 后端

后端启动时会优先加载根目录下的环境文件：

- 开发环境：`.env.dev`
- 生产环境：`.env.prd`
- 也可以通过 `ENV_FILE` 指定自定义文件名

常用变量：

- `PORT`：后端端口，默认 `3000`
- `NODE_ENV`：运行环境
- `USE_HTTPS`：强制启用 HTTPS / WSS
- `SSL_KEY_PATH`：HTTPS 私钥路径
- `SSL_CERT_PATH`：HTTPS 证书路径
- `SWAGGER_AUTO_EXPOSE`：控制是否自动暴露 Swagger 文档
- `FRONTEND_DEV_SERVER_URL`：开发环境前端地址
- `USE_VITE_DEV_SERVER`：是否在开发环境跳转到 Vite 开发服务器
- `AI_API_KEY` 或 `OPENAI_API_KEY`
- `AI_API_BASE_URL` 或 `OPENAI_BASE_URL`
- `AI_API_MODEL` 或 `OPENAI_MODEL`

### 前端

- `VITE_API_BASE_URL`：API 基础地址，默认可按项目约定使用 `/v1`
- `VITE_API_PORT`：WebSocket 地址推导使用的后端端口，默认 `3000`

前端的 WebSocket 连接会在 HTTPS 场景下自动使用 `wss`。

## 数据文件

- `runtime/musiclist.json`：当前节目单
- `runtime/current_show.json`：当前演出状态
- `runtime/user_settings.json`：用户设置
- `runtime/live_state.json`：实时播控状态
- `recordings/`：录音输出文件
- `show_record/*.json`：历史演出记录

## 录音与系统音频

录音与系统输出切换的实现主要在 [backend/routes/recordingRoutes.js](backend/routes/recordingRoutes.js) 和 [backend/services/recordingService.js](backend/services/recordingService.js)。当前项目支持录音输入设备枚举、输出设备枚举、切换默认输出设备，以及基于 ffmpeg 的录音与转码。

在 macOS 上，如果你要录系统声音，通常需要配合 BlackHole 2ch 或 Loopback 这类虚拟声卡使用；同时如果要在录制时保持外放，可以使用系统的多输出设备进行组合。

## 部署建议

### PM2

```bash
npm install
npm --prefix frontend install
npm run build
npm run pm2:start
```

### Nginx 反向代理

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

如果需要 HTTPS，请同时配置 `USE_HTTPS=1` 和对应证书路径，或者通过 Nginx 在外层终止 TLS。

## 说明

- 首页和节目单页面会读取当前演出与当前节目状态。
- PDF 导出由后端生成。
- 代码中已预留移动端控制、直播与 WebRTC 相关页面和接口。

