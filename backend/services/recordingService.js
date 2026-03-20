const fs = require('fs');
const path = require('path');
const { recordingDir } = require('../config/paths');

class RecordingService {
  constructor() {
    this.activeRecordings = new Map(); // 存储活动录音的状态
    this.clients = new Map(); // 存储WebSocket客户端
    this.nextClientId = 1;
  }

  // 注册WebSocket客户端
  registerClient(ws) {
    const clientId = this.nextClientId++;
    this.clients.set(clientId, ws);

    ws.on('close', () => {
      this.clients.delete(clientId);
      // 检查是否有与此客户端关联的录音
      for (const [fileName, recordingInfo] of this.activeRecordings.entries()) {
        if (recordingInfo.clientId === clientId) {
          this.stopRecording(fileName);
        }
      }
    });

    return clientId;
  }

  // 广播音量数据给所有客户端
  broadcastVolume(volumeData) {
    for (const [clientId, ws] of this.clients.entries()) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'volume',
          data: volumeData
        }));
      }
    }
  }

  // 开始录音
  startRecording(clientId) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `recording-${timestamp}.webm`;
    const filePath = path.join(recordingDir, fileName);

    // 确保录音目录存在
    if (!fs.existsSync(recordingDir)) {
      fs.mkdirSync(recordingDir, { recursive: true });
    }

    // 记录录音状态
    const recordingInfo = {
      fileName,
      filePath,
      startTime: new Date(),
      isRecording: true,
      chunks: [],
      clientId: clientId, // 关联客户端ID
      volumeData: [] // 存储音量数据
    };

    this.activeRecordings.set(fileName, recordingInfo);

    return {
      fileName,
      startTime: recordingInfo.startTime,
    };
  }

  // 添加录音数据块并计算音量
  addRecordingChunk(fileName, chunk) {
    const recordingInfo = this.activeRecordings.get(fileName);
    if (!recordingInfo) {
      throw new Error(`录音 ${fileName} 不存在或未激活`);
    }

    // 将Buffer转换为音频数据并计算音量
    const volume = this.calculateVolume(chunk);
    
    // 记录音量数据
    recordingInfo.volumeData.push({
      timestamp: Date.now(),
      volume: volume
    });
    
    // 广播音量数据
    this.broadcastVolume({
      fileName,
      volume: volume,
      timestamp: Date.now()
    });

    recordingInfo.chunks.push(chunk);
    return true;
  }

  // 计算音量（RMS值）
  calculateVolume(buffer) {
    // 将buffer转换为Float32Array进行处理
    const float32Array = new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    
    let sum = 0;
    for (let i = 0; i < float32Array.length; i++) {
      sum += float32Array[i] * float32Array[i];
    }
    
    const rms = Math.sqrt(sum / float32Array.length);
    // 将RMS值映射到0-100的范围内
    const normalizedVolume = Math.min(100, Math.max(0, Math.round(rms * 1000)));
    
    return normalizedVolume;
  }

  // 停止录音
  stopRecording(fileName) {
    const recordingInfo = this.activeRecordings.get(fileName);
    if (!recordingInfo) {
      throw new Error(`录音 ${fileName} 不存在或未激活`);
    }

    // 将所有数据块合并并写入文件
    const allChunks = Buffer.concat(recordingInfo.chunks);
    fs.writeFileSync(recordingInfo.filePath, allChunks);

    // 从活动录音中移除
    this.activeRecordings.delete(fileName);

    return {
      fileName,
      filePath: recordingInfo.filePath,
      duration: (new Date() - recordingInfo.startTime) / 1000, // 秒
      size: allChunks.length
    };
  }

  // 获取录音状态
  getStatus(fileName) {
    if (fileName) {
      const recordingInfo = this.activeRecordings.get(fileName);
      if (recordingInfo) {
        return {
          fileName,
          isRecording: recordingInfo.isRecording,
          startTime: recordingInfo.startTime,
          volume: recordingInfo.volumeData.length > 0 ? recordingInfo.volumeData[recordingInfo.volumeData.length - 1].volume : 0
        };
      }
      return null;
    }

    // 返回所有活动录音的状态
    const activeStatuses = [];
    for (const [fileName, info] of this.activeRecordings) {
      activeStatuses.push({
        fileName,
        isRecording: info.isRecording,
        startTime: info.startTime,
        volume: info.volumeData.length > 0 ? info.volumeData[info.volumeData.length - 1].volume : 0
      });
    }
    
    return {
      activeRecordings: activeStatuses,
      totalActive: activeStatuses.length,
    };
  }

  // 获取录音列表
  getList() {
    try {
      const files = fs.readdirSync(recordingDir).filter(file => 
        /\.(mp3|wav|webm|ogg)$/i.test(file)
      );
      
      const recordings = files.map(file => {
        const filePath = path.join(recordingDir, file);
        const stats = fs.statSync(filePath);
        
        return {
          filename: file,
          size: stats.size,
          createdAt: stats.birthtime,
          url: `/v1/recordings/${encodeURIComponent(file)}`,
        };
      }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // 按时间倒序排列
      
      return recordings;
    } catch (error) {
      throw error;
    }
  }

  // 删除录音文件
  deleteRecording(fileName) {
    const filePath = path.join(recordingDir, fileName);
    
    // 验证文件名安全性
    if (path.resolve(filePath).indexOf(recordingDir) !== 0) {
      throw new Error('无效的文件路径');
    }
    
    if (!fs.existsSync(filePath)) {
      throw new Error('文件不存在');
    }
    
    // 如果正在录音，则先停止
    if (this.activeRecordings.has(fileName)) {
      this.stopRecording(fileName);
    }
    
    fs.unlinkSync(filePath);
    return true;
  }
}

module.exports = new RecordingService();