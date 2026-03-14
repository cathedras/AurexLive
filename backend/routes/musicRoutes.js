const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const musicPlaybackService = require('../services/musicPlaybackService');

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
} = require('../utils/fileUtils');

const router = express.Router();

function normalizeTrackFileName(fileName) {
  return String(fileName || '')
    .trim()
    .normalize('NFC')
    .toLowerCase();
}

function buildTrackFileHash(input) {
  const normalizedName = normalizeTrackFileName(input);
  if (!normalizedName) {
    return '';
  }

  return crypto.createHash('sha1').update(normalizedName).digest('hex');
}

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

function extractSavedTracksOnly(musicList = []) {
  return (Array.isArray(musicList) ? musicList : [])
    .map((item, index) => normalizeTrack({ ...item, status: 'saved' }, index))
    .filter((item) => item.status === 'saved');
}

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

function getShowFilePath(fileName) {
  return path.join(showRecordDir, fileName);
}

function resolveUploadFilePathByName(fileName) {
  const rawName = String(fileName || '').trim();
  if (!rawName) {
    return null;
  }

  const recoverLatin1Utf8 = (value) => {
    try {
      const recovered = Buffer.from(String(value || ''), 'latin1').toString('utf8');
      return recovered.includes('�') ? String(value || '') : recovered;
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

function toMusicListResponsePayload(output = {}) {
  const list = Array.isArray(output.musicList) ? output.musicList.map((item) => toTrackResponse(item)) : [];
  return {
    ...output,
    count: list.length,
    musicList: list
  };
}

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

function getCurrentShow() {
  return getValidatedCurrentShowState();
}

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

router.get('/musiclist', (req, res) => {
  try {
    const savedList = readSavedMusicList();
    const currentShow = getValidatedCurrentShowState();
    let output;

    if (currentShow?.fileName) {
      output = syncShowToMusicList(currentShow.fileName);
    } else if (savedList?.musicList?.length) {
      output = buildRuntimeMusicListOutput(savedList);
    } else if (savedList) {
      output = buildTemporaryOnlyMusicListOutput(savedList.recordName || 'musiclist');
    } else {
      output = buildTemporaryOnlyMusicListOutput('musiclist');
    }

    return res.json({ success: true, ...toMusicListResponsePayload(output) });
  } catch (error) {
    clearCurrentShowState();
    const output = buildTemporaryOnlyMusicListOutput('musiclist');
    return res.json({
      success: true,
      message: `当前演出文件不存在，已清除当前演出状态：${error.message}`,
      ...toMusicListResponsePayload(output)
    });
  }
});

router.post('/musiclist/runtime-track', (req, res) => {
  try {
    const performer = String(req.body?.performer || '').trim();
    const programName = String(req.body?.programName || '').trim();
    const hostScript = String(req.body?.hostScript || '').trim();
    const sourceTrack = req.body?.sourceTrack && typeof req.body.sourceTrack === 'object' ? req.body.sourceTrack : {};

    if (!performer || !programName) {
      return res.status(400).json({
        success: false,
        message: '演出人和节目名不能为空'
      });
    }

    const currentShow = getValidatedCurrentShowState();
    const targetFileName = currentShow?.fileName || 'musiclist.json';
    const sourceList = currentShow?.fileName
      ? (() => {
          const filePath = getShowFilePath(currentShow.fileName);
          if (!fs.existsSync(filePath)) {
            throw new Error('当前演出文件不存在');
          }

          const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          return {
            recordName: decodeJsonRecordName(currentShow.fileName),
            playlistLocked: Boolean(parsed?.playlistLocked),
            musicList: extractSavedTracksOnly(parsed?.musicList)
          };
        })()
      : (readSavedMusicList() || {
          recordName: 'musiclist',
          playlistLocked: false,
          musicList: []
        });
    const savedTracks = extractSavedTracksOnly(sourceList.musicList);
    const nextTrack = buildSavedTrackInput({
      performer,
      programName,
      hostScript,
      ...sourceTrack
    }, savedTracks.length);

    if (nextTrack.fileHash) {
      const hasExistingTrack = savedTracks.some((track) => String(track.fileHash || '').trim() === nextTrack.fileHash);
      if (hasExistingTrack) {
        return res.status(409).json({
          success: false,
          message: '该音频文件对应的节目已存在，无需重复新增'
        });
      }
    }

    const nextTracks = [...savedTracks, { ...nextTrack, order: savedTracks.length + 1 }];
    const savedOutput = currentShow?.fileName
      ? saveMusicListFile(targetFileName, nextTracks, { playlistLocked: sourceList.playlistLocked })
      : writeRuntimeMusicList(nextTracks, sourceList.recordName || 'musiclist', sourceList.playlistLocked);

    if (currentShow?.fileName) {
      writeCurrentShowState({
        fileName: currentShow.fileName,
        recordName: currentShow.recordName,
        playlistLocked: Boolean(savedOutput.playlistLocked),
        musicList: savedOutput.musicList,
        currentProgramName: currentShow.currentProgramName,
        currentPerformerName: currentShow.currentPerformerName
      });
      syncShowToMusicList(currentShow.fileName);
    }

    return res.json({
      success: true,
      message: currentShow?.fileName ? '节目已加入当前演出' : '节目已加入临时列表',
      track: toTrackResponse(nextTrack),
      musicList: toMusicListResponsePayload(savedOutput).musicList
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `新增节目失败：${error.message}`
    });
  }
});

router.post('/musiclist/save', (req, res) => {
  try {
    const { recordName, musicList, setCurrent, playlistLocked } = req.body || {};
    const activeCurrentShow = getValidatedCurrentShowState();
    const requestedFileName = normalizeJsonFileName(recordName);
    const shouldSetCurrent = Boolean(setCurrent);
    const fileName = shouldSetCurrent
      ? requestedFileName
      : ((requestedFileName === 'musiclist.json' && activeCurrentShow?.fileName) ? activeCurrentShow.fileName : requestedFileName);

    if (!fileName) {
      return res.status(400).json({ success: false, message: '请填写有效的演出文件名' });
    }

    const runtimeList = readSavedMusicList();
    const sourceMusicList = shouldSetCurrent && Array.isArray(runtimeList?.musicList)
      ? runtimeList.musicList
      : musicList;
    const savedOutput = saveMusicListFile(fileName, sourceMusicList, {
      playlistLocked: typeof playlistLocked === 'boolean' ? playlistLocked : undefined
    });
    let nextCurrentShow = null;

    if (shouldSetCurrent) {
      nextCurrentShow = writeCurrentShowState({
        fileName,
        recordName: fileName.replace(/\.json$/i, ''),
        playlistLocked: Boolean(savedOutput.playlistLocked),
        musicList: savedOutput.musicList,
        currentProgramName: '',
        currentPerformerName: ''
      });
      writeRuntimeMusicList([], fileName.replace(/\.json$/i, ''), false);
    } else if (fileName === 'musiclist.json') {
      refreshCurrentProgramState(savedOutput.musicList);
    } else if (activeCurrentShow?.fileName === fileName) {
      nextCurrentShow = writeCurrentShowState({
        fileName,
        recordName: decodeJsonRecordName(fileName),
        playlistLocked: Boolean(savedOutput.playlistLocked),
        musicList: savedOutput.musicList,
        currentProgramName: activeCurrentShow.currentProgramName,
        currentPerformerName: activeCurrentShow.currentPerformerName
      });
      syncShowToMusicList(fileName);
    }

    return res.json({
      success: true,
      message: shouldSetCurrent ? '演出保存成功，并已设为当前演出' : '保存成功',
      fileName,
      currentShow: nextCurrentShow,
      filePath: fileName === 'musiclist.json' ? '' : `/v1/show_record/${encodeURIComponent(fileName)}`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `保存音乐列表失败：${error.message}` });
  }
});

router.get('/music/file/:token', (req, res) => {
  try {
    const fileName = decodeMusicFileToken(req.params?.token);
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: '文件标识不能为空'
      });
    }

    const filePath = resolveUploadFilePathByName(fileName);
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: '音频文件不存在'
      });
    }

    return res.sendFile(filePath);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `获取音频文件失败：${error.message}`
    });
  }
});

