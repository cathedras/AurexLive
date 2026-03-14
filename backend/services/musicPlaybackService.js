const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const NodeMpv = require('node-mpv');

const { runtimeConfigDir, uploadDir } = require('../config/paths');
const { readLiveState, updateBackendPlaybackState } = require('../utils/liveStateStore');

const MPV_SOCKET_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\filetransfer-mpv'
  : path.join(runtimeConfigDir, 'node-mpv.sock');

function hasCommand(command) {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';

  try {
    const result = spawnSync(lookupCommand, [command], { encoding: 'utf-8' });
    return result.status === 0 && Boolean(String(result.stdout || '').trim());
  } catch {
    return false;
  }
}

function resolveMpvBinary() {
  const explicitBinary = String(process.env.MPV_PATH || '').trim();
  if (explicitBinary) {
    return explicitBinary;
  }

  if (hasCommand('mpv')) {
    return 'mpv';
  }

  return '';
}

function ensureSocketDirectory(socketPath) {
  if (process.platform === 'win32') {
    return;
  }

  const socketDir = path.dirname(socketPath);
  if (!fs.existsSync(socketDir)) {
    fs.mkdirSync(socketDir, { recursive: true });
  }

  if (fs.existsSync(socketPath)) {
    try {
      fs.unlinkSync(socketPath);
    } catch {
      // ignore stale socket cleanup failure
    }
  }
}

function detectDriver() {
  const binary = resolveMpvBinary();

  if (!binary) {
    return {
      available: false,
      name: '',
      canPause: false,
      binary: '',
      socketPath: MPV_SOCKET_PATH,
    };
  }

  return {
    available: true,
    name: 'mpv',
    canPause: true,
    binary,
    socketPath: MPV_SOCKET_PATH,
  };
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : null;
}

function parseDurationSeconds(filePath) {
  const normalizedFilePath = path.resolve(String(filePath || '').trim());
  if (!normalizedFilePath || !fs.existsSync(normalizedFilePath)) {
    return null;
  }

  if (process.platform === 'darwin' && hasCommand('afinfo')) {
    try {
      const result = spawnSync('afinfo', [normalizedFilePath], { encoding: 'utf-8' });
      const output = `${result.stdout || ''}\n${result.stderr || ''}`;
      const matched = output.match(/estimated duration:\s*([0-9.]+)\s*sec/i);
      if (matched) {
        const durationSec = Number(matched[1]);
        return Number.isFinite(durationSec) ? durationSec : null;
      }
    } catch {
      return null;
    }
  }

  if (hasCommand('ffprobe')) {
    try {
      const result = spawnSync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        normalizedFilePath,
      ], { encoding: 'utf-8' });
      const durationSec = Number(String(result.stdout || '').trim());
      return Number.isFinite(durationSec) ? durationSec : null;
    } catch {
      return null;
    }
  }

  return null;
}

class MusicPlaybackService {
  constructor() {
    this.driver = detectDriver();
    this.player = null;
    this.state = 'idle';
    this.volumePercent = 100;
    this.currentTrack = null;
    this.pendingTrack = null;
    this.errorMessage = '';
    this.progressSyncTimer = null;
    this.currentPositionSec = 0;
    this.durationSec = null;
    this.playStartedAtMs = null;
    this.pauseStartedAtMs = null;
    this.restoreSnapshot = null;

    try {
      const liveState = readLiveState();
      this.restoreSnapshot = liveState?.backendPlayback || null;
      this.volumePercent = clampNumber(Number(liveState?.backendPlayback?.volumePercent ?? 100), 0, 100);
    } catch {
      this.restoreSnapshot = null;
      this.volumePercent = 100;
    }

    if (this.driver.available) {
      this.initializePlayer();
    }

    this.syncRuntimeState();
  }

