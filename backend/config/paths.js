const path = require('path');
const fs = require('fs');
const { createLogger } = require('../middleware/logger');

const logger = createLogger({ source: 'paths' });

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
    logger.info(`Migrated runtime configuration: ${legacyPath} -> ${targetPath}`);
  });
}

function ensureDirectories() {
  [uploadDir, showRecordDir, runtimeConfigDir, recordingDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created directory: ${dir}`);
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
  ensureDirectories
};
