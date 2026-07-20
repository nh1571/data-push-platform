/**
 * 右侧面板：属性 / 预览 / 推送 Tab 切换。
 */
import { EyeOutlined, SendOutlined, SettingOutlined } from '@ant-design/icons'
import { Tabs } from 'antd'
import type { StudioCompileResponse } from '../../api'
import { PushTab } from '../push/PushTab'

export interface SidePanelProps {
  activeTab: string
  onTabChange: (tab: string) => void
  // 推送
  channelIds: string[]
  onChannelIdsChange: (ids: string[]) => void
  compileResult: StudioCompileResponse | null
  compileLoading: boolean
  compileError: string | null
  onCompile: () => void
  pushing: boolean
  onTestPush: () => void
  // 属性
  propertiesContent?: React.ReactNode
}

export function SidePanel({
  activeTab,
  onTabChange,
  channelIds,
  onChannelIdsChange,
  compileResult,
  compileLoading,
  compileError,
  onCompile,
  pushing,
  onTestPush,
  propertiesContent,
}: SidePanelProps) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', borderLeft: '1px solid #f0f0f0' }}>
      <Tabs
        activeKey={activeTab}
        onChange={onTabChange}
        size="small"
        style={{ padding: '0 12px' }}
        items={[
          {
            key: 'properties',
            label: <span><SettingOutlined /> 属性</span>,
            children: (
              <div style={{ padding: '0 4px', maxHeight: 'calc(100vh - 160px)', overflow: 'auto' }}>
                {propertiesContent || (
                  <div style={{ color: '#999', fontSize: 12, textAlign: 'center', padding: 24 }}>
                    点击画布上的组件查看属性
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'preview',
            label: <span><EyeOutlined /> 预览</span>,
            children: (
              <div style={{ padding: '0 4px', maxHeight: 'calc(100vh - 160px)', overflow: 'auto' }}>
                {compileResult?.image_base64 ? (
                  <img
                    src={`data:image/png;base64,${compileResult.image_base64}`}
                    alt="推送预览"
                    style={{ maxWidth: '100%', borderRadius: 8 }}
                  />
                ) : compileResult?.html ? (
                  <div dangerouslySetInnerHTML={{ __html: compileResult.html }} />
                ) : (
                  <div style={{ color: '#999', fontSize: 12, textAlign: 'center', padding: 24 }}>
                    点击「编译」生成预览
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'push',
            label: <span><SendOutlined /> 推送</span>,
            children: (
              <div style={{ padding: '0 4px', maxHeight: 'calc(100vh - 160px)', overflow: 'auto' }}>
                <PushTab
                  channelIds={channelIds}
                  onChannelIdsChange={onChannelIdsChange}
                  compileResult={compileResult}
                  compileLoading={compileLoading}
                  compileError={compileError}
                  onCompile={onCompile}
                  pushing={pushing}
                  onTestPush={onTestPush}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
