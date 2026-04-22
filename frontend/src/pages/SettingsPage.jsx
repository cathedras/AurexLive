import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { fetchSettings as loadSettings, saveSettings as persistSettings } from '../services/settings/settingsService'

const defaultSettings = {
  profile: {
    displayName: '',
    avatarUrl: '',
    phone: '',
    email: '',
  },
  preferences: {
    theme: 'light',
    fontScale: 100,
    marqueeSpeed: 16,
  },
  speech: {
    mode: 'ai',
    language: 'zh-CN',
    offlineFallback: true,
  },
  ai: {
    enabled: true,
    showModelHint: true,
  },
}

function SettingsPage() {
  const [settings, setSettings] = useState(defaultSettings)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const result = await loadSettings()
      if (!result.success) {
        throw new Error(result.message || '加载失败')
      }
      setSettings(mergeSettings(result.settings))
      setMessage('已加载用户设置')
    } catch (error) {
      setMessage(`加载设置失败：${error.message}`)
    }
  }

  const updateSection = (section, key, value) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }))
  }

  const onSave = async () => {
    try {
      setSaving(true)
      const result = await persistSettings(settings)
      if (!result.success) {
        throw new Error(result.message || '保存失败')
      }
      setSettings(mergeSettings(result.settings))
      setMessage('设置保存成功')
    } catch (error) {
      setMessage(`保存失败：${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container settings-container">
      <div className="page-actions settings-actions">
        <Link to="/page" className="back-link">返回首页</Link>
        <Link to="/page/music" className="back-link">返回播放页</Link>
      </div>

      <h1>用户设置中心</h1>
      {message ? <div className="music-message">{message}</div> : null}

      <div className="settings-panel">
        <div className="settings-section-title">基础资料</div>
        <div className="settings-grid">
          <label className="settings-label">昵称<input className="settings-input" value={settings.profile.displayName} onChange={(e) => updateSection('profile', 'displayName', e.target.value)} /></label>
          <label className="settings-label">头像地址<input className="settings-input" value={settings.profile.avatarUrl} onChange={(e) => updateSection('profile', 'avatarUrl', e.target.value)} /></label>
          <label className="settings-label">手机号<input className="settings-input" value={settings.profile.phone} onChange={(e) => updateSection('profile', 'phone', e.target.value)} /></label>
          <label className="settings-label">邮箱<input className="settings-input" value={settings.profile.email} onChange={(e) => updateSection('profile', 'email', e.target.value)} /></label>
        </div>
      </div>

      <div className="settings-panel">
        <div className="settings-section-title">系统偏好</div>
        <div className="settings-grid">
          <label className="settings-label">主题
            <select className="settings-input" value={settings.preferences.theme} onChange={(e) => updateSection('preferences', 'theme', e.target.value)}>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
          <label className="settings-label">字号比例(%)
            <input className="settings-input" type="number" min="80" max="140" value={settings.preferences.fontScale} onChange={(e) => updateSection('preferences', 'fontScale', Number(e.target.value || 100))} />
          </label>
          <label className="settings-label">跑马灯速度(秒)
            <input className="settings-input" type="number" min="6" max="40" value={settings.preferences.marqueeSpeed} onChange={(e) => updateSection('preferences', 'marqueeSpeed', Number(e.target.value || 16))} />
          </label>
        </div>
      </div>

      <div className="settings-panel">
        <div className="settings-section-title">语音设置</div>
        <div className="settings-grid">
          <label className="settings-label">默认识别模式
            <select className="settings-input" value={settings.speech.mode} onChange={(e) => updateSection('speech', 'mode', e.target.value)}>
              <option value="ai">AI 识别</option>
              <option value="local">本机识别</option>
            </select>
          </label>
          <label className="settings-label">识别语言
            <input className="settings-input" value={settings.speech.language} onChange={(e) => updateSection('speech', 'language', e.target.value)} />
          </label>
          <label className="settings-check"><input type="checkbox" checked={settings.speech.offlineFallback} onChange={(e) => updateSection('speech', 'offlineFallback', e.target.checked)} />离线自动回退本机识别</label>
        </div>
      </div>

      <div className="settings-panel">
        <div className="settings-section-title">AI 设置</div>
        <div className="settings-grid">
          <label className="settings-check"><input type="checkbox" checked={settings.ai.enabled} onChange={(e) => updateSection('ai', 'enabled', e.target.checked)} />启用 AI 文本优化</label>
          <label className="settings-check"><input type="checkbox" checked={settings.ai.showModelHint} onChange={(e) => updateSection('ai', 'showModelHint', e.target.checked)} />显示模型提示信息</label>
        </div>
      </div>

      <div className="settings-footer">
        <button className="upload-btn" onClick={onSave} disabled={saving}>{saving ? '保存中...' : '保存设置'}</button>
      </div>
    </div>
  )
}

function mergeSettings(input = {}) {
  const preferencesInput = input.preferences || {}

  return {
    profile: {
      ...defaultSettings.profile,
      ...(input.profile || {}),
    },
    preferences: {
      theme: preferencesInput.theme || defaultSettings.preferences.theme,
      fontScale: Number(preferencesInput.fontScale || defaultSettings.preferences.fontScale),
      marqueeSpeed: Number(preferencesInput.marqueeSpeed || defaultSettings.preferences.marqueeSpeed),
    },
    speech: {
      ...defaultSettings.speech,
      ...(input.speech || {}),
    },
    ai: {
      ...defaultSettings.ai,
      ...(input.ai || {}),
    },
  }
}

export default SettingsPage
