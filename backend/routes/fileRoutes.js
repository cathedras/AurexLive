const express = require('express');

const { uploadDir } = require('../config/paths');
const { getUploadedFiles } = require('../utils/fileUtils');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const files = getUploadedFiles(uploadDir);
    return res.json({ success: true, files });
  } catch (error) {
    return res.status(500).json({ success: false, message: `Failed to fetch file list: ${error.message}` });
  }
});

module.exports = router;
