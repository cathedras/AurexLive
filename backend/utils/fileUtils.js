const fs = require('fs');
const path = require('path');

const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.webm'];
const videoExtensions = ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.mkv'];

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
function isVideoFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return videoExtensions.includes(ext);
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
    performer: 'Unknown performer',
    programName: 'Untitled program',
    fileName
  };
}

function normalizeJsonFileName(inputName) {
  const trimmed = String(inputName || '').trim();
  if (!trimmed) {
    return null;
  }

  let decodedName = trimmed;
  try {
    decodedName = decodeURIComponent(trimmed);
  } catch {
    decodedName = trimmed;
  }

  const safeBaseName = decodedName
    .normalize('NFC')
    .replace(/\.json$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();

  if (!safeBaseName) {
    return null;
  }

  return `${safeBaseName}.json`;
}

function decodeJsonRecordName(fileName) {
  const baseName = String(fileName || '').replace(/\.json$/i, '').trim();
  if (!baseName) {
    return '';
  }

  try {
    return decodeURIComponent(baseName);
  } catch {
    return baseName;
  }
}

function encodeMusicFileToken(fileName) {
  const safeName = String(fileName || '').trim();
  if (!safeName) {
    return '';
  }
  return encodeURIComponent(safeName);
}

function decodeMusicFileToken(token) {
  const safeToken = String(token || '').trim();
  if (!safeToken) {
    return '';
  }

  try {
    return decodeURIComponent(safeToken);
  } catch {
    return safeToken;
  }
}

module.exports = {
  normalizeUploadFileName,
  getDisplayNameFromSavedName,
  getUploadedFiles,
  isAudioFile,
  isVideoFile,
  parseTrackMeta,
  normalizeJsonFileName,
  decodeJsonRecordName,
  encodeMusicFileToken,
  decodeMusicFileToken
};
