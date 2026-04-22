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
  normalizeJsonFileName,
  decodeJsonRecordName,
  encodeMusicFileToken,
  decodeMusicFileToken,
  getDisplayNameFromSavedName
} = require('../utils/fileUtils');
const {
  readSavedMusicList,
  getValidatedCurrentShowState,
  syncShowToMusicList,
  buildRuntimeMusicListOutput,
  buildTemporaryOnlyMusicListOutput,
  toMusicListResponsePayload,
  clearCurrentShowState,
  getShowFilePath,
  extractSavedTracksOnly,
  saveMusicListFile,
  writeCurrentShowState,
  writeRuntimeMusicList,
  buildSavedTrackInput,
  toTrackResponse,
  refreshCurrentProgramState,
  updateCurrentProgramState,
  resolveUploadFilePathByName,
  listShowRecords,
  getCurrentShow,
  getCurrentProgram,
  normalizeTrack,
  resolveShowRecordFileName
} = require('../services/musicService.js');
const {
  findAvailableChineseFontPath,
  renderProgramSheetPdf
} = require('../utils/pdfTemplate');

const router = express.Router();

// ==================== Music List APIs ====================

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
      message: `The current show file does not exist, so the current show state has been cleared: ${error.message}`,
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
        message: 'Performer and program name are required.'
      });
    }

    const currentShow = getValidatedCurrentShowState();
    const targetFileName = currentShow?.fileName || 'musiclist.json';
    const sourceList = currentShow?.fileName
      ? (() => {
          const filePath = getShowFilePath(currentShow.fileName);
          if (!fs.existsSync(filePath)) {
            throw new Error('The current show file does not exist.');
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
          message: 'A program for this audio file already exists; duplicate creation is not needed.'
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
      message: currentShow?.fileName ? 'The program has been added to the current show.' : 'The program has been added to the temporary list.',
      track: toTrackResponse(nextTrack),
      musicList: toMusicListResponsePayload(savedOutput).musicList
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to add program: ${error.message}`
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
      return res.status(400).json({ success: false, message: 'Please provide a valid show file name.' });
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
      message: shouldSetCurrent ? 'The show has been saved and set as the current show.' : 'Saved successfully.',
      fileName,
      currentShow: nextCurrentShow,
      filePath: fileName === 'musiclist.json' ? '' : `/v1/show_record/${encodeURIComponent(fileName)}`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `Failed to save music list: ${error.message}` });
  }
});

// ==================== Audio File APIs ====================

router.get('/file/:token', (req, res) => {
  try {
    const fileName = decodeMusicFileToken(req.params?.token);
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'File token is required.'
      });
    }

    const filePath = resolveUploadFilePathByName(fileName);
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: 'Audio file not found.'
      });
    }

    return res.sendFile(filePath);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to fetch audio file: ${error.message}`
    });
  }
});

router.post('/file-url', (req, res) => {
  try {
    const fileName = String(req.body?.fileName || '').trim();
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'fileName is required.'
      });
    }

    const filePath = resolveUploadFilePathByName(fileName);
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: 'Audio file not found.'
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
      message: `Failed to get playback URL: ${error.message}`
    });
  }
});

router.post('/preview-source', (req, res) => {
  try {
    const fileName = String(req.body?.fileName || '').trim();
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'fileName is required.'
      });
    }

    const filePath = resolveUploadFilePathByName(fileName);
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: 'Audio file not found.'
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
      message: `Failed to get preview URL: ${error.message}`
    });
  }
});

// ==================== Backend Playback Control APIs ====================

router.get('/backend-state', (req, res) => {
  return res.json({
    success: true,
    state: musicPlaybackService.getPublicState()
  });
});