router.post('/music/file-url', (req, res) => {
  try {
    const fileName = String(req.body?.fileName || '').trim();
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'fileName 不能为空'
      });
    }

    const filePath = resolveUploadFilePathByName(fileName);
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: '音频文件不存在'
      });
    }

    const savedName = path.basename(filePath);
    const displayName = getDisplayNameFromSavedName(savedName);
    const url = `/v1/music/file/${encodeMusicFileToken(savedName)}`;
    return res.json({
      success: true,
      fileName: displayName,
      savedName,
      url
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `获取播放地址失败：${error.message}`
    });
  }
});

router.post('/music/preview-source', (req, res) => {
  try {
    const fileName = String(req.body?.fileName || '').trim();
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'fileName 不能为空'
      });
    }

    const filePath = resolveUploadFilePathByName(fileName);
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: '音频文件不存在'
      });
    }

    const savedName = path.basename(filePath);
    const displayName = getDisplayNameFromSavedName(savedName);
    const url = `/v1/music/file/${encodeMusicFileToken(savedName)}`;
    return res.json({
      success: true,
      fileName: displayName,
      savedName,
      filePath,
      url
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `获取预听地址失败：${error.message}`
    });
  }
});

router.get('/music/backend-state', (req, res) => {
  return res.json({
    success: true,
    state: musicPlaybackService.getPublicState()
  });
});

