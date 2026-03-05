const express = require('express');

const { uploadDir } = require('../config/paths');
const { getUploadedFiles } = require('../utils/fileUtils');

const router = express.Router();

router.get('/files', (req, res) => {
  try {
    const files = getUploadedFiles(uploadDir);
    return res.json({ success: true, files });
  } catch (error) {
    return res.status(500).json({ success: false, message: `获取文件列表失败：${error.message}` });
  }
});

module.exports = router;
