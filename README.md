# AurexLive

AurexLive is a premium live production control platform built with Express and React (Vite). It brings together file uploads, setlist management, current show display, recording control, WebSocket-based real-time communication, and PDF export in one unified workflow for stage production and live operations.

## Capabilities

- File uploads and file list browsing
- Music setlist management
  - Add, edit, and delete items
  - Drag-and-drop reordering
  - Linked display of the current set and current show
  - Setlist PDF export
- Show control and real-time state
  - Save and switch the current show state
  - Display the current set, current show, and live entry on the home page
  - Real-time show state, effect triggering, and backend playback control
- Recording and device management
  - Enumerate recording input devices
  - Enumerate recording output devices
  - Switch the default output device
  - Start and stop backend recording
  - Browse recordings and recording files
- AI assistance
  - Generate candidate host script lines
  - Text polishing and correction endpoints
- Live streaming and mobile
  - Live preview page
  - Live streaming page
  - Mobile camera and mobile control page
  - WebRTC-related endpoints
- Operations and diagnostics
  - Frontend error reporting
  - Swagger API documentation
  - PM2 process management

## Roadmap

- Push to online multi-media live streaming platforms
- Read files uploaded through WeChat ✅
- Optimize audio and video playback bitrates for preview, storage, and online playback
- AI API integration
- Professional audio tuning tools (future plan)

## Tech Stack

- Backend technologies: Node.js, Express, WebSocket, ffmpeg, pdfkit, multer, swagger-ui-express
- Frontend technologies: React 19, Vite, React Router, Axios, mediasoup-client
- Runtime directories: `uploads/`, `recordings/`, `runtime/`, `show_record/`

## Project Structure

```text
backend/      # Express backend, routes, services, middleware, OpenAPI
frontend/     # React + Vite frontend
runtime/      # Runtime JSON configuration
recordings/   # Recording files
show_record/  # Historical show record JSON files
uploads/      # Uploaded files directory
certs/        # Local HTTPS certificates
```

## Routes

Frontend pages are accessed through routes that start with `/page`:

- `/page` Home
- `/page/upload` File upload
- `/page/music` Setlist and show control
- `/page/recording` Recording
- `/page/live-stream` Live streaming
- `/page/live-preview` Live preview
- `/page/settings` Settings
- `/page/ws-demo` WebSocket demo

## Install Dependencies

Run the following in the project root:

```bash
npm install
```

## Local Development

Start the backend, frontend, and monitoring process with one command:

```bash
npm run dev
```

This is equivalent to running the following at the same time:

- `npm run server:dev`: backend hot reload
- `node backend/monitorWorker.js`: monitoring process
- `npm run client`: frontend Vite development server

Default URLs:

- Backend: `http://localhost:3000`
- Frontend development server: usually `http://localhost:5173`
- API docs: `http://localhost:3000/docs`

## Common Scripts

```bash
npm run server        # Start backend only
npm run server:dev    # Backend development mode (watch)
npm run client        # Start frontend Vite only
npm run build         # Build the frontend production bundle
npm test              # Run backend tests
npm run pm2:start     # Start PM2 using ecosystem.config.js
npm run pm2:stop      # Stop PM2
npm run pm2:restart   # Restart PM2
npm run pm2:logs      # View PM2 logs
```

## API Preview

Swagger UI is integrated into the project:

