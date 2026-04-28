import { Link } from 'react-router-dom'

import { useLanguage } from '../context/languageContext'

import './SystemNoticePage.css'

const VARIANT_CONFIG = {
  notFound: {
    eyebrow: '404 / Not Found',
    title: '页面不存在',
    titleEn: 'Page not found',
    subtitle: '你访问的地址不存在，或者已经迁移到新的前端路由。',
    subtitleEn: 'The route you requested does not exist, or it has moved to a new frontend page.',
    accent: '404',
    tone: 'warn',
    primaryLabel: '返回首页',
    secondaryLabel: '返回上一页',
    tertiaryLabel: '打开音乐页',
    primaryTo: '/page',
    tertiaryTo: '/page/music',
    details: [
      '旧的后端 HTML 页面已迁移到前端。',
      '如果这是从旧书签进入的地址，请更新到新的路由。',
    ],
  },
  serverError: {
    eyebrow: '500 / Server Error',
    title: '服务器内部错误',
    titleEn: 'Internal server error',
    subtitle: '后端在处理请求时遇到了意外问题，请稍后再试。',
    subtitleEn: 'The backend encountered an unexpected problem while handling the request.',
    accent: '500',
    tone: 'danger',
    primaryLabel: '重新加载',
    secondaryLabel: '返回首页',
    tertiaryLabel: '查看状态页',
    primaryTo: null,
    tertiaryTo: '/docs',
    details: [
      '先重试一次页面。',
      '如果问题持续存在，请检查后端日志与网络状态。',
    ],
  },
  buildMissing: {
    eyebrow: 'Build Missing',
    title: '前端构建文件缺失',
    titleEn: 'Frontend build files are missing',
    subtitle: '后端正在运行，但前端生产构建产物还没有生成。',
    subtitleEn: 'The backend is running, but the frontend production bundle has not been generated yet.',
    accent: 'B',
    tone: 'good',
    primaryLabel: '查看文档',
    secondaryLabel: '返回首页',
    tertiaryLabel: '打开设置',
    primaryTo: '/docs',
    tertiaryTo: '/page/settings',
    details: [
      '执行 npm run build 生成前端静态资源。',
      '本地开发可直接使用 npm run dev。',
    ],
    commands: ['npm run build', 'npm run dev'],
  },
}

function SystemNoticePage({ variant = 'notFound' }) {
  const { t } = useLanguage()
  const config = VARIANT_CONFIG[variant] || VARIANT_CONFIG.notFound

  return (
    <main className={`system-notice-page system-notice-page-${variant}`}>
      <div className="system-notice-shell">
        <section className="system-notice-card">
          <div className="system-notice-graphic" aria-hidden="true">
            <span className="system-notice-accent">{config.accent}</span>
          </div>

          <p className="system-notice-eyebrow">{t(config.eyebrow, config.eyebrow)}</p>
          <h1 className="system-notice-title">
            <span>{t(config.title, config.titleEn)}</span>
            <small>{t(config.titleEn, config.title)}</small>
          </h1>
          <p className="system-notice-subtitle">{t(config.subtitle, config.subtitleEn)}</p>

          <div className="system-notice-detail-list">
            {config.details.map((detail) => (
              <div key={detail} className="system-notice-detail">
                {t(detail, detail)}
              </div>
            ))}
          </div>

          {config.commands ? (
            <div className="system-notice-command-card">
              <div className="system-notice-command-title">{t('Suggested commands', '建议命令')}</div>
              <div className="system-notice-command-list">
                {config.commands.map((command) => (
                  <code key={command} className="system-notice-command">{command}</code>
                ))}
              </div>
            </div>
          ) : null}

          <div className="system-notice-actions">
            {variant === 'serverError' ? (
              <button className="system-notice-button system-notice-button-primary" type="button" onClick={() => window.location.reload()}>
                {t(config.primaryLabel, config.primaryLabel)}
              </button>
            ) : (
              <Link className="system-notice-button system-notice-button-primary" to={config.primaryTo || '/page'}>
                {t(config.primaryLabel, config.primaryLabel)}
              </Link>
            )}

            <button className="system-notice-button system-notice-button-secondary" type="button" onClick={() => window.history.back()}>
              {t(config.secondaryLabel, config.secondaryLabel)}
            </button>

            <Link className="system-notice-button system-notice-button-ghost" to={config.tertiaryTo || '/page'}>
              {t(config.tertiaryLabel, config.tertiaryLabel)}
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}

export default SystemNoticePage