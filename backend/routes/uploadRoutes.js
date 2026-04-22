const express = require('express');
const multer = require('multer');

const { uploadDir } = require('../config/paths');
const { normalizeUploadFileName } = require('../utils/fileUtils');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const normalizedOriginalName = normalizeUploadFileName(file.originalname);
    file.originalname = normalizedOriginalName;
    const fileName = `${uniqueSuffix}-${normalizedOriginalName}`;
    cb(null, fileName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

router.post('/', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please select a file to upload.' });
    }

    return res.json({
      success: true,
      message: 'File uploaded successfully.',
      fileInfo: {
        name: req.file.originalname,
        size: req.file.size,
        path: req.file.path,
        savedName: req.file.filename
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `Failed to upload file: ${error.message}` });
  }
});

module.exports = router;
