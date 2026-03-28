import React, { useRef, useState, useEffect } from 'react'

export default function WsDemo() {
  const [url, setUrl] = useState(() => {
    // When running frontend dev server (vite) the origin port is different (e.g. 5173).
    // Backend WebSocket server runs on port 3000 by default. Use backend URL in dev.
    try {
      const loc = window.location
      const isDevPort = loc.port && loc.port !== '3000'
      const proto = loc.protocol === 'https:' ? 'wss' : 'ws'
      return isDevPort ? `${proto}://localhost:3000` : loc.origin.replace(/^http/, 'ws')
    } catch (e) {
      return 'ws://localhost:3000'
    }
  })
  const [connected, setConnected] = useState(false)
  const [log, setLog] = useState([])
  const [input, setInput] = useState('')
  const wsRef = useRef(null)

  useEffect(() => {
    function handleWindowError(e) {
      try {
        const loc = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : ''
        const stack = e.error && e.error.stack ? `\n${e.error.stack}` : ''
        appendLog({ type: 'page-error', text: `${e.message} ${loc}${stack}` })
      } catch (err) {
        appendLog({ type: 'page-error', text: String(e) })
      }
    }

    function handleRejection(e) {
      try {
        let reason = e && e.reason ? e.reason : e
        if (typeof reason === 'object') {
          reason = JSON.stringify(reason, Object.getOwnPropertyNames(reason))
        }
        appendLog({ type: 'unhandledrejection', text: `UnhandledRejection: ${reason}` })
      } catch (err) {
        appendLog({ type: 'unhandledrejection', text: String(e) })
      }
    }

    window.addEventListener('error', handleWindowError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('unhandledrejection', handleRejection)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [])

  function formatTime(date) {
    try {
      const d = new Date(date)
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      const ss = String(d.getSeconds()).padStart(2, '0')
      const ms = String(d.getMilliseconds()).padStart(3, '0')
      return `${hh}:${mm}:${ss}.${ms}`
    } catch (e) {
      return new Date().toISOString()
    }
  }

  function appendLog(item) {
    const ts = formatTime(new Date())
    setLog((l) => [...l, { ts, ...item }])
  }

  function connect() {
    if (wsRef.current) return
    try {
      const ws = new WebSocket(url)
      wsRef.current = ws
      appendLog({ type: 'system', text: `Connecting to ${url}...` })

      ws.onopen = () => {
        setConnected(true)
        appendLog({ type: 'system', text: 'Connected' })
      }

      ws.onmessage = (ev) => {
        let text = ev.data
        try {
          const obj = JSON.parse(ev.data)
          text = JSON.stringify(obj, null, 2)
        } catch (e) {
          appendLog({ type: 'parse-error', text: `Failed to parse JSON: ${e.message} raw=${String(ev.data).slice(0, 500)}` })
        }
        appendLog({ type: 'recv', text })
      }

      ws.onclose = (ev) => {
        setConnected(false)
        wsRef.current = null
        appendLog({ type: 'system', text: `Disconnected (code=${ev.code} reason=${ev.reason || ''})` })
      }

      ws.onerror = (ev) => {
        // ev is often an Event with little detail; try to surface any useful props
        let info = ''
        try {
          if (ev && ev.message) info = ev.message
          else if (ev && ev.error && ev.error.message) info = ev.error.message
          else info = JSON.stringify(ev)
        } catch (err) {
          info = String(ev)
        }
        appendLog({ type: 'error', text: `WebSocket error: ${info}` })
      }

      // extra: catch addEventListener error events with more info
      try {
        ws.addEventListener('error', (e) => {
          appendLog({ type: 'error', text: `WebSocket event error: ${JSON.stringify(e)}` })
        })
      } catch (e) {}
    } catch (err) {
      appendLog({ type: 'error', text: String(err) })
    }
  }

  function disconnect() {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }

  function send() {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      appendLog({ type: 'error', text: 'WebSocket is not open' })
      return
    }
    let payload = input
    try {
      JSON.parse(input)
      payload = input
    } catch (e) {
      payload = input
    }
    try {
      wsRef.current.send(payload)
      appendLog({ type: 'sent', text: payload })
    } catch (err) {
      appendLog({ type: 'error', text: `Send failed: ${err && err.message ? err.message : String(err)}` })
    }
    setInput('')
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>WebSocket Client Demo</h2>

      <div style={{ marginBottom: 8 }}>
        <label style={{ display: 'block', marginBottom: 4 }}>WebSocket URL</label>
        <input style={{ width: '80%' }} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button onClick={connect} disabled={connected} style={{ marginLeft: 8 }}>Connect</button>
        <button onClick={disconnect} disabled={!connected} style={{ marginLeft: 8 }}>Disconnect</button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ display: 'block', marginBottom: 4 }}>Send message (JSON or text)</label>
        <input style={{ width: '70%' }} value={input} onChange={(e) => setInput(e.target.value)} />
        <button onClick={send} style={{ marginLeft: 8 }}>Send</button>
      </div>

      <div style={{ border: '1px solid #ddd', padding: 8, height: 300, overflow: 'auto', background: '#fafafa' }}>
        {log.map((item, idx) => (
          <div key={idx} style={{ marginBottom: 6, whiteSpace: 'pre-wrap' }}>
            <strong>[{item.ts}][{item.type}]</strong> {item.text}
          </div>
        ))}
      </div>
    </div>
  )
}
