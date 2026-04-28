import { apiGet, apiPost } from '../apiClientUtil'
import { API_ENDPOINTS } from '../webApiConfig'

export async function fetchBackendPlaybackState() {
  return await apiGet(API_ENDPOINTS.music.backendState)
}

export async function controlBackendPlayback(action) {
  return await apiPost(API_ENDPOINTS.music.backendControl, { action })
}

export async function updateBackendVolume(volume) {
  return await apiPost(API_ENDPOINTS.music.backendVolume, { volume })
}