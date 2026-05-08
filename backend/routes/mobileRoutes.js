const express = require('express');
const os = require('os');
const QRCode = require('qrcode');

const router = express.Router();

const configuredMobileBaseUrl = String(process.env.MOBILE_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim();
const useViteDevServer = process.env.NODE_ENV !== 'production' && process.env.USE_VITE_DEV_SERVER !== '0';
const explicitHttpsEnabled = ['1', 'true', 'yes'].includes(String(process.env.USE_HTTPS || '').trim().toLowerCase());

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function isLocalhostHost(host) {
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(String(host || '').trim());
}

function getRequestScheme(req) {
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  if (forwardedProto === 'http' || forwardedProto === 'https') {
    return forwardedProto;
  }

  if (req.secure) {
    return 'https';
  }

  return explicitHttpsEnabled ? 'https' : 'http';
}

function getDevServerUrl(localIp) {
  const configuredUrl = normalizeBaseUrl(process.env.FRONTEND_DEV_SERVER_URL || 'https://localhost:5173');

  try {
    const parsed = new URL(configuredUrl);
    if (isLocalhostHost(parsed.host)) {
      parsed.hostname = localIp;
      return parsed.toString().replace(/\/$/, '');
    }
    return configuredUrl;
  } catch {
    return `https://${localIp}:5173`;
  }
}

function getMobileBaseUrl(req, localIp) {
  if (configuredMobileBaseUrl) {
    return normalizeBaseUrl(configuredMobileBaseUrl);
  }

  if (useViteDevServer) {
    return getDevServerUrl(localIp);
  }

  const host = String(req.get('host') || '').trim();
  const scheme = getRequestScheme(req);

  if (host) {
    if (isLocalhostHost(host)) {
      const portMatch = host.match(/:(\d+)$/);
      const port = portMatch ? `:${portMatch[1]}` : '';
      return `${scheme}://${localIp}${port}`;
    }

    return `${scheme}://${host}`;
  }

  return `${scheme}://${localIp}:3000`;
}

function getMobilePageUrl(req, localIp, pagePath) {
  const normalizedPagePath = String(pagePath || '').startsWith('/') ? String(pagePath || '') : `/${String(pagePath || '')}`;
  return `${getMobileBaseUrl(req, localIp)}${normalizedPagePath}`;
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
  const liveStreamUrl = getMobilePageUrl(req, localIp, '/page/live-stream');
  return res.redirect(liveStreamUrl);
});

router.get('/control', (req, res) => {
  const localIp = getLocalIpAddress();
  const controlPageUrl = getMobilePageUrl(req, localIp, '/page/mobile-control');
  return res.redirect(controlPageUrl);
});

router.get('/links', async (req, res) => {
  try {
    const localIp = getLocalIpAddress();
    const baseUrl = getMobileBaseUrl(req, localIp);
    const cameraUrl = getMobilePageUrl(req, localIp, '/page/live-stream');
    const controlUrl = getMobilePageUrl(req, localIp, '/page/mobile-control');
    const liveStreamUrl = getMobilePageUrl(req, localIp, '/page/live-stream');

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