router.get('/music/backend-progress', (req, res) => {
  const state = musicPlaybackService.getPublicState();
  return res.json({
    success: true,
    state: {
      playbackState: state.state,
      currentTrack: state.currentTrack,
      progress: state.progress,
    }
  });
});

router.get('/music/backend-progress/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const writeState = () => {
    const state = musicPlaybackService.getPublicState();
    res.write(`data: ${JSON.stringify({ success: true, state })}\n\n`);
  };

  writeState();

  const heartbeat = setInterval(() => {
    writeState();
  }, 1000);

  req.on('close', () => {
    clearInterval(heartbeat);
    try {
      res.end();
    } catch {
      // ignore close errors
    }
  });
});

router.post('/music/backend-play', async (req, res) => {
  try {
    const savedName = String(req.body?.fileName || '').trim();
    if (!savedName) {
      return res.status(400).json({
        success: false,
        message: 'fileName 不能为空'
      });
    }

    const filePath = resolveUploadFilePathByName(savedName);
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: '音频文件不存在'
      });
    }

    const state = await musicPlaybackService.playFile(filePath, {
      id: req.body?.trackId,
      performer: req.body?.performer,
      programName: req.body?.programName,
      savedName,
      fileName: getDisplayNameFromSavedName(path.basename(filePath))
    });

    return res.json({
      success: true,
      message: '后端开始播放',
      state
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `后端播放失败：${error.message}`
    });
  }
});

router.post('/music/backend-control', async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim();
    let state = null;

    if (action === 'pause') {
      state = await musicPlaybackService.pause();
    } else if (action === 'resume') {
      state = await musicPlaybackService.resume();
    } else if (action === 'stop') {
      state = await musicPlaybackService.stop();
    } else {
      return res.status(400).json({
        success: false,
        message: '无效操作，仅支持 pause / resume / stop'
      });
    }

    return res.json({
      success: true,
      state
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `后端播放控制失败：${error.message}`
    });
  }
});

router.post('/music/backend-volume', async (req, res) => {
  try {
    const volume = Number(req.body?.volume);
    if (!Number.isFinite(volume)) {
      return res.status(400).json({
        success: false,
        message: 'volume 必须是有效数字'
      });
    }

    const state = await musicPlaybackService.setVolume(volume);
    return res.json({
      success: true,
      state
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `设置后端音量失败：${error.message}`
    });
  }
});

router.get('/show/current', (req, res) => {
  try {
    const currentShow = getCurrentShow();

    if (!currentShow) {
      return res.json({
        success: true,
        hasCurrentShow: false,
        currentShow: null
      });
    }

    return res.json({
      success: true,
      hasCurrentShow: true,
      currentShow
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `获取当前演出失败：${error.message}`
    });
  }
});

router.get('/show/current-program', (req, res) => {
  try {
    const currentProgram = getCurrentProgram();
    return res.json({
      success: true,
      hasCurrentProgram: Boolean(currentProgram),
      currentProgram
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `读取当前节目失败：${error.message}`
    });
  }
});

router.post('/show/current-program', (req, res) => {
  try {
    const currentShow = updateCurrentProgramState({
      performer: req.body?.performer,
      programName: req.body?.programName,
      clearCurrentProgram: req.body?.clearCurrentProgram
    });

    return res.json({
      success: true,
      message: '当前节目更新成功',
      currentShow
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `更新当前节目失败：${error.message}`
    });
  }
});

router.get('/show/current-state', (req, res) => {
  try {
    const currentShow = getCurrentShow();
    const currentProgram = getCurrentProgram();

    return res.json({
      success: true,
      hasCurrentShow: Boolean(currentShow),
      hasCurrentProgram: Boolean(currentProgram),
      currentShow,
      currentProgram
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `获取当前状态失败：${error.message}`
    });
  }
});

