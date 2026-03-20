const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/v1';

/**
 * 获取录音状态
 */
export const getRecordingStatus = async (fileName) => {
  try {
    const params = fileName ? `?fileName=${encodeURIComponent(fileName)}` : '';
    const response = await fetch(`${BASE_URL}/recording-status${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('获取录音状态失败:', error);
    throw error;
  }
};

/**
 * 开始录音
 */
export const startRecording = async (clientId) => {
  try {
    const response = await fetch(`${BASE_URL}/start-recording`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ clientId }),
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('开始录音失败:', error);
    throw error;
  }
};

/**
 * 发送录音数据块
 */
export const sendRecordingChunk = async (chunk, filename) => {
  try {
    // 将Blob转换为ArrayBuffer，然后转为Base64
    const arrayBuffer = await chunk.arrayBuffer();
    const base64Chunk = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    const response = await fetch(`${BASE_URL}/recording-chunk/${filename}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chunk: base64Chunk }),
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('发送录音数据块失败:', error);
    throw error;
  }
};

/**
 * 获取录音列表
 */
export const getRecordingList = async () => {
  try {
    const response = await fetch(`${BASE_URL}/list-recordings`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('获取录音列表失败:', error);
    throw error;
  }
};

/**
 * 删除录音文件
 */
export const deleteRecording = async (filename) => {
  try {
    const response = await fetch(`${BASE_URL}/recording/${filename}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('删除录音失败:', error);
    throw error;
  }
};