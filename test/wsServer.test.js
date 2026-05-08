const assert = require('assert');
const initWebSocket = require('../backend/wsServer');

const { normalizeClientType } = initWebSocket;
const { parseWebSocketRequest } = initWebSocket;

describe('normalizeClientType', function() {
  it('extracts client type from the new pathname format', () => {
    assert.strictEqual(normalizeClientType('/volume?param=%7B%7D'), 'volume');
    assert.strictEqual(normalizeClientType('/recording?param=abc'), 'recording');
  });

  it('keeps backward compatibility with the old ws prefix', () => {
    assert.strictEqual(normalizeClientType('/ws/volume?param=%7B%7D'), 'volume');
    assert.strictEqual(normalizeClientType('/ws'), 'default');
  });

  it('keeps backward compatibility with the old wss prefix', () => {
    assert.strictEqual(normalizeClientType('/wss/volume?param=%7B%7D'), 'volume');
    assert.strictEqual(normalizeClientType('/wss'), 'default');
  });

  it('accepts a full websocket url when present', () => {
    assert.strictEqual(normalizeClientType('wss://localhost:3000/volume?param=%7B%7D'), 'volume');
  });

  it('parses the websocket param query as JSON when possible', () => {
    const context = parseWebSocketRequest('wss://localhost:3000/live-stream?param=%7B%22sessionId%22%3A%22abc%22%7D');

    assert.strictEqual(context.clientType, 'live-stream');
    assert.deepStrictEqual(context.param, { sessionId: 'abc' });
  });

  it('keeps plain string param values when they are not JSON', () => {
    const context = parseWebSocketRequest('/volume?param=device-1');

    assert.strictEqual(context.clientType, 'volume');
    assert.strictEqual(context.param, 'device-1');
  });
});
