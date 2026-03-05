import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '../component/Modal'

function MusicPage() {
  const [tracks, setTracks] = useState([])
  const [currentTrackId, setCurrentTrackId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [message, setMessage] = useState('')
  const audioRef = useRef(null)
  const performerInputRef = useRef(null)
  const programInputRef = useRef(null)
  const hostScriptInputRef = useRef(null)
  const recognitionRef = useRef(null)
  const speechBaseTextRef = useRef('')
  const speechFinalTextRef = useRef('')
  const speechProcessQueueRef = useRef(Promise.resolve())
  const [dialogMode, setDialogMode] = useState('edit')
  const [editingTrack, setEditingTrack] = useState(null)
  const [editPerformer, setEditPerformer] = useState('')
  const [editProgramName, setEditProgramName] = useState('')
  const [editHostScript, setEditHostScript] = useState('')
  const [aiSuggestions, setAiSuggestions] = useState([])
  const [isGeneratingScript, setIsGeneratingScript] = useState(false)
  const [listeningField, setListeningField] = useState('')
  const [speechInputMode, setSpeechInputMode] = useState('ai')
  const [speechLanguage, setSpeechLanguage] = useState('zh-CN')
  const [offlineFallbackEnabled, setOfflineFallbackEnabled] = useState(true)
  const [aiTextOptimizeEnabled, setAiTextOptimizeEnabled] = useState(true)
  const [showModelHintEnabled, setShowModelHintEnabled] = useState(true)
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true)
  const [marqueeSpeedSec, setMarqueeSpeedSec] = useState(16)
  const [fontScalePercent, setFontScalePercent] = useState(100)
  const [speechSupported, setSpeechSupported] = useState(true)
  const [speechSupportHint, setSpeechSupportHint] = useState('')
  const [currentShowName, setCurrentShowName] = useState('未设置')
  const [currentProgramName, setCurrentProgramName] = useState('暂无节目')
  const [currentPerformerName, setCurrentPerformerName] = useState('暂无演出人员')
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveRecordName, setSaveRecordName] = useState('')
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportFileName, setExportFileName] = useState('节目单')
  const [deletingTrack, setDeletingTrack] = useState(null)
  const [historyShows, setHistoryShows] = useState([])
  const [controlState, setControlState] = useState({ playbackCommandId: 0, effectCommandId: 0 })
  const [customEffectName, setCustomEffectName] = useState('')
  const audioCtxRef = useRef(null)

  useEffect(() => {
    refreshPageData()
    detectSpeechSupport()
  }, [])

  // 暂停 /v1/live/state 轮询

  const detectSpeechSupport = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const supported = Boolean(SpeechRecognition)
    setSpeechSupported(supported)

    const userAgent = navigator.userAgent || ''
    const isWindows = /Windows/i.test(userAgent)
    const isChromeOrEdge = /Chrome|Edg/i.test(userAgent)

    if (!supported) {
      setSpeechSupportHint('当前浏览器不支持语音识别。建议使用 Windows 下的 Edge 或 Chrome。')
      return
    }

    if (isWindows && !isChromeOrEdge) {
      setSpeechSupportHint('当前浏览器语音支持可能不稳定，建议使用 Windows 下的 Edge 或 Chrome。')
      return
    }

    setSpeechSupportHint('当前浏览器支持语音识别。')
  }

  const refreshPageData = async () => {
    await Promise.all([fetchTracks(), fetchCurrentShow(), fetchUserSettings(), fetchHistoryShows()])
  }

  const fetchHistoryShows = async () => {
    try {
      const response = await fetch('/v1/shows')
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.message || '加载失败')
      }
      setHistoryShows(Array.isArray(result.shows) ? result.shows : [])
    } catch {
      setHistoryShows([])
    }
  }

  const switchToHistoryShow = async (fileName) => {
    try {
      const response = await fetch('/v1/show/current', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileName, clearCurrentProgram: true }),
      })
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.message || '切换失败')
      }

      setCurrentTrackId(null)
      await refreshPageData()
      setCurrentProgramName('暂无节目')
      setCurrentPerformerName('暂无演出人员')
      setMessage(`已切换当前演出：${result.currentShow?.recordName || fileName}`)
    } catch (error) {
      setMessage(`切换演出失败：${error.message}`)
    }
  }

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = AudioContext ? new AudioContext() : null
    }
    return audioCtxRef.current
  }

  const playProgramEffect = async (effectName) => {
    const ctx = getAudioContext()
    if (!ctx) {
      setMessage('当前浏览器不支持音效播放。')
      return
    }

    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    const now = ctx.currentTime
    const lowerName = String(effectName || '').toLowerCase()
    const baseFreq = lowerName.includes('鼓') ? 140 : lowerName.includes('笑') ? 440 : lowerName.includes('拍') ? 320 : 260
    const repeat = lowerName.includes('拍') ? 5 : lowerName.includes('笑') ? 4 : 3

    for (let i = 0; i < repeat; i += 1) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = i % 2 === 0 ? 'triangle' : 'sine'
      osc.frequency.setValueAtTime(baseFreq + i * 30, now + i * 0.15)
      gain.gain.setValueAtTime(0.0001, now + i * 0.15)
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.15 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.12)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.15)
      osc.stop(now + i * 0.15 + 0.14)
    }
  }

  const triggerLocalEffect = (effectName) => {
    playProgramEffect(effectName)
    setMessage(`已触发节目效果：${effectName}`)
  }

  const triggerCustomEffect = () => {
    const name = String(customEffectName || '').trim()
    if (!name) return
    triggerLocalEffect(name)
    setCustomEffectName('')
  }

  const pollLiveState = async () => {
    try {
      const response = await fetch('/v1/live/state')
      const result = await response.json()
      if (!result.success || !result.state) return

      const state = result.state

      if (Number(state.playbackCommandId || 0) !== Number(controlState.playbackCommandId || 0)) {
        setControlState((prev) => ({ ...prev, playbackCommandId: Number(state.playbackCommandId || 0) }))
        if (state.playbackAction === 'play' && audioRef.current) {
          audioRef.current.play().catch(() => {})
        }
        if (state.playbackAction === 'pause' && audioRef.current) {
          audioRef.current.pause()
        }
      }

      if (Number(state.effectCommandId || 0) !== Number(controlState.effectCommandId || 0)) {
        setControlState((prev) => ({ ...prev, effectCommandId: Number(state.effectCommandId || 0) }))
        if (state.effectName) {
          triggerLocalEffect(state.effectName)
        }
      }
    } catch {
      // ignore polling errors
    }
  }

  const reportClientError = async ({ message: errorMessage, stack, meta } = {}) => {
    try {
      await fetch('/v1/client-error', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'music-page',
          message: errorMessage || 'unknown error',
          stack: stack || '',
          page: window.location.pathname,
          timestamp: new Date().toISOString(),
          meta: meta || {},
        }),
      })
    } catch {
      // ignore report failures
    }
  }

  const fetchUserSettings = async () => {
    try {
      const response = await fetch('/v1/settings')
      const result = await response.json()
      if (!result.success || !result.settings) {
        return
      }

      const settings = mergeRuntimeSettings(result.settings)
      setSpeechInputMode(settings.speech.mode)
      setSpeechLanguage(settings.speech.language)
      setOfflineFallbackEnabled(Boolean(settings.speech.offlineFallback))
      setAiTextOptimizeEnabled(Boolean(settings.ai.enabled))
      setShowModelHintEnabled(Boolean(settings.ai.showModelHint))
      setAutoPlayEnabled(Boolean(settings.preferences.autoPlay))
      setMarqueeSpeedSec(Math.max(6, Math.min(40, Number(settings.preferences.marqueeSpeed || 16))))
      setFontScalePercent(Math.max(80, Math.min(140, Number(settings.preferences.fontScale || 100))))
    } catch {
      // keep default runtime values when settings request fails
    }
  }

  const fetchCurrentShow = async () => {
    try {
      const response = await fetch('/v1/show/current-state')
      const result = await response.json()

      if (!result.success || !result.hasCurrentShow || !result.currentShow) {
        setCurrentShowName('未设置')
        setCurrentProgramName('暂无节目')
        setCurrentPerformerName('暂无演出人员')
        return
      }

      setCurrentShowName(result.currentShow.recordName || '未设置')
      if (result.hasCurrentProgram && result.currentProgram) {
        setCurrentProgramName(result.currentProgram.programName || '暂无节目')
        setCurrentPerformerName(result.currentProgram.performer || '暂无演出人员')
      } else {
        setCurrentProgramName('暂无节目')
        setCurrentPerformerName('暂无演出人员')
      }
    } catch {
      setCurrentShowName('未设置')
      setCurrentProgramName('暂无节目')
      setCurrentPerformerName('暂无演出人员')
    }
  }

  const currentTrack = useMemo(
    () => tracks.find((track) => track.id === currentTrackId) || null,
    [tracks, currentTrackId],
  )

  useEffect(() => {
    if (!autoPlayEnabled) return
    if (!currentTrack || !audioRef.current) return
    audioRef.current.play().catch(() => {
      setMessage('当前浏览器阻止了自动播放，请手动点击播放器上的播放按钮。')
    })
  }, [currentTrack, autoPlayEnabled])

  const fetchTracks = async () => {
    try {
      const response = await fetch('/v1/musiclist')
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.message || '加载失败')
      }

      const audioTracks = (result.musicList || []).map((item) => ({
        id: item.id,
        performer: item.performer,
        programName: item.programName,
        hostScript: item.hostScript || '',
        fileName: item.displayName || item.fileName,
        url: item.url || '',
      }))

      setTracks(audioTracks)
      if (!audioTracks.length) {
        setMessage('暂无音频文件，请先在上传页上传 mp3/wav/m4a 等音频文件。')
      } else {
        setMessage('')
      }
    } catch (error) {
      setTracks([])
      setMessage(`加载音乐列表失败：${error.message}`)
    }
  }

  const onPlay = async (trackId) => {
    const selectedTrack = tracks.find((track) => track.id === trackId)
    if (!selectedTrack?.url) {
      setMessage('该节目暂无可播放音频，请先上传或绑定音频文件。')
      return
    }

    try {
      try {
        await fetch('/v1/show/current-program', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            performer: selectedTrack.performer,
            programName: selectedTrack.programName,
          }),
        })

        setCurrentProgramName(selectedTrack.programName || '暂无节目')
        setCurrentPerformerName(selectedTrack.performer || '暂无演出人员')
      } catch {
        setMessage('更新当前节目状态失败，但不影响本次播放。')
      }

      setCurrentTrackId(trackId)

      const audioElement = audioRef.current
      if (!audioElement) {
        throw new Error('播放器实例未就绪（audioRef.current 为空）')
      }

      const currentSrc = audioElement.currentSrc || audioElement.src || ''
      const targetUrl = new URL(selectedTrack.url, window.location.origin).toString()
      if (currentSrc !== targetUrl) {
        audioElement.src = selectedTrack.url
        audioElement.load()
      }

      await audioElement.play()
    } catch (error) {
      const errorName = error?.name || 'UnknownError'
      const errorMessage = error?.message || '未知错误'
      console.error('[MusicPage:onPlay] 播放失败', {
        trackId,
        url: selectedTrack.url,
        errorName,
        errorMessage,
        error,
      })

      await reportClientError({
        message: '[MusicPage:onPlay] 播放失败',
        stack: String(error?.stack || ''),
        meta: {
          trackId,
          url: selectedTrack.url,
          errorName,
          errorMessage,
        },
      })

      if (errorName === 'AbortError') return
      if (errorName === 'NotAllowedError') {
        setMessage('当前浏览器阻止了自动播放，请手动点击播放器上的播放按钮。')
        return
      }

      setMessage(`播放失败：${errorName} - ${errorMessage}`)
    }
  }

  const onDragStart = (trackId) => {
    setDraggingId(trackId)
  }

  const onDropRow = (targetId) => {
    if (!draggingId || draggingId === targetId) return

    setTracks((prev) => {
      const sourceIndex = prev.findIndex((item) => item.id === draggingId)
      const targetIndex = prev.findIndex((item) => item.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0) return prev

      const next = [...prev]
      const [moved] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })

    setDraggingId(null)
  }

  const onDragEnd = () => {
    setDraggingId(null)
  }

  const openEditDialog = (track) => {
    setDialogMode('edit')
    setEditingTrack(track)
    setEditPerformer(track.performer || '')
    setEditProgramName(track.programName || '')
    setEditHostScript(track.hostScript || '')
    setAiSuggestions([])
  }

  const openCreateDialog = () => {
    setDialogMode('create')
    setEditingTrack({ id: '' })
    setEditPerformer('')
    setEditProgramName('')
    setEditHostScript('')
    setAiSuggestions([])
  }

  const closeEditDialog = () => {
    setEditingTrack(null)
    setEditPerformer('')
    setEditProgramName('')
    setEditHostScript('')
    setAiSuggestions([])
    stopRecognition()
  }

  const stopRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null
      recognitionRef.current.onerror = null
      recognitionRef.current.onend = null
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setListeningField('')
    speechBaseTextRef.current = ''
    speechFinalTextRef.current = ''
    speechProcessQueueRef.current = Promise.resolve()
  }

  const getFieldValue = (field) => {
    if (field === 'performer') return editPerformer
    if (field === 'program') return editProgramName
    return editHostScript
  }

  const setFieldValue = (field, value) => {
    if (field === 'performer') {
      setEditPerformer(value)
      return
    }
    if (field === 'program') {
      setEditProgramName(value)
      return
    }
    setEditHostScript(value)
  }

  const joinSpeechText = (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join(' ').trim()

  const flushSpeechDisplay = (field, interimText = '') => {
    const merged = joinSpeechText(speechBaseTextRef.current, speechFinalTextRef.current, interimText)
    setFieldValue(field, merged)
  }

  const refineSpeechChunk = async (chunkText, field) => {
    const rawText = String(chunkText || '').trim()
    if (!rawText) {
      return ''
    }

    if (speechInputMode !== 'ai' || !aiTextOptimizeEnabled) {
      return rawText
    }

    if (!navigator.onLine) {
      return rawText
    }

    try {
      const response = await fetch('/v1/ai/speech-refine-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: rawText, field }),
      })
      const result = await response.json()
      if (!result.success) {
        return rawText
      }

      return String(result.text || rawText).trim() || rawText
    } catch {
      return rawText
    }
  }

  const handleKeyboardInput = (field) => {
    const targetRef =
      field === 'performer'
        ? performerInputRef
        : field === 'program'
          ? programInputRef
          : hostScriptInputRef
    targetRef.current?.focus()
  }

  const handleSpeechInput = (field) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setMessage('当前浏览器不支持语音转文字，请使用键盘输入。')
      return
    }

    if (listeningField && listeningField !== field) {
      setMessage('已有语音识别进行中，请稍后再试。')
      return
    }

    if (listeningField === field) {
      stopRecognition()
      return
    }

    stopRecognition()

    if (speechInputMode === 'ai' && !navigator.onLine) {
      if (!offlineFallbackEnabled) {
        setMessage('当前无网络，且设置为不回退本机识别，请切换到本机识别后重试。')
        return
      }
      setMessage('当前无网络，已自动回退到本机语音识别。')
    }

    const recognition = new SpeechRecognition()
    recognition.lang = speechLanguage || 'zh-CN'
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 1

    speechBaseTextRef.current = field === 'hostScript' ? String(getFieldValue(field) || '').trim() : ''
    speechFinalTextRef.current = ''
    speechProcessQueueRef.current = Promise.resolve()

    recognition.onresult = (event) => {
      let interimText = ''
      const finalChunks = []

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const text = result?.[0]?.transcript?.trim() || ''
        if (!text) continue

        if (result.isFinal) {
          finalChunks.push(text)
        } else {
          interimText = joinSpeechText(interimText, text)
        }
      }

      flushSpeechDisplay(field, interimText)

      if (!finalChunks.length) return

      speechProcessQueueRef.current = speechProcessQueueRef.current
        .then(async () => {
          for (const finalText of finalChunks) {
            const refinedText = await refineSpeechChunk(finalText, field)
            speechFinalTextRef.current = joinSpeechText(speechFinalTextRef.current, refinedText)
          }
          flushSpeechDisplay(field)
        })
        .catch(() => {
          flushSpeechDisplay(field)
        })
    }

    recognition.onerror = () => {
      setMessage('语音识别失败，请重试或改用键盘输入。')
      setListeningField('')
    }

    recognition.onend = () => {
      recognitionRef.current = null
      setListeningField('')
    }

    recognitionRef.current = recognition
    setListeningField(field)
    recognition.start()
  }

  const saveCurrentMusicList = async (nextTracks) => {
    const payload = {
      recordName: 'musiclist',
      setCurrent: false,
      musicList: nextTracks.map((track, index) => ({
        id: track.id,
        order: index + 1,
        performer: track.performer,
        programName: track.programName,
        hostScript: track.hostScript || '',
        fileName: track.fileName,
        url: track.url,
      })),
    }

    const response = await fetch('/v1/musiclist/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.message || '保存失败')
    }
  }

  const onDeleteTrack = async (trackId) => {
    const target = tracks.find((item) => item.id === trackId)
    if (!target) return

    setDeletingTrack(target)
  }

  const closeDeleteDialog = () => {
    setDeletingTrack(null)
  }

  const confirmDeleteTrack = async () => {
    if (!deletingTrack) return
    const trackId = deletingTrack.id

    const nextTracks = tracks.filter((item) => item.id !== trackId)

    try {
      await saveCurrentMusicList(nextTracks)
      setTracks(nextTracks)
      if (currentTrackId === trackId) {
        setCurrentTrackId(null)
      }
      setMessage('删除并保存成功')
      closeDeleteDialog()
    } catch (error) {
      setMessage(`删除失败：${error.message}`)
    }
  }

  const onGenerateHostScript = async () => {
    const performer = editPerformer.trim()
    const programName = editProgramName.trim()

    if (!performer || !programName) {
      setMessage('请先填写演出人和节目名，再生成口播词')
      return
    }

    try {
      setIsGeneratingScript(true)
      setAiSuggestions([])

      const response = await fetch('/v1/ai/host-script-suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ performer, programName, count: 3 }),
      })

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.message || '生成失败')
      }

      setAiSuggestions(Array.isArray(result.suggestions) ? result.suggestions : [])
      setMessage('已生成口播词候选，可点击下方示例直接填入')
    } catch (error) {
      setMessage(`生成口播词失败：${error.message}`)
    } finally {
      setIsGeneratingScript(false)
    }
  }

  const onSelectSuggestion = (text) => {
    setEditHostScript(text)
  }

  const onConfirmEdit = async () => {
    if (!editingTrack) return

    const performer = editPerformer.trim()
    const programName = editProgramName.trim()

    if (!performer || !programName) {
      setMessage('演出人和节目名不能为空')
      return
    }

    const hostScript = editHostScript.trim()
    let nextTracks

    if (dialogMode === 'create') {
      const newTrack = {
        id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        performer,
        programName,
        hostScript,
        fileName: '手动新增节目（无音频）',
        url: '',
      }
      nextTracks = [...tracks, newTrack]
    } else {
      nextTracks = tracks.map((track) => {
        if (track.id !== editingTrack.id) return track
        return {
          ...track,
          performer,
          programName,
          hostScript,
        }
      })
    }

    try {
      await saveCurrentMusicList(nextTracks)
      setTracks(nextTracks)
      setMessage(dialogMode === 'create' ? '新增并保存成功' : '修改并保存成功')
      closeEditDialog()
    } catch (error) {
      setMessage(`保存失败：${error.message}`)
    }
  }

  const onSaveMusicList = async () => {
    setSaveRecordName('')
    setSaveDialogOpen(true)
  }

  const closeSaveDialog = () => {
    setSaveDialogOpen(false)
    setSaveRecordName('')
  }

  const confirmSaveMusicList = async () => {
    const trimmedName = saveRecordName.trim()
    if (!trimmedName) {
      setMessage('保存失败：演出名称不能为空')
      return
    }

    try {
      const payload = {
        recordName: trimmedName,
        setCurrent: true,
        musicList: tracks.map((track, index) => ({
          order: index + 1,
          performer: track.performer,
          programName: track.programName,
          hostScript: track.hostScript || '',
          fileName: track.fileName,
          url: track.url,
        })),
      }

      const response = await fetch('/v1/musiclist/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.message || '保存失败')
      }

      setMessage(`已保存并设为当前演出：${result.currentShow?.recordName || trimmedName}`)
      await fetchCurrentShow()
      closeSaveDialog()
    } catch (error) {
      setMessage(`保存失败：${error.message}`)
    }
  }

  const createProgramSheetHtml = (title = '节目单') => {
    const now = new Date().toLocaleString('zh-CN')
    const rows = tracks
      .map(
        (track, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(track.performer || '')}</td>
            <td>${escapeHtml(track.programName || '')}</td>
            <td>${escapeHtml(track.hostScript || '')}</td>
          </tr>
        `,
      )
      .join('')

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #222; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    .meta { margin-bottom: 14px; color: #666; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 13px; vertical-align: top; }
    th { background: #f6f6f6; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">导出时间：${now} · 节目总数：${tracks.length}</div>
  <table>
    <thead>
      <tr>
        <th>序号</th>
        <th>演出人</th>
        <th>节目名</th>
        <th>主持人口播词</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="4">暂无节目数据</td></tr>'}
    </tbody>
  </table>
</body>
</html>`
  }

  const openSheetWindow = (title, shouldPrint = false) => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setMessage('浏览器拦截了新窗口，请允许弹窗后重试。')
      return
    }

    printWindow.document.open()
    printWindow.document.write(createProgramSheetHtml(title))
    printWindow.document.close()

    if (shouldPrint) {
      printWindow.onload = () => {
        printWindow.focus()
        printWindow.print()
      }
    }
  }

  const onPrintProgramSheet = () => {
    openSheetWindow('节目单（打印）', true)
  }

  const onExportPdf = () => {
    const defaultName = currentShowName && currentShowName !== '未设置' ? currentShowName : '节目单'
    setExportFileName(defaultName)
    setExportDialogOpen(true)
  }

  const closeExportDialog = () => {
    setExportDialogOpen(false)
    setExportFileName('节目单')
  }

  const confirmExportProgramSheetPdf = async () => {
    try {
      const recordName = exportFileName.trim() || '节目单'
      const response = await fetch('/v1/musiclist/export-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recordName,
          musicList: tracks.map((track, index) => ({
            id: track.id,
            order: index + 1,
            performer: track.performer,
            programName: track.programName,
            hostScript: track.hostScript || '',
            fileName: track.fileName,
            url: track.url,
          })),
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `请求失败（${response.status}）`)
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition') || ''
      const downloadedName = getFileNameFromDisposition(contentDisposition) || `${recordName}.pdf`
      const objectUrl = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = objectUrl
      link.download = downloadedName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)

      setMessage(`PDF 导出成功：${downloadedName}`)
      closeExportDialog()
    } catch (error) {
      setMessage(`导出 PDF 失败：${error.message}`)
    }
  }

  return (
    <div className="container music-container" style={{ fontSize: `${fontScalePercent}%` }}>
      <div className="page-actions">
        <Link to="/page" className="back-link">返回首页</Link>
        <Link to="/page/settings" className="back-link">用户设置</Link>
      </div>

      <h1>音乐播放</h1>

      <div className="playing-marquee-panel" style={{ '--music-marquee-speed': `${marqueeSpeedSec}s` }}>
        <div className="playing-marquee-row" aria-label="当前演出标题滚动显示">
          <div className="playing-marquee-track">
            <span>{`当前演出标题：${currentShowName} · 当前节目：${currentProgramName}`}</span>
            <span>{`当前演出标题：${currentShowName} · 当前节目：${currentProgramName}`}</span>
          </div>
        </div>
        <div className="playing-marquee-row" aria-label="当前演出人员滚动显示">
          <div className="playing-marquee-track">
            <span>{`当前演出人员：${currentPerformerName}`}</span>
            <span>{`当前演出人员：${currentPerformerName}`}</span>
          </div>
        </div>
      </div>

      <div className="music-player-panel">
        <div className="music-playing-title">
          {currentTrack
            ? `正在播放：${currentTrack.performer} - ${currentTrack.programName}`
            : '请选择下方音乐进行播放'}
        </div>
        <audio
          ref={audioRef}
          controls
          className="music-audio"
          src={currentTrack?.url || ''}
        />
      </div>

      {message && <div className="music-message">{message}</div>}

      <div className="music-list-wrap">
        <div className="music-list-header">
          <div className="music-list-title">音乐文件列表（当前演出：{currentShowName}）</div>
          <div className="music-list-actions">
            <button type="button" className="refresh-btn" onClick={openCreateDialog}>新增节目</button>
            <button type="button" className="refresh-btn" onClick={refreshPageData}>刷新列表</button>
            <button type="button" className="refresh-btn" onClick={onPrintProgramSheet}>打印节目单</button>
            <button type="button" className="refresh-btn" onClick={onExportPdf}>导出 PDF</button>
            <button type="button" className="refresh-btn" onClick={onSaveMusicList}>保存演出</button>
          </div>
        </div>
        <table className="music-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>演出人</th>
              <th>节目名</th>
              <th>主持人口播词</th>
              <th>音乐文件名</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track, index) => (
              <tr
                key={track.id}
                draggable
                onDragStart={() => onDragStart(track.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => onDropRow(track.id)}
                onDragEnd={onDragEnd}
                className={draggingId === track.id ? 'dragging-row' : ''}
              >
                <td>{index + 1}</td>
                <td>{track.performer}</td>
                <td>{track.programName}</td>
                <td className="music-host-script" title={track.hostScript}>{track.hostScript || '-'}</td>
                <td className="music-file-name" title={track.fileName}>{track.fileName}</td>
                <td className="music-action-cell">
                  <div className="music-action-buttons">
                    <button
                      className="row-play-btn"
                      onClick={() => onPlay(track.id)}
                      type="button"
                      disabled={!track.url}
                    >
                      播放
                    </button>
                    <button
                      className="row-edit-btn"
                      onClick={() => openEditDialog(track)}
                      type="button"
                    >
                      修改
                    </button>
                    <button
                      className="row-delete-btn"
                      onClick={() => onDeleteTrack(track.id)}
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="music-list-wrap history-wrap">
        <div className="music-list-header">
          <div className="music-list-title">历史演出文件（双击加载并设为当前演出）</div>
        </div>
        <ul className="history-show-list">
          {historyShows.length === 0 ? (
            <li className="empty-text">暂无历史演出文件</li>
          ) : historyShows.map((item) => (
            <li
              key={item.fileName}
              className="history-show-item"
              onDoubleClick={() => switchToHistoryShow(item.fileName)}
              title="双击切换到该演出"
            >
              <span className="history-show-name">{item.recordName}</span>
              <span className="history-show-meta">{item.count} 个节目</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="music-list-wrap effect-wrap">
        <div className="music-list-header">
          <div className="music-list-title">节目效果快捷按钮（电脑端）</div>
        </div>
        <div className="effect-buttons">
          <button type="button" className="refresh-btn" onClick={() => triggerLocalEffect('大笑')}>大笑</button>
          <button type="button" className="refresh-btn" onClick={() => triggerLocalEffect('拍手')}>拍手</button>
          <button type="button" className="refresh-btn" onClick={() => triggerLocalEffect('欢呼')}>欢呼</button>
          <button type="button" className="refresh-btn" onClick={() => triggerLocalEffect('鼓点')}>鼓点</button>
          <input
            className="effect-input"
            value={customEffectName}
            onChange={(e) => setCustomEffectName(e.target.value)}
            placeholder="自定义效果名"
          />
          <button type="button" className="refresh-btn" onClick={triggerCustomEffect}>触发自定义</button>
        </div>
      </div>

      <Modal
        open={!!editingTrack}
        title={dialogMode === 'create' ? '新增节目' : '修改演出信息'}
        onClose={closeEditDialog}
        footer={(
          <>
            <button type="button" className="dialog-btn dialog-btn-secondary" onClick={closeEditDialog}>取消</button>
            <button type="button" className="dialog-btn" onClick={onConfirmEdit}>{dialogMode === 'create' ? '新增并保存' : '保存'}</button>
          </>
        )}
      >
        <div className="dialog-field">
          <label className="dialog-label">语音识别模式</label>
          <select
            className="dialog-select"
            value={speechInputMode}
            onChange={(event) => setSpeechInputMode(event.target.value)}
            disabled={!!listeningField}
          >
            <option value="ai">AI 识别（在线优先）</option>
            <option value="local">本机识别</option>
          </select>
          <div className="dialog-tip">AI 模式会在联网时进行文本优化，无网络时自动回退为本机识别。</div>
          {showModelHintEnabled && speechInputMode === 'ai' && (
            <div className="dialog-tip">当前模式：AI 识别 + 实时文本优化</div>
          )}
          <div className={`dialog-tip ${speechSupported ? '' : 'dialog-tip-warning'}`}>{speechSupportHint}</div>
        </div>

        <div className="dialog-field">
          <label className="dialog-label">演出人</label>
          <div className="dialog-input-row">
            <input
              ref={performerInputRef}
              className="dialog-input"
              value={editPerformer}
              onChange={(event) => setEditPerformer(event.target.value)}
            />
            <button type="button" className="input-tool-btn" onClick={() => handleKeyboardInput('performer')}>键盘</button>
            <button
              type="button"
              className={`input-tool-btn ${listeningField === 'performer' ? 'input-tool-btn-active' : ''}`}
              onClick={() => handleSpeechInput('performer')}
              disabled={!speechSupported || (!!listeningField && listeningField !== 'performer')}
            >
              {listeningField === 'performer' ? '识别中...' : '语音转文字'}
            </button>
          </div>
        </div>

        <div className="dialog-field">
          <label className="dialog-label">节目名</label>
          <div className="dialog-input-row">
            <input
              ref={programInputRef}
              className="dialog-input"
              value={editProgramName}
              onChange={(event) => setEditProgramName(event.target.value)}
            />
            <button type="button" className="input-tool-btn" onClick={() => handleKeyboardInput('program')}>键盘</button>
            <button
              type="button"
              className={`input-tool-btn ${listeningField === 'program' ? 'input-tool-btn-active' : ''}`}
              onClick={() => handleSpeechInput('program')}
              disabled={!speechSupported || (!!listeningField && listeningField !== 'program')}
            >
              {listeningField === 'program' ? '识别中...' : '语音转文字'}
            </button>
          </div>
        </div>

        <div className="dialog-field">
          <label className="dialog-label">主持人口播词</label>
          <textarea
            ref={hostScriptInputRef}
            className="dialog-textarea"
            value={editHostScript}
            onChange={(event) => setEditHostScript(event.target.value)}
            placeholder="可手动输入，或使用 AI 自动生成候选示例"
          />
          <div className="dialog-input-row dialog-top-space">
            <button type="button" className="input-tool-btn" onClick={() => handleKeyboardInput('hostScript')}>键盘</button>
            <button
              type="button"
              className={`input-tool-btn ${listeningField === 'hostScript' ? 'input-tool-btn-active' : ''}`}
              onClick={() => handleSpeechInput('hostScript')}
              disabled={!speechSupported || (!!listeningField && listeningField !== 'hostScript')}
            >
              {listeningField === 'hostScript' ? '识别中...' : '语音转文字'}
            </button>
            <button
              type="button"
              className="input-tool-btn"
              onClick={onGenerateHostScript}
              disabled={isGeneratingScript}
            >
              {isGeneratingScript ? '生成中...' : 'AI 生成口播词示例'}
            </button>
          </div>
          {aiSuggestions.length > 0 && (
            <div className="script-suggestions">
              {aiSuggestions.map((item, index) => (
                <button
                  key={`${item}-${index}`}
                  type="button"
                  className="suggestion-btn"
                  onClick={() => onSelectSuggestion(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={saveDialogOpen}
        title="保存演出"
        onClose={closeSaveDialog}
        footer={(
          <>
            <button type="button" className="dialog-btn dialog-btn-secondary" onClick={closeSaveDialog}>取消</button>
            <button type="button" className="dialog-btn" onClick={confirmSaveMusicList}>保存并设为当前演出</button>
          </>
        )}
      >
        <div className="dialog-field dialog-field-compact">
          <input
            className="dialog-input dialog-input-full"
            value={saveRecordName}
            onChange={(event) => setSaveRecordName(event.target.value)}
            placeholder="请输入演出名称（无需 .json 后缀）"
          />
        </div>
      </Modal>

      <Modal
        open={exportDialogOpen}
        title="导出 PDF"
        onClose={closeExportDialog}
        footer={(
          <>
            <button type="button" className="dialog-btn dialog-btn-secondary" onClick={closeExportDialog}>取消</button>
            <button type="button" className="dialog-btn" onClick={confirmExportProgramSheetPdf}>导出</button>
          </>
        )}
      >
        <div className="dialog-field">
          <label className="dialog-label">文件名称</label>
          <input
            className="dialog-input"
            value={exportFileName}
            onChange={(event) => setExportFileName(event.target.value)}
            placeholder="请输入文件名（无需 .pdf 后缀）"
          />
        </div>
      </Modal>

      <Modal
        open={!!deletingTrack}
        title="删除确认"
        onClose={closeDeleteDialog}
        footer={(
          <>
            <button type="button" className="dialog-btn dialog-btn-secondary" onClick={closeDeleteDialog}>取消</button>
            <button type="button" className="dialog-btn" onClick={confirmDeleteTrack}>确认删除</button>
          </>
        )}
      >
        <div className="dialog-field">
          <div className="dialog-desc">
            {deletingTrack
              ? `确认删除节目「${deletingTrack.performer} - ${deletingTrack.programName}」吗？`
              : '确认删除该节目吗？'}
          </div>
        </div>
      </Modal>
    </div>
  )
}

function escapeHtml(input) {
  return String(input || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getFileNameFromDisposition(disposition) {
  if (!disposition) return ''

  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1])
    } catch {
      return utfMatch[1]
    }
  }

  const plainMatch = disposition.match(/filename="?([^";]+)"?/i)
  return plainMatch?.[1] || ''
}

function mergeRuntimeSettings(input = {}) {
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

export default MusicPage
