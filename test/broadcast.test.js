const assert = require('assert');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

// Use same WS wiring used by server
const initWebSocket = require('../backend/wsServer');
const wsClientService = require('../backend/services/wsClientService');

describe('WebSocket broadcast', function() {
  this.timeout(5000);
  let server;
  const port = 3010;

  before((done) => {
    const app = express();
    server = http.createServer(app);
    initWebSocket(server);
    server.listen(port, done);
  });

  after((done) => {
    try { server.close(done); } catch (e) { done(); }
  });

  it('delivers broadcastVolume to connected client', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/`);
    let gotClientId = false;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'clientId') {
          gotClientId = true;
          // trigger broadcast to all clients
          wsClientService.broadcastVolume({ volume: 55 });
          return;
        }
        if (msg.type === 'volume') {
          assert.strictEqual(msg.data.volume, 55);
          ws.close();
          return done();
        }
      } catch (e) {
        return done(e);
      }
    });

    ws.on('open', () => {});
    ws.on('error', (err) => done(err));
  });
});
