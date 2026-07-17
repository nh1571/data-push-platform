/**
 * HTTP 客户端与 Token 工具。
 *
 * 基于 axios 封装后端 REST 调用：
 * - baseURL 默认 `/api`（Vite 开发代理到后端），可通过 VITE_API_BASE 覆盖
 * - 请求拦截器自动注入 `Authorization: Bearer <token>`
 * - 响应拦截器：非登录接口遇 401 时清 Token 并跳转登录页
 * - `getErrorMessage` 统一解析 FastAPI `detail`（字符串 / 校验数组 / 对象）
 *
 * 业务 API 函数见 `./index.ts`，类型见 `./types.ts`。
 */
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

/** localStorage 中 access token 的键名 */
const TOKEN_KEY = 'dpp_access_token'

/** 读取当前登录 access token（无则 null） */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

/** 持久化 access token（登录成功后调用） */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

/** 清除 access token（登出或 401 时调用） */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * baseURL 来自 VITE_API_BASE（默认 `/api`，配合 Vite 代理）。
 * 业务路径形如 `/v1/...`，完整 URL 为 `/api/v1/...`。
 */
const baseURL = import.meta.env.VITE_API_BASE || '/api'

/** 全局 axios 实例：JSON、60s 超时 */
export const api = axios.create({
  baseURL,
  timeout: 60_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求：若本地有 token 则带上 Bearer
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应：401 时清 token 并跳转登录（登录接口本身失败除外）
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const url = error.config?.url ?? ''
      // 登录失败本身会 401，不应强制跳转形成死循环
      if (!url.includes('/v1/auth/login')) {
        clearToken()
        if (window.location.pathname !== '/login') {
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`
        }
      }
    }
    return Promise.reject(error)
  },
)

/**
 * 从未知错误中提取可读文案，供 message.error / Alert 使用。
 * 优先使用后端 `detail` 字段；校验错误数组会拼接 `msg`。
 */
export function getErrorMessage(error: unknown, fallback = '请求失败'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { detail?: unknown } | undefined
    const detail = data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object' && 'msg' in item) {
            return String((item as { msg: unknown }).msg)
          }
          return JSON.stringify(item)
        })
        .join('; ')
    }
    if (detail && typeof detail === 'object') return JSON.stringify(detail)
    return error.message || fallback
  }
  if (error instanceof Error) return error.message
  return fallback
}
