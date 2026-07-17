/**
 * 路由鉴权守卫。
 *
 * 未登录时重定向到 `/login`，并通过 location.state.from 记录来源路径，
 * 便于登录成功后回跳。已登录则原样渲染子节点（通常为 AppLayout）。
 */
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

/**
 * 保护需登录的路由树。
 * @param children 通过鉴权后渲染的内容
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
