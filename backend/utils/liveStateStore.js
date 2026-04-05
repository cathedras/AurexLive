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
    volumePercent: 100,
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

function writeLiveStateFileAtomic(nextState) {
  const runtimeDir = path.dirname(liveStateJsonPath);
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }

  const tempPath = `${liveStateJsonPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  const serialized = JSON.stringify(nextState, null, 2);

  try {
    fs.writeFileSync(tempPath, serialized, 'utf-8');
    try {
      fs.renameSync(tempPath, liveStateJsonPath);
    } catch (renameError) {
      try {
        fs.writeFileSync(liveStateJsonPath, serialized, 'utf-8');
      } catch (fallbackError) {
        throw fallbackError;
      }
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // ignore cleanup failure
      }
      return;
    }
  } finally {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // ignore cleanup failure
    }
  }
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
  try {
    const rawText = fs.readFileSync(liveStateJsonPath, 'utf-8');
    return normalizeLiveState(JSON.parse(rawText));
  } catch (error) {
    const backupPath = `${liveStateJsonPath}.corrupt-${Date.now()}`;
    try {
      if (fs.existsSync(liveStateJsonPath)) {
        fs.renameSync(liveStateJsonPath, backupPath);
      }
    } catch {
      // ignore backup failure
    }

    const repaired = {
      ...defaultLiveState,
      updatedAt: new Date().toISOString(),
    };
    writeLiveStateFileAtomic(repaired);
    return repaired;
  }
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

  try {
    writeLiveStateFileAtomic(output);
  } catch {
    // preserve runtime stability even when the JSON file is temporarily unavailable
  }
  return output;
}

function updateBackendPlaybackState(partialState) {
  try {
    const prev = readLiveState();
    return writeLiveState({
      ...prev,
      backendPlayback: {
        ...prev.backendPlayback,
        ...partialState,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch {
    return normalizeLiveState({
      ...defaultLiveState,
      updatedAt: new Date().toISOString(),
      backendPlayback: {
        ...defaultLiveState.backendPlayback,
        ...partialState,
        updatedAt: new Date().toISOString(),
      },
    });
  }
}

module.exports = {
  defaultLiveState,
  ensureLiveStateFile,
  readLiveState,
  writeLiveState,
  updateBackendPlaybackState,
};