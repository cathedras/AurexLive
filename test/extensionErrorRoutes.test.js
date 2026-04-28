const assert = require('assert');
const http = require('http');

const express = require('express');

const { createExtensionErrorRouter } = require('../backend/routes/extensionErrorRoutes');

function requestJson(port, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      } : {},
    }, (response) => {
      let rawBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        rawBody += chunk;
      });
      response.on('end', () => {
        try {
          resolve({
            statusCode: response.statusCode,
            body: rawBody ? JSON.parse(rawBody) : null,
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

describe('Extension error routes', function() {
  this.timeout(5000);

  let server;
  let port;
  const logEntries = [];

  before((done) => {
    const app = express();
    app.use(express.json());
    app.use('/v1/extension-error', createExtensionErrorRouter({
      logger: {
        error: (...args) => {
          logEntries.push(args);
        }
      }
    }));

    server = http.createServer(app);
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  after((done) => {
    try {
      server.close(done);
    } catch (error) {
      done(error);
    }
  });

  it('normalizes and logs extension exceptions', async () => {
    const response = await requestJson(port, 'POST', '/v1/extension-error', {
      source: 'wechat-web-extension',
      component: 'content-script',
      stage: 'upload-media',
      severity: 'error',
      message: 'Extension context invalidated',
      stack: 'Error: Extension context invalidated\n    at content-script.js:1:1',
      page: 'https://szfilehelper.weixin.qq.com/',
      meta: {
        intentId: 'intent-123',
        fileName: 'test.mp3'
      }
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.body.success, true);
    assert.strictEqual(logEntries.length, 1);
    const [label, report] = logEntries[0];
    assert.strictEqual(label, '[ExtensionError]');
    assert.strictEqual(report.source, 'wechat-web-extension');
    assert.strictEqual(report.component, 'content-script');
    assert.strictEqual(report.stage, 'upload-media');
    assert.strictEqual(report.message, 'Extension context invalidated');
    assert.strictEqual(report.page, 'https://szfilehelper.weixin.qq.com/');
    assert.deepStrictEqual(report.meta, {
      intentId: 'intent-123',
      fileName: 'test.mp3'
    });
  });
});