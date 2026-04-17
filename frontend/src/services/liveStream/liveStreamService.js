import { apiDelete, apiGet, apiPost } from '../apiClientUtil'

export async function fetchLiveRtpCapabilities() {
  return await apiGet('/v1/webrtc/rtp-capabilities')
}

export async function createLiveSession(sessionId = '') {
  return await apiPost('/v1/webrtc/sessions', { sessionId })
}

export async function createLiveTransport(sessionId, direction = 'send') {
  return await apiPost('/v1/webrtc/transports', { sessionId, direction })
}

export async function connectLiveTransport(transportId, dtlsParameters) {
  return await apiPost(`/v1/webrtc/transports/${transportId}/connect`, { dtlsParameters })
}

export async function produceLiveTrack(transportId, kind, rtpParameters, appData = {}) {
  return await apiPost(`/v1/webrtc/transports/${transportId}/produce`, {
    kind,
    rtpParameters,
    appData,
  })
}

export async function consumeLiveTrack(transportId, producerId, rtpCapabilities) {
  return await apiPost(`/v1/webrtc/transports/${transportId}/consume`, {
    producerId,
    rtpCapabilities,
  })
}

export async function resumeLiveConsumer(consumerId) {
  return await apiPost(`/v1/webrtc/consumers/${consumerId}/resume`, {})
}

export async function closeLiveSession(sessionId) {
  return await apiDelete(`/v1/webrtc/sessions/${sessionId}`)
}