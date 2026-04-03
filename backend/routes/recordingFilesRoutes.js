const express = require('express');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');

const { recordingDir } = require('../config/paths');

const router = express.Router();

function parseRangeHeader(rangeHeader, fileSize) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return null;
  }

  const rangeValue = rangeHeader.slice('bytes='.length).trim();
  const [startPart, endPart] = rangeValue.split('-');
  const start = Number(startPart);
  const end = endPart ? Number(endPart) : fileSize - 1;

  if (!Number.isFinite(start) || start < 0 || start >= fileSize) {
    return null;
  }

  const safeEnd = Number.isFinite(end) ? Math.min(end, fileSize - 1) : fileSize - 1;
  if (safeEnd < start) {
    return null;
  }

  return { start, end: safeEnd };
}

router.get('/:filename', (req, res) => {
  try {
    const filename = String(req.params.filename || '').trim();
    if (!filename) {
      return res.status(400).json({ success: false, message: '文件名不能为空' });
    }

    const filePath = path.join(recordingDir, filename);
    if (path.resolve(filePath).indexOf(recordingDir) !== 0) {
      return res.status(400).json({ success: false, message: '无效的文件路径' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '文件不存在' });
    }

    const stat = fs.statSync(filePath);
    const range = parseRangeHeader(req.headers.range, stat.size);
    const contentType = filename.toLowerCase().endsWith('.flac') ? 'audio/flac' : undefined;

    res.setHeader('Accept-Ranges', 'bytes');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    if (!range) {
      res.status(200);
      res.setHeader('Content-Length', stat.size);
      return pipeline(fs.createReadStream(filePath), res, (error) => {
        if (error && !res.headersSent) {
          res.status(500).json({ success: false, message: '读取录音文件失败', error: error.message });
        }
      });
    }

    const { start, end } = range;
    res.status(206);
    res.setHeader('Content-Length', end - start + 1);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);

    return pipeline(fs.createReadStream(filePath, { start, end }), res, (error) => {
      if (error && !res.headersSent) {
        res.status(500).json({ success: false, message: '读取录音文件失败', error: error.message });
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: '读取录音文件失败', error: error.message });
  }
});

module.exports = router;