const { randomUUID } = require('crypto');
const EventEmitter = require('events');
const mediasoup = require('mediasoup');
const { createLogger } = require('../middleware/logger');
const wsClientService = require('./wsClientService');

const logger = createLogger({ source: 'mediasoupService' });

function broadcastLivePushEvent(event, data = {}) {
  try {
    wsClientService.broadcast({
      event,
      timestamp: new Date().toISOString(),
      ...data
    }, 'live-push-event');
  } catch (error) {
    logger.warning(`broadcast live push event failed: ${error.message}`, 'broadcastLivePushEvent');
  }
}

function createListenIps() {
  const listenIp = String(process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0').trim();
  const announcedIp = String(process.env.MEDIASOUP_ANNOUNCED_IP || '').trim();

  const listenIps = [{ ip: listenIp }];
  if (announcedIp) {
    listenIps[0].announcedIp = announcedIp;
  }
  return listenIps;
}

function createRouterMediaCodecs() {
  return [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2
    },
    {
      kind: 'video',
      mimeType: 'video/VP8',
      clockRate: 90000
    },
    {
      kind: 'video',
      mimeType: 'video/H264',
      clockRate: 90000,
      parameters: {
        'packetization-mode': 1,
        'profile-level-id': '42e01f',
        'level-asymmetry-allowed': 1
      }
    }
  ];
}

class MediasoupService extends EventEmitter {
  constructor() {
    super();
    this.workerPromise = null;
    this.routerPromise = null;
    this.sessions = new Map();
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();
  }

  async getWorker() {
    if (!this.workerPromise) {
      this.workerPromise = mediasoup.createWorker({
        logLevel: process.env.MEDIASOUP_LOG_LEVEL || 'warn',
        logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp']
      });

      this.workerPromise.then((worker) => {
        worker.on('died', () => {
          logger.error(new Error('mediasoup worker died'), 'worker');
          this.workerPromise = null;
          this.routerPromise = null;
        });
      });
    }

    return this.workerPromise;
  }

  async getRouter() {
    if (!this.routerPromise) {
      this.routerPromise = (async () => {
        const worker = await this.getWorker();
        const router = await worker.createRouter({
          mediaCodecs: createRouterMediaCodecs()
        });
        logger.info('mediasoup router created', 'router');
        return router;
      })();
    }

    return this.routerPromise;
  }

