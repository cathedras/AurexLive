import { apiDelete, apiGet, apiPost } from '../apiClientUtil'
import { API_ENDPOINTS } from '../webApiConfig'

export async function fetchLiveRtpCapabilities() {
  return await apiGet(API_ENDPOINTS.webrtc.rtpCapabilities)
}

export async function createLiveSession(sessionId = '') {
  return await apiPost(API_ENDPOINTS.webrtc.sessions, { sessionId })
}

export async function createLiveTransport(sessionId, direction = 'send') {
  return await apiPost(API_ENDPOINTS.webrtc.transports, { sessionId, direction })
}

export async function connectLiveTransport(transportId, dtlsParameters) {
  return await apiPost(API_ENDPOINTS.webrtc.transportConnect(transportId), { dtlsParameters })
}

export async function fetchLiveTransportState(transportId) {
  return await apiGet(API_ENDPOINTS.webrtc.transportDetail(transportId))
}

export async function fetchLiveSession(sessionId) {
  return await apiGet(API_ENDPOINTS.webrtc.sessionDetail(sessionId))
}

export async function fetchLiveSessionProducers(sessionId) {
  return await apiGet(API_ENDPOINTS.webrtc.sessionProducers(sessionId))
}

export async function produceLiveTrack(transportId, kind, rtpParameters, appData = {}) {
  return await apiPost(API_ENDPOINTS.webrtc.transportProduce(transportId), {
    kind,
    rtpParameters,
    appData,
  })
}

export async function consumeLiveTrack(transportId, producerId, rtpCapabilities) {
  return await apiPost(API_ENDPOINTS.webrtc.transportConsume(transportId), {
    producerId,
    rtpCapabilities,
  })
}

export async function resumeLiveConsumer(consumerId) {
  return await apiPost(API_ENDPOINTS.webrtc.consumerResume(consumerId), {})
}

export async function closeLiveSession(sessionId) {
  return await apiDelete(API_ENDPOINTS.webrtc.sessionDetail(sessionId))
}