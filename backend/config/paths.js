const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..', '..');
const uploadDir = path.join(projectRoot, 'uploads');
const showRecordDir = path.join(projectRoot, 'show_record');
const runtimeConfigDir = path.join(projectRoot, 'runtime');
const recordingDir = path.join(projectRoot, 'recordings');
const musicListJsonPath = path.join(runtimeConfigDir, 'musiclist.json');
const currentShowJsonPath = path.join(runtimeConfigDir, 'current_show.json');
const userSettingsJsonPath = path.join(runtimeConfigDir, 'user_settings.json');
const liveStateJsonPath = path.join(runtimeConfigDir, 'live_state.json');
const reactDistDir = path.join(projectRoot, 'frontend', 'dist');
const frontendBuildMissingHtmlPath = path.join(__dirname, '..', 'views', 'frontend-build-missing.html');
const notFoundHtmlPath = path.join(__dirname, '..', 'views', 'errors', '404.html');
const internalServerErrorHtmlPath = path.join(__dirname, '..', 'views', 'errors', '500.html');
const mobileCameraHtmlPath = path.join(__dirname, '..', 'views', 'mobile', 'camera.html');
const mobileControlHtmlPath = path.join(__dirname, '..', 'views', 'mobile', 'control.html');

const legacyRuntimeFiles = [
  {
    legacyPath: path.join(showRecordDir, 'musiclist.json'),
    targetPath: musicListJsonPath
  },
  {
    legacyPath: path.join(showRecordDir, 'current_show.json'),
    targetPath: currentShowJsonPath
  },
  {
    legacyPath: path.join(showRecordDir, 'user_settings.json'),
    targetPath: userSettingsJsonPath
  },
  {
    legacyPath: path.join(showRecordDir, 'live_state.json'),
    targetPath: liveStateJsonPath
  }
];

function migrateLegacyRuntimeFiles() {
  legacyRuntimeFiles.forEach(({ legacyPath, targetPath }) => {
    if (!fs.existsSync(legacyPath) || fs.existsSync(targetPath)) {
      return;
    }

    fs.renameSync(legacyPath, targetPath);
    console.log(`已迁移运行时配置：${legacyPath} -> ${targetPath}`);
  });
}

function ensureDirectories() {
  [uploadDir, showRecordDir, runtimeConfigDir, recordingDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`已创建目录：${dir}`);
    }
  });

  migrateLegacyRuntimeFiles();
}

module.exports = {
  projectRoot,
  uploadDir,
  showRecordDir,
  runtimeConfigDir,
  recordingDir,
  musicListJsonPath,
  currentShowJsonPath,
  userSettingsJsonPath,
  liveStateJsonPath,
  reactDistDir,
  frontendBuildMissingHtmlPath,
  notFoundHtmlPath,
  internalServerErrorHtmlPath,
  mobileCameraHtmlPath,
  mobileControlHtmlPath,
  ensureDirectories
};
