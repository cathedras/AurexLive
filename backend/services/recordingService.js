const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const EventEmitter = require('events');
const { recordingDir } = require('../config/paths');
const wsClientService = require('./wsClientService');
const { createLogger } = require('../middleware/logger');

const logger = createLogger({ source: 'RecordingService' });

// Fine-grained ffmpeg debug flags for each audio path.
const RECORDING_VOLUME_DEBUG = process.env.RECORDING_VOLUME_DEBUG === '1';
const RECORDING_OUTPUT_DEBUG = process.env.RECORDING_OUTPUT_DEBUG === '1';
const RECORDING_LIVE_DEBUG = process.env.RECORDING_LIVE_DEBUG === '1';

// Smaller blocks produce faster RMS updates, but increase ffmpeg/WS traffic.
const ASTATS_SAMPLE_SIZE = 32;
const VOLUME_UPDATE_RATE_MS = 8;
const SILENCE_HEARTBEAT_MS = 150;

// ffmpeg args for a null-output astats/ametadata monitor (used to extract RMS levels)
// -nostats disables the default progress output (size/time/speed)
// asetnsamples reduces the audio block size so metadata is emitted with lower latency
const ASTATS_MONITOR_ARGS = ['-hide_banner', '-nostats', '-map', '0:a', '-af', `asetnsamples=n=${ASTATS_SAMPLE_SIZE}:pad=1,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-`, '-f', 'null', '-'];

function parseRmsDbValue(rawValue) {
  const text = String(rawValue || '').trim().toLowerCase();
  if (text === '-inf' || text === '-infinity') {
    return -60;
  }

  if (text === 'inf' || text === 'infinity') {
    return 0;
  }

  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
}

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

function isAvfoundationDeviceAvailable(device, ffmpegPath) {
  if (!device || device === 'default') {
    return true;
  }

  const normalizedDevice = normalizeAvfoundationAudioDevice(device).replace(/^:/, '');
  const deviceIndexMatch = String(normalizedDevice).match(/^(\d+)$/);
  const devList = listAvfoundationDevicesSync(ffmpegPath).map((line) => String(line).toLowerCase());

  if (devList.length === 0) {
    return true;
  }

  if (deviceIndexMatch) {
    const targetIndex = deviceIndexMatch[1];
    return devList.some((line) => {
      const indexMatch = line.match(/\[(\d+)\]/);
      if (indexMatch && indexMatch[1] === targetIndex) {
        return true;
      }
      return line.includes(`:${targetIndex}`) || line.includes(`'${targetIndex}'`) || line.includes(` ${targetIndex} `);
    });
  }

  return devList.some((line) => line.includes(normalizedDevice.toLowerCase()));
}

// Try to resolve built ffmpeg path from local release or installed package, fallback to system `ffmpeg`
function resolveFfmpegPath() {
  const candidates = [];

  try {
    const rel = require('../../release');
    if (rel && rel.ffmpegPath) candidates.push(rel.ffmpegPath);
  } catch (e) { }

  try {
    const pkg = require('ffmpeg-min-local');
    if (pkg && pkg.ffmpegPath) candidates.push(pkg.ffmpegPath);
  } catch (e) { }

  candidates.push('ffmpeg');

  const whichCmd = process.platform === 'win32' ? 'where' : 'which';

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (candidate === 'ffmpeg') {
      const probe = spawnSync(whichCmd, ['ffmpeg'], { encoding: 'utf8' });
      if (probe && probe.status === 0) {
        return 'ffmpeg';
      }
      continue;
    }

    if (path.isAbsolute(candidate) || candidate.includes(path.sep)) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      continue;
    }

    const probe = spawnSync(whichCmd, [candidate], { encoding: 'utf8' });
    if (probe && probe.status === 0) {
      return candidate;
    }
  }

  return 'ffmpeg';
}

function hasCommand(command) {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';

  try {
    const result = spawnSync(lookupCommand, [command], { encoding: 'utf8' });
    return result.status === 0 && Boolean(String(result.stdout || '').trim());
  } catch {
    return false;
  }
}

