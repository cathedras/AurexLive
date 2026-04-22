import { useEffect, useRef, useState } from 'react'

function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function buildSpeechSupportHint(supported) {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent || ''
  const isWindows = /Windows/i.test(userAgent)
  const isChromeOrEdge = /Chrome|Edg/i.test(userAgent)

  if (!supported) {
    return '当前浏览器不支持语音识别。建议使用 Windows 下的 Edge 或 Chrome。'
  }

  if (isWindows && !isChromeOrEdge) {
    return '当前浏览器语音支持可能不稳定，建议使用 Windows 下的 Edge 或 Chrome。'
  }

  return '当前浏览器支持语音识别。'
}

function joinSpeechText(...parts) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(' ').trim()
}

export function useSpeechRecognition({
  speechInputMode,
  speechLanguage,
  offlineFallbackEnabled,
  aiTextOptimizeEnabled,
  getFieldValue,
  setFieldValue,
  refineSpeechText,
  onMessage,
}) {
  const recognitionRef = useRef(null)
  const speechBaseTextRef = useRef('')
  const speechFinalTextRef = useRef('')
  const speechProcessQueueRef = useRef(Promise.resolve())
  const latestOptionsRef = useRef({
    speechInputMode,
    speechLanguage,
    offlineFallbackEnabled,
    aiTextOptimizeEnabled,
    getFieldValue,
    setFieldValue,
    refineSpeechText,
    onMessage,
  })
  const initialSpeechSupported = Boolean(getSpeechRecognitionCtor())
  const [listeningField, setListeningField] = useState('')
  const [speechSupported] = useState(initialSpeechSupported)
  const [speechSupportHint] = useState(buildSpeechSupportHint(initialSpeechSupported))

  useEffect(() => {
    latestOptionsRef.current = {
      speechInputMode,
      speechLanguage,
      offlineFallbackEnabled,
      aiTextOptimizeEnabled,
      getFieldValue,
      setFieldValue,
      refineSpeechText,
      onMessage,
    }
  }, [
    aiTextOptimizeEnabled,
    getFieldValue,
    offlineFallbackEnabled,
    onMessage,
    refineSpeechText,
    setFieldValue,
    speechInputMode,
    speechLanguage,
  ])

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

  useEffect(() => stopRecognition, [])

  const flushSpeechDisplay = (field, interimText = '') => {
    const merged = joinSpeechText(speechBaseTextRef.current, speechFinalTextRef.current, interimText)
    latestOptionsRef.current.setFieldValue(field, merged)
  }

  const refineSpeechChunk = async (chunkText, field) => {
    const rawText = String(chunkText || '').trim()
    if (!rawText) {
      return ''
    }

    if (latestOptionsRef.current.speechInputMode !== 'ai' || !latestOptionsRef.current.aiTextOptimizeEnabled) {
      return rawText
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return rawText
    }

    try {
      const result = await latestOptionsRef.current.refineSpeechText({ text: rawText, field })
      if (!result.success) {
        return rawText
      }

      return String(result.text || rawText).trim() || rawText
    } catch {
      return rawText
    }
  }

  const handleSpeechInput = (field) => {
    const SpeechRecognition = getSpeechRecognitionCtor()
    if (!SpeechRecognition) {
      latestOptionsRef.current.onMessage('当前浏览器不支持语音转文字，请使用键盘输入。')
      return
    }

    if (listeningField && listeningField !== field) {
      latestOptionsRef.current.onMessage('已有语音识别进行中，请稍后再试。')
      return
    }

    if (listeningField === field) {
      stopRecognition()
      return
    }

    stopRecognition()

    if (latestOptionsRef.current.speechInputMode === 'ai' && typeof navigator !== 'undefined' && !navigator.onLine) {
      if (!latestOptionsRef.current.offlineFallbackEnabled) {
        latestOptionsRef.current.onMessage('当前无网络，且设置为不回退本机识别，请切换到本机识别后重试。')
        return
      }
      latestOptionsRef.current.onMessage('当前无网络，已自动回退到本机语音识别。')
    }

    const recognition = new SpeechRecognition()
    recognition.lang = latestOptionsRef.current.speechLanguage || 'zh-CN'
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 1

    speechBaseTextRef.current = field === 'hostScript' ? String(latestOptionsRef.current.getFieldValue(field) || '').trim() : ''
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
      latestOptionsRef.current.onMessage('语音识别失败，请重试或改用键盘输入。')
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

  return {
    listeningField,
    speechSupported,
    speechSupportHint,
    stopRecognition,
    handleSpeechInput,
  }
}