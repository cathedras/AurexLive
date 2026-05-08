import buildWsAttemptUrls, { buildWsTrustHint } from './ws-addrconfig'

// Helpers: convert text <-> Uint8Array and base64 helpers
export function textToUint8Array(text) {
  const encoder = new TextEncoder();
  return encoder.encode(text);
}

export function uint8ArrayToText(u8) {
  try {
    const decoder = new TextDecoder();
    return decoder.decode(u8);
  } catch (e) {
    return null;
  }
}

export function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// send helpers
export function sendJsonAsText(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch (e) {}
}

export function sendJsonAsBinary(ws, obj) {
  try {
    const s = JSON.stringify(obj);
    const u8 = textToUint8Array(s);
    ws.send(u8);
  } catch (e) {}
}

// Connect wrapper that attempts multiple urls.
export async function connect(clientTypeOrParam, paramOrOnMessageVolume, onMessageVolume, onOpen, onClose, onGenericMessage) {
  const isLegacySignature = typeof paramOrOnMessageVolume === 'function';
  const clientType = isLegacySignature ? String(clientTypeOrParam || 'ws') : String(clientTypeOrParam || 'ws');
  const connectionParam = isLegacySignature ? undefined : paramOrOnMessageVolume;
  const volumeHandler = isLegacySignature ? paramOrOnMessageVolume : onMessageVolume;
  const openHandler = isLegacySignature ? onMessageVolume : onOpen;
  const closeHandler = isLegacySignature ? onOpen : onClose;
  const genericHandler = isLegacySignature ? onClose : onGenericMessage;
  const attemptUrls = buildWsAttemptUrls(clientType, connectionParam);
  console.log('WSClientService connect, attemptUrls=', attemptUrls);
  return new Promise((resolve, reject) => {
    let finished = false;
    let ai = 0;
    let volumeFrameId = null;
    let volumeQueued = null;

    const flushVolumeMessage = () => {
      volumeFrameId = null;
      if (volumeQueued == null) {
        return;
      }

      const nextVolume = volumeQueued;
      volumeQueued = null;

      try {
        volumeHandler && volumeHandler(nextVolume);
      } catch (e) {}
    };

    const queueVolumeMessage = (volumeData) => {
      volumeQueued = volumeData;

      if (volumeFrameId != null) {
        return;
      }

      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        volumeFrameId = window.requestAnimationFrame(flushVolumeMessage);
      } else {
        volumeFrameId = setTimeout(flushVolumeMessage, 16);
      }
    };

    const cancelQueuedVolumeMessage = () => {
      if (volumeFrameId == null) {
        volumeQueued = null;
        return;
      }

      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(volumeFrameId);
      } else {
        clearTimeout(volumeFrameId);
      }

      volumeFrameId = null;
      volumeQueued = null;
    };

    const wrapOnOpen = (ws, ev) => {
      finished = true;
      try { openHandler && openHandler(ev); } catch (e) {}
      const facade = {
        close: () => { try { if (ws) ws.close(); } catch (e) {} },
        send: (data) => { try { if (ws) ws.send(data); } catch (e) {} },
        readyState: () => (ws ? ws.readyState : WebSocket.CLOSED)
      };
      resolve(facade);
    };

    const wrapOnClose = (ev) => {
      cancelQueuedVolumeMessage();
      try { closeHandler && closeHandler(ev); } catch (e) {}
      if (!finished) {
        finished = true;
        const trustHint = buildWsTrustHint(attemptUrls);
        const error = new Error(trustHint ? `ws_connect_failed: ${trustHint}` : 'ws_connect_failed');
        error.code = 'ws_connect_failed';
        error.hint = trustHint;
        error.attemptUrls = attemptUrls.slice();
        reject(error);
      }
    };

    const tryNext = () => {
      if (ai >= attemptUrls.length) { wrapOnClose(new Event('error')); return; }
      const url = attemptUrls[ai++];
      try {
        const ws = new WebSocket(url);
        let localTimeout = null;

        ws.onopen = (ev) => {
          if (localTimeout) { clearTimeout(localTimeout); localTimeout = null; }
          ws.onmessage = (evm) => {
            try {
              const data = evm.data;
              // try parse JSON text
              if (typeof data === 'string') {
                const obj = JSON.parse(data);
                  if (obj && obj.type === 'volume') queueVolumeMessage(obj.data);
                else genericHandler && genericHandler(obj);
              } else {
                // binary frame -> try decode text then parse
                try {
                  const txt = uint8ArrayToText(new Uint8Array(evm.data));
                  if (txt) {
                    const obj = JSON.parse(txt);
                      if (obj && obj.type === 'volume') queueVolumeMessage(obj.data);
                    else genericHandler && genericHandler(obj);
                    return;
                  }
                } catch (e) {}
                // fallback: wrapped binary
                genericHandler && genericHandler({ type: 'binary', data: evm.data });
              }
            } catch (e) {
              // ignore
            }
          };

          ws.onclose = (ev) => { try { closeHandler && closeHandler(ev); } catch (e) {}; };
          ws.onerror = (ev) => { console.error('WS error', ev); };
          wrapOnOpen(ws, ev);
        };

        ws.onerror = () => {
          cancelQueuedVolumeMessage();
          if (localTimeout) { clearTimeout(localTimeout); localTimeout = null; }
          try { ws.close(); } catch (e) {}
          tryNext();
        };

        localTimeout = setTimeout(() => {
          try { ws.close(); } catch (e) {}
          tryNext();
        }, 3000);
      } catch (e) {
        tryNext();
      }
    };

    tryNext();
  });
}

export default { connect, sendJsonAsText, sendJsonAsBinary, textToUint8Array, uint8ArrayToText, arrayBufferToBase64, base64ToArrayBuffer };
