const WebSocket = require('ws');
const fetch = globalThis.fetch || ((...args) => import('node-fetch').then(({default: fetch}) => fetch(...args)));

async function run() {
  const url = 'ws://localhost:3000/';
  console.log('Connecting to', url);
  const ws = new WebSocket(url);

  ws.on('open', async () => {
    console.log('WS open');
    // wait briefly then call debug endpoint
    setTimeout(async () => {
      try {
        const resp = await fetch('http://localhost:3000/v1/debug/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ volume: 77, extra: { test: true } })
        });
        console.log('HTTP trigger status:', resp.status);
        const j = await resp.json();
        console.log('HTTP response:', j);
      } catch (e) {
        console.error('HTTP trigger failed', e && e.message);
      }
    }, 500);

    // close after a short while
    setTimeout(() => {
      console.log('Closing WS');
      ws.close();
    }, 2500);
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log('<<', msg.type, JSON.stringify(msg.data));
    } catch (e) {
      console.log('<< raw', data.toString());
    }
  });

  ws.on('close', () => console.log('WS closed'));
  ws.on('error', (err) => console.error('WS error', err && err.message));
}

run();
