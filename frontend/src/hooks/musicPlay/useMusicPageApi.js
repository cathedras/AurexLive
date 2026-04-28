import { useMemo } from 'react'

import {
  closeCurrentShow,
  controlBackendPlayback,
  createRuntimeTrack,
  deleteHistoryShow,
  exportProgramSheetPdf,
  fetchBackendPlaybackState,
  fetchCurrentShowState,
  fetchHistoryShows,
  fetchMusicList,
  fetchPreviewSource,
  playBackendTrack,
  reportClientError,
  saveMusicList,
  switchToHistoryShow,
  updateBackendVolume,
  updateCurrentProgram,
  updateCurrentShowLock,
} from '../../services/musicPlay/musicApiService'
import { generateHostScriptSuggestions, refineSpeechText } from '../../services/musicPlay/aiService'
import { fetchSettings as fetchUserSettings } from '../../services/settings/settingsService'

export function useMusicPageApi() {
  return useMemo(() => ({
    closeCurrentShow,
    controlBackendPlayback,
    createRuntimeTrack,
    deleteHistoryShow,
    exportProgramSheetPdf,
    fetchBackendPlaybackState,
    fetchCurrentShowState,
    fetchHistoryShows,
    fetchMusicList,
    fetchPreviewSource,
    fetchUserSettings,
    generateHostScriptSuggestions,
    playBackendTrack,
    refineSpeechText,
    reportClientError,
    saveMusicList,
    switchToHistoryShow,
    updateBackendVolume,
    updateCurrentProgram,
    updateCurrentShowLock,
  }), [])
}