import { useEffect } from 'react'

export function useBackendPlaybackStream({ backendPlayback, requestBackendPlaybackState, setBackendPlayback }) {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      return undefined
    }

    let cancelled = false
    let eventSource = null

    const fetchLatestState = async () => {
      try {
        const result = await requestBackendPlaybackState()
        if (!result.success || !result.state) {
          return null
        }

        setBackendPlayback(result.state)
        return result.state
      } catch {
        setBackendPlayback((prev) => ({
          ...prev,
          available: false,
          state: 'idle',
        }))
        return null
      }
    }

    const startProgressStream = async () => {
      const latestState = (await fetchLatestState()) || null
      if (cancelled || !latestState?.available) {
        return
      }

      const playbackState = String(latestState.state || '').trim()
      if (!['playing', 'paused', 'stopping'].includes(playbackState)) {
        return
      }

      eventSource = new window.EventSource('/v1/music/backend-progress/stream')

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data || '{}'))
          if (!payload?.success || !payload?.state) {
            return
          }

          setBackendPlayback((prev) => ({
            ...prev,
            ...payload.state,
          }))
        } catch {
          // ignore parse failures
        }
      }

      eventSource.onerror = async () => {
        eventSource?.close()
        eventSource = null

        if (!cancelled) {
          await fetchLatestState()
        }
      }
    }

    startProgressStream()

    return () => {
      cancelled = true
      eventSource?.close()
    }
  }, [backendPlayback.available, backendPlayback.state, requestBackendPlaybackState, setBackendPlayback])
}