function resolveFfplayPath() {
  if (process.env.FFPLAY_PATH) {
    return String(process.env.FFPLAY_PATH).trim();
  }

  if (hasCommand('ffplay')) {
    return 'ffplay';
  }

  return '';
}

function resolveSwitchAudioSourcePath() {
  if (process.platform !== 'darwin') {
    return '';
  }

  if (process.env.SWITCH_AUDIO_SOURCE_PATH) {
    return String(process.env.SWITCH_AUDIO_SOURCE_PATH).trim();
  }

  if (hasCommand('SwitchAudioSource')) {
    return 'SwitchAudioSource';
  }

  return '';
}

function getMacCurrentOutputDevice() {
  const switchAudioSourcePath = resolveSwitchAudioSourcePath();
  if (!switchAudioSourcePath) {
    return '';
  }

  const result = spawnSync(switchAudioSourcePath, ['-c', '-t', 'output'], { encoding: 'utf8' });
  if (!result || result.status !== 0) {
    return '';
  }

  return String(result.stdout || result.stderr || '').trim();
}

function setMacOutputDevice(device) {
  const targetDevice = String(device || '').trim();
  if (!targetDevice) {
    return { success: false, error: 'missing-output-device' };
  }

  const switchAudioSourcePath = resolveSwitchAudioSourcePath();
  if (!switchAudioSourcePath) {
    return { success: false, error: 'SwitchAudioSource-not-found' };
  }

  const result = spawnSync(switchAudioSourcePath, ['-s', targetDevice, '-t', 'output'], { encoding: 'utf8' });
  if (!result || result.status !== 0) {
    const errorText = String(result?.stderr || result?.stdout || '').trim();
    return {
      success: false,
      error: errorText || `failed-to-switch-output-device:${targetDevice}`,
    };
  }

  return { success: true };
}

class RecordingService {
  constructor() {
    this.activeRecordings = new Map(); // Store the state of active recordings
    // clientId -> { proc, restarts, intentionalStop, lastRestartAt, lastSentAt }
    this.monitorProcs = new Map();
    this.livePlaybackProc = null;
    this.livePlaybackState = null;
    this.livePlaybackMeta = null;
  }

