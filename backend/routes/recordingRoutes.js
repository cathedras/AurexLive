const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const recordingService = require('../services/recordingService');
const { recordingDir } = require('../config/paths');

// 确保录音文件目录存在
if (!fs.existsSync(recordingDir)) {
  fs.mkdirSync(recordingDir, { recursive: true });
}

// 获取录音状态
router.get('/recording-status', (req, res) => {
  try {
    const { fileName } = req.query;
    const status = recordingService.getStatus(fileName);
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取录音状态失败',
      error: error.message,
    });
  }
});

// 开始录音
router.post('/start-recording', (req, res) => {
  try {
    const { clientId } = req.body;
    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: '缺少客户端ID',
      });
    }

    const recordingInfo = recordingService.startRecording(clientId);

    res.json({
      success: true,
      message: '录音已开始',
      data: recordingInfo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '开始录音失败',
      error: error.message,
    });
  }
});

// 接收录音数据块
router.post('/recording-chunk/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const chunk = req.body.chunk; // 音频数据块

    if (!chunk) {
      return res.status(400).json({
        success: false,
        message: '缺少音频数据块',
      });
    }

    // 将Base64数据转换为Buffer
    const buffer = Buffer.from(chunk, 'base64');
    
    recordingService.addRecordingChunk(filename, buffer);

    res.json({
      success: true,
      message: '音频数据块已接收',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '处理音频数据块失败',
      error: error.message,
    });
  }
});

// 获取录音列表
router.get('/list-recordings', (req, res) => {
  try {
    const recordings = recordingService.getList();
    
    res.json({
      success: true,
      data: recordings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取录音列表失败',
      error: error.message,
    });
  }
});

// 删除录音文件
router.delete('/recording/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    
    // 验证文件名安全性
    if (path.resolve(recordingDir, filename).indexOf(recordingDir) !== 0) {
      return res.status(400).json({
        success: false,
        message: '无效的文件路径',
      });
    }
    
    recordingService.deleteRecording(filename);
    
    res.json({
      success: true,
      message: '录音文件已删除',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '删除录音文件失败',
      error: error.message,
    });
  }
});

module.exports = router;