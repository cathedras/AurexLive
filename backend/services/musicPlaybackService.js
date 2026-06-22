/**
 * Music Playback Service — ffplay backend
 *
 * Uses ffplay (part of ffmpeg) for cross-platform audio playback.
 * Supports stdin-based pause/resume via the 'p' key command,
 * and 'q' for quit. Seek via -ss, volume via -volume.
 *
 * Environment: FFPLAY_PATH to override binary path.
 */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const { runtimeConfigDir, uploadDir } = require('../config/paths');
const { readLiveState, updateBackendPlaybackState } = require('../utils/liveStateStore');
const { createLogger } = require('../middleware/logger');

const logger = createLogger({ source: 'MusicPlayback' });

function hasCommand(command) {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  try {
    const r = spawnSync(lookup, [command], { encoding: 'utf-8' });
    return r.status === 0 && Boolean(String(r.stdout || '').trim());
  } catch { return false; }
}

function resolveBinary() {
  const envBin = String(process.env.FFPLAY_PATH || '').trim();
  if (envBin) return envBin;
  if (hasCommand('ffplay')) return 'ffplay';
  return '';
}

function clampNumber(v, min, max) { return Math.min(Math.max(v, min), max); }

function toFiniteNumberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseDurationSeconds(filePath) {
  const fp = path.resolve(String(filePath || '').trim());
  if (!fp || !fs.existsSync(fp)) return null;

  if (process.platform === 'darwin' && hasCommand('afinfo')) {
    try {
      const r = spawnSync('afinfo', [fp], { encoding: 'utf-8' });
      const m = `${r.stdout || ''}\n${r.stderr || ''}`.match(/estimated duration:\s*([0-9.]+)\s*sec/i);
      if (m) { const d = Number(m[1]); if (Number.isFinite(d)) return d; }
    } catch { /* fall through */ }
  }

  if (hasCommand('ffprobe')) {
    try {
      const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', fp], { encoding: 'utf-8' });
      const d = Number(String(r.stdout || '').trim());
      if (Number.isFinite(d)) return d;
    } catch { /* ignore */ }
  }
  return null;
}

class MusicPlaybackService {
  constructor() {
    this.binary = resolveBinary();
    this.available = Boolean(this.binary);
    this.proc = null;
    this.state = 'idle';        // idle | playing | paused
    this.volumePercent = 100;
    this.currentTrack = null;
    this.errorMessage = '';

    this.currentPositionSec = 0;
    this.durationSec = null;
    this.playStartedAtMs = null;
    this.pauseStartedAtMs = null;
    this.pausePosSec = 0;
    this.progressSyncTimer = null;

    try {
      const liveState = readLiveState();
      this.volumePercent = clampNumber(Number(liveState?.backendPlayback?.volumePercent ?? 100), 0, 100);
    } catch { this.volumePercent = 100; }

    this.syncRuntimeState();
    logger.info(`ffplay backend initialized, binary="${this.binary}" available=${this.available}`, 'constructor');
  }

  getPublicState() {
    return {
      available: this.available,
      driver: 'ffplay',
      canPause: true,
      volumePercent: this.volumePercent,
      state: this.state,
      errorMessage: this.errorMessage,
      currentTrack: this.currentTrack,
      progress: this.getProgressSnapshot(),
    };
  }

  async playFile(filePath, track = {}) {
    this.ensureAvailable();
    this.stopProc();

    const normalizedFilePath = path.resolve(String(filePath || '').trim());
    if (!normalizedFilePath || !fs.existsSync(normalizedFilePath)) {
      throw new Error('The audio file to be played does not exist.');
    }

    const durationSec = parseDurationSeconds(normalizedFilePath);
    this.currentTrack = {
      id: String(track.id || '').trim(),
      performer: String(track.performer || '').trim(),
      programName: String(track.programName || '').trim(),
      savedName: String(track.savedName || '').trim(),
      fileName: String(track.fileName || path.basename(normalizedFilePath)).trim(),
      filePath: normalizedFilePath,
      durationSec: Number.isFinite(durationSec) ? Number(durationSec.toFixed(3)) : null,
    };
    this.durationSec = this.currentTrack.durationSec;
    this.currentPositionSec = 0;
    this.playStartedAtMs = Date.now();
    this.pauseStartedAtMs = null;
    this.pausePosSec = 0;
    this.state = 'playing';
    this.errorMessage = '';

    const vol = clampNumber(this.volumePercent, 0, 100);
    const args = [
      '-nodisp',
      '-autoexit',
      '-volume', String(vol),
      '-i', normalizedFilePath,
    ];

    try {
      this.proc = spawn(this.binary, args, { stdio: ['pipe', 'ignore', 'pipe'] });
      logger.info(`ffplay started PID=${this.proc.pid} file=${path.basename(normalizedFilePath)}`, 'playFile');

      this.proc.on('exit', (code, sig) => {
        logger.info(`ffplay exited PID=${this.proc?.pid} code=${code} sig=${sig}`, 'playFile');
        this.proc = null;
        if (this.state !== 'idle') {
          this.state = 'idle';
          this.resetProgressState();
          this.stopProgressSync();
          this.currentTrack = null;
          this.syncRuntimeState();
        }
      });

      this.proc.on('error', (err) => {
        this.errorMessage = String(err.message || err);
        logger.error(`ffplay error: ${this.errorMessage}`, 'playFile');
      });

      this.proc.stdin.on('error', () => { /* ignore broken pipe after exit */ });

      this.startProgressSync();
      this.syncRuntimeState();
    } catch (err) {
      this.state = 'idle';
      this.currentTrack = null;
      this.errorMessage = String(err.message || err);
      this.resetProgressState();
      this.syncRuntimeState();
      throw err;
    }

    return this.getPublicState();
  }

