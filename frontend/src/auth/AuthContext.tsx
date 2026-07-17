/**
 * 认证上下文：登录态、login / logout。
 *
 * Token 存于 localStorage（见 api/client），初始化时同步读取。
 * 业务页通过 `useAuth()` 获取 isAuthenticated 与登录方法。
 * 路由守卫见 RequireAuth.tsx。
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { clearToken, getToken, setToken } from '../api/client'
import { login as apiLogin } from '../api'

/** AuthContext 对外暴露的值 */
interface AuthContextValue {
  token: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * 认证 Provider：包裹整棵应用树（见 App.tsx）。
 * 内部维护 token 状态，与 localStorage 双向同步。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // 懒初始化：从 localStorage 恢复，避免首屏闪未登录
  const [token, setTokenState] = useState<string | null>(() => getToken())

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiLogin(username, password)
    setToken(res.access_token)
    setTokenState(res.access_token)
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setTokenState(null)
  }, [])

  const value = useMemo(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      login,
      logout,
    }),
    [token, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * 读取认证上下文。必须在 AuthProvider 内使用，否则抛错。
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
