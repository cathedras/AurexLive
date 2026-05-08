const VIRTUAL_DEVICE_MATCHER = /black\s?hole|loopback|soundflower|vb[-\s]?cable|voicemeeter|virtual|aggregate|wiretap|dante/i

export const supportsRecordingCapture = () => Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia)

export const getDeviceKindLabel = (kind, t) => {
  switch (kind) {
    case 'virtual':
      return t('Virtual', '虚拟')
    case 'built-in':
      return t('Built-in', '内置')
    case 'external':
      return t('External', '外接')
    case 'monitor':
      return t('Playback', '回放')
    default:
      return ''
  }
}

export const formatDeviceLabel = (device, t) => {
  const baseLabel = String(device?.label || device?.value || '').trim()
  const tags = []

  if (device?.isDefault) {
    tags.push(t('Default', '默认'))
  }

  const kindLabel = getDeviceKindLabel(device?.kind, t)
  if (kindLabel) {
    tags.push(kindLabel)
  }

  if (tags.length === 0) {
    return baseLabel
  }

  return `${baseLabel}（${tags.join('·')}）`
}

export const normalizeDeviceList = (items, t) => {
  if (!Array.isArray(items)) {
    return []
  }

  return items.map((item) => ({
    ...item,
    label: formatDeviceLabel(item, t),
    kind: item?.kind || 'unknown',
    isDefault: Boolean(item?.isDefault),
  }))
}

export const pickDefaultDeviceValue = (items, fallbackMatchers = []) => {
  const defaultItem = items.find((item) => item?.isDefault)
  if (defaultItem) {
    return defaultItem.value
  }

  for (const matcher of fallbackMatchers) {
    const found = items.find((item) => matcher.test(String(item?.label || item?.value || '')))
    if (found) {
      return found.value
    }
  }

  return items[0]?.value || null
}

export const findVirtualDevice = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return null
  }

  return items.find((item) => {
    const name = String(item?.label || item?.value || '')
    return item?.kind === 'virtual' || VIRTUAL_DEVICE_MATCHER.test(name)
  }) || null
}

export const getCurrentTimestamp = () => Date.now()

export const buildAutoRecordingFileName = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `auto-recording-${timestamp}.flac`
}

export const buildExternalAutoMonitorKey = () => `external-auto-${getCurrentTimestamp()}`

export const formatRecordingTime = (seconds) => {
  const mins = Math.floor(Number(seconds || 0) / 60)
  const secs = Math.max(0, Number(seconds || 0) % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export const formatRecordingFileSize = (bytes) => {
  const sizeInBytes = Number(bytes || 0)
  if (sizeInBytes < 1000 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(1)} KB`
  }

  return `${(sizeInBytes / 1024 / 1024).toFixed(2)} MB`
}
