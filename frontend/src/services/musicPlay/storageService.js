const PLAYLIST_LOCK_STORAGE_KEY = 'music-page-playlist-locked'

export function readPlaylistLockState() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(PLAYLIST_LOCK_STORAGE_KEY) === 'true'
}

export function persistPlaylistLockState(locked) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(PLAYLIST_LOCK_STORAGE_KEY, locked ? 'true' : 'false')
}