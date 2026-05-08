import { useCallback, useEffect, useRef, useState } from 'react'

import { getRecordingList, listInputDevices, listOutputDevices } from '../../services/musicPlay/recordService'
import { normalizeDeviceList, pickDefaultDeviceValue } from './recordingUtils'

export function useRecordingCatalog({ t, isMacPlatform }) {
  const cancelledRef = useRef(false)
  const [recordings, setRecordings] = useState([])
  const [devices, setDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [outputDevices, setOutputDevices] = useState([])
  const [selectedOutputDevice, setSelectedOutputDevice] = useState(null)
  const [livePlaybackUnavailable, setLivePlaybackUnavailable] = useState(isMacPlatform)

  const loadRecordings = useCallback(async () => {
    try {
      const result = await getRecordingList()
      if (cancelledRef.current) {
        return []
      }

      if (result.success) {
        setRecordings(Array.isArray(result.data) ? result.data : [])
        return Array.isArray(result.data) ? result.data : []
      }

      return []
    } catch {
      if (!cancelledRef.current) {
        setRecordings([])
      }
      return []
    }
  }, [])

  const loadDeviceLists = useCallback(async () => {
    try {
      const musicPlay = await import('../../services/musicPlay')
      const devRes = await musicPlay.listInputDevices()
      if (!cancelledRef.current && devRes && devRes.success) {
        const raw = devRes.raw || ''
        const plat = devRes.platform || ''
        setLivePlaybackUnavailable(plat === 'darwin' || isMacPlatform)

        let parsed = normalizeDeviceList(Array.isArray(devRes.devices) ? devRes.devices : [], t)

        if (parsed.length === 0) {
          if (plat === 'darwin') {
            const lines = raw.split(/\r?\n/)
            let inAudio = false
            for (const line of lines) {
              const l = line.trim()
              if (!l) continue
              if (/AVFoundation audio devices/i.test(l)) {
                inAudio = true
                continue
              }
              if (/AVFoundation video devices/i.test(l)) {
                inAudio = false
                continue
              }
              if (inAudio) {
                const m = l.match(/\[(?:.*?)\]\s*\[(\d+)\]\s*(.+)$/)
                if (m) {
                  const idx = m[1]
                  const name = m[2]
                  parsed.push({ label: `${name} (${t('Input', '输入')})`, value: `:${idx}` })
                }
              }
            }
          }

          if (parsed.length === 0) {
            const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
            parsed = lines.map((line) => ({ label: line, value: line }))
          }
        }

        setDevices(parsed)
        if (parsed.length) {
          const defaultDevice = pickDefaultDeviceValue(parsed, [
            /macbook|built-?in|internal|default/i,
            /microphone|default|loopback/i,
            /pulse|alsa/i,
          ])

          setSelectedDevice(defaultDevice)
        }
      }
    } catch {
      // Keep existing device state when listing fails.
    }

    try {
      const musicPlay = await import('../../services/musicPlay')
      const outRes = await musicPlay.listOutputDevices()
      if (cancelledRef.current) {
        return
      }

      if (outRes && outRes.success) {
        let parsed = normalizeDeviceList(Array.isArray(outRes.devices) ? outRes.devices : [], t)

        if (parsed.length === 0) {
          const raw = outRes.raw || ''
          const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
          parsed = lines
            .filter((line) => !/^audio:$/i.test(line) && !/^devices:$/i.test(line))
            .map((line, index) => ({ label: line.length > 120 ? `${line.substring(0, 120)}…` : line, value: line || String(index) }))
        }

        setOutputDevices(parsed)
        if (parsed.length) {
          setSelectedOutputDevice(parsed.find((item) => item.isDefault)?.value || parsed[0].value)
        }
      }
    } catch {
      // Keep existing output state when listing fails.
    }
  }, [isMacPlatform, t])

  useEffect(() => {
    cancelledRef.current = false
    void loadRecordings()
    void loadDeviceLists()

    return () => {
      cancelledRef.current = true
    }
  }, [loadDeviceLists, loadRecordings])

  return {
    recordings,
    setRecordings,
    loadRecordings,
    devices,
    setDevices,
    selectedDevice,
    setSelectedDevice,
    outputDevices,
    setOutputDevices,
    selectedOutputDevice,
    setSelectedOutputDevice,
    livePlaybackUnavailable,
    setLivePlaybackUnavailable,
  }
}
