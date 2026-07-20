/**
 * 应用根组件：Ant Design 中文主题 + 路由表。
 *
 * - `/login` 公开；其余路由包在 RequireAuth + AppLayout 内
 * - 内容工作台：`/editor`、`/editor/:jobId`
 * - 资源管理：数据源 / 通道 / 推送任务 / 执行记录 / 系统设置
 * - 未知路径重定向到工作台首页
 */
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { AppLayout } from './layouts/AppLayout'
import { IdentityFormPage } from './pages/address-book/Form'
import { IdentityListPage } from './pages/address-book/List'
import { ChannelFormPage } from './pages/channels/Form'
import { ChannelListPage } from './pages/channels/List'
import { DashboardPage } from './pages/Dashboard'
import { DataSourceFormPage } from './pages/data-sources/Form'
import { DataSourceListPage } from './pages/data-sources/List'
import { EditorPage } from './pages/editor/EditorPage'
import { EditorPageV2 } from './pages/editor/EditorPageV2'
import { JobRunDetailPage } from './pages/job-runs/Detail'
import { JobRunListPage } from './pages/job-runs/List'
import { LoginPage } from './pages/Login'
import { PushJobFormPage } from './pages/push-jobs/Form'
import { PushJobListPage } from './pages/push-jobs/List'
import { SettingsPage } from './pages/Settings'

/** 全局字体栈（中英文系统字体） */
const FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif"

/** 根组件：全局 ConfigProvider + Auth + 路由 */
export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
          colorBgLayout: '#F5F6F8',
          colorBgContainer: '#ffffff',
          colorBorderSecondary: '#f0f0f0',
          fontFamily: FONT_FAMILY,
          fontSize: 14,
          controlHeight: 36,
        },
        components: {
          Layout: {
            headerHeight: 56,
            siderBg: '#001529',
            triggerBg: '#002140',
          },
          Menu: {
            darkItemBg: '#001529',
            darkSubMenuItemBg: '#000c17',
          },
          Table: {
            headerBg: '#fafafa',
            rowHoverBg: '#f5f8ff',
          },
        },
      }}
    >
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* 需登录的后台布局路由 */}
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/editor" element={<EditorPage />} />
              <Route path="/editor/:jobId" element={<EditorPage />} />
              <Route path="/editor-v2" element={<EditorPageV2 />} />
              <Route path="/editor-v2/:jobId" element={<EditorPageV2 />} />
              <Route path="/data-sources" element={<DataSourceListPage />} />
              <Route path="/data-sources/new" element={<DataSourceFormPage />} />
              <Route path="/data-sources/:id" element={<DataSourceFormPage />} />
              <Route path="/channels" element={<ChannelListPage />} />
              <Route path="/channels/new" element={<ChannelFormPage />} />
              <Route path="/channels/:id" element={<ChannelFormPage />} />
              <Route path="/address-book" element={<IdentityListPage />} />
              <Route path="/address-book/new" element={<IdentityFormPage />} />
              <Route path="/address-book/:id" element={<IdentityFormPage />} />
              <Route path="/push-jobs" element={<PushJobListPage />} />
              {/* 新建任务统一走列表弹窗 → 编辑器，避免旧 Form 入口 */}
              <Route path="/push-jobs/new" element={<Navigate to="/push-jobs" replace />} />
              <Route path="/push-jobs/:id" element={<PushJobFormPage />} />
              <Route path="/job-runs" element={<JobRunListPage />} />
              <Route path="/job-runs/:id" element={<JobRunDetailPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  )
}
