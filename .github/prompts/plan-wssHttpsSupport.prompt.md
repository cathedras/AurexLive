## Plan: Add WSS/HTTPS Support

TL;DR - Enable secure WebSocket (WSS) by adding TLS to the backend HTTP server (or terminating TLS at a reverse proxy), provide instructions for dev and production certificates, update the front-end to prefer `wss://` on HTTPS pages, and add verification steps. This is **lowest priority** and targeted as an optional enhancement for secure deployments.

**Steps**
1. Add TLS option to `backend/server.js` to create an `https` server when certs/keys are provided (env toggle `USE_HTTPS`). (*depends on step 2*)
2. Keep `initWebSocket(server)` usage; ensure `wsServer.js` accepts an `https` server so `ws` will support `wss://` automatically. (*parallel with step 1*)
3. Provide developer certificate generation instructions (self-signed or `mkcert`) and example env variables: `SSL_KEY_PATH`, `SSL_CERT_PATH`, `USE_HTTPS=1`.
4. Document production options: a) terminate TLS at reverse proxy (nginx/Caddy/Traefik) and forward `ws://` to backend, or b) provision real certs on the backend using Let's Encrypt.
5. Update `frontend/src/pages/WsDemo.jsx` to select `wss://` when `location.protocol === 'https:'` and fall back to `ws://` otherwise.
6. Add verification steps and necessary troubleshooting notes (browser mixed content, self-signed cert trust, proxy upgrade headers).
7. Add small automated smoke test commands to the README or a script: start with `USE_HTTPS=1` and test with `wscat` (noting cert trust requirements).

**Relevant files**
- backend/server.js — create HTTP or HTTPS server and call `initWebSocket(server)`
- backend/wsServer.js — already accepts `server`; ensure it logs wss endpoints when server is listening
- frontend/src/pages/WsDemo.jsx — detect page protocol and use `wss://` for secure pages

**Verification**
1. Start backend with HTTPS enabled and confirm console prints `ws://`/`wss://` endpoints.
2. Open front-end over HTTPS and connect to `wss://localhost:<port>`; confirm handshake in DevTools Network → WS.
3. Use `wscat` (or equivalent) to connect with `wss://` and verify echo responses.
4. Test reverse-proxy configuration by terminating TLS at nginx and forwarding websocket upgrade to backend; verify connection.

**Decisions**
- Default approach: recommend reverse-proxy TLS termination in production for simpler cert management and process isolation.
- Dev approach: allow self-signed certs or `mkcert` for localhost testing; document steps.

**Further Considerations**
1. Do you want me to implement the code changes in `backend/server.js` now (add HTTPS switch and example env usage), or only document them in this plan? Option A (implement) / Option B (document only).
2. If implementing, confirm preferred dev cert method: self-signed via `openssl` or `mkcert` (recommended).
