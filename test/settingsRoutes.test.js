const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const express = require('express');

const { createSettingsRouter } = require('../backend/routes/settingsRoutes');

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

describe('Settings routes', function() {
  this.timeout(5000);

  let server;
  let tempDir;
  let userSettingsPath;
  let port;

  before((done) => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filetransfer-settings-'));
    userSettingsPath = path.join(tempDir, 'user_settings.json');

    const app = express();
    app.use(express.json());
    app.use('/v1/settings', createSettingsRouter({ userSettingsPath }));

    server = http.createServer(app);
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  after((done) => {
    try {
      server.close(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        done();
      });
    } catch (error) {
      done(error);
    }
  });

  it('returns default WeChat import settings when the settings file is created', async () => {
    const response = await requestJson(port, 'GET', '/v1/settings');

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.body.success, true);
    assert.deepStrictEqual(response.body.settings.wechatImport.allowedExtensions, ['mp3', 'wav', 'm4a', 'mp4', 'mov', 'mkv']);
    assert.strictEqual(response.body.settings.wechatImport.maxFileSizeMb, 100);
  });

  it('accepts a file whose extension matches the configured WeChat import list', async () => {
    await requestJson(port, 'POST', '/v1/settings', {
      settings: {
        wechatImport: {
          allowedExtensions: ['mp3', 'wav'],
          maxFileSizeMb: 20,
        },
      },
    });

    const response = await requestJson(port, 'POST', '/v1/settings/wechat-import/validate', {
      fileName: 'sample-track.mp3',
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.allowed, true);
    assert.deepStrictEqual(response.body.reasons, []);
  });

  it('rejects a file when the size is larger than the configured WeChat import limit', async () => {
    await requestJson(port, 'POST', '/v1/settings', {
      settings: {
        wechatImport: {
          allowedExtensions: ['mp3'],
          maxFileSizeMb: 1,
        },
      },
    });

    const response = await requestJson(port, 'POST', '/v1/settings/wechat-import/validate', {
      fileName: 'large-audio.mp3',
      fileSize: 2 * 1024 * 1024,
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.allowed, false);
    assert.match(response.body.reasons[0], /larger than the configured limit/i);
  });
});