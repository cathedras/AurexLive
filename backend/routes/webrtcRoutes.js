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
    return handleError(res, error, 'Failed to get RTP capabilities');
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
    return handleError(res, error, 'Failed to create WebRTC session');
  }
});

router.get('/sessions', async (req, res) => {
  try {
    return res.json({
      success: true,
      sessions: mediasoupService.listSessions()
    });
  } catch (error) {
    return handleError(res, error, 'Failed to get WebRTC session list');
  }
});

router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const session = mediasoupService.getSessionState(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    return res.json({ success: true, session });
  } catch (error) {
    return handleError(res, error, 'Failed to get WebRTC session');
  }
});

router.get('/sessions/:sessionId/producers', async (req, res) => {
  try {
    const producers = mediasoupService.listProducers(req.params.sessionId);
    return res.json({ success: true, producers });
  } catch (error) {
    return handleError(res, error, 'Failed to get Producer list');
  }
});

router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const removed = await mediasoupService.closeSession(req.params.sessionId);
    return res.json({ success: true, removed });
  } catch (error) {
    return handleError(res, error, 'Failed to close WebRTC session');
  }
});

router.post('/transports', async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required.' });
    }

    const direction = String(req.body?.direction || 'send').trim();
    const transport = await mediasoupService.createWebRtcTransport(sessionId, { direction });

    return res.json({ success: true, transport });
  } catch (error) {
    return handleError(res, error, 'Failed to create WebRTC transport');
  }
});

router.post('/transports/:transportId/connect', async (req, res) => {
  try {
    const dtlsParameters = req.body?.dtlsParameters;
    if (!dtlsParameters) {
      return res.status(400).json({ success: false, message: 'dtlsParameters is required.' });
    }

    const result = await mediasoupService.connectTransport(req.params.transportId, dtlsParameters);
    return res.json({ success: true, result });
  } catch (error) {
    return handleError(res, error, 'Failed to connect WebRTC transport');
  }
});

router.get('/transports/:transportId', async (req, res) => {
  try {
    const transport = mediasoupService.getTransportState(req.params.transportId);
    if (!transport) {
      return res.status(404).json({ success: false, message: 'Transport not found.' });
    }

    return res.json({ success: true, transport });
  } catch (error) {
    return handleError(res, error, 'Failed to get WebRTC transport state');
  }
});

router.post('/transports/:transportId/produce', async (req, res) => {
  try {
    const kind = String(req.body?.kind || '').trim();
    const rtpParameters = req.body?.rtpParameters;

    if (!['audio', 'video'].includes(kind)) {
      return res.status(400).json({ success: false, message: 'kind only supports audio/video.' });
    }

    if (!rtpParameters) {
      return res.status(400).json({ success: false, message: 'rtpParameters is required.' });
    }

    const result = await mediasoupService.produce(req.params.transportId, {
      kind,
      rtpParameters,
      appData: req.body?.appData || {}
    });

    return res.json({ success: true, producer: result });
  } catch (error) {
    return handleError(res, error, 'Failed to create Producer');
  }
});

router.post('/transports/:transportId/consume', async (req, res) => {
  try {
    const producerId = String(req.body?.producerId || '').trim();
    const rtpCapabilities = req.body?.rtpCapabilities;

    if (!producerId) {
      return res.status(400).json({ success: false, message: 'producerId is required.' });
    }

    if (!rtpCapabilities) {
      return res.status(400).json({ success: false, message: 'rtpCapabilities is required.' });
    }

    const result = await mediasoupService.consume(req.params.transportId, {
      producerId,
      rtpCapabilities
    });

    return res.json({ success: true, consumer: result });
  } catch (error) {
    return handleError(res, error, 'Failed to create Consumer');
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