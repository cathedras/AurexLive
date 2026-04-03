import { createContext, createElement, useContext, useMemo } from 'react'
import httpClient, { apiGet, apiPost } from '../utils/http'

const MusicPageApiContext = createContext(null)

export function MusicPageApiProvider({ children }) {
  const value = useMemo(() => ({
    fetchBackendPlaybackState: async () => apiGet('/v1/music/backend-state'),
    fetchHistoryShows: async () => apiGet('/v1/music/shows'),
    switchToHistoryShow: async (fileName, clearCurrentProgram = true) => apiPost('/v1/music/show/current', {
      fileName,
      clearCurrentProgram,
    }),
    closeCurrentShow: async () => apiPost('/v1/music/show/current/close', {}),
    deleteHistoryShow: async (fileName) => httpClient.delete(`/v1/music/show/${encodeURIComponent(fileName)}`).then((response) => response.data),
    updateCurrentShowLock: async (locked) => apiPost('/v1/music/show/current-lock', { locked }),
    reportClientError: async (payload) => apiPost('/v1/client-error', payload),
    fetchUserSettings: async () => apiGet('/v1/settings'),
    fetchCurrentShowState: async () => apiGet('/v1/music/show/current-state'),
    fetchMusicList: async () => apiGet('/v1/music/musiclist'),
    createRuntimeTrack: async (payload) => apiPost('/v1/music/musiclist/runtime-track', payload),
    updateCurrentProgram: async (payload) => apiPost('/v1/music/show/current-program', payload),
    playBackendTrack: async (payload) => apiPost('/v1/music/backend-play', payload),
    controlBackendPlayback: async (action) => apiPost('/v1/music/backend-control', { action }),
    updateBackendVolume: async (volume) => apiPost('/v1/music/backend-volume', { volume }),
    fetchPreviewSource: async (fileName) => apiPost('/v1/music/preview-source', { fileName }),
    refineSpeechText: async (payload) => apiPost('/v1/ai/speech-refine-text', payload),
    saveMusicList: async (payload) => apiPost('/v1/music/musiclist/save', payload),
    generateHostScriptSuggestions: async (payload) => apiPost('/v1/ai/host-script-suggestions', payload),
    exportProgramSheetPdf: async (payload) => {
      const response = await httpClient.post('/v1/music/musiclist/export-pdf', payload, {
        responseType: 'blob',
      })

      return response.data
    },
  }), [])

  return createElement(MusicPageApiContext.Provider, { value }, children)
}

export function useMusicPageApi() {
  const context = useContext(MusicPageApiContext)

  if (!context) {
    throw new Error('useMusicPageApi 必须在 MusicPageApiProvider 内使用')
  }

  return context
}