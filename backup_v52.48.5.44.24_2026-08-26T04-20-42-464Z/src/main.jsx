import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider } from '@mui/material'
import App from './App.jsx'
import { appTheme } from './theme.js'

const queryParams = new URLSearchParams(window.location.search)
const isAttendanceWorkerView =
  queryParams.get('view') === 'attendance-worker'

const syncBrowserIdentity = () => {
  const title = isAttendanceWorkerView
    ? '욱림건설 근태시스템'
    : '욱림건설 통합관리시스템'

  const iconHref = isAttendanceWorkerView
    ? '/attendance-icon-192.png'
    : '/wooklim-favicon.png'

  document.title = title

  let iconLink = document.querySelector(
    'link[rel="icon"]',
  )

  if (!iconLink) {
    iconLink = document.createElement('link')
    iconLink.rel = 'icon'
    document.head.appendChild(iconLink)
  }

  iconLink.type = 'image/png'
  iconLink.href = iconHref

  const appleTitle = document.querySelector(
    'meta[name="apple-mobile-web-app-title"]',
  )

  if (appleTitle) {
    appleTitle.setAttribute('content', title)
  }

  const appleIcon = document.querySelector(
    'link[rel="apple-touch-icon"]',
  )

  if (appleIcon && isAttendanceWorkerView) {
    appleIcon.href = '/attendance-apple-touch-icon.png'
  }
}

syncBrowserIdentity()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <App /> {/* 👈 Dashboard 대신 다시 원래의 관문인 App으로 변경! */}
    </ThemeProvider>
  </StrictMode>,
)

if (
  'serviceWorker' in navigator &&
  isAttendanceWorkerView
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/attendance-sw.js').catch((error) => {
      console.warn('근태 앱 설치 준비 실패:', error)
    })
  })
}
