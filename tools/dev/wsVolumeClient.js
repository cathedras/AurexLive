const WebSocket = require('ws');
const { getDefaultWsUrl } = require('./getDefaultWsUrl');

// Connect to local server as a volume client. Adjust device suffix as needed.
const url = getDefaultWsUrl();

console.log('Connecting to', url);
const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('WS open');
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    console.log('<<', msg.type, JSON.stringify(msg.data));
  } catch (e) {
    console.log('<< raw', data.toString());
  }
});

ws.on('close', () => {
  console.log('WS closed');
});

ws.on('error', (err) => {
  console.error('WS error', err && err.message);
});

// Close after 8 seconds to allow monitor to start and persist
setTimeout(() => {
  console.log('Closing connection after timeout');
  ws.close();
}, 8000);
