import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider } from '@mui/material'
import App from './App.jsx'
import { appTheme } from './theme.js'

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
  new URLSearchParams(window.location.search).get('view') ===
    'attendance-worker'
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/attendance-sw.js').catch((error) => {
      console.warn('근태 앱 설치 준비 실패:', error)
    })
  })
}
