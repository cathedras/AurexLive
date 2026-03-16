const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const {
  uploadDir,
  showRecordDir,
  musicListJsonPath,
  currentShowJsonPath
} = require('../config/paths');
const {
  getUploadedFiles,
  getDisplayNameFromSavedName,
  isAudioFile,
  parseTrackMeta,
  normalizeJsonFileName,
  decodeJsonRecordName,
  encodeMusicFileToken,
  decodeMusicFileToken
} = require('./fileUtils');

/**
 * Normalize track file name for consistent comparison
 */
function normalizeTrackFileName(fileName) {
  return String(fileName || '')
    .trim()
    .normalize('NFC')
    .toLowerCase();
}

/**
 * Build SHA1 hash from file name
 */
function buildTrackFileHash(input) {
  const normalizedName = normalizeTrackFileName(input);
  if (!normalizedName) {
    return '';
  }

  return crypto.createHash('sha1').update(normalizedName).digest('hex');
}

/**
 * Resolve track file hash from explicit hash or fileName
 */
function resolveTrackFileHash(track = {}) {
  const explicitHash = String(track?.fileHash || '').trim();
  if (explicitHash) {
    return explicitHash;
  }

  const displayName = String(track?.displayName || track?.fileName || '').trim();
  const savedName = String(track?.savedName || '').trim();
  const hashSource = displayName || getDisplayNameFromSavedName(savedName);
  return buildTrackFileHash(hashSource);
}

/**
 * Normalize track object with default values
 */
function normalizeTrack(track, index = 0) {
  const performer = String(track?.performer || '').trim() || '未知演出人';
  const programName = String(track?.programName || '').trim() || '未命名节目';
  const fileName = String(track?.fileName || track?.displayName || '').trim();
  const id = String(track?.id || track?.savedName || `custom-${Date.now()}-${index}`);
  const savedName = String(track?.savedName || '').trim();
  const status = String(track?.status || 'saved').trim() === 'temp' ? 'temp' : 'saved';

  return {
    id,
    performer,
    programName,
    hostScript: String(track?.hostScript || '').trim(),
    fileName,
    displayName: fileName,
    savedName,
    fileHash: resolveTrackFileHash({ ...track, fileName }),
    status,
    size: Number(track?.size || 0),
    uploadTime: track?.uploadTime || null,
    order: Number(track?.order || index + 1)
  };
}

/**
 * Build music list from all uploaded audio files
 */
function buildMusicListFromUploadedFiles() {
  const uploadedFiles = getUploadedFiles(uploadDir);
  return uploadedFiles
    .filter((file) => isAudioFile(file.savedName))
    .map((file, index) => {
      const trackMeta = parseTrackMeta(file.savedName);
      const cleanFileName = getDisplayNameFromSavedName(file.savedName);
      return normalizeTrack(
        {
          id: file.savedName,
          performer: trackMeta.performer,
          programName: trackMeta.programName,
          displayName: cleanFileName,
          fileName: cleanFileName,
          savedName: file.savedName,
          status: 'saved',
          size: file.size,
          uploadTime: file.uploadTime,
          order: index + 1
        },
        index
      );
    });
}

/**
 * Build temporary track candidates from uploaded audio files
 */
function buildUploadedAudioTrackCandidates() {
  return getUploadedFiles(uploadDir)
    .filter((file) => isAudioFile(file.savedName))
    .map((file, index) => normalizeTrack({
      id: `temp-${file.savedName}`,
      performer: '',
      programName: '',
      hostScript: '',
      displayName: getDisplayNameFromSavedName(file.savedName),
      fileName: getDisplayNameFromSavedName(file.savedName),
      savedName: file.savedName,
      status: 'temp',
      size: Number(file.size || 0),
      uploadTime: file.uploadTime || null,
      order: index + 1,
    }, index));
}

/**
 * Extract only saved tracks from music list
 */
