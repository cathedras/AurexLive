// Load environment variables early
try {
  const envPath = process.env.ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.prd' : '.env.dev');
  require('dotenv').config({ path: require('path').join(__dirname, '..', envPath) });
} catch (e) {
  // ignore if dotenv not installed or file missing
}

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const http = require('http');
const os = require('os');

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

// WebSocket 服务（已抽离到 backend/wsServer.js）
const initWebSocket = require('./wsServer');
initWebSocket(server);

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
  console.log(`演出服务启动成功 🚀 ✅`);
  console.log(`访问地址: http://localhost:${port}`);
  console.log(`接口文档: http://localhost:${port}/docs`);
  console.log(`原始接口文档: http://localhost:${port}/docs/openapi.json`);
  console.log(`上传文件保存路径: ${uploadDir}`);
  console.log(`演出记录保存路径: ${showRecordDir}`);
  console.log(`录音文件保存路径: ${recordingDir}`);
  console.log(`运行时配置路径: ${runtimeConfigDir}`);
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