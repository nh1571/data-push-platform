/**
 * 登录页。
 *
 * 已登录用户直接跳转首页；否则展示用户名/密码表单。
 * 登录成功后优先跳回 `location.state.from` 或 `?redirect=` 指定路径。
 */
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { getErrorMessage } from '../api/client'
import { useAuth } from '../auth/AuthContext'

/** 登录表单字段 */
interface LoginForm {
  username: string
  password: string
}

/** 登录页面组件 */
export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 已登录则无需再看登录页
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  // 回跳目标：RequireAuth 的 state.from 或 401 拦截器写入的 redirect 参数
  const from =
    (location.state as { from?: string } | null)?.from ||
    new URLSearchParams(location.search).get('redirect') ||
    '/'

  const onFinish = async (values: LoginForm) => {
    setLoading(true)
    setError(null)
    try {
      await login(values.username, values.password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, '登录失败，请检查用户名和密码'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1677ff 0%, #69b1ff 100%)',
        padding: 24,
      }}
    >
      <Card style={{ width: 400, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
          数据推送
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
          运营管理后台
        </Typography.Paragraph>
        {error ? (
          <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
        ) : null}
        <Form<LoginForm> layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