  initializePlayer() {
    if (this.player || !this.driver.available) {
      return;
    }

    ensureSocketDirectory(this.driver.socketPath);

    this.player = new NodeMpv({
      audio_only: true,
      binary: this.driver.binary,
      debug: false,
      verbose: false,
      socket: this.driver.socketPath,
      time_update: 1,
    }, ['--no-config', '--load-scripts=no']);

    this.bindPlayerEvents();
    void this.applyVolume(this.volumePercent);
  }

  async applyVolume(value) {
    if (!this.player) {
      return;
    }

    await Promise.resolve(this.player.volume(value));
  }

  bindPlayerEvents() {
    if (!this.player) {
      return;
    }

    this.player.on('started', () => {
      if (this.pendingTrack) {
        this.currentTrack = this.pendingTrack;
        this.pendingTrack = null;
      }

      if (!this.playStartedAtMs) {
        this.playStartedAtMs = Date.now();
      }

      this.state = 'playing';
      this.pauseStartedAtMs = null;
      this.errorMessage = '';
      this.startProgressSync();
      this.syncRuntimeState();
    });

    this.player.on('paused', async () => {
      this.state = 'paused';
      this.pauseStartedAtMs = Date.now();
      this.errorMessage = '';
      await this.refreshPlaybackMetrics();
      this.startProgressSync();
      this.syncRuntimeState();
    });

    this.player.on('resumed', async () => {
      this.state = 'playing';
      this.pauseStartedAtMs = null;
      this.errorMessage = '';
      await this.refreshPlaybackMetrics();
      this.startProgressSync();
      this.syncRuntimeState();
    });

    this.player.on('stopped', () => {
      if (this.pendingTrack) {
        return;
      }

      this.state = 'idle';
      this.currentTrack = null;
      this.errorMessage = '';
      this.resetProgressState();
      this.stopProgressSync();
      this.syncRuntimeState();
    });

    this.player.on('timeposition', (seconds) => {
      const nextPosition = toFiniteNumberOrNull(seconds);
      if (nextPosition !== null) {
        this.currentPositionSec = nextPosition;
      }
    });

    this.player.on('statuschange', (status = {}) => {
      const nextDuration = toFiniteNumberOrNull(status.duration);
      if (nextDuration !== null) {
        this.durationSec = nextDuration;
      }

      if (!status.filename && !this.pendingTrack && ['playing', 'paused'].includes(this.state)) {
        this.state = 'idle';
        this.currentTrack = null;
        this.resetProgressState();
        this.stopProgressSync();
      } else if (status.pause === true && this.currentTrack) {
        this.state = 'paused';
      } else if (status.pause === false && this.currentTrack) {
        this.state = 'playing';
      }

      this.syncRuntimeState();
    });

    this.player.mpvPlayer?.on('error', (error) => {
      this.errorMessage = error?.message || 'mpv 初始化失败';
      this.syncRuntimeState();
    });
  }

  resolveTrackFilePath(track = {}) {
    const candidates = [
      String(track.filePath || '').trim(),
      path.join(uploadDir, path.basename(String(track.savedName || '').trim())),
    ].filter(Boolean);

    return candidates.find((candidate) => fs.existsSync(candidate)) || '';
  }

  syncRuntimeState() {
    updateBackendPlaybackState({
      available: this.driver.available,
      driver: this.driver.name,
      canPause: this.driver.canPause,
      volumePercent: this.volumePercent,
      state: this.state,
      errorMessage: this.errorMessage,
      currentTrack: this.currentTrack,
      progress: this.getProgressSnapshot(),
    });
  }

  getPublicState() {
    return {
      available: this.driver.available,
      driver: this.driver.name,
      canPause: this.driver.canPause,
      volumePercent: this.volumePercent,
      state: this.state,
      errorMessage: this.errorMessage,
      currentTrack: this.currentTrack,
      progress: this.getProgressSnapshot(),
    };
  }

