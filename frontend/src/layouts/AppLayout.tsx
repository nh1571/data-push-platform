/**
 * 后台主布局：左侧导航 + 顶栏 + 内容区 Outlet。
 *
 * 菜单项与 App.tsx 路由一一对应；根据 pathname 前缀高亮当前菜单。
 * 顶栏提供退出登录（清 token 并跳转 /login）。
 */
import {
  ApiOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  FormOutlined,
  HistoryOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SendOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Button, Layout, Menu, theme, Tooltip, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const { Header, Sider, Content } = Layout

/** 侧栏菜单定义：key 即路由 path */
const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/editor', icon: <FormOutlined />, label: '内容工作台' },
  { key: '/push-jobs', icon: <SendOutlined />, label: '任务管理' },
  { key: '/data-sources', icon: <CloudServerOutlined />, label: '数据源' },
  { key: '/channels', icon: <ApiOutlined />, label: '通道' },
  { key: '/address-book', icon: <TeamOutlined />, label: '通讯录' },
  { key: '/job-runs', icon: <HistoryOutlined />, label: '执行记录' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统' },
]

/**
 * 根据 pathname 选择应高亮的菜单 key。
 * 子路径（如 /data-sources/new）匹配最长公共前缀（排除首页 `/`）。
 */
function selectedKey(pathname: string): string {
  if (pathname === '/') return '/'
  const match = MENU_ITEMS.find(
    (item) => item.key !== '/' && pathname.startsWith(item.key),
  )
  return match?.key ?? '/'
}

/** 带侧栏的主布局组件，内容通过 Outlet 渲染子路由 */
export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const {
    token: { colorBgContainer, colorBgLayout, borderRadiusLG },
  } = theme.useToken()

  const selected = useMemo(() => selectedKey(location.pathname), [location.pathname])
  const isEditor = location.pathname.startsWith('/editor')

  return (
    <Layout style={{ minHeight: '100vh', background: colorBgLayout }}>
      <Sider
        width={220}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        theme="dark"
        breakpoint="lg"
        collapsedWidth={64}
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            height: 56,
            margin: collapsed ? '0 8px' : '0 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 600,
            fontSize: collapsed ? 13 : 16,
            letterSpacing: collapsed ? 0 : 1,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {collapsed ? '推送' : '数据推送中台'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 'none' }}
        />
      </Sider>
      <Layout style={{ background: colorBgLayout }}>
        <Header
          style={{
            height: 56,
            lineHeight: '56px',
            padding: '0 20px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Tooltip title={collapsed ? '展开侧栏' : '收起侧栏'}>
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
              />
            </Tooltip>
            <Typography.Text strong style={{ fontSize: 15 }}>
              数据推送
            </Typography.Text>
          </div>
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
        <Content style={{ margin: isEditor ? 12 : 24 }}>
          <div
            className={isEditor ? 'app-content-editor' : undefined}
            style={{
              padding: isEditor ? 12 : 24,
              minHeight: 360,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
