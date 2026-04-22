import { getPreferredLanguage, localizeText } from '../../utils/language'

export function mergeRuntimeSettings(input = {}) {
  const preferencesInput = input.preferences || {}

  return {
    preferences: {
      marqueeSpeed: Number(preferencesInput.marqueeSpeed || 16),
      fontScale: Number(preferencesInput.fontScale || 100),
    },
    speech: {
      mode: 'ai',
      language: 'zh-CN',
      offlineFallback: true,
      ...(input.speech || {}),
    },
    ai: {
      enabled: true,
      showModelHint: true,
      ...(input.ai || {}),
    },
  }
}

export function isAudioFileName(fileName) {
  return /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(String(fileName || '').trim())
}

export function getRefreshMessage(nextTracks = [], nextFiles = [], locked = false) {
  const pendingCount = Array.isArray(nextFiles) ? nextFiles.length : 0
  const language = getPreferredLanguage()

  if (!nextTracks.length && pendingCount === 0) {
    return localizeText(language, 'No audio files yet. Upload mp3/wav/m4a files from the upload page first.', '暂无音频文件，请先在上传页上传 mp3/wav/m4a 等音频文件。')
  }

  if (locked && pendingCount > 0) {
    return localizeText(language, `The playlist is locked. ${pendingCount} newly uploaded file(s) are hidden for now.`, `节目单已锁定，已有 ${pendingCount} 个新上传文件暂不显示。`)
  }

  if (pendingCount > 0) {
    return localizeText(language, `Found ${pendingCount} newly uploaded file(s). They are shown as temporary rows and can be added via "Add track".`, `发现 ${pendingCount} 个新上传文件，已作为临时行显示，可点击“新增节目”加入节目单。`)
  }

  return ''
}

export function formatProgressTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0)))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const secs = safeSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function getBackendPlaybackLabel(backendPlayback) {
  const language = getPreferredLanguage()

  if (!backendPlayback.available) {
    return localizeText(language, 'Unavailable', '不可用')
  }

  if (backendPlayback.state === 'playing') {
    return localizeText(language, 'Playing', '播放中')
  }

  if (backendPlayback.state === 'paused') {
    return localizeText(language, 'Paused', '已暂停')
  }

  if (backendPlayback.state === 'stopping') {
    return localizeText(language, 'Stopping', '停止中')
  }

  if (backendPlayback.state === 'stopped') {
    return localizeText(language, 'Stopped', '已停止')
  }

  return localizeText(language, 'Idle', '空闲')
}

export function getBackendActionTip(action, capabilityState) {
  const language = getPreferredLanguage()

  if (!capabilityState.available) {
    return localizeText(language, 'The current player is unavailable.', '当前播放器不可用')
  }

  if (action === 'pause') {
    return capabilityState.canPause
      ? localizeText(language, 'Pause current playback', '暂停当前播放')
      : localizeText(language, 'Only playing audio can be paused.', '只有播放中才可以暂停')
  }

  if (action === 'resume') {
    return capabilityState.canResume
      ? localizeText(language, 'Resume current playback', '恢复当前播放')
      : localizeText(language, 'Only paused audio can be resumed.', '只有暂停后才可以恢复')
  }

  if (action === 'stop') {
    return capabilityState.canStop
      ? localizeText(language, 'Stop current playback', '停止当前播放')
      : localizeText(language, 'There is no playback task to stop.', '当前没有可停止的播放任务')
  }

  return ''
}

export function isTrackActive(track, currentTrackId, backendPlayback) {
  if (!track) return false
  if (currentTrackId && track.id === currentTrackId) return true

  const trackSavedName = String(track.savedName || '').trim()
  const backendSavedName = String(backendPlayback.currentTrack?.savedName || '').trim()
  return Boolean(trackSavedName) && trackSavedName === backendSavedName
}

export function getTrackPlaybackState(track, currentTrackId, backendPlayback) {
  if (!isTrackActive(track, currentTrackId, backendPlayback)) {
    return 'idle'
  }

  return String(backendPlayback.state || 'idle').trim() || 'idle'
}

export function getTrackPlaybackTip(track, playbackState) {
  const language = getPreferredLanguage()

  if (!track?.savedName) {
    return localizeText(language, 'This track has no playable audio yet.', '该节目暂无可播放音频')
  }

  if (playbackState === 'playing') return localizeText(language, 'Click to pause playback.', '当前点击可暂停播放')
  if (playbackState === 'paused') return localizeText(language, 'Click to resume playback.', '当前点击可恢复播放')
  if (playbackState === 'stopping') return localizeText(language, 'Stopping now, please wait.', '当前正在停止，请稍候')
  return localizeText(language, 'Start playing this track.', '开始播放该节目')
}

export function getTrackPreviewTip(track) {
  const language = getPreferredLanguage()

  if (!track?.savedName) {
    return localizeText(language, 'This track has no preview audio yet.', '该节目暂无可预听音频')
  }

  return localizeText(language, 'Open the floating preview player.', '打开悬浮预听工具')
}

export function getTrackEditTip(track) {
  const language = getPreferredLanguage()
  return localizeText(language, `Edit track "${track?.programName || 'Untitled track'}".`, `修改节目《${track?.programName || '未命名节目'}》信息`)
}

export function getTrackDeleteTip(track) {
  const language = getPreferredLanguage()
  return localizeText(language, `Delete track "${track?.programName || 'Untitled track'}".`, `删除节目《${track?.programName || '未命名节目'}》`)
}

export function getTrackCreateTip(track) {
  const language = getPreferredLanguage()
  return localizeText(language, `Add audio file "${track?.fileName || 'Untitled file'}" as a formal track.`, `将音频文件《${track?.fileName || '未命名文件'}》新增为正式节目`)
}

export function reorderTracks(prevTracks, draggingId, targetId) {
  const sourceIndex = prevTracks.findIndex((item) => item.id === draggingId)
  const targetIndex = prevTracks.findIndex((item) => item.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0) return prevTracks

  const nextTracks = [...prevTracks]
  const [moved] = nextTracks.splice(sourceIndex, 1)
  nextTracks.splice(targetIndex, 0, moved)
  return nextTracks
}

export function buildMusicListSavePayload(recordName, tracks, setCurrent = false, playlistLocked = false) {
  return {
    recordName,
    setCurrent,
    playlistLocked,
    musicList: tracks
      .filter((track) => !track?.isTemporary && String(track?.status || 'saved').trim() !== 'temp')
      .map((track, index) => ({
      id: track.id,
      order: index + 1,
      performer: track.performer,
      programName: track.programName,
      hostScript: track.hostScript || '',
      fileName: track.fileName,
      savedName: track.savedName || '',
      fileHash: track.fileHash || '',
      status: 'saved',
    })),
  }
}

export function buildEditedTrackList({ tracks, dialogMode, editingTrack, performer, programName, hostScript }) {
  if (dialogMode === 'create') {
    const newTrack = {
      id: editingTrack?.savedName || `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      performer,
      programName,
      hostScript,
      fileName: editingTrack?.fileName || localizeText(getPreferredLanguage(), 'Manual track (no audio)', '手动新增节目（无音频）'),
      savedName: editingTrack?.savedName || '',
      fileHash: editingTrack?.fileHash || '',
      status: 'saved',
      isTemporary: false,
    }
    return [...tracks, newTrack]
  }

  return tracks.map((track) => {
    if (track.id !== editingTrack.id) return track
    return {
      ...track,
      performer,
      programName,
      hostScript,
    }
  })
}