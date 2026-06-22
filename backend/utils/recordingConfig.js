/**
 * Centralized recording format configuration.
 *
 * Priority:
 *   1. RECORDING_FORMAT env var (e.g. RECORDING_FORMAT=flac)
 *   2. runtime/user_settings.json → recording.format
 *   3. Default: mp3
 *
 * Each format preset defines codec, codecArgs, mimeType, and extension.
 */
const fs = require('fs');
const path = require('path');
const { runtimeConfigDir } = require('../config/paths');

const FORMAT_PRESETS = {
  mp3: {
    format: 'mp3',
    codec: 'libmp3lame',
    codecArgs: ['-q:a', '2'],
    mimeType: 'audio/mpeg',
    extension: 'mp3',
  },
  flac: {
    format: 'flac',
    codec: 'flac',
    codecArgs: ['-compression_level', '12'],
    mimeType: 'audio/flac',
    extension: 'flac',
  },
  wav: {
    format: 'wav',
    codec: 'pcm_s16le',
    codecArgs: [],
    mimeType: 'audio/wav',
    extension: 'wav',
  },
  aac: {
    format: 'aac',
    codec: 'aac',
    codecArgs: ['-b:a', '192k'],
    mimeType: 'audio/aac',
    extension: 'aac',
  },
  ogg: {
    format: 'ogg',
    codec: 'libvorbis',
    codecArgs: ['-q:a', '4'],
    mimeType: 'audio/ogg',
    extension: 'ogg',
  },
};

const DEFAULT_FORMAT = 'mp3';
const RECORDING_FORMAT_ENV_KEY = 'RECORDING_FORMAT';

/**
 * Attempt to read recording.format from runtime/user_settings.json.
 * Returns null if the file is missing, unreadable, or has no recording.format.
 */
function readSettingsFormat() {
  try {
    const settingsPath = path.join(runtimeConfigDir, 'user_settings.json');
    if (!fs.existsSync(settingsPath)) return null;

    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const fmt = parsed?.recording?.format;
    return typeof fmt === 'string' && fmt.trim() ? fmt.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the active recording format key.
 * Priority: env var > user_settings.json > DEFAULT_FORMAT.
 */
function resolveFormatKey() {
  const envFormat = process.env[RECORDING_FORMAT_ENV_KEY];
  if (envFormat && typeof envFormat === 'string' && envFormat.trim()) {
    const key = envFormat.trim().toLowerCase();
    if (FORMAT_PRESETS[key]) return key;
  }

  const settingsFormat = readSettingsFormat();
  if (settingsFormat && FORMAT_PRESETS[settingsFormat]) return settingsFormat;

  return DEFAULT_FORMAT;
}

/**
 * Get the full recording format definition.
 *
 * @returns {{ format: string, codec: string, codecArgs: string[], mimeType: string, extension: string }}
 */
function getRecordingFormat() {
  const key = resolveFormatKey();
  return { ...FORMAT_PRESETS[key] };
}

/**
 * List all available format keys.
 */
function listFormats() {
  return Object.keys(FORMAT_PRESETS);
}

/**
 * Build a recording file name with the configured extension.
 * @param {string} prefix - e.g. 'recording' or 'auto-recording'
 * @param {string} [timestamp] - ISO string (defaults to now)
 * @returns {string} e.g. 'recording-2026-06-22T12-00-00-000Z.mp3'
 */
function buildRecordingFileName(prefix = 'recording', timestamp) {
  const ts = timestamp || new Date().toISOString().replace(/[:.]/g, '-');
  const ext = getRecordingFormat().extension;
  return `${prefix}-${ts}.${ext}`;
}

module.exports = {
  FORMAT_PRESETS,
  DEFAULT_FORMAT,
  getRecordingFormat,
  listFormats,
  buildRecordingFileName,
  readSettingsFormat,
};
