## Plan: 后端录音与转换支持

TL;DR - 在后端增强 ffmpeg 驱动的录音能力以支持：1) 系统/外放音频捕获（需 loopback 虚拟设备或平台回环支持）；2) 直接录制在线视频/音频流（输入 URL）；3) 提供音视频格式转换工具并在前端增加页面调用后端转换接口。主要利用现有 `recordingService.startRecordingWithFfmpeg`，新增/调整路由和一个小的 `ffmpegService`，以及一个前端转换页面。

**Steps**
1. 后端：抽出/新增 `backend/services/ffmpegService.js`（或在 `recordingService` 内新增方法）以封装常用 ffmpeg 操作：开始录制（支持 `device`, `inputUrl`, `ffmpegArgs`），停止，和 `convert(inputPath, outputPath, args)`。 (*depends on step 2*)
2. 路由：在 `backend/routes/recordingRoutes.js` 增加/调整接口：
   - `POST /start-recording-backend`：支持 `device`, `inputUrl`, `outFileName`, `ffmpegArgs`。当需要录制「外放」时，文档说明需提供 loopback 设备名或使用平台建议命令。 (*blocks on step 1*)
   - `POST /convert`：请求体 `inputFile`（或 `fileName`）、`targetFormat`、`options`，返回转换任务结果或下载地址。 (*depends on step 1*)
3. recordingService：调用 `ffmpegService` 来启动 ffmpeg；保留现有音量/astats 解析逻辑，但支持 `inputUrl` 流作为 ffmpeg 输入。 (*depends on step 1*)
4. ws/通知：保持现有 SSE/WS 音量广播，确保 `ffmpegService` 在解析 astats 时调用 `recordingService.broadcastVolume`，或直接使用 `recordingService` 的 emitter。 (*parallel with step 3*)
5. 前端：添加简单页面 `src/pages/ConvertPage.jsx`，调用 `POST /convert`，并展示转换结果与下载链接。 添加说明如何在客户端指定 `clientType` 与选择录音来源（设备/URL）。 (*depends on step 2*)
6. 文档与示例：在 README 或前端页面中加入示例命令：
   - macOS 外放（需安装 BlackHole/Soundflower）示例 `ffmpeg` 输入说明；
   - Windows 使用 WASAPI loopback 或 dshow 的示例；
   - 使用在线流 URL（例如 HLS/HTTP/RTMP）的示例 ffmpeg args；
   - 前端如何调用 `identify` 并传入 `clientType`。

**Relevant files**
- `backend/services/recordingService.js` — 调整以调用 `ffmpegService`；保留音量解析和 emitter
- `backend/services/wsClientService.js` — 保持不变（用于按类型路由客户端）
- `backend/routes/recordingRoutes.js` — 增强 `start-recording-backend`，新增 `POST /convert`
- `backend/services/ffmpegService.js` — 新增，封装 ffmpeg spawn、astats 解析与转换调用
- `backend/wsServer.js` — 保持现状，继续处理 chunk 与 identify
- `frontend/src/pages/ConvertPage.jsx` — 新增页面（UI 可简洁）

**Verification**
1. 手动测试：在本机用以下场景试验：
   - 使用本机 loopback 虚拟设备（mac: BlackHole）启动 `POST /start-recording-backend`，确认文件生成为 `recording-*.mp4`，并能在 `/list-recordings` 看到
   - 传入 `inputUrl`（例如公网 mp3/ogg/hls）并验证录制到文件
   - 上传或选择已有录音调用 `POST /convert`，验证输出文件格式正确
2. 集成测试：短脚本调用路由，检查返回 `success: true` 与文件生成
3. 回退策略：若 ffmpeg 报错，路由返回详细错误信息以便定位（保留 stderr）

**Decisions / Assumptions**
- 捕获“外放”音频通常需要系统级 loopback（BlackHole/Soundflower/WasapiLoopback）。后端无法在不额外安装驱动的情况下自动捕获系统声卡输出。计划里会在文档中列明安装/使用示例。
- 在线流录制依赖网络访问与 ffmpeg 对该协议的支持（HLS/RTMP/HTTP/HTTPS）。
- 转换工具使用 ffmpeg，文件 I/O 使用现有 `recordingDir`。

**Further Considerations**
1. 是否需要后台队列/任务系统来处理长时间转换或并发大量转码？（建议：轻量队列 or spawn 控制）
2. 是否希望支持直接将转换结果通过 WebSocket/事件推送给特定 `clientType`（例如仅推送给 `admin`）？
3. 是否要对上传/转换操作加入认证/权限控制？



7. 长期目标（最低优先级）：在本地网络中自动发现可控设备，支持通过小程序、原生 App 或轻量化 PWA 对设备进行控制与录音调度，并将发现的设备信息在本地记录以供管理与调度使用。该功能属于长期规划，初期不列为必须实现项。

8 增加对wss和https的支持