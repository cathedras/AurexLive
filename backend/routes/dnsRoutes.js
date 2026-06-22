const express = require('express');
const path = require('path');
const { readDnsStatus, getLocalFallbackAddress } = require('../utils/dnsStatusStore');

const router = express.Router();
const projectRoot = path.resolve(__dirname, '..', '..');

router.get('/status', (req, res) => {
  try {
    const status = readDnsStatus(projectRoot, {
      useHttps: process.env.USE_HTTPS,
      port: process.env.PORT || 3000,
    });

    return res.json({
      success: true,
      status: {
        ...status,
        availableAddress: status.availableAddress || getLocalFallbackAddress({
          useHttps: process.env.USE_HTTPS,
          port: process.env.PORT || 3000,
        }),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to read DNS status: ${error.message}`,
    });
  }
});

module.exports = router;