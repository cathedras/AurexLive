import { apiGet, apiPost } from '../apiClientUtil'

export async function fetchBackendPlaybackState() {
  return await apiGet('/v1/music/backend-state')
}

export async function controlBackendPlayback(action) {
  return await apiPost('/v1/music/backend-control', { action })
}

export async function updateBackendVolume(volume) {
  return await apiPost('/v1/music/backend-volume', { volume })
}