function extractSavedTracksOnly(musicList = []) {
  return (Array.isArray(musicList) ? musicList : [])
    .map((item, index) => normalizeTrack({ ...item, status: 'saved' }, index))
    .filter((item) => item.status === 'saved');
}

/**
 * Append temporary tracks to existing saved tracks
 */
function appendTemporaryTracks(baseTracks = []) {
  const savedTracks = extractSavedTracksOnly(baseTracks);
  const existingHashes = new Set(
    savedTracks
      .map((track) => String(track.fileHash || '').trim())
      .filter(Boolean)
  );

  const tempTracks = buildUploadedAudioTrackCandidates()
    .filter((track) => {
      const nextHash = String(track.fileHash || '').trim();
      return Boolean(nextHash) && !existingHashes.has(nextHash);
    })
    .map((track, index) => ({
      ...track,
      order: savedTracks.length + index + 1,
      status: 'temp',
    }));

  return [...savedTracks, ...tempTracks];
}

/**
 * Read saved music list from JSON file
 */
function readSavedMusicList() {
  if (!fs.existsSync(musicListJsonPath)) {
    return null;
  }

  const rawText = fs.readFileSync(musicListJsonPath, 'utf-8');
  const parsed = JSON.parse(rawText);
  if (!Array.isArray(parsed?.musicList)) {
    return null;
  }

  return {
    generatedAt: parsed.generatedAt || new Date().toISOString(),
    recordName: parsed.recordName || 'musiclist',
    playlistLocked: Boolean(parsed?.playlistLocked),
    musicList: extractSavedTracksOnly(parsed.musicList)
  };
}

/**
 * Read playlist locked state from show record file
 */
function readShowPlaylistLock(fileName) {
  const targetPath = fileName === 'musiclist.json' ? musicListJsonPath : path.join(showRecordDir, fileName);
  if (!fs.existsSync(targetPath)) {
    return false;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
    return Boolean(parsed?.playlistLocked);
  } catch {
    return false;
  }
}

/**
 * Save music list to JSON file
 */
function saveMusicListFile(fileName, musicList, options = {}) {
  const normalizedList = extractSavedTracksOnly(musicList);
  const playlistLocked = typeof options.playlistLocked === 'boolean'
    ? options.playlistLocked
    : readShowPlaylistLock(fileName);
  const output = {
    generatedAt: new Date().toISOString(),
    recordName: decodeJsonRecordName(fileName),
    playlistLocked,
    count: normalizedList.length,
    musicList: normalizedList
  };

  const outputPath = fileName === 'musiclist.json' ? musicListJsonPath : path.join(showRecordDir, fileName);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  return output;
}

/**
 * Ensure current show state file exists
 */
