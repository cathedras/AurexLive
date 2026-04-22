import { getPreferredLanguage, localizeText } from '../../utils/language'

function escapeHtml(input) {
  return String(input || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function createProgramSheetHtml(tracks, title = '节目单') {
  const language = getPreferredLanguage()
  const now = new Date().toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')
  const rows = tracks
    .map(
      (track, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(track.performer || '')}</td>
            <td>${escapeHtml(track.programName || '')}</td>
            <td>${escapeHtml(track.hostScript || '')}</td>
          </tr>
        `,
    )
    .join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #222; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    .meta { margin-bottom: 14px; color: #666; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 13px; vertical-align: top; }
    th { background: #f6f6f6; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">${localizeText(language, `Exported at: ${now} · Total tracks: ${tracks.length}`, `导出时间：${now} · 节目总数：${tracks.length}`)}</div>
  <table>
    <thead>
      <tr>
        <th>${localizeText(language, 'No.', '序号')}</th>
        <th>${localizeText(language, 'Performer', '演出人')}</th>
        <th>${localizeText(language, 'Track', '节目名')}</th>
        <th>${localizeText(language, 'Host Script', '主持人口播词')}</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="4">${localizeText(language, 'No track data yet.', '暂无节目数据')}</td></tr>`}
    </tbody>
  </table>
</body>
</html>`
}

export function openProgramSheetWindow(tracks, title, shouldPrint = false) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    return false
  }

  printWindow.document.open()
  printWindow.document.write(createProgramSheetHtml(tracks, title))
  printWindow.document.close()

  if (shouldPrint) {
    printWindow.onload = () => {
      printWindow.focus()
      printWindow.print()
    }
  }

  return true
}

export function downloadBlobFile(blob, downloadedName) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = downloadedName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}