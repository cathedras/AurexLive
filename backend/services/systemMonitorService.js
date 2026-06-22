/**
 * System Monitor Service
 *
 * Samples system-level metrics (CPU, memory, disk I/O, per-process stats)
 * during recording to help correlate audio glitches with system load events.
 *
 * Usage:
 *   systemMonitorService.startMonitoring('recording-filename.mp3')
 *   systemMonitorService.stopMonitoring() → returns saved data path
 *
 * Data is saved to: recordings/<filename>.monitor.json
 */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { recordingDir } = require('../config/paths');
const { createLogger } = require('../middleware/logger');

const logger = createLogger({ source: 'SystemMonitor' });

const SAMPLE_INTERVAL_MS = 200; // sample every 200ms (5 Hz)
const MAX_RUNNING_SEC = 600;     // safety limit: 10 minutes

/** Known browser/audio processes to track on macOS */
const TARGET_PROCESS_NAMES = [
  'ffmpeg',
  'Google Chrome',
  'Chrome',
  'firefox',
  'Safari',
  'webkit',
  'coreaudio',
  'WindowServer',
  'kernel_task',
];

class SystemMonitorService {
  constructor() {
    this._timer = null;
    this._samples = [];
    this._startTime = null;
    this._recordingFile = null;
    this._sampleCount = 0;
    this._maxSamples = (MAX_RUNNING_SEC * 1000) / SAMPLE_INTERVAL_MS;
  }

  /**
   * Start periodic system monitoring.
   * @param {string} recordingFileName - e.g. 'auto-recording-xxx.mp3'
   */
  startMonitoring(recordingFileName) {
    if (this._timer) {
      logger.warning('Monitor already running, restarting...', 'startMonitoring');
      this.stopMonitoring();
    }

    this._recordingFile = recordingFileName;
    this._samples = [];
    this._startTime = Date.now();
    this._sampleCount = 0;

    logger.info(`System monitoring started for ${recordingFileName}`, 'startMonitoring');

    // Sample immediately, then periodically
    this._sample();
    this._timer = setInterval(() => this._sample(), SAMPLE_INTERVAL_MS);
  }