function ensureCurrentShowStateFile() {
  if (fs.existsSync(currentShowJsonPath)) {
    return;
  }

  const initialState = {
    fileName: '',
    recordName: '',
    playlistLocked: false,
    currentProgramName: '',
    currentPerformerName: '',
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(currentShowJsonPath, JSON.stringify(initialState, null, 2), 'utf-8');
}

/**
 * Clear current show state
 */
function clearCurrentShowState() {
  const emptyState = {
    fileName: '',
    recordName: '',
    playlistLocked: false,
    currentProgramName: '',
    currentPerformerName: '',
    updatedAt: new Date().toISOString()
  };

  ensureCurrentShowStateFile();
  fs.writeFileSync(currentShowJsonPath, JSON.stringify(emptyState, null, 2), 'utf-8');
  return null;
}

/**
 * Write current show state to file
 */
function writeCurrentShowState({ fileName, recordName, musicList, playlistLocked, currentProgramName, currentPerformerName }) {
  ensureCurrentShowStateFile();

  const output = {
    fileName: String(fileName || '').trim(),
    recordName: String(recordName || '').trim() || decodeJsonRecordName(fileName),
    playlistLocked: Boolean(playlistLocked),
    currentProgramName: String(currentProgramName ?? '').trim(),
    currentPerformerName: String(currentPerformerName ?? '').trim(),
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(currentShowJsonPath, JSON.stringify(output, null, 2), 'utf-8');
  return output;
}

/**
 * Read current show state from file
 */
function readCurrentShowState() {
  if (!fs.existsSync(currentShowJsonPath)) {
    return null;
  }

  const rawText = fs.readFileSync(currentShowJsonPath, 'utf-8');
  const parsed = JSON.parse(rawText);
  if (!parsed?.fileName) {
    return null;
  }

  return {
    fileName: String(parsed.fileName),
    recordName: String(parsed.recordName || '').trim() || decodeJsonRecordName(parsed.fileName),
    playlistLocked: Boolean(parsed.playlistLocked),
    currentProgramName: String(parsed.currentProgramName || '').trim(),
    currentPerformerName: String(parsed.currentPerformerName || '').trim(),
    updatedAt: parsed.updatedAt || null
  };
}

/**
 * Get validated current show state (clears if file doesn't exist)
 */
function getValidatedCurrentShowState() {
  const currentState = readCurrentShowState();
  if (!currentState?.fileName) {
    return null;
  }

  if (fs.existsSync(getShowFilePath(currentState.fileName))) {
    return currentState;
  }

  return clearCurrentShowState();
}

/**
 * Write runtime music list to musiclist.json
 */
function writeRuntimeMusicList(musicList = [], recordName = 'musiclist', playlistLocked = false) {
  const savedTracks = extractSavedTracksOnly(musicList);
  const output = {
    generatedAt: new Date().toISOString(),
    recordName: String(recordName || '').trim() || 'musiclist',
    playlistLocked: Boolean(playlistLocked),
    count: savedTracks.length,
    musicList: savedTracks
  };

  fs.writeFileSync(musicListJsonPath, JSON.stringify(output, null, 2), 'utf-8');
  return output;
}

/**
 * Build temporary-only music list output
 */
function buildTemporaryOnlyMusicListOutput(recordName = 'musiclist') {
  const tempTracks = buildUploadedAudioTrackCandidates().map((track, index) => ({
    ...track,
    order: index + 1,
    status: 'temp'
  }));

  writeRuntimeMusicList([], recordName, false);

  return {
    generatedAt: new Date().toISOString(),
    recordName,
    playlistLocked: false,
    count: tempTracks.length,
    musicList: tempTracks,
    hasCurrentShow: false,
    currentShow: null
  };
}

/**
 * Build runtime music list output with saved and temporary tracks
 */
function buildRuntimeMusicListOutput(savedList = {}) {
  const savedTracks = extractSavedTracksOnly(savedList?.musicList);
  const normalizedList = appendTemporaryTracks(savedTracks);

  return {
    generatedAt: new Date().toISOString(),
    recordName: String(savedList?.recordName || '').trim() || 'musiclist',
    playlistLocked: Boolean(savedList?.playlistLocked),
    count: normalizedList.length,
    musicList: normalizedList,
    hasCurrentShow: false,
    currentShow: null
  };
}

/**
 * Build saved track input for new tracks without audio
 */
function buildSavedTrackInput(track = {}, index = 0) {
  const fileName = String(track?.fileName || track?.displayName || '').trim() || '手动新增节目（无音频）';
  const savedName = String(track?.savedName || '').trim();

  return normalizeTrack({
    id: track?.id || savedName || `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    performer: track?.performer,
    programName: track?.programName,
    hostScript: track?.hostScript || '',
    fileName,
    displayName: fileName,
    savedName,
    fileHash: track?.fileHash || resolveTrackFileHash({ ...track, fileName, savedName }),
    status: 'saved',
    order: index + 1
  }, index);
}

/**
 * Refresh current program state with updated music list
 */
function refreshCurrentProgramState(musicList) {
  const currentState = readCurrentShowState();
  if (!currentState) {
    return null;
  }

  return writeCurrentShowState({
    fileName: currentState.fileName,
    recordName: currentState.recordName,
    playlistLocked: Boolean(currentState.playlistLocked),
    musicList,
    currentProgramName: currentState.currentProgramName,
    currentPerformerName: currentState.currentPerformerName
  });
}

/**
 * Update current program state (performer and program name)
 */
function updateCurrentProgramState({ performer, programName, clearCurrentProgram = false }) {
  const shouldClearCurrentProgram = Boolean(clearCurrentProgram);
  const safePerformer = String(performer || '').trim();
  const safeProgramName = String(programName || '').trim();
  if (!shouldClearCurrentProgram && !safeProgramName) {
    throw new Error('节目名不能为空');
  }

  const currentState = readCurrentShowState();
  const savedList = readSavedMusicList();
  const fallbackRecordName = String(savedList?.recordName || '').trim() || 'musiclist';

  const nextState = {
    fileName: currentState?.fileName || `${fallbackRecordName}.json`,
    recordName: currentState?.recordName || fallbackRecordName,
    playlistLocked: Boolean(currentState?.playlistLocked),
    currentProgramName: shouldClearCurrentProgram ? '' : safeProgramName,
    currentPerformerName: shouldClearCurrentProgram ? '' : safePerformer,
    updatedAt: new Date().toISOString()
  };

  ensureCurrentShowStateFile();
  fs.writeFileSync(currentShowJsonPath, JSON.stringify(nextState, null, 2), 'utf-8');
  return nextState;
}

/**
 * Get show file path
 */
function getShowFilePath(fileName) {
  return path.join(showRecordDir, fileName);
}

/**
 * Resolve upload file path by name with encoding recovery
 */
function resolveUploadFilePathByName(fileName) {
  const rawName = String(fileName || '').trim();
  if (!rawName) {
    return null;
  }

  const recoverLatin1Utf8 = (value) => {
    try {
      const recovered = Buffer.from(String(value || ''), 'latin1').toString('utf8');
      return recovered.includes('') ? String(value || '') : recovered;
    } catch {
      return String(value || '');
    }
  };

  const decodeSafely = (value) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const candidateNames = Array.from(
    new Set([
      rawName,
      decodeMusicFileToken(rawName),
      decodeSafely(rawName),
      recoverLatin1Utf8(rawName),
      recoverLatin1Utf8(decodeSafely(rawName))
    ])
  )
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .map((name) => name.normalize('NFC'));

  const normalizedUploadDir = path.resolve(uploadDir);

  for (const candidate of candidateNames) {
    const safeName = path.basename(candidate);
    if (!safeName) continue;

    const targetPath = path.join(uploadDir, safeName);
    const normalizedTargetPath = path.resolve(targetPath);
    if (!normalizedTargetPath.startsWith(normalizedUploadDir)) {
      continue;
    }

    if (fs.existsSync(normalizedTargetPath)) {
      return normalizedTargetPath;
    }
  }

  return null;
}

/**
 * Transform track to response format
 */
function toTrackResponse(track) {
  const savedName = String(track?.savedName || '').trim();
  const cleanFileName = savedName ? getDisplayNameFromSavedName(savedName) : '';
  const status = String(track?.status || 'saved').trim() === 'temp' ? 'temp' : 'saved';
  return {
    ...track,
    fileName: cleanFileName || track?.fileName,
    displayName: cleanFileName || track?.displayName,
    fileHash: resolveTrackFileHash(track),
    status,
    isTemporary: status === 'temp',
    playUrl: savedName ? `/v1/music/file/${encodeMusicFileToken(savedName)}` : ''
  };
}

/**
 * Transform music list to response payload
 */
function toMusicListResponsePayload(output = {}) {
  const list = Array.isArray(output.musicList) ? output.musicList.map((item) => toTrackResponse(item)) : [];
  return {
    ...output,
    count: list.length,
    musicList: list
  };
}

/**
 * Sync show file to musiclist.json
 */
function syncShowToMusicList(fileName) {
  const sourcePath = getShowFilePath(fileName);
  if (!fs.existsSync(sourcePath)) {
    throw new Error('目标演出文件不存在');
  }

  const rawText = fs.readFileSync(sourcePath, 'utf-8');
  const parsed = JSON.parse(rawText);
  const normalizedList = appendTemporaryTracks(Array.isArray(parsed?.musicList) ? parsed.musicList : []);

  const output = {
    generatedAt: new Date().toISOString(),
    recordName: decodeJsonRecordName(fileName),
    playlistLocked: Boolean(parsed?.playlistLocked),
    count: normalizedList.length,
    musicList: normalizedList
  };

  fs.writeFileSync(musicListJsonPath, JSON.stringify(output, null, 2), 'utf-8');
  return output;
}

/**
 * Resolve show record file name with multiple encoding attempts
 */
function resolveShowRecordFileName(inputFileName) {
  const raw = String(inputFileName || '').trim();
  if (!raw) {
    return null;
  }

  const exactCandidate = raw.toLowerCase().endsWith('.json') ? raw : `${raw}.json`;
  const normalizedCandidate = normalizeJsonFileName(raw);
  let decodedCandidate = exactCandidate;
  try {
    decodedCandidate = decodeURIComponent(exactCandidate);
  } catch {
    decodedCandidate = exactCandidate;
  }
  const legacyEncodedCandidate = normalizedCandidate ? `${encodeURIComponent(String(normalizedCandidate || '').replace(/\.json$/i, ''))}.json` : null;
  const candidates = Array.from(new Set([exactCandidate, decodedCandidate, normalizedCandidate, legacyEncodedCandidate].filter(Boolean)));

  for (const candidate of candidates) {
    const filePath = getShowFilePath(candidate);
    if (fs.existsSync(filePath)) {
      return candidate;
    }
  }

  return null;
}

/**
 * List all show records
 */
function listShowRecords() {
  return fs
    .readdirSync(showRecordDir)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .map((fileName) => {
      const filePath = getShowFilePath(fileName);
      const stats = fs.statSync(filePath);
      let count = 0;

      try {
        const rawText = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(rawText);
        count = Array.isArray(parsed?.musicList) ? parsed.musicList.length : 0;
      } catch {
        count = 0;
      }

      return {
        fileName,
        recordName: decodeJsonRecordName(fileName),
        count,
        updatedAt: stats.mtime
      };
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Get current show
 */
function getCurrentShow() {
  return getValidatedCurrentShowState();
}

/**
 * Get current program
 */
function getCurrentProgram() {
  const currentState = getValidatedCurrentShowState();
  if (!currentState?.currentProgramName) {
    return null;
  }

  return {
    performer: currentState.currentPerformerName || '未知演出人',
    programName: currentState.currentProgramName
  };
}

/**
 * Find available Chinese font path for PDF generation
 */
function findAvailableChineseFontPath() {
  const candidates = [
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/System/Library/Fonts/STHeiti Light.ttc',
    '/System/Library/Fonts/Supplemental/Songti.ttc',
    '/Library/Fonts/Arial Unicode.ttf'
  ];

  return candidates.find((fontPath) => fs.existsSync(fontPath)) || null;
}

/**
 * Render program sheet PDF document
 */
function renderProgramSheetPdf(doc, list, recordName) {
  const marginLeft = 50;
  const contentWidth = doc.page.width - marginLeft * 2;
  const colWidths = {
    order: 44,
    performer: 110,
    programName: 140,
    hostScript: contentWidth - 44 - 110 - 140
  };

  const drawLine = (y) => {
    doc.moveTo(marginLeft, y).lineTo(marginLeft + contentWidth, y).strokeColor('#DDDDDD').stroke();
  };

  const ensurePageSpace = (nextRowHeight, currentY) => {
    const bottomSafeY = doc.page.height - 60;
    if (currentY + nextRowHeight <= bottomSafeY) {
      return currentY;
    }

    doc.addPage();
    return 50;
  };

  const drawHeader = (startY) => {
    doc.fontSize(20).fillColor('#222222').text(recordName, marginLeft, startY, { width: contentWidth, align: 'left' });
    doc
      .fontSize(11)
      .fillColor('#666666')
      .text(`导出时间：${new Date().toLocaleString('zh-CN')}  ·  节目总数：${list.length}`, marginLeft, startY + 30, {
        width: contentWidth,
        align: 'left'
      });
  };

  const drawTableHeader = (startY) => {
    doc.fontSize(12).fillColor('#222222');

    let x = marginLeft;
    doc.text('序号', x + 4, startY + 6, { width: colWidths.order - 8 });
    x += colWidths.order;
    doc.text('演出人', x + 4, startY + 6, { width: colWidths.performer - 8 });
    x += colWidths.performer;
    doc.text('节目名', x + 4, startY + 6, { width: colWidths.programName - 8 });
    x += colWidths.programName;
    doc.text('主持人口播词', x + 4, startY + 6, { width: colWidths.hostScript - 8 });

    drawLine(startY + 26);
    return startY + 28;
  };

  drawHeader(50);
  let cursorY = drawTableHeader(98);

  list.forEach((track, index) => {
    const rowOrder = String(index + 1);
    const performer = track.performer || '-';
    const programName = track.programName || '-';
    const hostScript = track.hostScript || '-';

    doc.fontSize(11).fillColor('#333333');
    const lineHeight = 16;
    const performerHeight = doc.heightOfString(performer, { width: colWidths.performer - 8, lineGap: 2 });
    const programHeight = doc.heightOfString(programName, { width: colWidths.programName - 8, lineGap: 2 });
    const scriptHeight = doc.heightOfString(hostScript, { width: colWidths.hostScript - 8, lineGap: 2 });
    const orderHeight = doc.heightOfString(rowOrder, { width: colWidths.order - 8, lineGap: 2 });
    const rowHeight = Math.max(lineHeight, performerHeight, programHeight, scriptHeight, orderHeight) + 10;

    cursorY = ensurePageSpace(rowHeight + 2, cursorY);
    if (cursorY === 50) {
      cursorY = drawTableHeader(50);
    }

    let x = marginLeft;
    doc.text(rowOrder, x + 4, cursorY + 4, { width: colWidths.order - 8, lineGap: 2 });
    x += colWidths.order;
    doc.text(performer, x + 4, cursorY + 4, { width: colWidths.performer - 8, lineGap: 2 });
    x += colWidths.performer;
    doc.text(programName, x + 4, cursorY + 4, { width: colWidths.programName - 8, lineGap: 2 });
    x += colWidths.programName;
    doc.text(hostScript, x + 4, cursorY + 4, { width: colWidths.hostScript - 8, lineGap: 2 });

    drawLine(cursorY + rowHeight);
    cursorY += rowHeight + 2;
  });
}

module.exports = {
  normalizeTrackFileName,
  buildTrackFileHash,
  resolveTrackFileHash,
  normalizeTrack,
  buildMusicListFromUploadedFiles,
  buildUploadedAudioTrackCandidates,
  extractSavedTracksOnly,
  appendTemporaryTracks,
  readSavedMusicList,
  readShowPlaylistLock,
  saveMusicListFile,
  ensureCurrentShowStateFile,
  clearCurrentShowState,
  writeCurrentShowState,
  readCurrentShowState,
  getValidatedCurrentShowState,
  writeRuntimeMusicList,
  buildTemporaryOnlyMusicListOutput,
  buildRuntimeMusicListOutput,
  buildSavedTrackInput,
  refreshCurrentProgramState,
  updateCurrentProgramState,
  getShowFilePath,
  resolveUploadFilePathByName,
  toTrackResponse,
  toMusicListResponsePayload,
  syncShowToMusicList,
  resolveShowRecordFileName,
  listShowRecords,
  getCurrentShow,
  getCurrentProgram,
  findAvailableChineseFontPath,
  renderProgramSheetPdf
};