  getProgressSnapshot() {
    const nowMs = Date.now();
    const startedAt = this.playStartedAtMs ? new Date(this.playStartedAtMs).toISOString() : null;
    const pausedAt = this.pauseStartedAtMs ? new Date(this.pauseStartedAtMs).toISOString() : null;
    const safePositionSec = Number.isFinite(this.currentPositionSec) ? this.currentPositionSec : 0;
    const safeDurationSec = Number.isFinite(this.durationSec) ? this.durationSec : null;
    const progressPercent = safeDurationSec && safeDurationSec > 0
      ? clampNumber((safePositionSec / safeDurationSec) * 100, 0, 100)
      : 0;

    if (!this.currentTrack) {
      return {
        isAvailable: false,
        positionSec: 0,
        durationSec: safeDurationSec,
        progressPercent: 0,
        startedAt,
        pausedAt,
        updatedAt: new Date(nowMs).toISOString(),
      };
    }

    return {
      isAvailable: true,
      positionSec: Number(safePositionSec.toFixed(3)),
      durationSec: safeDurationSec == null ? null : Number(safeDurationSec.toFixed(3)),
      progressPercent: Number(progressPercent.toFixed(2)),
      startedAt,
      pausedAt,
      updatedAt: new Date(nowMs).toISOString(),
    };
  }

  startProgressSync() {
    this.stopProgressSync();
    this.progressSyncTimer = setInterval(() => {
      if (!this.currentTrack && !['paused', 'playing', 'stopping'].includes(this.state)) {
        return;
      }

      this.syncRuntimeState();
    }, 1000);
  }

  stopProgressSync() {
    if (!this.progressSyncTimer) {
      return;
    }

    clearInterval(this.progressSyncTimer);
    this.progressSyncTimer = null;
  }

  resetProgressState() {
    this.currentPositionSec = 0;
    this.durationSec = null;
    this.playStartedAtMs = null;
    this.pauseStartedAtMs = null;
  }

  ensureAvailable() {
    if (this.driver.available) {
      return;
    }

    throw new Error('当前后端未检测到可用的 mpv 播放器，请先安装 mpv 或设置 MPV_PATH。');
  }

  async refreshPlaybackMetrics() {
    if (!this.player) {
      return;
    }

    try {
      const [timePos, duration, volume] = await Promise.all([
        this.player.getProperty('time-pos'),
        this.player.getProperty('duration'),
        this.player.getProperty('volume'),
      ]);

      const nextTimePos = toFiniteNumberOrNull(timePos);
      if (nextTimePos !== null) {
        this.currentPositionSec = nextTimePos;
      }

      const nextDuration = toFiniteNumberOrNull(duration);
      if (nextDuration !== null) {
        this.durationSec = nextDuration;
      }

      const nextVolume = toFiniteNumberOrNull(volume);
      if (nextVolume !== null) {
        this.volumePercent = clampNumber(Math.round(nextVolume), 0, 100);
      }
    } catch {
      // ignore metric refresh failures; event stream will continue updating
    }
  }

