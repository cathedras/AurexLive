const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const { uploadDir } = require('../config/paths');
const { readLiveState, updateBackendPlaybackState } = require('../utils/liveStateStore');

function hasCommand(command) {
  try {
    const result = spawnSync('which', [command], { encoding: 'utf-8' });
    return result.status === 0 && Boolean(String(result.stdout || '').trim());
  } catch {
    return false;
  }
}

function detectDriver() {
  if (process.platform === 'darwin' && hasCommand('afplay')) {
    return {
      available: true,
      name: 'afplay',
      canPause: true,
      command: 'afplay',
      buildArgs: (filePath) => [filePath],
    };
  }

  if (process.platform === 'linux' && hasCommand('ffplay')) {
    return {
      available: true,
      name: 'ffplay',
      canPause: true,
      command: 'ffplay',
      buildArgs: (filePath) => ['-nodisp', '-autoexit', '-loglevel', 'error', filePath],
    };
  }

  return {
    available: false,
    name: '',
    canPause: false,
    command: '',
    buildArgs: () => [],
  };
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
    this.playerProcess = null;
    this.playbackId = 0;
    this.stopReasons = new Map();
    this.state = 'idle';
    this.currentTrack = null;
    this.errorMessage = '';
    this.progressSyncTimer = null;
    this.playStartedAtMs = null;
    this.pauseStartedAtMs = null;
    this.accumulatedPauseMs = 0;
    this.durationSec = null;
    this.restoreSnapshot = null;

    try {
      const liveState = readLiveState();
      this.restoreSnapshot = liveState?.backendPlayback || null;
    } catch {
      this.restoreSnapshot = null;
    }

    this.syncRuntimeState();
  }

  resolveTrackFilePath(track = {}) {
    const candidates = [
      String(track.filePath || '').trim(),
      path.join(uploadDir, path.basename(String(track.savedName || '').trim())),
    ].filter(Boolean)

    return candidates.find((candidate) => fs.existsSync(candidate)) || ''
  }

  syncRuntimeState() {
    updateBackendPlaybackState({
      available: this.driver.available,
      driver: this.driver.name,
      canPause: this.driver.canPause,
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

    if (!this.playStartedAtMs || !this.currentTrack) {
      return {
        isAvailable: false,
        positionSec: 0,
        durationSec: this.durationSec,
        progressPercent: 0,
        startedAt,
        pausedAt,
        updatedAt: new Date(nowMs).toISOString(),
      };
    }

    const effectiveNowMs = this.state === 'paused' && this.pauseStartedAtMs ? this.pauseStartedAtMs : nowMs;
    const elapsedMs = Math.max(0, effectiveNowMs - this.playStartedAtMs - this.accumulatedPauseMs);
    let positionSec = elapsedMs / 1000;

    if (Number.isFinite(this.durationSec) && this.durationSec !== null) {
      positionSec = clampNumber(positionSec, 0, this.durationSec);
    }

    const progressPercent = Number.isFinite(this.durationSec) && this.durationSec && this.durationSec > 0
      ? clampNumber((positionSec / this.durationSec) * 100, 0, 100)
      : 0;

    return {
      isAvailable: true,
      positionSec: Number(positionSec.toFixed(3)),
      durationSec: Number.isFinite(this.durationSec) ? Number(this.durationSec.toFixed(3)) : null,
      progressPercent: Number(progressPercent.toFixed(2)),
      startedAt,
      pausedAt,
      updatedAt: new Date(nowMs).toISOString(),
    };
  }

  startProgressSync() {
    this.stopProgressSync();
    this.progressSyncTimer = setInterval(() => {
      if (!this.playerProcess && !['paused', 'playing', 'stopping'].includes(this.state)) {
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
    this.playStartedAtMs = null;
    this.pauseStartedAtMs = null;
    this.accumulatedPauseMs = 0;
    this.durationSec = null;
  }

  ensureAvailable() {
    if (this.driver.available) {
      return;
    }

    throw new Error('当前后端未检测到可用的系统播放器。macOS 请确认 afplay 可用。');
  }

  stopProcess(processToStop, reason) {
    if (!processToStop) {
      return;
    }

    this.stopReasons.set(processToStop.pid, reason);

    try {
      processToStop.kill('SIGTERM');
    } catch {
      return;
    }

    setTimeout(() => {
      try {
        if (processToStop.exitCode === null && processToStop.signalCode === null) {
          processToStop.kill('SIGKILL');
        }
      } catch {
        // ignore force-kill failure
      }
    }, 300);
  }

  playFile(filePath, track = {}) {
    this.ensureAvailable();

    const normalizedFilePath = path.resolve(String(filePath || '').trim());
    if (!normalizedFilePath || !fs.existsSync(normalizedFilePath)) {
      throw new Error('待播放的音频文件不存在');
    }

    const previousProcess = this.playerProcess;
    const nextPlaybackId = this.playbackId + 1;
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

    return new Promise((resolve, reject) => {
      const child = spawn(this.driver.command, this.driver.buildArgs(normalizedFilePath), {
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let settled = false;
      let stderrText = '';

      child.stderr?.on('data', (chunk) => {
        stderrText += String(chunk || '');
      });

      child.once('error', (error) => {
        if (settled) {
          return;
        }

        settled = true;
        this.errorMessage = error.message;
        this.syncRuntimeState();
        reject(error);
      });

      child.once('spawn', () => {
        this.playbackId = nextPlaybackId;
        this.playerProcess = child;
        this.state = 'playing';
        this.currentTrack = nextTrack;
        this.errorMessage = '';
        this.playStartedAtMs = Date.now();
        this.pauseStartedAtMs = null;
        this.accumulatedPauseMs = 0;
        this.durationSec = durationSec;
        this.startProgressSync();
        this.syncRuntimeState();

        if (previousProcess && previousProcess.pid !== child.pid) {
          setTimeout(() => this.stopProcess(previousProcess, 'switch'), 60);
        }

        if (!settled) {
          settled = true;
          resolve(this.getPublicState());
        }
      });

      child.once('exit', (code, signal) => {
        const stopReason = this.stopReasons.get(child.pid) || '';
        this.stopReasons.delete(child.pid);

        if (this.playerProcess !== child) {
          return;
        }

        this.playerProcess = null;
        this.stopProgressSync();

        if (stopReason === 'stop') {
          this.state = 'stopped';
          this.currentTrack = null;
          this.errorMessage = '';
        } else if (stopReason === 'switch') {
          return;
        } else if (code === 0 || signal === 'SIGTERM') {
          this.state = 'idle';
          this.currentTrack = null;
          this.errorMessage = '';
        } else {
          this.state = 'idle';
          this.currentTrack = null;
          this.errorMessage = stderrText.trim() || `播放器异常退出(code=${code}, signal=${signal || 'none'})`;
        }

        this.resetProgressState();

        this.syncRuntimeState();
      });
    });
  }

  pause() {
    this.ensureAvailable();

    if (!this.playerProcess || this.state !== 'playing') {
      throw new Error('当前没有正在播放的后端音频');
    }

    this.playerProcess.kill('SIGSTOP');
    this.pauseStartedAtMs = Date.now();
    this.state = 'paused';
    this.errorMessage = '';
    this.syncRuntimeState();
    return this.getPublicState();
  }

  resume() {
    this.ensureAvailable();

    if (!this.playerProcess || this.state !== 'paused') {
      throw new Error('当前没有可恢复的后端音频');
    }

    this.playerProcess.kill('SIGCONT');
    if (this.pauseStartedAtMs) {
      this.accumulatedPauseMs += Date.now() - this.pauseStartedAtMs;
    }
    this.pauseStartedAtMs = null;
    this.state = 'playing';
    this.errorMessage = '';
    this.syncRuntimeState();
    return this.getPublicState();
  }

  stop() {
    this.ensureAvailable();

    if (!this.playerProcess) {
      this.state = 'stopped';
      this.currentTrack = null;
      this.errorMessage = '';
      this.stopProgressSync();
      this.resetProgressState();
      this.syncRuntimeState();
      return this.getPublicState();
    }

    this.stopProcess(this.playerProcess, 'stop');
    this.state = 'stopping';
    this.errorMessage = '';
    this.syncRuntimeState();
    return this.getPublicState();
  }

  async restoreFromRuntimeState() {
    const persistedState = this.restoreSnapshot || {}
    const persistedTrack = persistedState.currentTrack || null
    const targetState = String(persistedState.state || '').trim()

    this.restoreSnapshot = null

    if (!this.driver.available) {
      this.errorMessage = '未检测到可用的系统播放器，跳过后端播放恢复。'
      this.syncRuntimeState()
      return this.getPublicState()
    }

    if (!persistedTrack || !['playing', 'paused'].includes(targetState)) {
      this.syncRuntimeState()
      return this.getPublicState()
    }

    const resolvedFilePath = this.resolveTrackFilePath(persistedTrack)
    if (!resolvedFilePath) {
      this.state = 'idle'
      this.currentTrack = null
      this.errorMessage = '上次播放的音频文件不存在，无法自动恢复。'
      this.syncRuntimeState()
      return this.getPublicState()
    }

    await this.playFile(resolvedFilePath, persistedTrack)

    if (targetState === 'paused') {
      this.pause()
    }

    return this.getPublicState()
  }
}

module.exports = new MusicPlaybackService();