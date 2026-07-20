/**
 * 中间画布面板：多画布切换 + 自由布局编辑器 + 实时预览。
 */
import { PlusOutlined } from '@ant-design/icons'
import { Button, Empty, Space, Tabs, Typography } from 'antd'
import type { DatasetMaps, StudioNode } from '../studioUtils'

export interface CanvasInfo {
  id: string
  name: string
  width: number
}

export interface CanvasPanelProps {
  canvases: CanvasInfo[]
  activeCanvasId: string | null
  onCanvasChange: (id: string) => void
  onAddCanvas: () => void
  canvasWidth: number
  nodes: StudioNode[]
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onLayoutChange: (nodeId: string, layout: Record<string, unknown>) => void
  data: DatasetMaps
  // 可选的 compose 子组件（自由布局画布渲染器）
  children?: React.ReactNode
}

export function CanvasPanel({
  canvases,
  activeCanvasId,
  onCanvasChange,
  onAddCanvas,
  nodes,
  selectedNodeId,
  data,
  children,
}: CanvasPanelProps) {
  if (canvases.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f6f8' }}>
        <Empty description="请先在数据面板取数并创建组件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#eef0f3', overflow: 'auto' }}>
      {/* 画布 Tabs */}
      <div style={{ padding: '4px 8px 0', background: '#fff', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center' }}>
        <Tabs
          size="small"
          activeKey={activeCanvasId || undefined}
          onChange={onCanvasChange}
          style={{ flex: 1, marginBottom: 0 }}
          tabBarExtraContent={
            <Button size="small" type="text" icon={<PlusOutlined />} onClick={onAddCanvas} />
          }
          items={canvases.map((c) => ({
            key: c.id,
            label: (
              <Space size={4}>
                <span>{c.name}</span>
                <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                  {c.width}px
                </Typography.Text>
              </Space>
            ),
          }))}
        />
      </div>

      {/* 画布区域 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            minHeight: 400,
            position: 'relative',
          }}
          onClick={() => {} /* deselect */}
        >
          {nodes.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
              <Typography.Text type="secondary">
                从左侧组件库拖入组件到画布
              </Typography.Text>
            </div>
          ) : (
            children
          )}
        </div>
      </div>

      {/* 底部状态 */}
      <div style={{ padding: '4px 12px', background: '#fff', borderTop: '1px solid #f0f0f0', fontSize: 11, color: '#999' }}>
        {nodes.length} 个组件
        {selectedNodeId ? ` · 已选中 ${selectedNodeId.slice(0, 8)}` : ' · 点击组件查看属性'}
      </div>
    </div>
  )
}
