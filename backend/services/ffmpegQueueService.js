const ffmpegService = require('./ffmpegService');
const { recordingDir } = require('../config/paths');
const path = require('path');

class FfmpegQueueService {
  constructor() {
    this.queue = [];
    this.jobs = new Map(); // jobId -> { status, data, result, err }
    this.nextJobId = 1;
    this.concurrency = 1;
    this.running = 0;
  }

  enqueue(jobData) {
    const id = this.nextJobId++;
    const job = { id, jobData, status: 'queued', createdAt: Date.now() };
    this.jobs.set(id, job);
    this.queue.push(job);
    this._maybeStart();
    return id;
  }

  getJob(id) {
    return this.jobs.get(Number(id)) || null;
  }

  _maybeStart() {
    while (this.running < this.concurrency && this.queue.length) {
      const job = this.queue.shift();
      this._run(job);
    }
  }

  _run(job) {
    this.running++;
    job.status = 'active';
    job.startedAt = Date.now();
    const onProgress = (p) => {
      job.progress = p;
      // attach last progress time
      job.lastProgressAt = Date.now();
      // emit event via recordingService if available (for SSE/WS integration)
      try {
        const recordingService = require('./recordingService');
        recordingService.emitter && recordingService.emitter.emit('ffmpeg-progress', { jobId: job.id, progress: p });
      } catch (e) {}
    };

    const { promise, cancel } = ffmpegService.runFfmpegJob(job.jobData, onProgress);
    job.cancel = cancel;

    promise.then((res) => {
      job.status = 'completed';
      job.completedAt = Date.now();
      job.result = res;
      this.running--;
      this._maybeStart();
    }).catch((err) => {
      if (job.status === 'cancelled') {
        // already marked cancelled by cancelJob
      } else {
        job.status = 'failed';
        job.error = err && (err.message || String(err));
        job.stderr = err && err.stderr;
      }
      job.completedAt = Date.now();
      this.running--;
      this._maybeStart();
    });
  }

  cancelJob(id) {
    const job = this.jobs.get(Number(id));
    if (!job) return false;
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return false;
    try {
      job.cancel && job.cancel();
      job.status = 'cancelled';
      job.cancelledAt = Date.now();
      return true;
    } catch (e) {
      return false;
    }
  }

  setConcurrency(n) {
    this.concurrency = Math.max(1, parseInt(n, 10) || 1);
    this._maybeStart();
  }

  listJobs() {
    return Array.from(this.jobs.values());
  }
}

module.exports = new FfmpegQueueService();