  async createSession(sessionId = randomUUID()) {
    const router = await this.getRouter();
    let created = false;
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        createdAt: new Date().toISOString(),
        router,
        transportIds: new Set(),
        producerIds: new Set(),
        consumerIds: new Set()
      });
      created = true;
    }

    if (created) {
      broadcastLivePushEvent('session-created', {
        sessionId
      });
    }

    return this.getSessionState(sessionId);
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  async ensureSession(sessionId) {
    const currentSessionId = sessionId || randomUUID();
    return this.createSession(currentSessionId);
  }

  getSessionState(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      sessionId: session.id,
      createdAt: session.createdAt,
      transportCount: session.transportIds.size,
      producerCount: session.producerIds.size,
      consumerCount: session.consumerIds.size
    };
  }

  async getRouterRtpCapabilities() {
    const router = await this.getRouter();
    return router.rtpCapabilities;
  }

  async createWebRtcTransport(sessionId, options = {}) {
    const session = await this.ensureSession(sessionId);
    const router = this.sessions.get(session.sessionId).router;

    const transport = await router.createWebRtcTransport({
      listenIps: createListenIps(),
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: Number(process.env.MEDIASOUP_INITIAL_OUTGOING_BITRATE || 800000),
      appData: {
        sessionId: session.sessionId,
        direction: options.direction || 'send'
      }
    });

    const transportRecord = {
      id: transport.id,
      sessionId: session.sessionId,
      direction: options.direction || 'send',
      transport,
      createdAt: new Date().toISOString()
    };

    this.transports.set(transport.id, transportRecord);
    this.sessions.get(session.sessionId).transportIds.add(transport.id);

    transport.on('dtlsstatechange', (state) => {
      logger.info(`transport ${transport.id} dtls state ${state}`, 'transport');
      if (state === 'closed') {
        this.closeTransport(transport.id).catch((error) => {
          logger.warning(`failed to close transport ${transport.id}: ${error.message}`, 'transport');
        });
      }
    });

    transport.on('close', () => {
      this.transports.delete(transport.id);
      const ownedSession = this.sessions.get(session.sessionId);
      if (ownedSession) {
        ownedSession.transportIds.delete(transport.id);
      }
    });

    return {
      sessionId: session.sessionId,
      transportId: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
      iceState: transport.iceState,
      iceRole: transport.iceRole
    };
  }

  async connectTransport(transportId, dtlsParameters) {
    const record = this.transports.get(transportId);
    if (!record) {
      throw new Error(`transport not found: ${transportId}`);
    }

    await record.transport.connect({ dtlsParameters });
    return {
      transportId,
      connected: true,
      dtlsState: record.transport.dtlsState
    };
  }

  async produce(transportId, { kind, rtpParameters, appData = {} }) {
    const record = this.transports.get(transportId);
    if (!record) {
      throw new Error(`transport not found: ${transportId}`);
    }

    const producer = await record.transport.produce({
      kind,
      rtpParameters,
      appData: {
        ...appData,
        sessionId: record.sessionId
      }
    });

    this.producers.set(producer.id, {
      id: producer.id,
      sessionId: record.sessionId,
      transportId,
      kind,
      producer,
      createdAt: new Date().toISOString()
    });

    const session = this.sessions.get(record.sessionId);
    if (session) {
      session.producerIds.add(producer.id);
    }

    broadcastLivePushEvent('producer-created', {
      sessionId: record.sessionId,
      transportId,
      producerId: producer.id,
      kind: producer.kind,
      producerCount: session ? session.producerIds.size : 0
    });

    producer.on('close', () => {
      this.producers.delete(producer.id);
      const ownedSession = this.sessions.get(record.sessionId);
      if (ownedSession) {
        ownedSession.producerIds.delete(producer.id);
      }
    });

    producer.on('transportclose', () => {
      this.producers.delete(producer.id);
    });

    return {
      producerId: producer.id,
      kind: producer.kind,
      rtpParameters: producer.rtpParameters,
      appData: producer.appData
    };
  }

  async consume(transportId, { producerId, rtpCapabilities }) {
    const transportRecord = this.transports.get(transportId);
    if (!transportRecord) {
      throw new Error(`transport not found: ${transportId}`);
    }

    const producerRecord = this.producers.get(producerId);
    if (!producerRecord) {
      throw new Error(`producer not found: ${producerId}`);
    }

    const router = this.sessions.get(transportRecord.sessionId).router;
    if (!router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('router cannot consume producer with provided RTP capabilities');
    }

    const consumer = await transportRecord.transport.consume({
      producerId,
      rtpCapabilities,
      paused: true
    });

    this.consumers.set(consumer.id, {
      id: consumer.id,
      sessionId: transportRecord.sessionId,
      transportId,
      producerId,
      consumer,
      createdAt: new Date().toISOString()
    });

    const session = this.sessions.get(transportRecord.sessionId);
    if (session) {
      session.consumerIds.add(consumer.id);
    }

    consumer.on('close', () => {
      this.consumers.delete(consumer.id);
      const ownedSession = this.sessions.get(transportRecord.sessionId);
      if (ownedSession) {
        ownedSession.consumerIds.delete(consumer.id);
      }
    });

    consumer.on('transportclose', () => {
      this.consumers.delete(consumer.id);
    });

    return {
      consumerId: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused
    };
  }

  async resumeConsumer(consumerId) {
    const record = this.consumers.get(consumerId);
    if (!record) {
      throw new Error(`consumer not found: ${consumerId}`);
    }

    await record.consumer.resume();
    return {
      consumerId,
      resumed: true
    };
  }

  async closeTransport(transportId) {
    const record = this.transports.get(transportId);
    if (!record) {
      return false;
    }

    try {
      record.transport.close();
    } catch (error) {
      logger.warning(`close transport failed: ${error.message}`, 'transport');
    }

    this.transports.delete(transportId);
    const session = this.sessions.get(record.sessionId);
    if (session) {
      session.transportIds.delete(transportId);
    }
    return true;
  }

  async closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const consumerIds = Array.from(session.consumerIds);
    const producerIds = Array.from(session.producerIds);
    const transportIds = Array.from(session.transportIds);

    for (const consumerId of consumerIds) {
      const consumerRecord = this.consumers.get(consumerId);
      if (consumerRecord) {
        try {
          consumerRecord.consumer.close();
        } catch (error) {
          logger.warning(`close consumer failed: ${error.message}`, 'consumer');
        }
      }
    }

    for (const producerId of producerIds) {
      const producerRecord = this.producers.get(producerId);
      if (producerRecord) {
        try {
          producerRecord.producer.close();
        } catch (error) {
          logger.warning(`close producer failed: ${error.message}`, 'producer');
        }
      }
    }

    for (const transportId of transportIds) {
      await this.closeTransport(transportId);
    }

    this.sessions.delete(sessionId);

    broadcastLivePushEvent('session-closed', {
      sessionId,
      producerCount: producerIds.length,
      transportCount: transportIds.length
    });

    return true;
  }

  listSessions() {
    return Array.from(this.sessions.values()).map((session) => this.getSessionState(session.id));
  }

  listProducers(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    return Array.from(session.producerIds)
      .map((producerId) => this.producers.get(producerId))
      .filter(Boolean)
      .map((record) => ({
        producerId: record.id,
        kind: record.kind,
        transportId: record.transportId,
        createdAt: record.createdAt,
        appData: record.producer?.appData || {}
      }));
  }
}

module.exports = new MediasoupService();