  /**
   * Stop monitoring and persist data to disk.
   * @returns {{ filePath: string, sampleCount: number, durationMs: number }}
   */
  stopMonitoring() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }

    const durationMs = Date.now() - (this._startTime || Date.now());
    const result = {
      recordingFile: this._recordingFile,
      recordingStarted: this._startTime,
      recordingStopped: Date.now(),
      durationMs,
      sampleCount: this._samples.length,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      samples: this._samples,
    };

    // Save to disk
    const baseName = this._recordingFile
      ? this._recordingFile.replace(/\.[^.]+$/, '') + '.monitor.json'
      : `monitor-${Date.now()}.json`;
    const filePath = path.join(recordingDir, baseName);

    try {
      fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8');
      logger.info(`System monitor data saved: ${filePath} (${this._samples.length} samples)`, 'stopMonitoring');
    } catch (err) {
      logger.error(`Failed to save monitor data: ${err.message}`, 'stopMonitoring');
    }

    this._recordingFile = null;
    this._samples = [];

    return { filePath, sampleCount: result.sampleCount, durationMs };
  }

  /** Collect one sample of system metrics */
  _sample() {
    this._sampleCount++;
    if (this._sampleCount > this._maxSamples) {
      logger.warning('Monitor reached max samples, stopping', '_sample');
      this.stopMonitoring();
      return;
    }

    const timestamp = Date.now();
    const elapsed = timestamp - (this._startTime || timestamp);

    const sample = {
      t: elapsed,           // ms since monitoring started
      ts: timestamp,        // absolute timestamp
    };

    // 1. Overall CPU load (1-min average)
    try {
      const load = spawnSync('sysctl', ['-n', 'vm.loadavg'], { encoding: 'utf8', timeout: 500 });
      if (load.status === 0) {
        const parts = String(load.stdout || '').trim().match(/[\d.]+/g);
        if (parts && parts.length >= 3) {
          sample.load1 = parseFloat(parts[0]);
          sample.load5 = parseFloat(parts[1]);
          sample.load15 = parseFloat(parts[2]);
        }
      }
    } catch (e) { /* non-fatal */ }

    // 2. CPU usage per target process
    try {
      // macOS ps uses different flags than Linux
      const proc = spawnSync('ps', ['-eo', 'pid,%cpu,comm'], { encoding: 'utf8', timeout: 1000 });
      if (proc.status === 0) {
        const lines = String(proc.stdout || '').trim().split('\n');
        const processMap = {};

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('PID')) continue;
          const match = trimmed.match(/^\s*(\d+)\s+([\d.]+)\s+(.+)$/);
          if (!match) continue;

          const pid = parseInt(match[1], 10);
          const cpu = parseFloat(match[2]);
          const command = String(match[3] || '').trim().toLowerCase();

          // Check if this process matches our targets
          for (const target of TARGET_PROCESS_NAMES) {
            if (command.includes(target.toLowerCase())) {
              const key = target;
              if (!processMap[key] || cpu > processMap[key].cpu) {
                processMap[key] = { pid, cpu, command: match[3].trim() };
              }
              break;
            }
          }

          // Also capture top 3 overall CPU consumers
          if (!sample.topCpu) sample.topCpu = [];
          if (sample.topCpu.length < 3 && cpu > 1) {
            sample.topCpu.push({ pid, cpu, command: match[3].trim().slice(0, 40) });
          }
        }

        if (Object.keys(processMap).length > 0) {
          sample.procs = processMap;
        }
      }
    } catch (e) { /* non-fatal */ }

    // 3. Memory pressure (macOS only)
    try {
      const mem = spawnSync('memory_pressure', [], { encoding: 'utf8', timeout: 500 });
      if (mem.status === 0) {
        const out = String(mem.stdout || '');
        const pressMatch = out.match(/pressure\s*:\s*(\w+)/i);
        if (pressMatch) sample.memPressure = pressMatch[1];
      }
    } catch (e) { /* non-fatal */ }

    // 4. Page faults / VM activity
    try {
      const vm = spawnSync('vm_stat', [], { encoding: 'utf8', timeout: 500 });
      if (vm.status === 0) {
        const out = String(vm.stdout || '');
        const pageInMatch = out.match(/pageins?\s*:\s*(\d+)/i);
        const pageOutMatch = out.match(/pageouts?\s*:\s*(\d+)/i);
        if (pageInMatch) sample.pageIn = parseInt(pageInMatch[1], 10);
        if (pageOutMatch) sample.pageOut = parseInt(pageOutMatch[1], 10);
      }
    } catch (e) { /* non-fatal */ }

    // 5. Context switches (via vmstat, macOS compatible)
    try {
      const cs = spawnSync('vmstat', ['-c', '1', '1'], { encoding: 'utf8', timeout: 1000 });
      if (cs.status === 0) {
        const out = String(cs.stdout || '');
        const lines = out.trim().split('\n').filter(l => l.trim());
        const dataLine = lines[lines.length - 1];
        if (dataLine) {
          const parts = dataLine.trim().split(/\s+/);
          // vmstat on macOS: procs,memory,page,faults,cpu
          // faults column (index 7 on macOS) includes context switches
          if (parts.length >= 8) {
            const csVal = parseInt(parts[parts.length - 4], 10); // 'in' (interrupts) or 'sy' (context switches)
            if (Number.isFinite(csVal)) sample.ctxSwitch = csVal;
          }
        }
      }
    } catch (e) { /* non-fatal */ }

    // 6. Disk I/O (iostat, macOS compatible)
    try {
      const io = spawnSync('iostat', ['-c', '2', '1'], { encoding: 'utf8', timeout: 1000 });
      if (io.status === 0) {
        const out = String(io.stdout || '');
        const lines = out.trim().split('\n').filter(l => l.trim());
        // Last line should be numeric data (second sample after header)
        const dataLine = lines.length > 0 ? lines[lines.length - 1] : '';
        if (dataLine) {
          const parts = dataLine.trim().split(/\s+/);
          // macOS iostat output: disk0 KB/t tps MB/s ...
          // We're looking for disk read/write KB
          if (parts.length >= 4) {
            const kbRead = parseFloat(parts[parts.length - 3]);
            const kbWrite = parseFloat(parts[parts.length - 2]);
            if (Number.isFinite(kbRead)) sample.diskReadKB = kbRead;
            if (Number.isFinite(kbWrite)) sample.diskWriteKB = kbWrite;
          }
        }
      }
    } catch (e) { /* non-fatal */ }

    // 7. Running process count
    try {
      const psProc = spawnSync('ps', ['-e'], { encoding: 'utf8', timeout: 500 });
      if (psProc.status === 0) {
        const count = String(psProc.stdout || '').trim().split('\n').filter(l => l.trim()).length - 1; // subtract header
        sample.procCount = Math.max(0, count);
      }
    } catch (e) { /* non-fatal */ }

    this._samples.push(sample);
  }
}

module.exports = new SystemMonitorService();
