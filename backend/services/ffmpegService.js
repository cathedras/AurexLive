const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { recordingDir } = require('../config/paths');

function safeJoinRecordingDir(fileName) {
  const p = path.join(recordingDir, fileName);
  if (path.resolve(p).indexOf(path.resolve(recordingDir)) !== 0) {
    throw new Error('invalid output path');
  }
  return p;
}

// Run a conversion/recording job with ffmpeg.
// job: { input (file path or URL), outFileName, ffmpegArgs (array) }
// onProgress: function(progressObj)
function runFfmpegJob(job, onProgress) {
  // returns { promise, cancel }
  let ff = null;
  let stderrBuf = '';

  const promise = new Promise((resolve, reject) => {
    if (!job || (!job.input && !job.ffmpegArgs)) return reject(new Error('invalid job'));

    // determine output path
    const outFileName = job.outFileName || `convert-${Date.now()}.mp4`;
    const outPath = safeJoinRecordingDir(outFileName);

    // prepare args
    let args = [];
    if (Array.isArray(job.ffmpegArgs) && job.ffmpegArgs.length) {
      args = job.ffmpegArgs.slice();
      // if caller didn't include output path, append
      const hasOutput = args.some(a => /\.(mp4|m4a|aac|wav|webm|flac|mp3|mkv)$/i.test(a) || a.indexOf('/') !== -1);
      if (!hasOutput) args = args.concat([outPath]);
    } else if (job.input) {
      // basic conversion: copy streams if possible
      args = ['-y', '-i', job.input, '-c', 'copy', outPath];
    } else {
      return reject(new Error('no ffmpeg args or input specified'));
    }

    try {
      ff = spawn('ffmpeg', args);
    } catch (e) {
      return reject(e);
    }

    ff.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrBuf += text;
      // parse progress-ish info from stderr lines
      const lines = stderrBuf.split(/\r?\n/);
      stderrBuf = lines.pop();
      for (const line of lines) {
        try {
          const m = {};
          const re = /(\w+)=([^\s]+)/g;
          let mm;
          while ((mm = re.exec(line)) !== null) {
            m[mm[1]] = mm[2];
          }
          if (Object.keys(m).length) {
            try { onProgress && onProgress(m); } catch (e) {}
          } else {
            try { onProgress && onProgress({ raw: line }); } catch (e) {}
          }
        } catch (e) {}
      }
    });

    ff.on('error', (err) => {
      reject(err);
    });

    ff.on('exit', (code, sig) => {
      if (code === 0) {
        try {
          const stats = fs.statSync(outPath);
          resolve({ outPath, size: stats.size });
        } catch (e) {
          resolve({ outPath, size: 0 });
        }
      } else {
        const err = new Error(`ffmpeg exited ${code || sig}`);
        err.stderr = stderrBuf;
        reject(err);
      }
    });
  });

  const cancel = () => {
    try {
      if (ff && !ff.killed) {
        ff.kill('SIGKILL');
      }
    } catch (e) {}
  };

  return { promise, cancel };
}

module.exports = {
  runFfmpegJob,
};