  waitForProcessClose(proc, timeoutMs = 5000) {
    return new Promise((resolve) => {
      if (!proc) {
        resolve();
        return;
      }

      let settled = false;
      let timeoutHandle = null;

      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        resolve();
      };

      proc.once('close', finish);
      proc.once('error', finish);

      timeoutHandle = setTimeout(() => {
        try {
          if (proc.stdin && !proc.stdin.destroyed) {
            proc.stdin.write('q');
          }
        } catch (e) { }

        try {
          proc.kill('SIGKILL');
        } catch (e) { }

        setTimeout(finish, 500);
      }, timeoutMs);
    });
  }

  // Broadcast volume data to all clients (forward through wsClientService and trigger local events)
  broadcastVolume(volumeData) {
    try {
      wsClientService.broadcastVolume(volumeData);
    } catch (e) { }
  }

  startLiveMicPlayback(device, outputDevice) {
    if (process.platform !== 'darwin') {
      return { success: false, error: 'unsupported-platform' };
    }

    if (this.livePlaybackProc) {
      return { success: false, error: 'live-playback-already-running' };
    }

    const ffplayPath = resolveFfplayPath();
    if (!ffplayPath) {
      return { success: false, error: 'ffplay-not-found' };
    }

    if (this.livePlaybackMeta?.restartTimer) {
      clearTimeout(this.livePlaybackMeta.restartTimer);
      this.livePlaybackMeta.restartTimer = null;
    }

    const targetOutputDevice = String(outputDevice || '').trim();
    const previousOutputDevice = targetOutputDevice ? getMacCurrentOutputDevice() : '';
    if (targetOutputDevice) {
      const switchResult = setMacOutputDevice(targetOutputDevice);
      if (!switchResult.success) {
        return { success: false, error: switchResult.error };
      }
    }

    const inputDevice = normalizeAvfoundationAudioDevice(device);
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-nodisp',
      '-autoexit',
      '-f', 'avfoundation',
      '-i', inputDevice,
    ];

    const meta = {
      device: inputDevice,
      outputDevice: targetOutputDevice,
      previousOutputDevice,
      intentionalStop: false,
      restarts: 0,
      restartTimer: null,
      startedAt: new Date().toISOString(),
    };

    this.livePlaybackMeta = meta;

    const spawnLivePlayback = () => {
      if (meta.intentionalStop) {
        return;
      }

      try {
        logger.info(`Starting live mic playback: ${ffplayPath} ${args.join(' ')}`, 'startLiveMicPlayback');
        const proc = spawn(ffplayPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        this.livePlaybackProc = proc;
        this.livePlaybackState = {
          device: inputDevice,
          startedAt: meta.startedAt,
        };

        proc.on('exit', (code, signal) => {
          if (this.livePlaybackProc === proc) {
            this.livePlaybackProc = null;
          }

          if (meta.intentionalStop) {
            this.livePlaybackState = null;
            if (meta.previousOutputDevice && meta.outputDevice) {
              try {
                setMacOutputDevice(meta.previousOutputDevice);
              } catch (e) { }
            }
            return;
          }

          meta.restarts += 1;
          logger.warning(`live mic playback exited (code=${code}, signal=${signal}); restarting (#${meta.restarts})`, 'startLiveMicPlayback');
          meta.restartTimer = setTimeout(() => {
            if (!meta.intentionalStop) {
              spawnLivePlayback();
            }
          }, Math.min(1000 * meta.restarts, 3000));
        });

        proc.on('error', (err) => {
          logger.error(err instanceof Error ? err : `live mic playback spawn error: ${String(err)}`, 'startLiveMicPlayback');
          if (this.livePlaybackProc === proc) {
            this.livePlaybackProc = null;
          }
          if (meta.previousOutputDevice && meta.outputDevice) {
            try {
              setMacOutputDevice(meta.previousOutputDevice);
            } catch (e) { }
          }
          if (!meta.intentionalStop) {
            meta.restarts += 1;
            meta.restartTimer = setTimeout(() => {
              if (!meta.intentionalStop) {
                spawnLivePlayback();
              }
            }, Math.min(1000 * meta.restarts, 3000));
          }
        });

        proc.stderr.on('data', (chunk) => {
          if (!RECORDING_LIVE_DEBUG) {
            return;
          }

          const text = String(chunk || '').trim();
          if (text) {
            logger.warning(`[live-mic-playback] ${text}`, 'startLiveMicPlayback');
          }
        });

        return { success: true, data: this.livePlaybackState };
      } catch (error) {
        logger.error(error instanceof Error ? error : `live mic playback failed: ${String(error)}`, 'startLiveMicPlayback');
        this.livePlaybackProc = null;
        this.livePlaybackState = null;
        if (meta.previousOutputDevice && meta.outputDevice) {
          try {
            setMacOutputDevice(meta.previousOutputDevice);
          } catch (e) { }
        }
        return { success: false, error: error.message || 'live-mic-playback-failed' };
      }
    };

    return spawnLivePlayback();
  }

  stopLiveMicPlayback() {
    if (!this.livePlaybackProc) {
      if (this.livePlaybackMeta?.restartTimer) {
        clearTimeout(this.livePlaybackMeta.restartTimer);
        this.livePlaybackMeta.restartTimer = null;
      }
      if (this.livePlaybackMeta?.previousOutputDevice && this.livePlaybackMeta?.outputDevice) {
        try {
          setMacOutputDevice(this.livePlaybackMeta.previousOutputDevice);
        } catch (e) { }
      }
      this.livePlaybackMeta = null;
      this.livePlaybackState = null;
      return { success: true, data: { stopped: false, reason: 'not-running' } };
    }

    if (this.livePlaybackMeta?.restartTimer) {
      clearTimeout(this.livePlaybackMeta.restartTimer);
      this.livePlaybackMeta.restartTimer = null;
    }
    if (this.livePlaybackMeta) {
      this.livePlaybackMeta.intentionalStop = true;
    }

    const proc = this.livePlaybackProc;
    this.livePlaybackProc = null;
    this.livePlaybackState = null;
    const restoreOutputDevice = this.livePlaybackMeta?.previousOutputDevice && this.livePlaybackMeta?.outputDevice
      ? this.livePlaybackMeta.previousOutputDevice
      : '';
    this.livePlaybackMeta = null;

    try {
      if (proc.stdin && !proc.stdin.destroyed) {
        proc.stdin.write('q');
      }
    } catch {
      // ignore
    }

    try {
      proc.kill('SIGKILL');
    } catch {
      // ignore
    }

    if (restoreOutputDevice) {
      try {
        setMacOutputDevice(restoreOutputDevice);
      } catch (e) { }
    }

    return { success: true, data: { stopped: true } };
  }

  // Start recording
  startRecording(clientId) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `recording-${timestamp}.flac`;
    const filePath = path.join(recordingDir, fileName);

    if (!fs.existsSync(recordingDir)) {
      fs.mkdirSync(recordingDir, { recursive: true });
    }

    // Record the recording state
    const recordingInfo = {
      fileName,
      filePath,
      startTime: new Date(),
      isRecording: true,
      chunks: [],
      clientId: clientId, // Associated client ID
      volumeData: [] // Stored volume data
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
  // - outFileName: optional filename (defaults to recording-<timestamp>.flac)
  startRecordingWithFfmpeg(clientId, ffmpegArgsOrDevice, outFileName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = outFileName || `recording-${timestamp}.flac`;
    const filePath = path.join(recordingDir, fileName);

    logger.info(
      `startRecordingWithFfmpeg requested: fileName=${fileName} clientId=${clientId ?? 'null'} outFileName=${outFileName ?? 'null'}`,
      'startRecordingWithFfmpeg'
    );

    if (!fs.existsSync(recordingDir)) {
      fs.mkdirSync(recordingDir, { recursive: true });
    }
    const providedArgs = Array.isArray(ffmpegArgsOrDevice) ? ffmpegArgsOrDevice : null;
    const device = Array.isArray(ffmpegArgsOrDevice) ? null : ffmpegArgsOrDevice;

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

    // Resolve the ffmpeg executable and verify availability
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

    // Prepare the final spawn arguments.
    // If the caller provided ffmpegArgs, use them directly and append the output file if needed.
    // Otherwise, build platform-aware defaults from a device value.
    let spawnArgs;
    const platform = process.platform;
    if (providedArgs) {
      spawnArgs = providedArgs.slice();

      const hasOutputTarget = spawnArgs.includes(filePath) || spawnArgs.includes(outFileName);
      if (!hasOutputTarget) {
        spawnArgs.push(filePath);
      }
      logger.info(`[RecordingService] Using provided ffmpeg args for ${fileName}`, 'startRecordingWithFfmpeg');
    } else {
      logger.info(`No ffmpeg args provided, using platform-aware defaults for ${platform}`, 'startRecordingWithFfmpeg');
      if (platform === 'darwin') {
        const macDevice = normalizeAvfoundationAudioDevice(device);
        spawnArgs = [
          '-f', 'avfoundation', '-i', macDevice,
          '-vn',
          '-c:a', 'flac', '-compression_level', '12',
          '-y', filePath
        ];
      } else if (platform === 'win32') {
        const winDev = device || 'audio=default';
        spawnArgs = [
          '-f', 'dshow', '-i', winDev,
          '-vn',
          '-c:a', 'flac', '-compression_level', '12',
          '-y', filePath
        ];
      } else {
        const linuxDev = device || 'default';

        spawnArgs = [
          '-f', 'alsa', '-i', linuxDev,
          '-vn',
          '-c:a', 'flac', '-compression_level', '12',
          '-y', filePath
        ];
      }
    }

    let ff;
    try {
      logger.info(`Starting ffmpeg: ${ffmpegPath} ${spawnArgs.join(' ')}`, 'startRecordingWithFfmpeg');
      // Keep stdin for graceful shutdown and stderr for astats metadata output.
      ff = spawn(ffmpegPath, spawnArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
    } catch (spawnErr) {
      recordingInfo.isRecording = false;
      recordingInfo.ffmpegProc = null;
      throw spawnErr;
    }
    logger.info(`ffmpeg started with PID ${ff.Errorno ? ff.Errorno : ff.pid}`, 'startRecordingWithFfmpeg');
    ff.on('exit', (code, sig) => {
      recordingInfo.isRecording = false;
      recordingInfo.ffmpegProc = null;
    });

    ff.on('error', (err) => {
      recordingInfo.isRecording = false;
      recordingInfo.ffmpegProc = null;
      logger.error(err instanceof Error ? err : `ffmpeg spawn error: ${String(err)}`, 'startRecordingWithFfmpeg');
    });

    ff.stderr.on('data', (chunk) => {
      if (!RECORDING_OUTPUT_DEBUG) {
        return;
      }

      const text = String(chunk || '').trim();
      if (text) {
        logger.info(`[recording-output] ${text}`, 'startRecordingWithFfmpeg');
      }
    });

    recordingInfo.ffmpegProc = ff;
    this.activeRecordings.set(fileName, recordingInfo);

    logger.info(
      `startRecordingWithFfmpeg registered active recording: fileName=${fileName} activeCount=${this.activeRecordings.size}`,
      'startRecordingWithFfmpeg'
    );

    return { fileName, startTime: recordingInfo.startTime };
  }

  // Start a separate ffmpeg process that only monitors audio levels (astats -> stderr)
  // clientId: the ws client id that requested monitoring; device: platform-specific device string/index
  startVolumeMonitor(clientId, device) {
    logger.info(`startVolumeMonitor called for client ${clientId} device=${device}`, 'startVolumeMonitor');
    if (this.monitorProcs.has(clientId)) return { success: false, error: 'monitor-already-running' };

    const platform = process.platform;
    let baseArgs;
    // On macOS, validate the avfoundation device immediately and return an error if it is missing
    if (platform === 'darwin' && device) {
      try {
        const ffPath = resolveFfmpegPath();
        if (!isAvfoundationDeviceAvailable(device, ffPath)) {
          logger.error(`startVolumeMonitor: avfoundation device not found for '${device}'`, 'startVolumeMonitor');
          return { success: false, error: 'device-not-found' };
        }
      } catch (e) {
        logger.error(`startVolumeMonitor: device validation failed ${e && e.message ? e.message : e}`, 'startVolumeMonitor');
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

    const meta = { proc: null, restarts: 0, intentionalStop: false, lastRestartAt: 0, lastSentAt: 0, lastSentVolume: null, silenceHeartbeatTimer: null };
    const MAX_RESTARTS = 5;
    const RATE_MS = VOLUME_UPDATE_RATE_MS; // minimum ms between sent volume updates per client

    const clearSilenceHeartbeat = () => {
      if (meta.silenceHeartbeatTimer) {
        clearInterval(meta.silenceHeartbeatTimer);
        meta.silenceHeartbeatTimer = null;
      }
    };

    const startSilenceHeartbeat = () => {
      if (meta.silenceHeartbeatTimer) {
        return;
      }

      meta.silenceHeartbeatTimer = setInterval(() => {
        if (meta.intentionalStop || meta.lastSentVolume !== 0) {
          clearSilenceHeartbeat();
          return;
        }

        meta.lastSentAt = Date.now();
        try {
          wsClientService.sendToClient(clientId, 0);
        } catch (e) { }
      }, SILENCE_HEARTBEAT_MS);
    };

    const spawnMonitor = () => {
      if (meta.intentionalStop) return;
      // Validate the macOS avfoundation device before spawning ffmpeg
      if (platform === 'darwin' && device) {
        try {
          const ffPath = resolveFfmpegPath();
          if (!isAvfoundationDeviceAvailable(device, ffPath)) {
            logger.error(`ffmpeg monitor validation: avfoundation device not found for '${device}'`, 'spawnMonitor');
            // Inform the caller synchronously by setting an error marker and not spawning
            meta.lastError = `device-not-found:${device}`;
            return scheduleRestart();
          }
        } catch (e) {
          logger.error(`ffmpeg monitor validation failed ${e && e.message ? e.message : e}`, 'spawnMonitor');
        }
      }

      const monitorArgs = baseArgs.concat(ASTATS_MONITOR_ARGS);
      let ff;
      try {
        logger.info(`Starting ffmpeg monitor for client ${clientId} ${monitorArgs.join(' ')}`, 'spawnMonitor');
        ff = spawn(resolveFfmpegPath(), monitorArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) {
        logger.error(`Failed to spawn ffmpeg monitor for ${clientId} ${e && e.message ? e.message : e}`, 'spawnMonitor');
        scheduleRestart();
        return;
      }

      meta.proc = ff;
      meta.lastRestartAt = Date.now();

      const handleMonitorOutput = (source, chunk) => {
        try {
          const text = chunk.toString();
          const rmsPattern = /lavfi\.astats\.Overall\.RMS_level\s*=?\s*([\-\w.]+)\b/g;
          const fallbackPattern = /RMS level\s*[:=]\s*([\-\w.]+)\s*dB/i;
          let dbValue = null;

          let match;
          while ((match = rmsPattern.exec(text)) !== null) {
            dbValue = parseRmsDbValue(match[1]);
          }

          if (dbValue === null) {
            const fallbackMatch = text.match(fallbackPattern);
            if (fallbackMatch) {
              dbValue = parseRmsDbValue(fallbackMatch[1]);
            }
          }
          if (dbValue !== null && !Number.isNaN(dbValue)) {
            const now = Date.now();
            const clamped = Math.max(-60, Math.min(0, dbValue));
            const normalized = Math.round(((clamped + 60) / 60) * 100);
            if (RECORDING_VOLUME_DEBUG) {
              logger.info(`[ffmpeg-monitor-${source}] rawDb=${Number.isFinite(dbValue) ? dbValue.toFixed(6) : '0.000000'} normalized=${normalized} clientId=${clientId}`, 'handleMonitorOutput');
            }

            if (normalized === 0) {
              if (meta.lastSentVolume !== 0) {
                meta.lastSentAt = now;
                meta.lastSentVolume = 0;
                try { wsClientService.sendToClient(clientId, 0); } catch (e) { }
              }

              startSilenceHeartbeat();
              return;
            }

            clearSilenceHeartbeat();

            if (meta.lastSentVolume === normalized && now - meta.lastSentAt < 120) {
              return;
            }

            if (now - meta.lastSentAt < RATE_MS) return; // rate limit

            meta.lastSentAt = now;
            meta.lastSentVolume = normalized;
            const payload = normalized;
            try { wsClientService.sendToClient(clientId, payload); } catch (e) { }
          }
        } catch (e) { }
      };

      ff.stdout.on('data', (chunk) => handleMonitorOutput('stdout', chunk));
      ff.stderr.on('data', (chunk) => handleMonitorOutput('stderr', chunk));

      ff.on('exit', (code, sig) => {
        meta.proc = null;
        clearSilenceHeartbeat();
        if (meta.intentionalStop) {
          this.monitorProcs.delete(clientId);
          return;
        }
        // Unexpected exit -> try restart with backoff
        meta.restarts = (meta.restarts || 0) + 1;
        if (meta.restarts > MAX_RESTARTS) {
          logger.error(`ffmpeg monitor for ${clientId} exceeded max restarts (${MAX_RESTARTS}), giving up`, 'ffmpegMonitorExit');
          this.monitorProcs.delete(clientId);
          return;
        }
        scheduleRestart();
      });

      ff.on('error', (err) => {
        logger.error(`ffmpeg monitor error for ${clientId} ${err && err.message ? err.message : err}`, 'ffmpegMonitorError');
      });
    };

    const scheduleRestart = () => {
      const backoff = Math.min(30000, 1000 * Math.pow(2, meta.restarts));
      logger.warning(`scheduling restart for monitor ${clientId} in ${backoff}ms (attempt ${meta.restarts})`, 'scheduleRestart');
      setTimeout(() => {
        if (meta.intentionalStop) return;
        spawnMonitor();
      }, backoff);
    };

    // Store meta immediately so stopVolumeMonitor can set intentionalStop
    this.monitorProcs.set(clientId, meta);
    spawnMonitor();
    return { success: true };
  }

  stopVolumeMonitor(clientId) {
    const meta = this.monitorProcs.get(clientId);
    if (!meta) return { success: false, error: 'no-monitor' };
    meta.intentionalStop = true;
    if (meta.silenceHeartbeatTimer) {
      clearInterval(meta.silenceHeartbeatTimer);
      meta.silenceHeartbeatTimer = null;
    }
    try {
      if (meta.proc && meta.proc.stdin && !meta.proc.stdin.destroyed) {
        meta.proc.stdin.write('q');
      }
    } catch (e) { }
    try { if (meta.proc) meta.proc.kill('SIGKILL'); } catch (e) { }
    this.monitorProcs.delete(clientId);
    return { success: true };
  }

  // Stop recording
  async stopRecording(fileName) {
    logger.info(`stopRecording requested: fileName=${fileName}`, 'stopRecording');
    const recordingInfo = this.activeRecordings.get(fileName);
    if (!recordingInfo) {
      const filePath = path.join(recordingDir, fileName);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        logger.warning(`stopRecording called for inactive recording ${fileName}; returning existing file info`, 'stopRecording');
        return {
          fileName,
          filePath,
          duration: 0,
          size: stats.size,
          alreadyStopped: true,
        };
      }

      logger.warning(
        `stopRecording miss: fileName=${fileName} activeCount=${this.activeRecordings.size}`,
        'stopRecording'
      );
      throw new Error(`Recording ${fileName} does not exist or is not active.`);
    }

    const clientId = recordingInfo.clientId;

    if (clientId !== null && clientId !== undefined) {
      this.stopVolumeMonitor(clientId);
    }

    // If an ffmpeg process is active for this recording, try a graceful shutdown
    if (recordingInfo.ffmpegProc) {
      // Try to ask ffmpeg to quit gracefully
      if (recordingInfo.ffmpegProc.stdin && !recordingInfo.ffmpegProc.stdin.destroyed) {
        recordingInfo.ffmpegProc.stdin.write('q');
      }
      await this.waitForProcessClose(recordingInfo.ffmpegProc, 5000);
    }

    // If no ffmpeg process was used and chunks were collected (legacy mode), write them
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

    // Remove from active recordings
    this.activeRecordings.delete(fileName);

    return {
      fileName,
      filePath: recordingInfo.filePath,
      duration: (new Date() - recordingInfo.startTime) / 1000, // seconds
      size
    };
  }

  // Get the recording list
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
      }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort by newest first

      return recordings;
    } catch (error) {
      throw error;
    }
  }


  // Delete a recording file
  async deleteRecording(fileName) {
    const filePath = path.join(recordingDir, fileName);

    // Validate filename safety
    if (path.resolve(filePath).indexOf(recordingDir) !== 0) {
      throw new Error('Invalid file path.');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error('File does not exist.');
    }

    // If recording is in progress, stop it first
    if (this.activeRecordings.has(fileName)) {
      await this.stopRecording(fileName);
    }

    fs.unlinkSync(filePath);
    return true;
  }
}

module.exports = new RecordingService();

// Export helper to resolve ffmpeg path (useful for other modules)
module.exports.resolveFfmpegPath = resolveFfmpegPath;