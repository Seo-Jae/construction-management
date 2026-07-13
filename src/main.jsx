import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Dashboard from './Dashboard.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App /> {/* 👈 Dashboard 대신 다시 원래의 관문인 App으로 변경! */}
  </StrictMode>,
)