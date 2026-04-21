// Load environment variables early
try {
  const envPath = process.env.ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.prd' : '.env.dev');
  require('dotenv').config({ path: require('path').join(__dirname, '..', envPath) });
} catch (e) {
  // ignore if dotenv not installed or file missing
}

const { installGlobalLogger } = require('./middleware/logger');
installGlobalLogger();
const { createLogger } = require('./middleware/logger');

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
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
const mobileRoutes = require('./routes/mobileRoutes');
const clientErrorRoutes = require('./routes/clientErrorRoutes');
const recordingRoutes = require('./routes/recordingRoutes'); // 引入录音路由
const recordingFilesRoutes = require('./routes/recordingFilesRoutes');
const webrtcRoutes = require('./routes/webrtcRoutes');
// debugRoutes removed for unit tests
const musicPlaybackService = require('./services/musicPlaybackService');
const requestLogger = require('./middleware/requestLogger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandlers');
const createStartupMonitor = require('./middleware/startupMonitor');
const logger = createLogger({ source: 'server' });
// Prefer a generated OpenAPI JSON if present (from `backend/tools/generate-openapi.js`).
let openApiSpec;
const generatedSpecPath = path.join(__dirname, 'config', 'openapi.generated.json');
if (fs.existsSync(generatedSpecPath)) {
  try {
    openApiSpec = require('./config/openapi.generated.json');
    logger.info(`[Swagger] Loaded generated OpenAPI spec: ${generatedSpecPath}`);
  } catch (err) {
    logger.warning(`[Swagger] Failed to load generated OpenAPI spec, falling back to static config/openapi.js. ${err.message}`);
    openApiSpec = require('./config/openapi');
  }
} else {
  openApiSpec = require('./config/openapi');
}

// 创建 HTTP 服务器
const app = express();
const port = process.env.PORT || 3000;
const projectRoot = path.resolve(__dirname, '..');

// 证书路径始终基于项目根目录解析，不依赖 cwd（兼容 nodemon 从 backend/ 目录启动）
const defaultDevKeyPath = path.join(projectRoot, 'certs', 'backend-dev.key');
const defaultDevCertPath = path.join(projectRoot, 'certs', 'backend-dev.crt');

function resolveCertPath(envValue, fallback) {
  if (!envValue) return fallback;
  return path.isAbsolute(envValue) ? envValue : path.resolve(projectRoot, envValue);
}

const explicitHttpsFlag = ['1', 'true', 'yes'].includes(String(process.env.USE_HTTPS || '').trim().toLowerCase());
const useHttps = explicitHttpsFlag || (
  process.env.NODE_ENV !== 'production' &&
  fs.existsSync(defaultDevKeyPath) &&
  fs.existsSync(defaultDevCertPath)
);
const frontendDevServerUrl = process.env.FRONTEND_DEV_SERVER_URL || 'https://localhost:5173';
const useViteDevServer = process.env.NODE_ENV !== 'production' && process.env.USE_VITE_DEV_SERVER !== '0';

function createServerInstance() {
  if (!useHttps) {
    return http.createServer(app);
  }

  const sslKeyPath = resolveCertPath(process.env.SSL_KEY_PATH, defaultDevKeyPath);
  const sslCertPath = resolveCertPath(process.env.SSL_CERT_PATH, defaultDevCertPath);

  if (!fs.existsSync(sslKeyPath) || !fs.existsSync(sslCertPath)) {
    throw new Error(`HTTPS 证书不存在: key=${sslKeyPath} cert=${sslCertPath}`);
  }

  const tlsOptions = {
    key: fs.readFileSync(sslKeyPath),
    cert: fs.readFileSync(sslCertPath)
  };

  return https.createServer(tlsOptions, app);
}

const server = createServerInstance();

function getAccessibleFrontendDevServerUrl() {
  if (!useViteDevServer) {
    return frontendDevServerUrl;
  }

  try {
    const parsed = new URL(frontendDevServerUrl);
    if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const item of nets[name] || []) {
          if (item.family === 'IPv4' && !item.internal) {
            parsed.hostname = item.address;
            return parsed.toString().replace(/\/$/, '');
          }
        }
      }
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return frontendDevServerUrl;
  }
}

// WebSocket 服务（已抽离到 backend/wsServer.js）
const initWebSocket = require('./wsServer');
initWebSocket(server);