  async pause() {
    this.ensureAvailable();
    if (this.state !== 'playing') throw new Error('There is no backend audio currently playing.');

    // Send 'p' to ffplay's stdin to toggle pause
    this.sendStdin('p');
    this.pausePosSec = this.currentPositionSec;
    this.pauseStartedAtMs = Date.now();
    this.state = 'paused';
    this.syncRuntimeState();
    return this.getPublicState();
  }

  async resume() {
    this.ensureAvailable();
    if (this.state !== 'paused') throw new Error('There is no paused backend audio to resume.');

    // Send 'p' to ffplay's stdin to toggle pause
    this.sendStdin('p');
    this.state = 'playing';
    this.pauseStartedAtMs = null;
    this.playStartedAtMs = Date.now();
    this.errorMessage = '';
    this.syncRuntimeState();
    return this.getPublicState();
  }

  async stop() {
    // Send 'q' to ffplay to quit gracefully
    if (this.proc) {
      this.sendStdin('q');
    }
    this.state = 'idle';
    this.currentTrack = null;
    this.resetProgressState();
    this.stopProgressSync();
    this.syncRuntimeState();
    return this.getPublicState();
  }

  async setVolume(value) {
    this.volumePercent = clampNumber(Number(value) || 0, 0, 100);
    this.syncRuntimeState();
    return this.getPublicState();
  }

  // ── Internal ────────────────────────────────────────────────

  ensureAvailable() {
    if (!this.available) {
      throw new Error('No audio player detected. Please install ffmpeg (ffplay) or set FFPLAY_PATH.');
    }
  }

  sendStdin(data) {
    if (!this.proc || !this.proc.stdin || this.proc.stdin.destroyed) return;
    try {
      this.proc.stdin.write(data);
    } catch { /* ignore write errors */ }
  }

  stopProc() {
    if (!this.proc) return;
    this.sendStdin('q');
    const pid = this.proc.pid;
    setTimeout(() => {
      try { if (this.proc) this.proc.kill('SIGKILL'); } catch { /* ignore */ }
    }, 500).unref();
    this.proc = null;
    logger.info(`ffplay process stopped PID=${pid}`, 'stopProc');
  }

  startProgressSync() {
    this.stopProgressSync();
    this.progressSyncTimer = setInterval(() => {
      if (!this.currentTrack || this.state === 'idle') return;
      if (this.state === 'playing' && this.playStartedAtMs) {
        const elapsed = (Date.now() - this.playStartedAtMs) / 1000;
        this.currentPositionSec = this.pausePosSec + elapsed;
      }
      // Auto-stop when position exceeds duration
      if (this.durationSec && this.currentPositionSec >= this.durationSec) {
        this.state = 'idle';
        this.currentTrack = null;
        this.resetProgressState();
        this.stopProgressSync();
        this.stopProc();
        this.syncRuntimeState();
      } else {
        this.syncRuntimeState();
      }
    }, 500);
  }

  stopProgressSync() {
    if (this.progressSyncTimer) {
      clearInterval(this.progressSyncTimer);
      this.progressSyncTimer = null;
    }
  }

  resetProgressState() {
    this.currentPositionSec = 0;
    this.durationSec = null;
    this.playStartedAtMs = null;
    this.pauseStartedAtMs = null;
    this.pausePosSec = 0;
  }

  getProgressSnapshot() {
    const nowMs = Date.now();
    const safePos = Number.isFinite(this.currentPositionSec) ? this.currentPositionSec : 0;
    const safeDur = Number.isFinite(this.durationSec) ? this.durationSec : null;
    const pct = safeDur && safeDur > 0 ? clampNumber((safePos / safeDur) * 100, 0, 100) : 0;

    return {
      isAvailable: Boolean(this.currentTrack),
      positionSec: Number(safePos.toFixed(3)),
      durationSec: safeDur == null ? null : Number(safeDur.toFixed(3)),
      progressPercent: Number(pct.toFixed(2)),
      startedAt: this.playStartedAtMs ? new Date(this.playStartedAtMs).toISOString() : null,
      pausedAt: this.pauseStartedAtMs ? new Date(this.pauseStartedAtMs).toISOString() : null,
      updatedAt: new Date(nowMs).toISOString(),
    };
  }

  syncRuntimeState() {
    updateBackendPlaybackState({
      available: this.available,
      driver: 'ffplay',
      canPause: true,
      volumePercent: this.volumePercent,
      state: this.state,
      errorMessage: this.errorMessage,
      currentTrack: this.currentTrack,
      progress: this.getProgressSnapshot(),
    });
  }
}

module.exports = new MusicPlaybackService();
