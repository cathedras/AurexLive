const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..', '..');
const uploadDir = path.join(projectRoot, 'uploads');
const showRecordDir = path.join(projectRoot, 'show_record');
const musicListJsonPath = path.join(showRecordDir, 'musiclist.json');
const currentShowJsonPath = path.join(showRecordDir, 'current_show.json');
const userSettingsJsonPath = path.join(showRecordDir, 'user_settings.json');
const liveStateJsonPath = path.join(showRecordDir, 'live_state.json');
const reactDistDir = path.join(projectRoot, 'frontend', 'dist');
const frontendBuildMissingHtmlPath = path.join(__dirname, '..', 'views', 'frontend-build-missing.html');
const notFoundHtmlPath = path.join(__dirname, '..', 'views', 'errors', '404.html');
const internalServerErrorHtmlPath = path.join(__dirname, '..', 'views', 'errors', '500.html');
const mobileCameraHtmlPath = path.join(__dirname, '..', 'views', 'mobile', 'camera.html');
const mobileControlHtmlPath = path.join(__dirname, '..', 'views', 'mobile', 'control.html');

function ensureDirectories() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`已创建文件保存目录：${uploadDir}`);
  }

  if (!fs.existsSync(showRecordDir)) {
    fs.mkdirSync(showRecordDir, { recursive: true });
  }
}

module.exports = {
  projectRoot,
  uploadDir,
  showRecordDir,
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
