import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFloatingAudioPlayer } from '../context/floatingAudioPlayerContext'
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
import {
  useBackendPlaybackStream,
  useMusicEditorState,
  useMusicPageApi,
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
import { useLanguage } from '../context/languageContext'

function MusicPage() {
  const { t } = useLanguage()
  const [currentTrackId, setCurrentTrackId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [message, setMessage] = useState('')
  const performerInputRef = useRef(null)
  const programInputRef = useRef(null)
  const hostScriptInputRef = useRef(null)
  const [isPlaylistLocked, setIsPlaylistLocked] = useState(false)
  const [customEffectName, setCustomEffectName] = useState('')
  const audioCtxRef = useRef(null)
  const hasSyncedProgramClearRef = useRef(false)
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
    updateRefreshMessage,
    playStateRef,
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

  const backendSavedName = useMemo(
    () => String(backendPlayback.currentTrack?.savedName || '').trim(),
    [backendPlayback.currentTrack?.savedName],
  )

  const backendPlaybackState = useMemo(
    () => String(backendPlayback.state || '').trim(),
    [backendPlayback.state],
  )

  const syncedCurrentTrackId = useMemo(() => {
    if (!backendSavedName) {
      return null
    }

    const matchedTrack = tracks.find((track) => String(track.savedName || '').trim() === backendSavedName)
    return matchedTrack?.id || null
  }, [backendSavedName, tracks])

  const effectiveCurrentTrackId = syncedCurrentTrackId || (['idle', 'stopped'].includes(backendPlaybackState) ? null : currentTrackId)
  const shouldShowClearedProgramInfo = !backendSavedName && ['idle', 'stopped'].includes(backendPlaybackState)
  const displayCurrentProgramName = shouldShowClearedProgramInfo ? t('No track yet', '暂无节目') : currentProgramName
  const displayCurrentPerformerName = shouldShowClearedProgramInfo ? t('No performer yet', '暂无演出人员') : currentPerformerName

  const currentTrack = useMemo(
    () => tracks.find((track) => track.id === effectiveCurrentTrackId) || null,
    [effectiveCurrentTrackId, tracks],
  )

  const clearCurrentProgramInfo = useCallback(async () => {
    try {
      if (currentProgramName !== t('No track yet', '暂无节目') || currentPerformerName !== t('No performer yet', '暂无演出人员')) {
        // Call backend to clear current program and performer in the current show JSON
        // Assuming an API method like clearCurrentProgramInfo or updateCurrentShow exists
        await musicPageApi.updateCurrentProgram({ programName: null, performerName: null, clearCurrentProgram: true })

        setCurrentProgramName(t('No track yet', '暂无节目'))
        setCurrentPerformerName(t('No performer yet', '暂无演出人员'))
      }
    } catch (error) {
      setMessage(t(`Failed to clear the current track info: ${error.message}`, `清除当前节目信息失败：${error.message}`))
      // Fallback to local update if needed, or keep old values? 
      // For now, we update locally even on error to match UI expectation, 
      // but ideally, we might revert.
      setCurrentProgramName(t('No track yet', '暂无节目'))
      setCurrentPerformerName(t('No performer yet', '暂无演出人员'))
    }
  }, [currentPerformerName, currentProgramName, musicPageApi, setCurrentPerformerName, setCurrentProgramName, t])

  const syncClearedCurrentProgramInfo = useCallback(async () => {
    try {
      await musicPageApi.updateCurrentProgram({ programName: null, performerName: null, clearCurrentProgram: true })
    } catch {
      // ignore sync failures here; UI already derives the cleared state locally
    }
  }, [musicPageApi])

  useEffect(() => {
    if (shouldShowClearedProgramInfo) {
      if (!hasSyncedProgramClearRef.current) {
        hasSyncedProgramClearRef.current = true
        syncClearedCurrentProgramInfo()
      }
      return
    }

    hasSyncedProgramClearRef.current = false
  }, [playStateRef, shouldShowClearedProgramInfo, syncClearedCurrentProgramInfo])

  const playbackProgress = backendPlayback.progress || {}
  const playbackPositionLabel = formatProgressTime(playbackProgress.positionSec)
  const playbackDurationLabel = playbackProgress.durationSec == null ? '--:--' : formatProgressTime(playbackProgress.durationSec)
  const playbackProgressPercent = Math.max(0, Math.min(100, Number(playbackProgress.progressPercent || 0)))
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
        throw new Error(result.message || t('Failed to update lock state', '更新锁定状态失败'))
      }

      setIsPlaylistLocked(Boolean(result.currentShow?.playlistLocked ?? nextLocked))
      const refreshed = await refreshPageData()
      updateRefreshMessage(
        refreshed?.tracks || tracks,
        refreshed?.temporaryTracks || temporaryTracks,
        Boolean(result.currentShow?.playlistLocked ?? nextLocked),
      )
    } catch (error) {
      setMessage(t(`Failed to update lock state: ${error.message}`, `更新锁定状态失败：${error.message}`))
    }
  }

  const closeCurrentShow = async () => {
    try {
      const result = await musicPageApi.closeCurrentShow()
      if (!result.success) {
        throw new Error(result.message || t('Failed to close current show', '关闭当前演出失败'))
      }

      setCurrentTrackId(null)
      // Reuse the clear logic or do it directly since show is closed
      clearCurrentProgramInfo()
      setTracks([])
      await refreshPageData()
      setMessage(result.message || t('Current show closed.', '当前演出已关闭'))
    } catch (error) {
      setMessage(t(`Failed to close current show: ${error.message}`, `关闭当前演出失败：${error.message}`))
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
    currentTrackId: effectiveCurrentTrackId,
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
    controlBackendPlayback,
    setBackendVolume,
    toggleTrackPlayback,
    openPreviewPlayer,
  } = useMusicPlaybackActions({
    tracks,
    currentTrackId: effectiveCurrentTrackId,
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
      setMessage(t('The browser blocked a new window. Please allow pop-ups and try again.', '浏览器拦截了新窗口，请允许弹窗后重试。'))
    }
  }

  const onPrintProgramSheet = () => {
    openSheetWindow(t('Setlist (Print)', '节目单（打印）'), true)
  }

  return (
    <div className="container music-container" style={{ fontSize: `${fontScalePercent}%` }}>
      <div className="page-actions">
        <Link to="/page" className="back-link">{t('Back to home', '返回首页')}</Link>
        <Link to="/page/settings" className="back-link">{t('Settings', '用户设置')}</Link>
        <Link to="/page/recording" className="back-link">{t('Recorder', '录音机')}</Link>
      </div>

      <h1>{t('Music playback', '音乐播放')}</h1>

      <MusicMarqueePanel
        marqueeSpeedSec={marqueeSpeedSec}
        currentShowName={currentShowName}
        currentProgramName={displayCurrentProgramName}
        currentPerformerName={displayCurrentPerformerName}
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
        getTrackPlaybackTip={(track) => getTrackPlaybackTip(track, getTrackPlaybackState(track, effectiveCurrentTrackId, backendPlayback))}
        isTrackActive={(track) => isTrackActive(track, effectiveCurrentTrackId, backendPlayback)}
        toggleTrackPlayback={toggleTrackPlayback}
        getTrackPlaybackState={(track) => getTrackPlaybackState(track, effectiveCurrentTrackId, backendPlayback)}
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
