import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Лаборатория вопросов (/dev) и моки интерфейса (/mocks) — только в dev-сервере: import.meta.env.DEV в прод-сборке
// равен false, ветка выбрасывается целиком, и динамические импорты страниц не попадают в бандл.
const path = window.location.pathname
let root = <App />
if (import.meta.env.DEV) {
  const DevPage = lazy(() => import('./dev/DevPage').then(m => ({ default: m.DevPage })))
  const MockPage = lazy(() => import('./dev/MockPage').then(m => ({ default: m.MockPage })))
  if (path.endsWith('/dev')) root = <Suspense fallback={null}><DevPage /></Suspense>
  else if (path.endsWith('/mocks')) root = <Suspense fallback={null}><MockPage /></Suspense>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {root}
  </React.StrictMode>
)
