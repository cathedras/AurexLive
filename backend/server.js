const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const {
  uploadDir,
  showRecordDir,
  reactDistDir,
  frontendBuildMissingHtmlPath,
  ensureDirectories
} = require('./config/paths');
const uploadRoutes = require('./routes/uploadRoutes');
const fileRoutes = require('./routes/fileRoutes');
const musicRoutes = require('./routes/musicRoutes');
const aiRoutes = require('./routes/aiRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const liveRoutes = require('./routes/liveRoutes');
const clientErrorRoutes = require('./routes/clientErrorRoutes');
const requestLogger = require('./middleware/requestLogger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandlers');

// 创建 express 应用
const app = express();
const port = 3000;

// 配置跨域（前端和后端端口不同时需要）
app.use(cors());
// 解析 JSON 请求体
app.use(express.json());
app.use(requestLogger);

ensureDirectories();

app.use('/v1', uploadRoutes);
app.use('/v1', fileRoutes);
app.use('/v1', musicRoutes);
app.use('/v1', aiRoutes);
app.use('/v1', settingsRoutes);
app.use('/v1', liveRoutes);
app.use('/v1', clientErrorRoutes);

// 7. 托管上传文件和前端静态文件
app.use('/v1/uploads', express.static(uploadDir));
app.use('/v1/show_record', express.static(showRecordDir));

const hasReactDist = fs.existsSync(reactDistDir);

if (hasReactDist) {
  app.use(express.static(reactDistDir));

  ['/page','/page/upload','/page/music','/page/settings'].forEach((routePath) => {
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
app.listen(port, () => {
  console.log(`============================================`);
  console.log(`文件传输服务已启动 ✅`);
  console.log(`访问地址：http://localhost:${port}`);
  console.log(`文件保存路径：${uploadDir}`);
  console.log(`============================================`);
});