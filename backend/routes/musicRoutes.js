const express = require('express');
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

function normalizeTrack(track, index = 0) {
  const performer = String(track?.performer || '').trim() || '未知演出人';
  const programName = String(track?.programName || '').trim() || '未命名节目';
  const fileName = String(track?.fileName || track?.displayName || '').trim();
  const id = String(track?.id || track?.savedName || `custom-${Date.now()}-${index}`);
  const savedName = String(track?.savedName || '').trim();

  return {
    id,
    performer,
    programName,
    hostScript: String(track?.hostScript || '').trim(),
    fileName,
    displayName: fileName,
    savedName,
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
          size: file.size,
          uploadTime: file.uploadTime,
          order: index + 1
        },
        index
      );
    });
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
    musicList: parsed.musicList.map((item, index) => normalizeTrack(item, index))
  };
}

function saveMusicListFile(fileName, musicList) {
  const normalizedList = (Array.isArray(musicList) ? musicList : []).map((item, index) => normalizeTrack(item, index));
  const output = {
    generatedAt: new Date().toISOString(),
    recordName: decodeJsonRecordName(fileName),
    count: normalizedList.length,
    musicList: normalizedList
  };

  const outputPath = fileName === 'musiclist.json' ? musicListJsonPath : path.join(showRecordDir, fileName);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  return output;
}

function getCurrentProgramSnapshot(musicList) {
  const firstTrack = Array.isArray(musicList) && musicList.length > 0 ? musicList[0] : null;
  if (!firstTrack) {
    return {
      programName: '',
      performer: ''
    };
  }

  return {
    programName: String(firstTrack.programName || '').trim(),
    performer: String(firstTrack.performer || '').trim()
  };
}

function ensureCurrentShowStateFile() {
  if (fs.existsSync(currentShowJsonPath)) {
    return;
  }

  const initialState = {
    fileName: '',
    recordName: '',
    currentProgramName: '',
    currentPerformerName: '',
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(currentShowJsonPath, JSON.stringify(initialState, null, 2), 'utf-8');
}

function writeCurrentShowState({ fileName, recordName, musicList, currentProgramName, currentPerformerName }) {
  ensureCurrentShowStateFile();

  const currentProgram = getCurrentProgramSnapshot(musicList);
  const output = {
    fileName: String(fileName || '').trim(),
    recordName: String(recordName || '').trim() || decodeJsonRecordName(fileName),
    currentProgramName: String(currentProgramName ?? currentProgram.programName ?? '').trim(),
    currentPerformerName: String(currentPerformerName ?? currentProgram.performer ?? '').trim(),
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
    currentProgramName: String(parsed.currentProgramName || '').trim(),
    currentPerformerName: String(parsed.currentPerformerName || '').trim(),
    updatedAt: parsed.updatedAt || null
  };
}

function refreshCurrentProgramState(musicList) {
  const currentState = readCurrentShowState();
  if (!currentState) {
    return null;
  }

  return writeCurrentShowState({
    fileName: currentState.fileName,
    recordName: currentState.recordName,
    musicList
  });
}

function updateCurrentProgramState({ performer, programName }) {
  const safePerformer = String(performer || '').trim();
  const safeProgramName = String(programName || '').trim();
  if (!safeProgramName) {
    throw new Error('节目名不能为空');
  }

  const currentState = readCurrentShowState();
  const savedList = readSavedMusicList();
  const fallbackRecordName = String(savedList?.recordName || '').trim() || 'musiclist';

  const nextState = {
    fileName: currentState?.fileName || `${fallbackRecordName}.json`,
    recordName: currentState?.recordName || fallbackRecordName,
    currentProgramName: safeProgramName,
    currentPerformerName: safePerformer,
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
  return {
    ...track,
    fileName: cleanFileName || track?.fileName,
    displayName: cleanFileName || track?.displayName,
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
  const normalizedList = Array.isArray(parsed?.musicList)
    ? parsed.musicList.map((item, index) => normalizeTrack(item, index))
    : [];

  const output = {
    generatedAt: new Date().toISOString(),
    recordName: decodeJsonRecordName(fileName),
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
  const candidates = Array.from(new Set([exactCandidate, normalizedCandidate].filter(Boolean)));

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
  return readCurrentShowState();
}

function getCurrentProgram() {
  const currentState = readCurrentShowState();
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
    let output;

    if (savedList) {
      output = {
        generatedAt: savedList.generatedAt,
        recordName: savedList.recordName,
        count: savedList.musicList.length,
        musicList: savedList.musicList
      };
    } else {
      const generatedList = buildMusicListFromUploadedFiles();
      output = saveMusicListFile('musiclist.json', generatedList);
    }

    return res.json({ success: true, ...toMusicListResponsePayload(output) });
  } catch (error) {
    return res.status(500).json({ success: false, message: `获取音乐列表失败：${error.message}` });
  }
});

router.post('/musiclist/save', (req, res) => {
  try {
    const { recordName, musicList, setCurrent } = req.body || {};
    const fileName = normalizeJsonFileName(recordName);

    if (!fileName) {
      return res.status(400).json({ success: false, message: '请填写有效的演出文件名' });
    }

    const savedOutput = saveMusicListFile(fileName, musicList);

    const shouldSetCurrent = Boolean(setCurrent);
    let currentShow = null;

    if (shouldSetCurrent) {
      currentShow = writeCurrentShowState({
        fileName,
        recordName: fileName.replace(/\.json$/i, ''),
        musicList: savedOutput.musicList
      });
    } else if (fileName === 'musiclist.json') {
      refreshCurrentProgramState(savedOutput.musicList);
    }

    return res.json({
      success: true,
      message: shouldSetCurrent ? '演出保存成功，并已设为当前演出' : '保存成功',
      fileName,
      currentShow,
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

router.post('/music/backend-control', (req, res) => {
  try {
    const action = String(req.body?.action || '').trim();
    let state = null;

    if (action === 'pause') {
      state = musicPlaybackService.pause();
    } else if (action === 'resume') {
      state = musicPlaybackService.resume();
    } else if (action === 'stop') {
      state = musicPlaybackService.stop();
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
      programName: req.body?.programName
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
