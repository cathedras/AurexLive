const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const http = require('http');

const {
  uploadDir,
  showRecordDir,
  runtimeConfigDir,
  reactDistDir,
  frontendBuildMissingHtmlPath,
  ensureDirectories,
  recordingDir  // 添加录音目录
} = require('./config/paths');
const uploadRoutes = require('./routes/uploadRoutes');
const fileRoutes = require('./routes/fileRoutes');
const musicRoutes = require('./routes/musicRoutes');
const aiRoutes = require('./routes/aiRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const liveRoutes = require('./routes/liveRoutes');
const clientErrorRoutes = require('./routes/clientErrorRoutes');
const recordingRoutes = require('./routes/recordingRoutes'); // 引入录音路由
const musicPlaybackService = require('./services/musicPlaybackService');
const requestLogger = require('./middleware/requestLogger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandlers');
const openApiSpec = require('./config/openapi');

// 创建 HTTP 服务器
const app = express();
const server = http.createServer(app);
const port = 3000;

// WebSocket 服务
const WebSocket = require('ws');
const recordingService = require('./services/recordingService');
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  // 注册客户端并绑定消息处理
  const clientId = recordingService.registerClient(ws);
  // 发送客户端ID给前端
  try { ws.send(JSON.stringify({ type: 'clientId', data: clientId })); } catch (e) {}

  ws.on('message', async (message) => {
    // 支持二进制和文本
    let payload = null;
    if (Buffer.isBuffer(message)) {
      // 若收到二进制，直接当作音频 chunk（二进制）需要额外约定字段，跳过自动处理
      // 可扩展：将二进制 chunk 与元数据组合发送
      return;
    }

    try {
      payload = JSON.parse(message.toString());
    } catch (e) {
      try { ws.send(JSON.stringify({ type: 'error', data: 'invalid_json' })); } catch (e) {}
      return;
    }

    const { type, data } = payload || {};
    try {
      if (type === 'start-backend') {
        const { device, outFileName, ffmpegArgs } = data || {};
        const info = recordingService.startRecordingWithFfmpeg(clientId, ffmpegArgs, outFileName || null);
        try { ws.send(JSON.stringify({ type: 'start-backend-result', success: true, data: info })); } catch (e) {}
      } else if (type === 'stop-recording') {
        const { fileName } = data || {};
        const info = recordingService.stopRecording(fileName);
        try { ws.send(JSON.stringify({ type: 'stop-recording-result', success: true, data: info })); } catch (e) {}
      } else if (type === 'start-recording') {
        const info = recordingService.startRecording(clientId);
        try { ws.send(JSON.stringify({ type: 'start-recording-result', success: true, data: info })); } catch (e) {}
      } else if (type === 'add-chunk') {
        // data: { fileName, chunkBase64 }
        const { fileName, chunkBase64 } = data || {};
        if (fileName && chunkBase64) {
          const buf = Buffer.from(chunkBase64, 'base64');
          recordingService.addRecordingChunk(fileName, buf);
          try { ws.send(JSON.stringify({ type: 'add-chunk-result', success: true })); } catch (e) {}
        } else {
          try { ws.send(JSON.stringify({ type: 'add-chunk-result', success: false, error: 'missing_params' })); } catch (e) {}
        }
      } else if (type === 'get-status') {
        const { fileName } = data || {};
        const status = recordingService.getStatus(fileName);
        try { ws.send(JSON.stringify({ type: 'get-status-result', success: true, data: status })); } catch (e) {}
      }
    } catch (err) {
      try { ws.send(JSON.stringify({ type: `${type}-result`, success: false, error: err.message })); } catch (e) {}
    }
  });
});

// 配置跨域（前端和后端端口不同时需要）
app.use(cors());
// 解析 JSON 请求体
app.use(express.json());
app.use(requestLogger);

ensureDirectories();

app.get('/docs/openapi.json', (req, res) => {
  res.json(openApiSpec);
});

app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    explorer: true,
    customSiteTitle: 'FileTransfer API Docs'
  })
);

app.use('/v1', uploadRoutes);
app.use('/v1', fileRoutes);
app.use('/v1', musicRoutes);
app.use('/v1', aiRoutes);
app.use('/v1', settingsRoutes);
app.use('/v1', liveRoutes);
app.use('/v1', clientErrorRoutes);
app.use('/v1', recordingRoutes); // 注册录音路由

// 7. 托管上传文件和前端静态文件
app.use('/v1/uploads', express.static(uploadDir));
app.use('/v1/show_record', express.static(showRecordDir));
app.use('/v1/recordings', express.static(recordingDir)); // 托管录音文件

const hasReactDist = fs.existsSync(reactDistDir);

if (hasReactDist) {
  app.use(express.static(reactDistDir));

  ['/page','/page/upload','/page/music','/page/settings', '/page/recording'].forEach((routePath) => {
    app.get(routePath, (req, res) => {
      res.sendFile(path.join(reactDistDir, 'index.html'));
    });
  });

  app.get('/', (req, res) => {
    res.redirect('/page');
  });
} else {
  app.get('/', (req, res) => {
    res.status(200).sendFile(frontendBuildMissingHtmlPath);
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

// 启动服务器
server.listen(port, () => {
  console.log(`============================================`);
  console.log(`文件传输服务已启动 ✅`);
  console.log(`访问地址：http://localhost:${port}`);
  console.log(`接口文档：http://localhost:${port}/docs`);
  console.log(`原始接口文档：http://localhost:${port}/docs/openapi.json`);
  console.log(`上传文件保存路径：${uploadDir}`);
  console.log(`演出记录保存路径：${showRecordDir}`);
  console.log(`录音文件保存路径：${recordingDir}`);
  console.log(`运行时配置路径：${runtimeConfigDir}`);
  console.log(`============================================`);

  musicPlaybackService.restoreFromRuntimeState()
    .then((state) => {
      if (state.currentTrack?.programName) {
        console.log(`\n⚠️  注意：检测到上次播放状态，当前播放: ${state.currentTrack.programName}`);
        console.log(`如需清理上次播放状态，请删除 runtime/ 目录下的 playback_state.json\n`);
      }
    })
    .catch((error) => {
      console.warn(`⚠️  注意：未能恢复上次播放状态，将从空闲状态开始`);
    });
});