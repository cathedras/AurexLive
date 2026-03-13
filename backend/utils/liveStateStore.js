const fs = require('fs');
const path = require('path');

const { liveStateJsonPath } = require('../config/paths');

const defaultLiveState = {
  playbackCommandId: 0,
  playbackAction: 'none',
  effectCommandId: 0,
  effectName: '',
  cameraImageData: '',
  cameraUpdatedAt: null,
  updatedAt: null,
  backendPlayback: {
    available: false,
    driver: '',
    canPause: false,
    state: 'idle',
    errorMessage: '',
    currentTrack: null,
    progress: {
      isAvailable: false,
      positionSec: 0,
      durationSec: null,
      progressPercent: 0,
      startedAt: null,
      pausedAt: null,
      updatedAt: null,
    },
    updatedAt: null,
  },
};

function ensureLiveStateFile() {
  const runtimeDir = path.dirname(liveStateJsonPath);
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }

  if (fs.existsSync(liveStateJsonPath)) {
    return;
  }

  const initial = {
    ...defaultLiveState,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(liveStateJsonPath, JSON.stringify(initial, null, 2), 'utf-8');
}

function normalizeLiveState(parsed = {}) {
  return {
    ...defaultLiveState,
    ...parsed,
    backendPlayback: {
      ...defaultLiveState.backendPlayback,
      ...(parsed?.backendPlayback || {}),
    },
  };
}

function readLiveState() {
  ensureLiveStateFile();
  const rawText = fs.readFileSync(liveStateJsonPath, 'utf-8');
  return normalizeLiveState(JSON.parse(rawText));
}

function writeLiveState(nextState) {
  const output = normalizeLiveState({
    ...nextState,
    updatedAt: new Date().toISOString(),
    backendPlayback: {
      ...(nextState?.backendPlayback || {}),
      updatedAt: new Date().toISOString(),
    },
  });

  fs.writeFileSync(liveStateJsonPath, JSON.stringify(output, null, 2), 'utf-8');
  return output;
}

function updateBackendPlaybackState(partialState) {
  const prev = readLiveState();
  return writeLiveState({
    ...prev,
    backendPlayback: {
      ...prev.backendPlayback,
      ...partialState,
      updatedAt: new Date().toISOString(),
    },
  });
}

module.exports = {
  defaultLiveState,
  ensureLiveStateFile,
  readLiveState,
  writeLiveState,
  updateBackendPlaybackState,
};