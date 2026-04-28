const express = require('express');
const fs = require('fs');
const path = require('path');

const { userSettingsJsonPath } = require('../config/paths');

const DEFAULT_WECHAT_IMPORT_EXTENSIONS = ['mp3', 'wav', 'm4a', 'mp4', 'mov', 'mkv'];

const defaultSettings = {
  profile: {
    displayName: '',
    avatarUrl: '',
    phone: '',
    email: ''
  },
  preferences: {
    theme: 'light',
    fontScale: 100,
    marqueeSpeed: 16
  },
  speech: {
    mode: 'ai',
    language: 'zh-CN',
    offlineFallback: true
  },
  ai: {
    enabled: true,
    showModelHint: true
  },
  wechatImport: {
    allowedExtensions: DEFAULT_WECHAT_IMPORT_EXTENSIONS,
    maxFileSizeMb: 100
  },
  updatedAt: null
};

function normalizeAllowedExtensions(input) {
  const source = Array.isArray(input) ? input : DEFAULT_WECHAT_IMPORT_EXTENSIONS;
  const normalized = source
    .map((item) => String(item || '').trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : DEFAULT_WECHAT_IMPORT_EXTENSIONS;
}

function normalizeMaxFileSizeMb(input) {
  const numericValue = Number(input);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : defaultSettings.wechatImport.maxFileSizeMb;
}

function mergeSettings(input = {}) {
  const preferencesInput = input.preferences || {};
  const wechatImportInput = input.wechatImport || {};

  return {
    profile: {
      ...defaultSettings.profile,
      ...(input.profile || {})
    },
    preferences: {
      theme: preferencesInput.theme || defaultSettings.preferences.theme,
      fontScale: Number(preferencesInput.fontScale || defaultSettings.preferences.fontScale),
      marqueeSpeed: Number(preferencesInput.marqueeSpeed || defaultSettings.preferences.marqueeSpeed)
    },
    speech: {
      ...defaultSettings.speech,
      ...(input.speech || {})
    },
    ai: {
      ...defaultSettings.ai,
      ...(input.ai || {})
    },
    wechatImport: {
      allowedExtensions: normalizeAllowedExtensions(wechatImportInput.allowedExtensions),
      maxFileSizeMb: normalizeMaxFileSizeMb(wechatImportInput.maxFileSizeMb)
    },
    updatedAt: input.updatedAt || null
  };
}

function ensureSettingsFile(settingsPath) {
  if (fs.existsSync(settingsPath)) {
    return;
  }

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const initial = {
    ...defaultSettings,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(settingsPath, JSON.stringify(initial, null, 2), 'utf-8');
}

function readSettings(settingsPath) {
  ensureSettingsFile(settingsPath);
  const rawText = fs.readFileSync(settingsPath, 'utf-8');
  const parsed = JSON.parse(rawText);
  return mergeSettings(parsed);
}

function writeSettings(settingsPath, nextSettings) {
  const output = mergeSettings(nextSettings);
  output.updatedAt = new Date().toISOString();
  fs.writeFileSync(settingsPath, JSON.stringify(output, null, 2), 'utf-8');
  return output;
}

function validateWechatImport(settings, fileName, fileSize) {
  const reasons = [];
  const normalizedFileName = String(fileName || '').trim();

  if (!normalizedFileName) {
    reasons.push('File name is required for WeChat import validation.');
    return { allowed: false, reasons };
  }

  const extension = path.extname(normalizedFileName).toLowerCase().replace(/^\./, '');
  const allowedExtensions = settings.wechatImport.allowedExtensions;
  if (!extension || !allowedExtensions.includes(extension)) {
    reasons.push(`File type .${extension || 'unknown'} is not allowed by the current WeChat import settings.`);
  }

  if (fileSize != null) {
    const numericSize = Number(fileSize);
    const maxFileSizeBytes = settings.wechatImport.maxFileSizeMb * 1024 * 1024;
    if (!Number.isFinite(numericSize) || numericSize < 0) {
      reasons.push('File size must be a non-negative number when provided.');
    } else if (numericSize > maxFileSizeBytes) {
      reasons.push(`File size is larger than the configured limit of ${settings.wechatImport.maxFileSizeMb} MB.`);
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    normalized: {
      extension,
      fileName: normalizedFileName,
      fileSize: fileSize == null ? null : Number(fileSize),
      maxFileSizeMb: settings.wechatImport.maxFileSizeMb,
      allowedExtensions,
    },
  };
}

function createSettingsRouter(options = {}) {
  const settingsPath = options.userSettingsPath || userSettingsJsonPath;
  const router = express.Router();

  router.get('/', (req, res) => {
    try {
      const settings = readSettings(settingsPath);
      return res.json({
        success: true,
        settings
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `Failed to read settings: ${error.message}`
      });
    }
  });

  router.post('/', (req, res) => {
    try {
      const nextSettings = mergeSettings(req.body?.settings || {});
      const settings = writeSettings(settingsPath, nextSettings);

      return res.json({
        success: true,
        message: 'Settings saved successfully.',
        settings
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `Failed to save settings: ${error.message}`
      });
    }
  });

  router.post('/wechat-import/validate', (req, res) => {
    try {
      const settings = readSettings(settingsPath);
      const validation = validateWechatImport(settings, req.body?.fileName, req.body?.fileSize);

      return res.json({
        success: true,
        allowed: validation.allowed,
        reasons: validation.reasons,
        normalized: validation.normalized,
        settings: settings.wechatImport,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `Failed to validate WeChat import settings: ${error.message}`
      });
    }
  });

  return router;
}

module.exports = createSettingsRouter();
module.exports.createSettingsRouter = createSettingsRouter;
module.exports.defaultSettings = defaultSettings;
module.exports.mergeSettings = mergeSettings;
module.exports.validateWechatImport = validateWechatImport;
