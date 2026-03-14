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
  buildTemporaryTracks,
  formatProgressTime,
  getBackendActionTip,
  getBackendPlaybackLabel,
  getTrackCreateTip,
  getTrackDeleteTip,
  getTrackEditTip,
  getTrackPlaybackButtonLabel,
  getTrackPlaybackState,
  getTrackPlaybackTip,
  getTrackPreviewTip,
  isTrackActive,
  openProgramSheetWindow,
  persistPlaylistLockState,
  readPlaylistLockState,
  reorderTracks,
} from '../services/musicPlay'

function MusicPage() {
  const [currentTrackId, setCurrentTrackId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [message, setMessage] = useState('')
  const performerInputRef = useRef(null)
  const programInputRef = useRef(null)
  const hostScriptInputRef = useRef(null)
  const [isPlaylistLocked, setIsPlaylistLocked] = useState(() => readPlaylistLockState())
  const [customEffectName, setCustomEffectName] = useState('')
  const audioCtxRef = useRef(null)
  const { openFloatingPlayer } = useFloatingAudioPlayer()
  const musicPageApi = useMusicPageApi()

  const {
    tracks,
    setTracks,
    uploadedAudioFiles,
    speechInputMode,
    setSpeechInputMode,
    speechLanguage,
    offlineFallbackEnabled,
    aiTextOptimizeEnabled,
    showModelHintEnabled,
    marqueeSpeedSec,
    fontScalePercent,
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
    onMessage: setMessage,
  })

  const temporaryTracks = useMemo(() => {
    return buildTemporaryTracks(tracks, uploadedAudioFiles, isPlaylistLocked)
  }, [isPlaylistLocked, tracks, uploadedAudioFiles])

  const displayTracks = useMemo(() => [...tracks, ...temporaryTracks], [temporaryTracks, tracks])

  useEffect(() => {
    persistPlaylistLockState(isPlaylistLocked)
  }, [isPlaylistLocked])

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

  const togglePlaylistLock = () => {
    const nextLocked = !isPlaylistLocked
    setIsPlaylistLocked(nextLocked)
    updateRefreshMessage(tracks, uploadedAudioFiles, nextLocked)
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
    musicPageApi,
    fetchCurrentShow,
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
    triggerLocalEffect,
    onPlay,
    controlBackendPlayback,
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
        playbackPositionLabel={playbackPositionLabel}
        playbackDurationLabel={playbackDurationLabel}
        playbackProgressPercent={playbackProgressPercent}
        pauseTip={getBackendActionTip('pause', backendActionCapability)}
        resumeTip={getBackendActionTip('resume', backendActionCapability)}
        stopTip={getBackendActionTip('stop', backendActionCapability)}
        canPauseBackendPlayback={canPauseBackendPlayback}
        canResumeBackendPlayback={canResumeBackendPlayback}
        canStopBackendPlayback={canStopBackendPlayback}
        onControlBackendPlayback={controlBackendPlayback}
      />

      {message && <div className="music-message">{message}</div>}

      <MusicTrackTable
        currentShowName={currentShowName}
        isPlaylistLocked={isPlaylistLocked}
        displayTracks={displayTracks}
        draggingId={draggingId}
        onOpenCreateDialog={() => openCreateDialog()}
        onTogglePlaylistLock={togglePlaylistLock}
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
        getTrackPlaybackButtonLabel={(track) => getTrackPlaybackButtonLabel(getTrackPlaybackState(track, currentTrackId, backendPlayback))}
        getTrackPreviewTip={getTrackPreviewTip}
        openPreviewPlayer={openPreviewPlayer}
        getTrackEditTip={getTrackEditTip}
        openEditDialog={openEditDialog}
        getTrackDeleteTip={getTrackDeleteTip}
        onDeleteTrack={onDeleteTrack}
      />

      <MusicHistoryPanel historyShows={historyShows} onSwitchToHistoryShow={switchToHistoryShow} />

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
