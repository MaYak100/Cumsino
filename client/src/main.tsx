import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { DevPage } from './dev/DevPage'
import { MockPage } from './dev/MockPage'
import './index.css'

const path = window.location.pathname
const root = path.endsWith('/dev') ? <DevPage /> : path.endsWith('/mocks') ? <MockPage /> : <App />

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {root}
  </React.StrictMode>
)
