import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFloatingAudioPlayer } from '../component/FloatingAudioPlayer'
import {
  DeleteTrackDialog,
  ExportPdfDialog,
  MusicEffectPanel,
  MusicHistoryPanel,
  MusicMarqueePanel,
  MusicPlaybackPanel,
  MusicTrackTable,
  SaveShowDialog,
  TrackEditorDialog,
} from '../component/MusicPlay'
import { useMusicPageApi } from '../context/musicPageApiContext'
import {
  useBackendPlaybackStream,
  useMusicEditorState,
  useMusicPageData,
  useMusicPlaybackActions,
  useSpeechRecognition,
} from '../hooks/musicPlay'
import {
  formatProgressTime,
  getBackendActionTip,
  getBackendPlaybackLabel,
  getTrackCreateTip,
  getTrackDeleteTip,
  getTrackEditTip,
  getTrackPlaybackState,
  getTrackPlaybackTip,
  getTrackPreviewTip,
  isTrackActive,
  openProgramSheetWindow,
  reorderTracks,
} from '../services/musicPlay'

function MusicPage() {
  const [currentTrackId, setCurrentTrackId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [message, setMessage] = useState('')
  const performerInputRef = useRef(null)
  const programInputRef = useRef(null)
  const hostScriptInputRef = useRef(null)
  const [isPlaylistLocked, setIsPlaylistLocked] = useState(false)
  const [customEffectName, setCustomEffectName] = useState('')
  const audioCtxRef = useRef(null)
  const { openFloatingPlayer } = useFloatingAudioPlayer()
  
  const musicPageApi = useMusicPageApi()

  const {
    tracks,
    setTracks,
    temporaryTracks,
    speechInputMode,
    setSpeechInputMode,
    speechLanguage,
    offlineFallbackEnabled,
    aiTextOptimizeEnabled,
    showModelHintEnabled,
    marqueeSpeedSec,
    fontScalePercent,
    hasCurrentShow,
    currentShowName,
    currentProgramName,
    setCurrentProgramName,
    currentPerformerName,
    setCurrentPerformerName,
    historyShows,
    backendPlayback,
    setBackendPlayback,
    refreshPageData,
    fetchBackendPlaybackState,
    fetchCurrentShow,
    updateRefreshMessage,
  } = useMusicPageData({
    musicPageApi,
    isPlaylistLocked,
    onPlaylistLockChange: setIsPlaylistLocked,
    onMessage: setMessage,
  })

  const displayTracks = useMemo(() => {
    if (isPlaylistLocked) {
      return tracks
    }

    return [...tracks, ...temporaryTracks]
  }, [isPlaylistLocked, temporaryTracks, tracks])

  const triggerCustomEffect = () => {
    const name = String(customEffectName || '').trim()
    if (!name) return
    triggerLocalEffect(name)
    setCustomEffectName('')
  }

  const reportClientError = async ({ message: errorMessage, stack, meta } = {}) => {
    try {
      await musicPageApi.reportClientError({
        source: 'music-page',
        message: errorMessage || 'unknown error',
        stack: stack || '',
        page: window.location.pathname,
        timestamp: new Date().toISOString(),
        meta: meta || {},
      })
    } catch {
      // ignore report failures
    }
  }

  const currentTrack = useMemo(
    () => tracks.find((track) => track.id === currentTrackId) || null,
    [tracks, currentTrackId],
  )

  useEffect(() => {
    const backendSavedName = String(backendPlayback.currentTrack?.savedName || '').trim()
    if (!backendSavedName) {
      if (['idle', 'stopped'].includes(String(backendPlayback.state || '').trim())) {
        setCurrentTrackId(null)
      }
      return
    }

    const matchedTrack = tracks.find((track) => String(track.savedName || '').trim() === backendSavedName)
    if (matchedTrack) {
      setCurrentTrackId(matchedTrack.id)
    }
  }, [backendPlayback, tracks])

  const playbackProgress = backendPlayback.progress || {}
  const playbackPositionLabel = formatProgressTime(playbackProgress.positionSec)
  const playbackDurationLabel = playbackProgress.durationSec == null ? '--:--' : formatProgressTime(playbackProgress.durationSec)
  const playbackProgressPercent = Math.max(0, Math.min(100, Number(playbackProgress.progressPercent || 0)))
  const backendPlaybackState = String(backendPlayback.state || '').trim()
  const canPauseBackendPlayback = backendPlayback.available && backendPlaybackState === 'playing'
  const canResumeBackendPlayback = backendPlayback.available && backendPlaybackState === 'paused'
  const canStopBackendPlayback = backendPlayback.available && ['playing', 'paused'].includes(backendPlaybackState)
  const canAdjustBackendVolume = backendPlayback.available

  const backendActionCapability = {
    available: backendPlayback.available,
    canPause: canPauseBackendPlayback,
    canResume: canResumeBackendPlayback,
    canStop: canStopBackendPlayback,
  }

  const onDragStart = (trackId) => {
    setDraggingId(trackId)
  }

  const onDropRow = (targetId) => {
    if (!draggingId || draggingId === targetId) return

    setTracks((prev) => reorderTracks(prev, draggingId, targetId))

    setDraggingId(null)
  }

  const onDragEnd = () => {
    setDraggingId(null)
  }

  const togglePlaylistLock = async () => {
    if (!hasCurrentShow) {
      return
    }

    const nextLocked = !isPlaylistLocked

    try {
      const result = await musicPageApi.updateCurrentShowLock(nextLocked)
      if (!result.success) {
        throw new Error(result.message || '更新锁定状态失败')
      }

      setIsPlaylistLocked(Boolean(result.currentShow?.playlistLocked ?? nextLocked))
      const refreshed = await refreshPageData()
      updateRefreshMessage(
        refreshed?.tracks || tracks,
        refreshed?.temporaryTracks || temporaryTracks,
        Boolean(result.currentShow?.playlistLocked ?? nextLocked),
      )
    } catch (error) {
      setMessage(`更新锁定状态失败：${error.message}`)
    }
  }

  const closeCurrentShow = async () => {
    try {
      const result = await musicPageApi.closeCurrentShow()
      if (!result.success) {
        throw new Error(result.message || '关闭当前演出失败')
      }

      setCurrentTrackId(null)
      setCurrentProgramName('暂无节目')
      setCurrentPerformerName('暂无演出人员')
      setTracks([])
      await refreshPageData()
      setMessage(result.message || '当前演出已关闭')
    } catch (error) {
      setMessage(`关闭当前演出失败：${error.message}`)
    }
  }

  const {
    dialogMode,
    editingTrack,
    editPerformer,
    editProgramName,
    editHostScript,
    aiSuggestions,
    isGeneratingScript,
    saveDialogOpen,
    saveRecordName,
    exportDialogOpen,
    exportFileName,
    deletingTrack,
    setEditPerformer,
    setEditProgramName,
    setEditHostScript,
    setSaveRecordName,
    setExportFileName,
    getFieldValue,
    setFieldValue,
    openEditDialog,
    openCreateDialog,
    createTrackFromUpload,
    resetEditDialog,
    onDeleteTrack,
    closeDeleteDialog,
    confirmDeleteTrack,
    onGenerateHostScript,
    onSelectSuggestion,
    onConfirmEdit,
    onSaveMusicList,
    closeSaveDialog,
    confirmSaveMusicList,
    onExportPdf,
    closeExportDialog,
    confirmExportProgramSheetPdf,
  } = useMusicEditorState({
    tracks,
    currentTrackId,
    currentShowName,
    isPlaylistLocked,
    musicPageApi,
    refreshPageData,
    setTracks,
    setCurrentTrackId,
    setMessage,
  })

  const { listeningField, speechSupported, speechSupportHint, stopRecognition, handleSpeechInput } = useSpeechRecognition({
    speechInputMode,
    speechLanguage,
    offlineFallbackEnabled,
    aiTextOptimizeEnabled,
    getFieldValue,
    setFieldValue,
    refineSpeechText: musicPageApi.refineSpeechText,
    onMessage: setMessage,
  })

  const {
    switchToHistoryShow,
    deleteHistoryShow,
    triggerLocalEffect,
    onPlay,
    controlBackendPlayback,
    setBackendVolume,
    toggleTrackPlayback,
    openPreviewPlayer,
  } = useMusicPlaybackActions({
    tracks,
    currentTrackId,
    backendPlayback,
    audioCtxRef,
    musicPageApi,
    openFloatingPlayer,
    setCurrentTrackId,
    setCurrentProgramName,
    setCurrentPerformerName,
    setBackendPlayback,
    setMessage,
    refreshPageData,
    reportClientError,
  })

  const closeEditDialog = () => {
    resetEditDialog()
    stopRecognition()
  }

  useBackendPlaybackStream({
    backendPlayback,
    requestBackendPlaybackState: fetchBackendPlaybackState,
    setBackendPlayback,
  })

  const handleKeyboardInput = (field) => {
    const targetRef =
      field === 'performer'
        ? performerInputRef
        : field === 'program'
          ? programInputRef
          : hostScriptInputRef
    targetRef.current?.focus()
  }

  const openSheetWindow = (title, shouldPrint = false) => {
    const opened = openProgramSheetWindow(tracks, title, shouldPrint)
    if (!opened) {
      setMessage('浏览器拦截了新窗口，请允许弹窗后重试。')
    }
  }

  const onPrintProgramSheet = () => {
    openSheetWindow('节目单（打印）', true)
  }

  return (
    <div className="container music-container" style={{ fontSize: `${fontScalePercent}%` }}>
      <div className="page-actions">
        <Link to="/page" className="back-link">返回首页</Link>
        <Link to="/page/settings" className="back-link">用户设置</Link>
      </div>

      <h1>音乐播放</h1>

      <MusicMarqueePanel
        marqueeSpeedSec={marqueeSpeedSec}
        currentShowName={currentShowName}
        currentProgramName={currentProgramName}
        currentPerformerName={currentPerformerName}
      />

      <MusicPlaybackPanel
        currentTrack={currentTrack}
        backendPlayback={backendPlayback}
        backendPlaybackLabel={getBackendPlaybackLabel(backendPlayback)}
        backendVolumePercent={Math.max(0, Math.min(100, Number(backendPlayback.volumePercent ?? 100)))}
        playbackPositionLabel={playbackPositionLabel}
        playbackDurationLabel={playbackDurationLabel}
        playbackProgressPercent={playbackProgressPercent}
        pauseTip={getBackendActionTip('pause', backendActionCapability)}
        resumeTip={getBackendActionTip('resume', backendActionCapability)}
        stopTip={getBackendActionTip('stop', backendActionCapability)}
        canPauseBackendPlayback={canPauseBackendPlayback}
        canResumeBackendPlayback={canResumeBackendPlayback}
        canStopBackendPlayback={canStopBackendPlayback}
        canAdjustBackendVolume={canAdjustBackendVolume}
        onControlBackendPlayback={controlBackendPlayback}
        onBackendVolumeChange={setBackendVolume}
      />

      {message && <div className="music-message">{message}</div>}

      <MusicTrackTable
        currentShowName={currentShowName}
        hasCurrentShow={hasCurrentShow}
        isPlaylistLocked={isPlaylistLocked}
        displayTracks={displayTracks}
        draggingId={draggingId}
        onOpenCreateDialog={() => openCreateDialog()}
        onTogglePlaylistLock={togglePlaylistLock}
        onCloseCurrentShow={closeCurrentShow}
        onRefreshPageData={refreshPageData}
        onPrintProgramSheet={onPrintProgramSheet}
        onExportPdf={onExportPdf}
        onSaveMusicList={onSaveMusicList}
        onDragStart={onDragStart}
        onDropRow={onDropRow}
        onDragEnd={onDragEnd}
        getTrackCreateTip={getTrackCreateTip}
        createTrackFromUpload={createTrackFromUpload}
        getTrackPlaybackTip={(track) => getTrackPlaybackTip(track, getTrackPlaybackState(track, currentTrackId, backendPlayback))}
        isTrackActive={(track) => isTrackActive(track, currentTrackId, backendPlayback)}
        toggleTrackPlayback={toggleTrackPlayback}
        getTrackPlaybackState={(track) => getTrackPlaybackState(track, currentTrackId, backendPlayback)}
        getTrackPreviewTip={getTrackPreviewTip}
        openPreviewPlayer={openPreviewPlayer}
        getTrackEditTip={getTrackEditTip}
        openEditDialog={openEditDialog}
        getTrackDeleteTip={getTrackDeleteTip}
        onDeleteTrack={onDeleteTrack}
      />

      <MusicHistoryPanel historyShows={historyShows} onSwitchToHistoryShow={switchToHistoryShow} onDeleteHistoryShow={deleteHistoryShow} />

      <MusicEffectPanel
        customEffectName={customEffectName}
        onCustomEffectNameChange={setCustomEffectName}
        onTriggerLocalEffect={triggerLocalEffect}
        onTriggerCustomEffect={triggerCustomEffect}
      />

      <TrackEditorDialog
        open={!!editingTrack}
        dialogMode={dialogMode}
        onClose={closeEditDialog}
        onConfirm={onConfirmEdit}
        speechInputMode={speechInputMode}
        onSpeechInputModeChange={setSpeechInputMode}
        listeningField={listeningField}
        showModelHintEnabled={showModelHintEnabled}
        speechSupported={speechSupported}
        speechSupportHint={speechSupportHint}
        performerInputRef={performerInputRef}
        editPerformer={editPerformer}
        onEditPerformerChange={setEditPerformer}
        onKeyboardInput={handleKeyboardInput}
        onSpeechInput={handleSpeechInput}
        programInputRef={programInputRef}
        editProgramName={editProgramName}
        onEditProgramNameChange={setEditProgramName}
        hostScriptInputRef={hostScriptInputRef}
        editHostScript={editHostScript}
        onEditHostScriptChange={setEditHostScript}
        onGenerateHostScript={onGenerateHostScript}
        isGeneratingScript={isGeneratingScript}
        aiSuggestions={aiSuggestions}
        onSelectSuggestion={onSelectSuggestion}
      />

      <SaveShowDialog
        open={saveDialogOpen}
        saveRecordName={saveRecordName}
        onClose={closeSaveDialog}
        onChange={setSaveRecordName}
        onConfirm={confirmSaveMusicList}
      />

      <ExportPdfDialog
        open={exportDialogOpen}
        exportFileName={exportFileName}
        onClose={closeExportDialog}
        onChange={setExportFileName}
        onConfirm={confirmExportProgramSheetPdf}
      />

      <DeleteTrackDialog deletingTrack={deletingTrack} onClose={closeDeleteDialog} onConfirm={confirmDeleteTrack} />
    </div>
  )
}

export default MusicPage