  waitForPlayerEvent(eventName, timeoutMs = 3000) {
    if (!this.player) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let finished = false;
      let timeoutId = null;

      const handleEvent = () => {
        if (finished) {
          return;
        }

        finished = true;
        clearTimeout(timeoutId);
        this.player.removeListener(eventName, handleEvent);
        resolve();
      };

      timeoutId = setTimeout(handleEvent, timeoutMs);
      this.player.once(eventName, handleEvent);
    });
  }

  async playFile(filePath, track = {}) {
    this.ensureAvailable();
    this.initializePlayer();

    const normalizedFilePath = path.resolve(String(filePath || '').trim());
    if (!normalizedFilePath || !fs.existsSync(normalizedFilePath)) {
      throw new Error('待播放的音频文件不存在');
    }

    const durationSec = parseDurationSeconds(normalizedFilePath);
    const nextTrack = {
      id: String(track.id || '').trim(),
      performer: String(track.performer || '').trim(),
      programName: String(track.programName || '').trim(),
      savedName: String(track.savedName || '').trim(),
      fileName: String(track.fileName || path.basename(normalizedFilePath)).trim(),
      filePath: normalizedFilePath,
      durationSec: Number.isFinite(durationSec) ? Number(durationSec.toFixed(3)) : null,
    };

    this.pendingTrack = nextTrack;
    this.currentTrack = nextTrack;
    this.currentPositionSec = 0;
    this.durationSec = nextTrack.durationSec;
    this.playStartedAtMs = Date.now();
    this.pauseStartedAtMs = null;
    this.state = 'playing';
    this.errorMessage = '';
    this.startProgressSync();
    this.syncRuntimeState();

    const startedPromise = this.waitForPlayerEvent('started', 3000);

    try {
      this.player.load(normalizedFilePath, 'replace');
      // When mpv is paused, replacing the file can inherit the paused flag.
      // Explicitly resume so selecting a different track always starts playback.
      if (this.state === 'playing' || this.state === 'paused') {
        this.player.resume();
      }
      await startedPromise;
      await this.refreshPlaybackMetrics();
      this.syncRuntimeState();
      return this.getPublicState();
    } catch (error) {
      this.pendingTrack = null;
      this.state = 'idle';
      this.currentTrack = null;
      this.errorMessage = error.message || 'mpv 播放失败';
      this.resetProgressState();
      this.stopProgressSync();
      this.syncRuntimeState();
      throw error;
    }
  }

  async pause() {
    this.ensureAvailable();

    if (!this.player || this.state !== 'playing') {
      throw new Error('当前没有正在播放的后端音频');
    }

    this.player.pause();
    this.state = 'paused';
    this.pauseStartedAtMs = Date.now();
    this.errorMessage = '';
    await this.refreshPlaybackMetrics();
    this.syncRuntimeState();
    return this.getPublicState();
  }

  async resume() {
    this.ensureAvailable();

    if (!this.player || this.state !== 'paused') {
      throw new Error('当前没有可恢复的后端音频');
    }

    this.player.resume();
    this.state = 'playing';
    this.pauseStartedAtMs = null;
    this.errorMessage = '';
    await this.refreshPlaybackMetrics();
    this.syncRuntimeState();
    return this.getPublicState();
  }

  async stop() {
    this.ensureAvailable();

    if (!this.player || !this.currentTrack) {
      this.state = 'stopped';
      this.currentTrack = null;
      this.errorMessage = '';
      this.stopProgressSync();
      this.resetProgressState();
      this.syncRuntimeState();
      return this.getPublicState();
    }

    this.player.stop();
    this.pendingTrack = null;
    this.state = 'stopping';
    this.errorMessage = '';
    this.syncRuntimeState();
    return this.getPublicState();
  }

  async setVolume(value) {
    this.ensureAvailable();
    this.initializePlayer();

    const nextVolume = clampNumber(Math.round(Number(value || 0)), 0, 100);
    this.volumePercent = nextVolume;
    await this.applyVolume(nextVolume);
    this.syncRuntimeState();
    return this.getPublicState();
  }

  async restoreFromRuntimeState() {
    const persistedState = this.restoreSnapshot || {};
    const persistedTrack = persistedState.currentTrack || null;
    const targetState = String(persistedState.state || '').trim();

    this.restoreSnapshot = null;

    if (!this.driver.available) {
      this.errorMessage = '未检测到可用的 mpv 播放器，跳过后端播放恢复。';
      this.syncRuntimeState();
      return this.getPublicState();
    }

    if (!persistedTrack || !['playing', 'paused'].includes(targetState)) {
      this.syncRuntimeState();
      return this.getPublicState();
    }

    const resolvedFilePath = this.resolveTrackFilePath(persistedTrack);
    if (!resolvedFilePath) {
      this.state = 'idle';
      this.currentTrack = null;
      this.errorMessage = '上次播放的音频文件不存在，无法自动恢复。';
      this.syncRuntimeState();
      return this.getPublicState();
    }

    await this.playFile(resolvedFilePath, persistedTrack);

    if (targetState === 'paused') {
      await this.pause();
    }

    return this.getPublicState();
  }
}

module.exports = new MusicPlaybackService();