router.get('/backend-progress', (req, res) => {
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

router.get('/backend-progress/stream', (req, res) => {
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

router.post('/backend-play', async (req, res) => {
  try {
    const savedName = String(req.body?.fileName || '').trim();
    if (!savedName) {
      return res.status(400).json({
        success: false,
        message: 'fileName is required.'
      });
    }

    const filePath = resolveUploadFilePathByName(savedName);
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: 'Audio file not found.'
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
      message: 'Backend playback started.',
      state
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Backend playback failed: ${error.message}`
    });
  }
});

router.post('/backend-control', async (req, res) => {
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
        message: 'Invalid action; only pause / resume / stop are supported.'
      });
    }

    return res.json({
      success: true,
      state
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Backend playback control failed: ${error.message}`
    });
  }
});

router.post('/backend-volume', async (req, res) => {
  try {
    const volume = Number(req.body?.volume);
    if (!Number.isFinite(volume)) {
      return res.status(400).json({
        success: false,
        message: 'Volume must be a valid number.'
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
      message: `Failed to set backend volume: ${error.message}`
    });
  }
});

// ==================== Show Management APIs ====================

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
      message: `Failed to get current show: ${error.message}`
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
      message: `Failed to read current program: ${error.message}`
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
      message: 'Current program updated successfully.',
      currentShow
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to update current program: ${error.message}`
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
      message: `Failed to get current state: ${error.message}`
    });
  }
});

router.post('/show/current-lock', (req, res) => {
  try {
    const currentShow = getValidatedCurrentShowState();
    if (!currentShow?.fileName) {
      return res.status(400).json({
        success: false,
        message: 'There is no currently opened show, so the lock state cannot be set.'
      });
    }

    const locked = Boolean(req.body?.locked);
    const filePath = getShowFilePath(currentShow.fileName);
    if (!fs.existsSync(filePath)) {
      clearCurrentShowState();
      return res.status(404).json({
        success: false,
        message: 'The current show file does not exist, so the current show state has been cleared.'
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
      message: locked ? 'The current show has been locked.' : 'The current show has been unlocked.',
      currentShow: nextCurrentShow
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to update current show lock state: ${error.message}`
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
        message: 'There is no currently opened show, so the temporary list has been cleared.'
      });
    }

    clearCurrentShowState();
    writeRuntimeMusicList([], 'musiclist');

    return res.json({
      success: true,
      message: `The current show "${currentShow.recordName || decodeJsonRecordName(currentShow.fileName)}" has been closed, and the temporary list has been cleared.`
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to close the current show: ${error.message}`
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
      message: `Failed to get show list: ${error.message}`
    });
  }
});

router.delete('/show/:fileName', (req, res) => {
  try {
    const fileName = resolveShowRecordFileName(req.params?.fileName);
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid show file.'
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
      message: isCurrentShow ? 'The historical show was deleted and the current show state was cleared.' : 'The historical show was deleted successfully.',
      deletedFileName: fileName,
      clearedCurrentShow: isCurrentShow
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to delete historical show: ${error.message}`
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
        message: 'Please select a valid show file.'
      });
    }

    const filePath = getShowFilePath(fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Show file not found.'
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
      message: 'Current show switched successfully.',
      currentShow
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to switch current show: ${error.message}`
    });
  }
});

// ==================== Export APIs ====================

router.post('/musiclist/export-pdf', (req, res) => {
  try {
    const list = Array.isArray(req.body?.musicList) ? req.body.musicList.map((item, index) => normalizeTrack(item, index)) : [];
    const rawRecordName = String(req.body?.recordName || 'Setlist').trim();
    const safeRecordName = rawRecordName || 'Setlist';
    const normalizedFileName = normalizeJsonFileName(safeRecordName) || 'Setlist.json';
    const pdfFileName = `${decodeJsonRecordName(normalizedFileName) || 'Setlist'}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(pdfFileName)}`);

    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const fontPath = findAvailableChineseFontPath();
    if (fontPath) {
      doc.font(fontPath);
    }

    doc.pipe(res);
    renderProgramSheetPdf(doc, list, `${safeRecordName} Setlist`);
    doc.end();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to export PDF: ${error.message}`
    });
  }
});

module.exports = router;
