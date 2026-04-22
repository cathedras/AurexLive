const express = require('express');
const fs = require('fs');

const { userSettingsJsonPath } = require('../config/paths');

const router = express.Router();

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
  updatedAt: null
};

function mergeSettings(input = {}) {
  const preferencesInput = input.preferences || {};

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
    updatedAt: input.updatedAt || null
  };
}

function ensureSettingsFile() {
  if (fs.existsSync(userSettingsJsonPath)) {
    return;
  }

  const initial = {
    ...defaultSettings,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(userSettingsJsonPath, JSON.stringify(initial, null, 2), 'utf-8');
}

function readSettings() {
  ensureSettingsFile();
  const rawText = fs.readFileSync(userSettingsJsonPath, 'utf-8');
  const parsed = JSON.parse(rawText);
  return mergeSettings(parsed);
}

function writeSettings(nextSettings) {
  const output = mergeSettings(nextSettings);
  output.updatedAt = new Date().toISOString();
  fs.writeFileSync(userSettingsJsonPath, JSON.stringify(output, null, 2), 'utf-8');
  return output;
}

router.get('/', (req, res) => {
  try {
    const settings = readSettings();
    return res.json({
      success: true,
      settings
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `读取设置失败：${error.message}`
    });
  }
});

router.post('/', (req, res) => {
  try {
    const nextSettings = mergeSettings(req.body?.settings || {});
    const settings = writeSettings(nextSettings);

    return res.json({
      success: true,
      message: '设置保存成功',
      settings
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `保存设置失败：${error.message}`
    });
  }
});

module.exports = router;
