export function mergeRuntimeSettings(input = {}) {
  return {
    preferences: {
      autoPlay: true,
      marqueeSpeed: 16,
      fontScale: 100,
      ...(input.preferences || {}),
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

  if (!nextTracks.length && pendingCount === 0) {
    return '暂无音频文件，请先在上传页上传 mp3/wav/m4a 等音频文件。'
  }

  if (locked && pendingCount > 0) {
    return `节目单已锁定，已有 ${pendingCount} 个新上传文件暂不显示。`
  }

  if (pendingCount > 0) {
    return `发现 ${pendingCount} 个新上传文件，已作为临时行显示，可点击“新增节目”加入节目单。`
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
  if (!backendPlayback.available) {
    return '不可用'
  }

  if (backendPlayback.state === 'playing') {
    return '播放中'
  }

  if (backendPlayback.state === 'paused') {
    return '已暂停'
  }

  if (backendPlayback.state === 'stopping') {
    return '停止中'
  }

  if (backendPlayback.state === 'stopped') {
    return '已停止'
  }

  return '空闲'
}

export function getBackendActionTip(action, capabilityState) {
  if (!capabilityState.available) {
    return '当前播放器不可用'
  }

  if (action === 'pause') {
    return capabilityState.canPause ? '暂停当前播放' : '只有播放中才可以暂停'
  }

  if (action === 'resume') {
    return capabilityState.canResume ? '恢复当前播放' : '只有暂停后才可以恢复'
  }

  if (action === 'stop') {
    return capabilityState.canStop ? '停止当前播放' : '当前没有可停止的播放任务'
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
  if (!track?.savedName) {
    return '该节目暂无可播放音频'
  }

  if (playbackState === 'playing') return '当前点击可暂停播放'
  if (playbackState === 'paused') return '当前点击可恢复播放'
  if (playbackState === 'stopping') return '当前正在停止，请稍候'
  return '开始播放该节目'
}

export function getTrackPreviewTip(track) {
  if (!track?.savedName) {
    return '该节目暂无可预听音频'
  }

  return '打开悬浮预听工具'
}

export function getTrackEditTip(track) {
  return `修改节目《${track?.programName || '未命名节目'}》信息`
}

export function getTrackDeleteTip(track) {
  return `删除节目《${track?.programName || '未命名节目'}》`
}

export function getTrackCreateTip(track) {
  return `将音频文件《${track?.fileName || '未命名文件'}》新增为正式节目`
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
      fileName: editingTrack?.fileName || '手动新增节目（无音频）',
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