// 配置跨域（前端和后端端口不同时需要）
app.use(cors());
// 解析 JSON 请求体
app.use(express.json());
app.use(requestLogger);

ensureDirectories();

// Swagger UI exposure control:
// - Default: exposed when NODE_ENV !== 'production'
// - Override: set SWAGGER_AUTO_EXPOSE=1 to force enable, SWAGGER_AUTO_EXPOSE=0 to force disable
const SWAGGER_AUTO_EXPOSE = (process.env.SWAGGER_AUTO_EXPOSE === '1') || (process.env.SWAGGER_AUTO_EXPOSE !== '0' && process.env.NODE_ENV !== 'production');

if (SWAGGER_AUTO_EXPOSE) {
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

  logger.info('[Swagger] API docs available at /docs (openapi JSON at /docs/openapi.json)');
} else {
  logger.info('[Swagger] API docs are disabled. Set SWAGGER_AUTO_EXPOSE=1 to enable.');
}

app.use('/v1/upload', uploadRoutes);
app.use('/v1/files', fileRoutes);
app.use('/v1/music', musicRoutes);
app.use('/v1/ai', aiRoutes);
app.use('/v1/settings', settingsRoutes);
app.use('/v1/live', liveRoutes);
app.use('/v1/mobile', mobileRoutes);
app.use('/v1/client-error', clientErrorRoutes);
app.use('/v1/recording', recordingRoutes); // 注册录音路由
app.use('/v1/webrtc', webrtcRoutes);

// 7. 托管上传文件和前端静态文件
app.use('/v1/uploads', express.static(uploadDir));
app.use('/v1/show_record', express.static(showRecordDir));
app.use('/v1/recordings', recordingFilesRoutes); // 托管录音文件（安全处理 Range）

const hasReactDist = fs.existsSync(reactDistDir);

if (useViteDevServer) {
  const redirectToVite = (req, res) => {
    const targetPath = req.originalUrl || req.url || '/page';
    res.redirect(`${getAccessibleFrontendDevServerUrl()}${targetPath}`);
  };

  ['/','/page','/page/upload','/page/music','/page/settings','/page/recording','/page/live-stream','/page/live-preview'].forEach((routePath) => {
    app.get(routePath, redirectToVite);
  });

  logger.info(`[Frontend] Vite dev server enabled, redirecting page routes to ${getAccessibleFrontendDevServerUrl()}`);
} else if (hasReactDist) {
  app.use(express.static(reactDistDir));

  ['/page','/page/upload','/page/music','/page/settings', '/page/recording', '/page/live-stream', '/page/live-preview'].forEach((routePath) => {
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

let listenAttempts = 0;
const maxListenAttempts = 5;

function startServer() {
  const onError = (error) => {
    if (error && error.code === 'EADDRINUSE' && listenAttempts < maxListenAttempts) {
      listenAttempts += 1;
      const retryDelayMs = Math.min(1000 * listenAttempts, 3000);
      logger.warning(`端口 ${port} 正在被占用，${retryDelayMs}ms 后重试 (${listenAttempts}/${maxListenAttempts})`, 'server.listen');
      setTimeout(startServer, retryDelayMs);
      return;
    }

    logger.error(error instanceof Error ? error : new Error(String(error)), 'server.listen');
    process.exit(1);
  };

  server.once('error', onError);
  server.listen(port, () => {
    server.removeListener('error', onError);

    logger.info('============================================');
    logger.info('演出服务启动成功 🚀 ✅');
    logger.info(`访问地址: ${useHttps ? 'https' : 'http'}://localhost:${port}`);
    logger.info(`接口文档: ${useHttps ? 'https' : 'http'}://localhost:${port}/docs`);
    logger.info(`原始接口文档: ${useHttps ? 'https' : 'http'}://localhost:${port}/docs/openapi.json`);
    logger.info(`上传文件保存路径: ${uploadDir}`);
    logger.info(`演出记录保存路径: ${showRecordDir}`);
    logger.info(`录音文件保存路径: ${recordingDir}`);
    logger.info(`运行时配置路径: ${runtimeConfigDir}`);
    logger.info('============================================');
    const startupMonitor = createStartupMonitor();
    startupMonitor.run();
  });
}

startServer();