import { useCallback, useEffect, useState } from 'react'

import { fetchWebRtcSessions } from '../../services/home/homePageService'

export function pickLatestSession(sessions) {
  const sortedSessions = [...(Array.isArray(sessions) ? sessions : [])]
    .filter(Boolean)
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())

  return (
    sortedSessions.find((session) => Number(session?.producerCount || 0) > 0)
    || sortedSessions.find((session) => Number(session?.transportCount || 0) > 0)
    || sortedSessions[0]
    || null
  )
}

export function useLivePreviewSession({ autoLoad = true } = {}) {
  const [latestSession, setLatestSession] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const loadLatestSession = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      const result = await fetchWebRtcSessions()
      if (!result.success || !Array.isArray(result.sessions) || result.sessions.length === 0) {
        setLatestSession(null)
        return null
      }

      const nextSession = pickLatestSession(result.sessions)
      setLatestSession(nextSession)
      return nextSession
    } catch (error) {
      setLatestSession(null)
      setErrorMessage(error?.message || '加载最新会话失败')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!autoLoad) {
      return undefined
    }

    let cancelled = false

    const syncLatestSession = async () => {
      const nextSession = await loadLatestSession()
      if (cancelled) {
        return
      }

      if (nextSession === null) {
        setLatestSession(null)
      }
    }

    void syncLatestSession()

    return () => {
      cancelled = true
    }
  }, [autoLoad, loadLatestSession])

  return {
    latestSession,
    setLatestSession,
    loadLatestSession,
    isLoading,
    errorMessage,
  }
}
