const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const EventEmitter = require('events');
const { recordingDir } = require('../config/paths');
const wsClientService = require('./wsClientService');

// ffmpeg args for a null-output astats/ametadata monitor (used to extract RMS levels)
const ASTATS_MONITOR_ARGS = ['-map', '0:a', '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-', '-f', 'null', '-'];

// Try to resolve built ffmpeg path from local release or installed package, fallback to system `ffmpeg`
function resolveFfmpegPath() {
  try {
    const rel = require('../../release');
    if (rel && rel.ffmpegPath) return rel.ffmpegPath;
  } catch (e) {}

  try {
    const pkg = require('ffmpeg-min-local');
    if (pkg && pkg.ffmpegPath) return pkg.ffmpegPath;
  } catch (e) {}

  return 'ffmpeg';
}

class RecordingService {
  constructor() {
    this.activeRecordings = new Map(); // 存储活动录音的状态
  }

  // 广播音量数据给所有客户端（使用 wsClientService 转发，并触发本地事件）
  broadcastVolume(volumeData) {
    try {
      wsClientService.broadcast(volumeData, 'volume');
    } catch (e) {}
    try {
    } catch (e) {}
  }

  // 开始录音
  startRecording(clientId) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `recording-${timestamp}.webm`;
    const filePath = path.join(recordingDir, fileName);

    // 确保录音目录存在
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
  // - outFileName: optional filename (defaults to recording-<timestamp>.mp4)
  startRecordingWithFfmpeg(clientId, ffmpegArgs, outFileName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = outFileName || `recording-${timestamp}.mp4`;
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

    // Build and normalize ffmpeg args
    const defaultArgs = [
      // empty by default — caller or route should pass device/input specifics
    ];

    const initialArgs = Array.isArray(ffmpegArgs) && ffmpegArgs.length ? ffmpegArgs.slice() : defaultArgs.slice();

    // ensure there is an output target in args; if not, append generated filePath
    const hasOutput = initialArgs.some(a => {
      if (!a || typeof a !== 'string') return false;
      if (a.indexOf(path.sep) !== -1) return true; // looks like a path
      if (/\.(mp4|m4a|aac|wav|webm|flac|mp3)$/i.test(a)) return true;
      return false;
    });
    const args = hasOutput ? initialArgs : initialArgs.concat([filePath]);

    // decide whether we should add astats monitoring (when user didn't provide custom args)
    const addAstats = !(Array.isArray(ffmpegArgs) && ffmpegArgs.length);

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
    if (!Array.isArray(ffmpegArgs) || ffmpegArgs.length === 0) {
      const platform = process.platform;
      let defaultInputArgs = [];
      if (platform === 'darwin') {
        // avfoundation default audio device
        defaultInputArgs = ['-f', 'avfoundation', '-i', 'default', '-vn', '-c:a', 'aac', '-b:a', '128k'];
      } else if (platform === 'win32') {
        // use dshow; allow override via env WIN_FFMPEG_DEVICE (e.g. "audio=virtual-audio-capturer")
        const winDev = process.env.WIN_FFMPEG_DEVICE || 'audio=default';
        defaultInputArgs = ['-f', 'dshow', '-i', winDev, '-vn', '-c:a', 'aac', '-b:a', '128k'];
      } else {
        // assume Linux/ALSA by default; allow override via LINUX_FFMPEG_DEVICE
        const linuxDev = process.env.LINUX_FFMPEG_DEVICE || 'default';
        defaultInputArgs = ['-f', 'alsa', '-i', linuxDev, '-vn', '-c:a', 'aac', '-b:a', '128k'];
      }

      const hasOutputInDefault = defaultInputArgs.some(a => typeof a === 'string' && (a.indexOf(path.sep) !== -1 || /\.(mp4|m4a|aac|wav|webm|flac|mp3)$/i.test(a)));
      const baseArgs = hasOutputInDefault ? defaultInputArgs.slice() : defaultInputArgs.concat([filePath]);
      spawnArgs = baseArgs.concat(ASTATS_MONITOR_ARGS);
    } else {
      spawnArgs = args.slice();
      if (addAstats) spawnArgs = spawnArgs.concat(ASTATS_MONITOR_ARGS);
    }

    let ff;
    try {
      console.log('Starting ffmpeg:', ffmpegPath, spawnArgs.join(' '));
      // use pipes so we can parse stdout (PCM) and stderr (astats)
      ff = spawn(ffmpegPath, spawnArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (spawnErr) {
      recordingInfo.isRecording = false;
      recordingInfo.ffmpegProc = null;
      throw spawnErr;
    }

    // Parse stderr for astats/ametadata output to extract RMS level (dB) and broadcast volume
    ff.stderr.on('data', (chunk) => {
      try {
        const text = chunk.toString();
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
          this.broadcastVolume({ fileName, volume: normalized, timestamp: Date.now() });
        }
      } catch (e) {
        // ignore parse errors
      }
    });

    // Also support parsing raw PCM from stdout (if ffmpeg was configured to pipe PCM)
    ff.stdout.on('data', (chunk) => {
      try {
        const volume = this.calculateVolume(Buffer.from(chunk));
        recordingInfo.volumeData.push({ timestamp: Date.now(), volume });
        this.broadcastVolume({ fileName, volume, timestamp: Date.now() });
      } catch (e) {
        // ignore parsing errors when stdout is not raw PCM
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
      } catch (e) {}

      // wait briefly for exit then force kill
      const proc = recordingInfo.ffmpegProc;
      const timeout = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (e) {}
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