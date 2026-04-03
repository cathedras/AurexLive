const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const EventEmitter = require('events');
const { recordingDir } = require('../config/paths');
const wsClientService = require('./wsClientService');

// Enable detailed ffmpeg I/O logging when env var set: FFMPEG_DEBUG=1 or RECORDING_DEBUG=1
const FFMPEG_DEBUG = !!(process.env.FFMPEG_DEBUG === '1' || process.env.RECORDING_DEBUG === '1');

// ffmpeg args for a null-output astats/ametadata monitor (used to extract RMS levels)
const ASTATS_MONITOR_ARGS = ['-map', '0:a', '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-', '-f', 'null', '-'];

function normalizeAvfoundationAudioDevice(device) {
  if (!device || device === 'default') {
    return ':0';
  }

  if (/^:[^:]+$/.test(device)) {
    return device;
  }

  if (/^\d+$/.test(String(device))) {
    return `:${device}`;
  }

  return `:${device}`;
}

function listAvfoundationDevicesSync(ffmpegPath) {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const spawnSync = require('child_process').spawnSync;
    const ff = spawnSync(ffmpegPath || resolveFfmpegPath(), ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''], { encoding: 'utf8' });
    // ffmpeg prints device list to stderr
    const out = (ff.stderr || ff.stdout || '').toString();
    const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return lines;
  } catch (e) {
    return [];
  }
}

// Try to resolve built ffmpeg path from local release or installed package, fallback to system `ffmpeg`
function resolveFfmpegPath() {
  try {
    const rel = require('../../release');
    if (rel && rel.ffmpegPath) return rel.ffmpegPath;
  } catch (e) { }

  try {
    const pkg = require('ffmpeg-min-local');
    if (pkg && pkg.ffmpegPath) return pkg.ffmpegPath;
  } catch (e) { }

  return 'ffmpeg';
}

class RecordingService {
  constructor() {
    this.activeRecordings = new Map(); // 存储活动录音的状态
    // clientId -> { proc, restarts, intentionalStop, lastRestartAt, lastSentAt }
    this.monitorProcs = new Map();
  }

  // 广播音量数据给所有客户端（使用 wsClientService 转发，并触发本地事件）
  broadcastVolume(volumeData) {
    try {
      wsClientService.broadcastVolume(volumeData);
    } catch (e) { }
  }

  // 开始录音
  startRecording(clientId) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `recording-${timestamp}.webm`;
    const filePath = path.join(recordingDir, fileName);

    if (!fs.existsSync(recordingDir)) {
      fs.mkdirSync(recordingDir, { recursive: true });
    }

    // 记录录音状态
    const recordingInfo = {
      fileName,
      filePath,
      startTime: new Date(),
      isRecording: true,
      chunks: [],
      clientId: clientId, // 关联客户端ID
      volumeData: [] // 存储音量数据
    };

    this.activeRecordings.set(fileName, recordingInfo);

