const express = require('express');
const mediasoupService = require('../services/mediasoupService');

const router = express.Router();

function handleError(res, error, message, statusCode = 500) {
  return res.status(statusCode).json({
    success: false,
    message: `${message}：${error.message}`
  });
}

router.get('/rtp-capabilities', async (req, res) => {
  try {
    const rtpCapabilities = await mediasoupService.getRouterRtpCapabilities();
    return res.json({ success: true, rtpCapabilities });
  } catch (error) {
    return handleError(res, error, '获取 RTP 能力失败');
  }
});

router.post('/sessions', async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim() || undefined;
    const session = await mediasoupService.createSession(sessionId);
    const rtpCapabilities = await mediasoupService.getRouterRtpCapabilities();

    return res.json({
      success: true,
      sessionId: session.sessionId,
      rtpCapabilities,
      state: session
    });
  } catch (error) {
    return handleError(res, error, '创建 WebRTC 会话失败');
  }
});

router.get('/sessions', async (req, res) => {
  try {
    return res.json({
      success: true,
      sessions: mediasoupService.listSessions()
    });
  } catch (error) {
    return handleError(res, error, '获取 WebRTC 会话列表失败');
  }
});

router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const session = mediasoupService.getSessionState(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: '会话不存在' });
    }

    return res.json({ success: true, session });
  } catch (error) {
    return handleError(res, error, '获取 WebRTC 会话失败');
  }
});

router.get('/sessions/:sessionId/producers', async (req, res) => {
  try {
    const producers = mediasoupService.listProducers(req.params.sessionId);
    return res.json({ success: true, producers });
  } catch (error) {
    return handleError(res, error, '获取 Producer 列表失败');
  }
});

router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const removed = await mediasoupService.closeSession(req.params.sessionId);
    return res.json({ success: true, removed });
  } catch (error) {
    return handleError(res, error, '关闭 WebRTC 会话失败');
  }
});

router.post('/transports', async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId 不能为空' });
    }

    const direction = String(req.body?.direction || 'send').trim();
    const transport = await mediasoupService.createWebRtcTransport(sessionId, { direction });

    return res.json({ success: true, transport });
  } catch (error) {
    return handleError(res, error, '创建 WebRTC 传输失败');
  }
});

router.post('/transports/:transportId/connect', async (req, res) => {
  try {
    const dtlsParameters = req.body?.dtlsParameters;
    if (!dtlsParameters) {
      return res.status(400).json({ success: false, message: 'dtlsParameters 不能为空' });
    }

    const result = await mediasoupService.connectTransport(req.params.transportId, dtlsParameters);
    return res.json({ success: true, result });
  } catch (error) {
    return handleError(res, error, '连接 WebRTC 传输失败');
  }
});

router.post('/transports/:transportId/produce', async (req, res) => {
  try {
    const kind = String(req.body?.kind || '').trim();
    const rtpParameters = req.body?.rtpParameters;

    if (!['audio', 'video'].includes(kind)) {
      return res.status(400).json({ success: false, message: 'kind 仅支持 audio/video' });
    }

    if (!rtpParameters) {
      return res.status(400).json({ success: false, message: 'rtpParameters 不能为空' });
    }

    const result = await mediasoupService.produce(req.params.transportId, {
      kind,
      rtpParameters,
      appData: req.body?.appData || {}
    });

    return res.json({ success: true, producer: result });
  } catch (error) {
    return handleError(res, error, '创建 Producer 失败');
  }
});

router.post('/transports/:transportId/consume', async (req, res) => {
  try {
    const producerId = String(req.body?.producerId || '').trim();
    const rtpCapabilities = req.body?.rtpCapabilities;

    if (!producerId) {
      return res.status(400).json({ success: false, message: 'producerId 不能为空' });
    }

    if (!rtpCapabilities) {
      return res.status(400).json({ success: false, message: 'rtpCapabilities 不能为空' });
    }

    const result = await mediasoupService.consume(req.params.transportId, {
      producerId,
      rtpCapabilities
    });

    return res.json({ success: true, consumer: result });
  } catch (error) {
    return handleError(res, error, '创建 Consumer 失败');
  }
});

router.post('/consumers/:consumerId/resume', async (req, res) => {
  try {
    const result = await mediasoupService.resumeConsumer(req.params.consumerId);
    return res.json({ success: true, result });
  } catch (error) {
    return handleError(res, error, '恢复 Consumer 失败');
  }
});

module.exports = router;