router.post('/show/current-lock', (req, res) => {
  try {
    const currentShow = getValidatedCurrentShowState();
    if (!currentShow?.fileName) {
      return res.status(400).json({
        success: false,
        message: '当前没有已打开的演出，无法设置锁定状态'
      });
    }

    const locked = Boolean(req.body?.locked);
    const filePath = getShowFilePath(currentShow.fileName);
    if (!fs.existsSync(filePath)) {
      clearCurrentShowState();
      return res.status(404).json({
        success: false,
        message: '当前演出文件不存在，已清除当前演出状态'
      });
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const savedTracks = extractSavedTracksOnly(parsed?.musicList);
    const savedOutput = saveMusicListFile(currentShow.fileName, savedTracks, { playlistLocked: locked });
    const nextCurrentShow = writeCurrentShowState({
      fileName: currentShow.fileName,
      recordName: currentShow.recordName,
      playlistLocked: locked,
      musicList: savedOutput.musicList,
      currentProgramName: currentShow.currentProgramName,
      currentPerformerName: currentShow.currentPerformerName
    });

    return res.json({
      success: true,
      message: locked ? '当前演出已锁定' : '当前演出已解锁',
      currentShow: nextCurrentShow
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `更新当前演出锁定状态失败：${error.message}`
    });
  }
});

router.post('/show/current/close', (req, res) => {
  try {
    const currentShow = getValidatedCurrentShowState();
    if (!currentShow?.fileName) {
      writeRuntimeMusicList([], 'musiclist');
      return res.json({
        success: true,
        message: '当前没有已打开的演出，临时列表已清空'
      });
    }

    clearCurrentShowState();
    writeRuntimeMusicList([], 'musiclist');

    return res.json({
      success: true,
      message: `当前演出《${currentShow.recordName || decodeJsonRecordName(currentShow.fileName)}》已关闭，临时列表已清空`
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `关闭当前演出失败：${error.message}`
    });
  }
});

router.get('/shows', (req, res) => {
  try {
    const shows = listShowRecords();
    return res.json({
      success: true,
      count: shows.length,
      shows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `获取演出列表失败：${error.message}`
    });
  }
});

router.delete('/show/:fileName', (req, res) => {
  try {
    const fileName = resolveShowRecordFileName(req.params?.fileName);
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: '请选择有效的演出文件'
      });
    }

    const filePath = getShowFilePath(fileName);
    const currentShow = getValidatedCurrentShowState();
    const isCurrentShow = currentShow?.fileName === fileName;

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    if (isCurrentShow) {
      clearCurrentShowState();
      writeRuntimeMusicList([], 'musiclist');
    }

    return res.json({
      success: true,
      message: isCurrentShow ? '历史演出删除成功，当前演出状态已清空' : '历史演出删除成功',
      deletedFileName: fileName,
      clearedCurrentShow: isCurrentShow
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `删除历史演出失败：${error.message}`
    });
  }
});

router.post('/show/current', (req, res) => {
  try {
    const fileName = resolveShowRecordFileName(req.body?.fileName);
    const clearCurrentProgram = Boolean(req.body?.clearCurrentProgram);
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: '请选择有效的演出文件'
      });
    }

    const filePath = getShowFilePath(fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: '演出文件不存在'
      });
    }

    const syncedOutput = syncShowToMusicList(fileName);
    const currentShow = writeCurrentShowState({
      fileName,
      recordName: decodeJsonRecordName(fileName),
      playlistLocked: Boolean(syncedOutput.playlistLocked),
      musicList: syncedOutput.musicList,
      currentProgramName: clearCurrentProgram ? '' : undefined,
      currentPerformerName: clearCurrentProgram ? '' : undefined
    });

    return res.json({
      success: true,
      message: '当前演出切换成功',
      currentShow
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `切换当前演出失败：${error.message}`
    });
  }
});

router.post('/musiclist/export-pdf', (req, res) => {
  try {
    const list = Array.isArray(req.body?.musicList) ? req.body.musicList.map((item, index) => normalizeTrack(item, index)) : [];
    const rawRecordName = String(req.body?.recordName || '节目单').trim();
    const safeRecordName = rawRecordName || '节目单';
    const normalizedFileName = normalizeJsonFileName(safeRecordName) || '节目单.json';
    const pdfFileName = `${decodeJsonRecordName(normalizedFileName) || '节目单'}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(pdfFileName)}`);

    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const fontPath = findAvailableChineseFontPath();
    if (fontPath) {
      doc.font(fontPath);
    }

    doc.pipe(res);
    renderProgramSheetPdf(doc, list, `${safeRecordName} 节目单`);
    doc.end();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `导出 PDF 失败：${error.message}`
    });
  }
});

module.exports = router;
