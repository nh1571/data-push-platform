/**
 * 前端入口：挂载 React 根节点。
 *
 * 从 `index.html` 的 `#root` 创建 React 18 root，
 * 以 StrictMode 包裹 App（开发期双重渲染便于发现副作用问题）。
 * 全局样式见 `./index.css`。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Root element #root not found')
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
