const express = require('express');
const os = require('os');
const QRCode = require('qrcode');

const {
  mobileCameraHtmlPath,
  mobileControlHtmlPath
} = require('../config/paths');

const router = express.Router();

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
  return res.sendFile(mobileCameraHtmlPath);
});

router.get('/control', (req, res) => {
  return res.sendFile(mobileControlHtmlPath);
});

router.get('/links', async (req, res) => {
  try {
    const localIp = getLocalIpAddress();
    const baseUrl = `http://${localIp}:3000`;
    const cameraUrl = `${baseUrl}/v1/mobile/camera`;
    const controlUrl = `${baseUrl}/v1/mobile/control`;

    const [cameraQr, controlQr] = await Promise.all([
      buildQrDataUrl(cameraUrl),
      buildQrDataUrl(controlUrl)
    ]);

    return res.json({
      success: true,
      baseUrl,
      links: {
        camera: cameraUrl,
        control: controlUrl
      },
      qrs: {
        camera: cameraQr,
        control: controlQr
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `生成二维码失败：${error.message}` });
  }
});

module.exports = router;