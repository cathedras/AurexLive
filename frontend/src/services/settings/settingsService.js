import { apiGet, apiPost } from '../apiClientUtil'

export async function fetchSettings() {
  return await apiGet('/v1/settings')
}

export async function saveSettings(settings) {
  return await apiPost('/v1/settings', { settings })
}