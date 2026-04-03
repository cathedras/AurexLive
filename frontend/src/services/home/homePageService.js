import { apiGet } from '../apiClientUtil'

export async function fetchMobileLinks() {
  return await apiGet('/v1/mobile/links')
}

export async function fetchUserSettings() {
  return await apiGet('/v1/settings')
}

export async function fetchCurrentShowState() {
  return await apiGet('/v1/music/show/current-state')
}