const express = require('express');
const os = require('os');
const QRCode = require('qrcode');

const router = express.Router();

function getFrontendDevServerUrl(localIp) {
  const configuredUrl = String(process.env.FRONTEND_DEV_SERVER_URL || 'https://localhost:5173').trim();

  if (process.env.NODE_ENV === 'production' || process.env.USE_VITE_DEV_SERVER === '0') {
    return configuredUrl;
  }

  try {
    const parsed = new URL(configuredUrl);
    if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
      parsed.hostname = localIp;
      return parsed.toString().replace(/\/$/, '');
    }
    return configuredUrl;
  } catch {
    return `https://${localIp}:5173`;
  }
}

function getFrontendPageUrl(localIp, pagePath) {
  const normalizedPagePath = String(pagePath || '').startsWith('/') ? String(pagePath || '') : `/${String(pagePath || '')}`;

  if (process.env.NODE_ENV === 'production' || process.env.USE_VITE_DEV_SERVER === '0') {
    return `http://${localIp}:3000${normalizedPagePath}`;
  }

  return `${getFrontendDevServerUrl(localIp)}${normalizedPagePath}`;
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const item of interfaces[name] || []) {
      if (item.family === 'IPv4' && !item.internal) {
        return item.address;
      }
    }
  }
  return '127.0.0.1';
}

async function buildQrDataUrl(text) {
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 220
  });
}

router.get('/camera', (req, res) => {
  const localIp = getLocalIpAddress();
  const liveStreamUrl = getFrontendPageUrl(localIp, '/page/live-stream');
  return res.redirect(liveStreamUrl);
});

router.get('/control', (req, res) => {
  const localIp = getLocalIpAddress();
  const controlPageUrl = getFrontendPageUrl(localIp, '/page/mobile-control');
  return res.redirect(controlPageUrl);
});

router.get('/links', async (req, res) => {
  try {
    const localIp = getLocalIpAddress();
    const baseUrl = `http://${localIp}:3000`;
    const cameraUrl = getFrontendPageUrl(localIp, '/page/live-stream');
    const controlUrl = getFrontendPageUrl(localIp, '/page/mobile-control');
    const liveStreamUrl = getFrontendPageUrl(localIp, '/page/live-stream');

    const [cameraQr, controlQr, liveStreamQr] = await Promise.all([
      buildQrDataUrl(cameraUrl),
      buildQrDataUrl(controlUrl),
      buildQrDataUrl(liveStreamUrl)
    ]);

    return res.json({
      success: true,
      baseUrl,
      links: {
        camera: cameraUrl,
        control: controlUrl,
        liveStream: liveStreamUrl
      },
      qrs: {
        camera: cameraQr,
        control: controlQr,
        liveStream: liveStreamQr
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `Failed to generate QR codes: ${error.message}` });
  }
});

module.exports = router;