- Docs page: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs/openapi.json`

The main documented API prefixes include:

- `/v1/upload`
- `/v1/files`
- `/v1/music/*`
- `/v1/recording/*`
- `/v1/show/*`
- `/v1/shows`
- `/v1/ai/*`
- `/v1/settings`
- `/v1/live/*`
- `/v1/mobile/*`
- `/v1/client-error`
- `/v1/webrtc`

The recording-related APIs cover input and output device enumeration, output device switching, recording start and stop, recording lists, and recording conversion. The AI APIs cover candidate host script generation and text correction.

## Environment Variables

### Backend

On startup, the backend loads the environment file from the project root in this order:

- Development: `.env.dev`
- Production: `.env.prd`
- You can also specify a custom file name with `ENV_FILE`

Common backend variables:

- `PORT`: backend port, default `3000`
- `NODE_ENV`: runtime environment
- `USE_HTTPS`: force HTTPS / WSS
- `SSL_KEY_PATH`: HTTPS private key path
- `SSL_CERT_PATH`: HTTPS certificate path
- `SWAGGER_AUTO_EXPOSE`: control whether Swagger docs are exposed automatically
- `FRONTEND_DEV_SERVER_URL`: frontend address in development
- `USE_VITE_DEV_SERVER`: whether to redirect to the Vite development server in development
- `AI_API_KEY` or `OPENAI_API_KEY`
- `AI_API_BASE_URL` or `OPENAI_BASE_URL`
- `AI_API_MODEL` or `OPENAI_MODEL`

### Frontend

- `VITE_API_BASE_URL`: API base URL, default can follow the project convention `/v1`
- `VITE_API_PORT`: backend port used for WebSocket URL derivation, default `3000`

Frontend WebSocket connections automatically switch to `wss` in HTTPS environments.

## Data Files

- `runtime/musiclist.json`: current setlist
- `runtime/current_show.json`: current show state
- `runtime/user_settings.json`: user settings
- `runtime/live_state.json`: real-time show control state
- `recordings/`: recording output files
- `show_record/*.json`: historical show records

## Recording and System Audio

The recording and output-switching workflow is implemented primarily in [backend/routes/recordingRoutes.js](backend/routes/recordingRoutes.js) and [backend/services/recordingService.js](backend/services/recordingService.js). The project currently supports recording input device enumeration, output device enumeration, default output device switching, and ffmpeg-based recording and transcoding.

On macOS, recording system audio usually requires a virtual audio device such as BlackHole 2ch or Loopback. If you also want to keep audio playing through speakers during recording, combine the speaker output and the virtual device with a Multi-Output Device in Audio MIDI Setup.

## Deployment Notes

### PM2

```bash
npm install
npm run build
npm run pm2:start
```

### One-Click Deploy

```bash
npm run deploy
```

This command will:

- install project dependencies with `npm ci` when a lockfile is present
- build the frontend production bundle
- start or reload the PM2 applications defined in `ecosystem.config.js`
- save the current PM2 process list

If dependencies are already installed on the target machine, you can skip reinstalling them:

```bash
SKIP_INSTALL=1 npm run deploy
```

### Nginx Reverse Proxy

```nginx
server {
  listen 80;
  server_name your-domain.com;

  client_max_body_size 200m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

If you need HTTPS, configure `USE_HTTPS=1` and the corresponding certificate paths, or terminate TLS at the Nginx layer.

For mobile QR access, set `MOBILE_BASE_URL` when you want the QR codes and redirects to use a specific HTTPS origin such as a public domain or an internal LAN host covered by the certificate SAN. If `MOBILE_BASE_URL` is not set, the backend derives the origin from the incoming request and falls back to the local LAN address when the page is opened on `localhost`.

### Public CA + Internal Domain

If you want the site to run on an internal domain while using a publicly trusted certificate, keep the DNS record internal and point it to the backend's LAN IP, then deploy a certificate issued by a public CA that covers the same hostname.

Example production environment values:

```bash
NODE_ENV=production
PORT=3000
USE_HTTPS=1
SSL_KEY_PATH=/etc/ssl/private/aurexlive.key
SSL_CERT_PATH=/etc/ssl/certs/aurexlive.crt
PUBLIC_BASE_URL=https://intra.example.com
MOBILE_BASE_URL=https://intra.example.com
```

`PUBLIC_BASE_URL` is used by mobile QR links and redirects when you want a fixed HTTPS origin. `MOBILE_BASE_URL` can be the same value when the backend should always emit the internal domain.

### Cross-Platform Deployment

The deployment model is platform-agnostic. You can put TLS termination and request routing in any reverse proxy or edge layer that can forward standard HTTP headers, such as Nginx, Caddy, Traefik, Apache, IIS, HAProxy, or a tunnel/edge product that preserves the `Host` and `X-Forwarded-*` headers.

Keep the application contract the same across platforms:

```bash
NODE_ENV=production
PORT=3000
USE_HTTPS=0
PUBLIC_BASE_URL=https://intra.example.com
MOBILE_BASE_URL=https://intra.example.com
```

If the platform terminates TLS before the backend, the backend can remain HTTP and the proxy must forward `X-Forwarded-Proto: https`. If the platform cannot terminate TLS cleanly, enable `USE_HTTPS=1` in the backend and point it at the certificate files instead.

The backend only needs three things from the host platform:

- A stable HTTPS origin that matches the certificate SAN
- A request path preserved by the proxy
- Forwarded host/proto headers when TLS is terminated upstream

## Notes

- The home page and setlist page read the current show and current set state.
- PDF export is generated by the backend.
- The codebase already includes reserved pages and APIs for mobile control, live streaming, and WebRTC.

