import buildWsAttemptUrls from './ws-addrconfig'

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

// Connect wrapper that attempts multiple urls (same behavior as previous connectRecordingSocket)
export async function connect(param, onMessageVolume, onOpen, onClose, onGenericMessage) {
  const attemptUrls = buildWsAttemptUrls(param);

  return new Promise((resolve, reject) => {
    let finished = false;
    let ai = 0;

    const wrapOnOpen = (ws, ev) => {
      finished = true;
      try { onOpen && onOpen(ev); } catch (e) {}
      const facade = {
        close: () => { try { if (ws) ws.close(); } catch (e) {} },
        send: (data) => { try { if (ws) ws.send(data); } catch (e) {} },
        readyState: () => (ws ? ws.readyState : WebSocket.CLOSED)
      };
      resolve(facade);
    };

    const wrapOnClose = (ev) => {
      try { onClose && onClose(ev); } catch (e) {}
      if (!finished) {
        finished = true;
        reject(new Error('ws_connect_failed'));
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
                if (obj && obj.type === 'volume') onMessageVolume && onMessageVolume(obj.data);
                else onGenericMessage && onGenericMessage(obj);
              } else {
                // binary frame -> try decode text then parse
                try {
                  const txt = uint8ArrayToText(new Uint8Array(evm.data));
                  if (txt) {
                    const obj = JSON.parse(txt);
                    if (obj && obj.type === 'volume') onMessageVolume && onMessageVolume(obj.data);
                    else onGenericMessage && onGenericMessage(obj);
                    return;
                  }
                } catch (e) {}
                // fallback: wrapped binary
                onGenericMessage && onGenericMessage({ type: 'binary', data: evm.data });
              }
            } catch (e) {
              // ignore
            }
          };

          ws.onclose = (ev) => { try { onClose && onClose(ev); } catch (e) {}; };
          ws.onerror = (ev) => { console.error('WS error', ev); };
          wrapOnOpen(ws, ev);
        };

        ws.onerror = () => {
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
