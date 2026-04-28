function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderFallbackHtml({ title, heading, message, hint = '', actions = [] }) {
  const safeActions = actions
    .map((action) => {
      const label = escapeHtml(action.label)
      const href = escapeHtml(action.href)
      return `<a class="action" href="${href}">${label}</a>`
    })
    .join('')

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#07110e" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #06100d;
        --panel: rgba(10, 19, 15, 0.88);
        --line: rgba(196, 255, 221, 0.12);
        --text: #f2fff8;
        --muted: rgba(242, 255, 248, 0.74);
        --primary: #18c96d;
        --primary-strong: #27df7d;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        color: var(--text);
        font-family: Inter, PingFang SC, Hiragino Sans GB, Segoe UI, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(24, 201, 109, 0.18), transparent 30%),
          radial-gradient(circle at 85% 10%, rgba(255, 191, 93, 0.12), transparent 26%),
          linear-gradient(180deg, #07110e 0%, #091412 48%, #050d0a 100%);
      }

      .shell {
        width: min(100%, 720px);
        position: relative;
      }

      .shell::before {
        content: '';
        position: absolute;
        inset: -22px;
        border-radius: 32px;
        background: radial-gradient(circle at 50% 0%, rgba(24, 201, 109, 0.18), transparent 52%);
        filter: blur(18px);
        z-index: 0;
      }

      .card {
        position: relative;
        z-index: 1;
        border: 1px solid var(--line);
        background: var(--panel);
        border-radius: 28px;
        padding: clamp(24px, 5vw, 40px);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .eyebrow {
        margin: 0 0 10px;
        color: var(--primary-strong);
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        font-weight: 700;
      }

      .headline {
        margin: 0;
        font-size: clamp(34px, 7vw, 60px);
        line-height: 1.04;
        letter-spacing: -0.04em;
      }

      .message {
        margin: 16px 0 0;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.7;
        max-width: 54ch;
      }

      .hint {
        margin: 14px 0 0;
        color: rgba(242, 255, 248, 0.88);
        font-size: 14px;
        line-height: 1.7;
        max-width: 60ch;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 24px;
      }

      .action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        padding: 0 16px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.04);
        color: var(--text);
        text-decoration: none;
        font-weight: 700;
        transition: transform 160ms ease, background 160ms ease;
      }

      .action:hover {
        background: rgba(255, 255, 255, 0.08);
        transform: translateY(-1px);
      }

      .action-primary {
        background: linear-gradient(180deg, var(--primary-strong), var(--primary));
        color: #04110a;
        border-color: transparent;
      }

      .meta {
        margin-top: 24px;
        padding-top: 18px;
        border-top: 1px solid rgba(196, 255, 221, 0.12);
        color: rgba(242, 255, 248, 0.62);
        font-size: 12px;
        line-height: 1.6;
      }

      .code-list {
        margin: 14px 0 0;
        display: grid;
        gap: 8px;
      }

      .code {
        display: block;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.22);
        border: 1px solid rgba(196, 255, 221, 0.12);
        color: #e8fff3;
        font-size: 13px;
        overflow: auto;
      }

      @media (max-width: 640px) {
        body { padding: 12px; }
        .card { border-radius: 22px; }
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          scroll-behavior: auto !important;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="card">
        <p class="eyebrow">AurexLive</p>
        <h1 class="headline">${escapeHtml(heading)}</h1>
        <p class="message">${escapeHtml(message)}</p>
        ${hint ? `<p class="hint">${escapeHtml(hint)}</p>` : ''}
        ${safeActions ? `<div class="actions">${safeActions}</div>` : ''}
        <div class="meta">
          如果你正在本地开发，请优先使用前端开发服务器；如果已经部署，请先确认前端构建产物是否生成。
        </div>
      </section>
    </main>
  </body>
</html>`
}

function renderFrontendBuildMissingHtml() {
  return renderFallbackHtml({
    title: 'AurexLive - Frontend build missing',
    heading: 'Frontend build files are missing',
    message: 'The backend is running, but the frontend production bundle has not been built yet.',
    hint: 'Run npm run build first, or switch to development mode with npm run dev so the frontend pages can be served normally.',
    actions: [
      { label: 'Open Docs', href: '/docs' },
      { label: 'Back Home', href: '/page' },
    ],
  })
}

function renderNotFoundFallbackHtml() {
  return renderFallbackHtml({
    title: 'AurexLive - 404',
    heading: '404 - Page not found',
    message: 'The page you requested does not exist or has moved to a new frontend route.',
    hint: 'Use the home page or return to the previous screen. If this came from an old backend HTML path, it has now been migrated to the frontend.',
    actions: [
      { label: 'Back Home', href: '/page' },
      { label: 'Open Music', href: '/page/music' },
    ],
  })
}

function renderServerErrorFallbackHtml() {
  return renderFallbackHtml({
    title: 'AurexLive - 500',
    heading: '500 - Internal server error',
    message: 'The server ran into an unexpected problem while handling the request.',
    hint: 'Try refreshing the page. If the problem keeps happening, check the backend logs and the current network status.',
    actions: [
      { label: 'Back Home', href: '/page' },
      { label: 'Open Docs', href: '/docs' },
    ],
  })
}

module.exports = {
  renderFallbackHtml,
  renderFrontendBuildMissingHtml,
  renderNotFoundFallbackHtml,
  renderServerErrorFallbackHtml,
}