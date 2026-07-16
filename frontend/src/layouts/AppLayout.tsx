import {
  ApiOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  FormOutlined,
  HistoryOutlined,
  LogoutOutlined,
  SendOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Button, Layout, Menu, theme, Typography } from 'antd'
import { useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const { Header, Sider, Content } = Layout

const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/editor', icon: <FormOutlined />, label: '内容工作台' },
  { key: '/push-jobs', icon: <SendOutlined />, label: '任务管理' },
  { key: '/data-sources', icon: <CloudServerOutlined />, label: '数据源' },
  { key: '/channels', icon: <ApiOutlined />, label: '通道' },
  { key: '/job-runs', icon: <HistoryOutlined />, label: '执行记录' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统' },
]

function selectedKey(pathname: string): string {
  if (pathname === '/') return '/'
  const match = MENU_ITEMS.find(
    (item) => item.key !== '/' && pathname.startsWith(item.key),
  )
  return match?.key ?? '/'
}

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  const selected = useMemo(() => selectedKey(location.pathname), [location.pathname])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={220}
        theme="dark"
        breakpoint="lg"
        collapsedWidth={64}
        style={{ position: 'sticky', top: 0, height: '100vh' }}
      >
        <div
          style={{
            height: 56,
            margin: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: 1,
          }}
        >
          数据推送中台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Typography.Title level={4} style={{ margin: 0 }}>
            数据推送
          </Typography.Title>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
          >
            退出登录
          </Button>
        </Header>
        <Content style={{ margin: 24 }}>
          <div
            style={{
              padding: 24,
              minHeight: 360,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
            }}
          >
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