    return {
      fileName,
      startTime: recordingInfo.startTime,
    };
  }

  // Start recording using ffmpeg (optional).
  // params:
  // - clientId: associated client
  // - ffmpegArgs: array of args to pass to ffmpeg (if omitted a sensible default will be used)
  // - outFileName: optional filename (defaults to recording-<timestamp>.webm)
  startRecordingWithFfmpeg(clientId, device) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `recording-${timestamp}.mp4`;
    const filePath = path.join(recordingDir, fileName);

    if (!fs.existsSync(recordingDir)) {
      fs.mkdirSync(recordingDir, { recursive: true });
    }

    const recordingInfo = {
      fileName,
      filePath,
      startTime: new Date(),
      isRecording: true,
      chunks: [],
      clientId: clientId,
      volumeData: [],
      ffmpegProc: null,
    };

    // resolve ffmpeg executable and verify availability
    let ffmpegPath = resolveFfmpegPath();
    try {
      if (ffmpegPath && ffmpegPath.indexOf('/') !== -1) {
        if (!fs.existsSync(ffmpegPath)) {
          const whichCmd = process.platform === 'win32' ? 'where' : 'which';
          const which = spawnSync(whichCmd, ['ffmpeg']);
          if (which && which.status === 0) ffmpegPath = 'ffmpeg';
          else throw new Error(`ffmpeg not found at ${ffmpegPath}`);
        }
      } else {
        const whichCmd = process.platform === 'win32' ? 'where' : 'which';
        const which = spawnSync(whichCmd, [ffmpegPath || 'ffmpeg']);
        if (!which || which.status !== 0) throw new Error('ffmpeg executable not found in PATH');
      }
    } catch (err) {
      recordingInfo.isRecording = false;
      throw new Error(`ffmpeg not available: ${err.message}`);
    }

    // Prepare final spawn arguments.
    // If caller did not provide ffmpegArgs, build platform-aware defaults (input device + sensible encoding).
    let spawnArgs;
    const platform = process.platform;
    // For recording-only we do not include astats monitoring here; monitoring is a separate process
    const filter = null;
    console.log(`No ffmpeg args provided, using platform-aware defaults for ${platform}`);
    if (platform === 'darwin') {
      // For macOS (avfoundation) use an asplit + astats filter_complex so we can
      // both encode to a file and monitor RMS levels in stderr simultaneously.
      // This produces lines like lavfi.astats.Overall.RMS_level which we parse.
      // avfoundation expects audio-only inputs in the form ':<index>' or ':<name>'.
      const macDevice = normalizeAvfoundationAudioDevice(device);
      // spawnArgs order: input spec, filter_complex, map output stream, codec settings, output file
      spawnArgs = [
        '-f', 'avfoundation', '-i', macDevice,
        '-vn',
        '-c:a', 'aac', '-b:a', '128k',
        '-y', filePath
      ];
    } else if (platform === 'win32') {
      // use dshow; allow override via env WIN_FFMPEG_DEVICE (e.g. "audio=virtual-audio-capturer")
      const winDev = device || 'audio=default';
      spawnArgs = [
        '-f', 'dshow', '-i', winDev,
        '-vn',
        '-c:a', 'aac', '-b:a', '128k',
        '-y', filePath
      ];    
    } else {
      // assume Linux/ALSA by default; allow override via LINUX_FFMPEG_DEVICE
      const linuxDev = device || 'default';

      spawnArgs = [
        '-f', 'alsa', '-i', linuxDev,
        '-vn',
        '-c:a', 'aac', '-b:a', '128k',
        '-y', filePath
      ];  
    }

    let ff;
    try {
      console.log('Starting ffmpeg:', ffmpegPath, spawnArgs.join(' '));
      // Keep stdin for graceful shutdown and stderr for astats metadata output.
      ff = spawn(ffmpegPath, spawnArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
    } catch (spawnErr) {
      recordingInfo.isRecording = false;
      recordingInfo.ffmpegProc = null;
      throw spawnErr;
    }
    console.log(`ffmpeg started with PID ${ff.Errorno ? ff.Errorno : ff.pid}`);
    // Parse stderr for astats/ametadata output to extract RMS level (dB) and broadcast volume
    ff.stderr.on('data', (chunk) => {
      try {
        const text = chunk.toString();
        // optional debug: output a trimmed stderr snippet for remote troubleshooting
        if (FFMPEG_DEBUG) {
          try {
            const dbg = text.replace(/\s+/g, ' ').trim().slice(0, 1000);
            console.log(`[RecordingService][ffmpeg-stderr][${fileName}] ${dbg}`);
          } catch (e) {
            // ignore debug logging errors
          }
        }
        const m1 = text.match(/lavfi\.astats\.Overall\.RMS_level\s*=?\s*([-\d.]+)\b/);
        let dbValue = null;
        if (m1) dbValue = parseFloat(m1[1]);
        else {
          const m2 = text.match(/RMS level\s*[:=]\s*([-\d.]+)\s*dB/i);
          if (m2) dbValue = parseFloat(m2[1]);
        }
        if (dbValue !== null && !Number.isNaN(dbValue)) {
          const clamped = Math.max(-60, Math.min(0, dbValue));
          const normalized = Math.round((1 - (clamped / -60)) * 100);
          recordingInfo.volumeData.push({ timestamp: Date.now(), volume: normalized });
          console.log(`[RecordingService] volume update for ${fileName}: ${normalized} (raw dB: ${dbValue})`);
          this.broadcastVolume({ fileName, volume: normalized, timestamp: Date.now() });
        }
      } catch (e) {
        // ignore parse errors
      }
    });

    ff.on('exit', (code, sig) => {
      recordingInfo.isRecording = false;
      recordingInfo.ffmpegProc = null;
      // leave file on disk; caller may query getList()/getStatus()
    });

    ff.on('error', (err) => {
      recordingInfo.isRecording = false;
      recordingInfo.ffmpegProc = null;
      console.error('ffmpeg spawn error:', err);
    });

    recordingInfo.ffmpegProc = ff;
    this.activeRecordings.set(fileName, recordingInfo);

    return { fileName, startTime: recordingInfo.startTime };
  }

  // Start a separate ffmpeg process that only monitors audio levels (astats -> stderr)
  // clientId: the ws client id that requested monitoring; device: platform-specific device string/index
  startVolumeMonitor(clientId, device) {
    if (this.monitorProcs.has(clientId)) return { success: false, error: 'monitor-already-running' };

    const platform = process.platform;
    let baseArgs;
    // On macOS validate avfoundation device immediately and return error if missing
    if (platform === 'darwin' && device) {
      try {
        const ffPath = resolveFfmpegPath();
        const devList = listAvfoundationDevicesSync(ffPath).map(l => String(l).toLowerCase());
        const macDeviceNorm = normalizeAvfoundationAudioDevice(device).replace(/^:/, '').toLowerCase();
        const found = devList.some(l => l.includes(macDeviceNorm) || l.includes(`:${macDeviceNorm}`) || l.includes(`'${macDeviceNorm}'`));
        if (!found) {
          console.error(`startVolumeMonitor: avfoundation device not found for '${device}'`);
          return { success: false, error: 'device-not-found' };
        }
      } catch (e) {
        console.error('startVolumeMonitor: device validation failed', e && e.message);
        return { success: false, error: 'device-validation-failed' };
      }
    }
    if (platform === 'darwin') {
      const macDevice = normalizeAvfoundationAudioDevice(device);
      baseArgs = ['-f', 'avfoundation', '-i', macDevice];
    } else if (platform === 'win32') {
      const winDev = device || 'audio=default';
      baseArgs = ['-f', 'dshow', '-i', winDev];
    } else {
      const linuxDev = device || 'default';
      baseArgs = ['-f', 'alsa', '-i', linuxDev];
    }

    const meta = { proc: null, restarts: 0, intentionalStop: false, lastRestartAt: 0, lastSentAt: 0 };
    const MAX_RESTARTS = 5;
    const RATE_MS = 100; // minimum ms between sent volume updates per client

    const spawnMonitor = () => {
      if (meta.intentionalStop) return;
      // Validate macOS avfoundation device before spawning ffmpeg
      if (platform === 'darwin' && device) {
        try {
          const ffPath = resolveFfmpegPath();
          const devList = listAvfoundationDevicesSync(ffPath);
          const macDevice = normalizeAvfoundationAudioDevice(device).replace(/^:/, '');
          const found = devList.some(l => l.includes(macDevice) || l.match(new RegExp("\\\\[" + macDevice + "\\\\]")));
          if (!found) {
            console.error(`ffmpeg monitor validation: avfoundation device not found for '${device}'`);
            // Inform caller synchronously by setting an error marker and scheduling no spawn
            meta.lastError = `device-not-found:${device}`;
            return scheduleRestart();
          }
        } catch (e) {
          console.error('ffmpeg monitor validation failed', e && e.message);
        }
      }

      const monitorArgs = baseArgs.concat(ASTATS_MONITOR_ARGS);
      let ff;
      try {
        console.log('Starting ffmpeg monitor for client', clientId, monitorArgs.join(' '));
        ff = spawn(resolveFfmpegPath(), monitorArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
      } catch (e) {
        console.error('Failed to spawn ffmpeg monitor for', clientId, e && e.message ? e.message : e);
        scheduleRestart();
        return;
      }

      meta.proc = ff;
      meta.lastRestartAt = Date.now();

      ff.stderr.on('data', (chunk) => {
        try {
          const text = chunk.toString();
          if (FFMPEG_DEBUG) {
            try { console.log(`[RecordingService][ffmpeg-monitor-stderr][${clientId}] ${text.replace(/\s+/g,' ').trim().slice(0,1000)}`); } catch (e) {}
          }
          const m1 = text.match(/lavfi\.astats\.Overall\.RMS_level\s*=?\s*([-\d.]+)\b/);
          let dbValue = null;
          if (m1) dbValue = parseFloat(m1[1]);
          else {
            const m2 = text.match(/RMS level\s*[:=]\s*([-\d.]+)\s*dB/i);
            if (m2) dbValue = parseFloat(m2[1]);
          }
          if (dbValue !== null && !Number.isNaN(dbValue)) {
            const now = Date.now();
            if (now - meta.lastSentAt < RATE_MS) return; // rate limit
            meta.lastSentAt = now;
            const clamped = Math.max(-60, Math.min(0, dbValue));
            const normalized = Math.round((1 - (clamped / -60)) * 100);
            const payload = { clientId, volume: normalized, rawDb: dbValue, timestamp: now };
            try { wsClientService.sendToClient(clientId, payload); } catch (e) {}
          }
        } catch (e) { }
      });

      ff.on('exit', (code, sig) => {
        meta.proc = null;
        if (meta.intentionalStop) {
          this.monitorProcs.delete(clientId);
          return;
        }
        // unexpected exit -> try restart with backoff
        meta.restarts = (meta.restarts || 0) + 1;
        if (meta.restarts > MAX_RESTARTS) {
          console.error(`ffmpeg monitor for ${clientId} exceeded max restarts (${MAX_RESTARTS}), giving up`);
          this.monitorProcs.delete(clientId);
          return;
        }
        scheduleRestart();
      });

      ff.on('error', (err) => {
        console.error('ffmpeg monitor error for', clientId, err && err.message ? err.message : err);
      });
    };

    const scheduleRestart = () => {
      const backoff = Math.min(30000, 1000 * Math.pow(2, meta.restarts));
      console.log(`scheduling restart for monitor ${clientId} in ${backoff}ms (attempt ${meta.restarts})`);
      setTimeout(() => {
        if (meta.intentionalStop) return;
        spawnMonitor();
      }, backoff);
    };

    // store meta immediately so stopVolumeMonitor can set intentionalStop
    this.monitorProcs.set(clientId, meta);
    spawnMonitor();
    return { success: true };
  }

  stopVolumeMonitor(clientId) {
    const meta = this.monitorProcs.get(clientId);
    if (!meta) return { success: false, error: 'no-monitor' };
    meta.intentionalStop = true;
    try {
      if (meta.proc && meta.proc.stdin && !meta.proc.stdin.destroyed) {
        meta.proc.stdin.write('q');
      }
    } catch (e) {}
    try { if (meta.proc) meta.proc.kill('SIGKILL'); } catch (e) {}
    this.monitorProcs.delete(clientId);
    return { success: true };
  }

  // 添加录音数据块并计算音量
  addRecordingChunk(fileName, chunk) {
    const recordingInfo = this.activeRecordings.get(fileName);
    if (!recordingInfo) {
      throw new Error(`录音 ${fileName} 不存在或未激活`);
    }

    // 将Buffer转换为音频数据并计算音量
    const volume = this.calculateVolume(chunk);

    // 记录音量数据
    recordingInfo.volumeData.push({
      timestamp: Date.now(),
      volume: volume
    });

    // 广播音量数据
    this.broadcastVolume({
      fileName,
      volume: volume,
      timestamp: Date.now()
    });

    recordingInfo.chunks.push(chunk);
    return true;
  }

  // 计算音量（RMS值）
  calculateVolume(buffer) {
    // 将buffer转换为Float32Array进行处理
    const float32Array = new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

    let sum = 0;
    for (let i = 0; i < float32Array.length; i++) {
      sum += float32Array[i] * float32Array[i];
    }

    const rms = Math.sqrt(sum / float32Array.length);
    // 将RMS值映射到0-100的范围内
    const normalizedVolume = Math.min(100, Math.max(0, Math.round(rms * 1000)));

    return normalizedVolume;
  }

  // 停止录音
  stopRecording(fileName) {
    const recordingInfo = this.activeRecordings.get(fileName);
    if (!recordingInfo) {
      throw new Error(`录音 ${fileName} 不存在或未激活`);
    }

    // If ffmpeg process is active for this recording, try graceful shutdown
    if (recordingInfo.ffmpegProc) {
      try {
        // Try to ask ffmpeg to quit gracefully
        if (recordingInfo.ffmpegProc.stdin && !recordingInfo.ffmpegProc.stdin.destroyed) {
          recordingInfo.ffmpegProc.stdin.write('q');
        }
      } catch (e) { }

      // wait briefly for exit then force kill
      const proc = recordingInfo.ffmpegProc;
      const timeout = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (e) { }
      }, 3000);

      // When process exits, we will finalize below
      proc.on('exit', () => clearTimeout(timeout));
    }

    // If no ffmpeg process used and chunks were collected (legacy mode), write them
    let size = 0;
    if (recordingInfo.chunks && recordingInfo.chunks.length) {
      const allChunks = Buffer.concat(recordingInfo.chunks);
      fs.writeFileSync(recordingInfo.filePath, allChunks);
      size = allChunks.length;
    } else {
      // If ffmpeg created the file, get its size
      try {
        const stats = fs.statSync(recordingInfo.filePath);
        size = stats.size;
      } catch (e) {
        size = 0;
      }
    }

    // 从活动录音中移除
    this.activeRecordings.delete(fileName);

    return {
      fileName,
      filePath: recordingInfo.filePath,
      duration: (new Date() - recordingInfo.startTime) / 1000, // 秒
      size
    };
  }

  // 获取录音状态
  getStatus(fileName) {
    if (fileName) {
      const recordingInfo = this.activeRecordings.get(fileName);
      if (recordingInfo) {
        return {
          fileName,
          isRecording: recordingInfo.isRecording,
          startTime: recordingInfo.startTime,
          volume: recordingInfo.volumeData.length > 0 ? recordingInfo.volumeData[recordingInfo.volumeData.length - 1].volume : 0
        };
      }
      return null;
    }

    // 返回所有活动录音的状态
    const activeStatuses = [];
    for (const [fileName, info] of this.activeRecordings) {
      activeStatuses.push({
        fileName,
        isRecording: info.isRecording,
        startTime: info.startTime,
        volume: info.volumeData.length > 0 ? info.volumeData[info.volumeData.length - 1].volume : 0
      });
    }

    return {
      activeRecordings: activeStatuses,
      totalActive: activeStatuses.length,
    };
  }

  // 获取录音列表
  getList() {
    try {
      // include common audio/video container formats produced by ffmpeg
      const files = fs.readdirSync(recordingDir).filter(file =>
        /\.(mp3|wav|webm|ogg|mp4|m4a|aac|flac)$/i.test(file)
      );

      const recordings = files.map(file => {
        const filePath = path.join(recordingDir, file);
        const stats = fs.statSync(filePath);

        return {
          filename: file,
          size: stats.size,
          createdAt: stats.birthtime,
          url: `/v1/recordings/${encodeURIComponent(file)}`,
        };
      }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // 按时间倒序排列

      return recordings;
    } catch (error) {
      throw error;
    }
  }

  // 删除录音文件
  deleteRecording(fileName) {
    const filePath = path.join(recordingDir, fileName);

    // 验证文件名安全性
    if (path.resolve(filePath).indexOf(recordingDir) !== 0) {
      throw new Error('无效的文件路径');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error('文件不存在');
    }

    // 如果正在录音，则先停止
    if (this.activeRecordings.has(fileName)) {
      this.stopRecording(fileName);
    }

    fs.unlinkSync(filePath);
    return true;
  }
}

module.exports = new RecordingService();

// Export helper to resolve ffmpeg path (useful for other modules)
module.exports.resolveFfmpegPath = resolveFfmpegPath;