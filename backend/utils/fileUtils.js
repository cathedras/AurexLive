const fs = require('fs');
const path = require('path');

const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];

function normalizeUploadFileName(originalName) {
  const source = String(originalName || '');
  let decoded = source;

  try {
    const latin1Decoded = Buffer.from(source, 'latin1').toString('utf8');
    if (!latin1Decoded.includes('�')) {
      decoded = latin1Decoded;
    }
  } catch {
    decoded = source;
  }

  const safeName = decoded
    .normalize('NFC')
    .replace(/[\\/]/g, '_')
    .trim();

  return safeName || `unnamed_${Date.now()}`;
}

function getDisplayNameFromSavedName(savedName) {
  const match = String(savedName || '').match(/^\d+-\d+-(.+)$/);
  const originalPart = match ? match[1] : String(savedName || '');
  return normalizeUploadFileName(originalPart);
}

function getUploadedFiles(uploadDir) {
  return fs.readdirSync(uploadDir)
    .map((fileName) => {
      const filePath = path.join(uploadDir, fileName);
      const stats = fs.statSync(filePath);
      const displayName = getDisplayNameFromSavedName(fileName);
      return {
        savedName: fileName,
        displayName,
        size: stats.size,
        uploadTime: stats.mtime,
        url: `/v1/uploads/${encodeURIComponent(fileName)}`
      };
    })
    .sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime));
}

function isAudioFile(fileName) {
  const lowerName = String(fileName || '').toLowerCase();
  return audioExtensions.some((ext) => lowerName.endsWith(ext));
}

function parseTrackMeta(savedName) {
  const fileName = getDisplayNameFromSavedName(savedName);
  const pureName = fileName.replace(/\.[^.]+$/, '');
  const segments = pureName.split(/[-_]/).map((item) => item.trim()).filter(Boolean);

  if (segments.length >= 2) {
    return {
      performer: segments[0],
      programName: segments[1],
      fileName
    };
  }

  return {
    performer: '未知演出人',
    programName: '未命名节目',
    fileName
  };
}

function normalizeJsonFileName(inputName) {
  const trimmed = String(inputName || '').trim();
  const safeBaseName = trimmed
    .replace(/\.json$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_');

  if (!safeBaseName) {
    return null;
  }

  return `${safeBaseName}.json`;
}

module.exports = {
  normalizeUploadFileName,
  getDisplayNameFromSavedName,
  getUploadedFiles,
  isAudioFile,
  parseTrackMeta,
  normalizeJsonFileName
};
