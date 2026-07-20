/**
 * 内容工作台 V2 — 三栏持续布局。
 *
 * 左栏（320px）：数据源/SQL/取数 + 组件类型 + 文案编排
 * 中栏（flex）：画布 + 组件列表
 * 右栏（360px）：Tab(属性|预览|推送)，推送Tab含通道收件人
 */
import {
  CodeOutlined,
  CompressOutlined,
  DatabaseOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SendOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import {
  Button,
  Collapse,
  Empty,
  Input,
  message,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { ChannelRecipientInfo } from './ChannelRecipientInfo'
import { EditorTopBar } from './EditorTopBar'
import { useEditorState } from './hooks/useEditorState'

const TYPE_LABELS: Record<string, string> = {
  Kpi: 'KPI', Text: '文案', Table: '表格', ChartBar: '柱状图', ChartLine: '折线图',
  ChartArea: '面积图', ChartHBar: '条形图', ChartPie: '饼图', Alert: '告警', Divider: '分隔', Container: '容器',
}
function typeLabel(t: string): string { return TYPE_LABELS[t] || t }

const CART_TYPES = [
  { type: 'Kpi', label: 'KPI' },
  { type: 'Text', label: '文案' },
  { type: 'Table', label: '表格' },
  { type: 'ChartBar', label: '柱状图' },
  { type: 'ChartLine', label: '折线图' },
  { type: 'ChartPie', label: '饼图' },
  { type: 'Alert', label: '告警' },
  { type: 'Divider', label: '分隔' },
]

export function EditorPageV2() {
  const { jobId } = useParams<{ jobId?: string }>()
  const s = useEditorState(jobId)

  const previewRows = useMemo(
    () => s.previewRows.map((row, i) => {
      const r: Record<string, unknown> = { __key: i }
      s.previewColumns.forEach((c, j) => { r[c] = (row as unknown[])[j] })
      return r
    }),
    [s.previewRows, s.previewColumns],
  )

  if (s.loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spin tip="加载中…" /></div>
  }

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', margin: -12 }}>
      <EditorTopBar
        name={s.name} onNameChange={s.setName} jobId={s.currentJobId}
        saving={s.saving} pushing={s.pushing}
        onSave={s.onSave} onTestPush={s.onTestPush}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ====== 左栏：数据 + 组件 ====== */}
        <div style={{ width: 320, minWidth: 260, borderRight: '1px solid #f0f0f0', background: '#fafafa', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          {/* 数据源 + SQL */}
          <Collapse defaultActiveKey={['data']} ghost size="small"
            items={[{
              key: 'data', label: <span><DatabaseOutlined style={{ marginRight: 4 }} />数据</span>,
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px' }}>
                  <Select size="small" style={{ width: '100%' }} placeholder="选择数据源"
                    value={s.dataSourceId} onChange={s.setDataSourceId}
                    options={s.sources.map((ds) => ({ value: ds.id, label: ds.name }))} />
                  <Input.TextArea rows={6} value={s.sql} onChange={(e) => s.setSql(e.target.value)}
                    placeholder="SELECT ..." style={{ fontFamily: 'monospace', fontSize: 12 }} />
                  <Button type="primary" size="small" icon={<PlayCircleOutlined />} loading={s.querying}
                    onClick={() => s.onQueryDataset(s.activeDatasetId)} block>取数预览</Button>
                  {s.previewColumns.length > 0 && (
                    <Table size="small" dataSource={previewRows.slice(0, 20)} rowKey="__key"
                      columns={s.previewColumns.map((f) => ({ title: f, dataIndex: f, ellipsis: true, width: 80 }))}
                      scroll={{ x: 'max-content', y: 160 }} pagination={false} />
                  )}
                </div>
              ),
            }]}
          />
          {/* 组件类型 */}
          <Collapse defaultActiveKey={['comp']} ghost size="small"
            items={[{
              key: 'comp', label: <span><CodeOutlined style={{ marginRight: 4 }} />组件库 {s.libraryCount > 0 && <Tag style={{ fontSize: 10 }}>{s.libraryCount}</Tag>}</span>,
              children: (
                <Space direction="vertical" size={4} style={{ width: '100%', padding: '0 4px' }}>
                  {CART_TYPES.map((ct) => (
                    <Button key={ct.type} size="small" block onClick={() => { s.startNew(ct.type); s.setStep('make') }}>
                      + {ct.label}
                    </Button>
                  ))}
                </Space>
              ),
            }]}
          />
          {/* 画布上组件 */}
          <Collapse defaultActiveKey={['oncanvas']} ghost size="small"
            items={[{
              key: 'oncanvas', label: <span>画布组件 {s.cart.length > 0 && <Tag style={{ fontSize: 10 }}>{s.cart.length}</Tag>}</span>,
              children: (
                <div style={{ padding: '0 4px' }}>
                  {s.cart.length === 0 ? (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>点击上方组件类型创建</Typography.Text>
                  ) : (
                    s.cart.map((node) => (
                      <div key={node.id} onClick={() => s.setSelectedComposeId(node.id)}
                        style={{ padding: '4px 8px', cursor: 'pointer', borderRadius: 4, fontSize: 12, marginBottom: 2,
                          background: s.selectedComposeId === node.id ? '#e6f4ff' : '#fff',
                          border: s.selectedComposeId === node.id ? '1px solid #1677ff' : '1px solid #f0f0f0' }}>
                        {node.props?.label || typeLabel(node.type)}
                      </div>
                    ))
                  )}
                </div>
              ),
            }]}
          />
        </div>

        {/* ====== 中栏：画布 ====== */}
        <div style={{ flex: 1, background: '#eef0f3', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
          {s.cart.length === 0 ? (
            <Empty description="左侧取数并创建组件后，组件将出现在这里" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, width: s.activeCanvas?.width || 750 }}>
              {s.cart.map((node) => (
                <div key={node.id} onClick={() => s.setSelectedComposeId(node.id)}
                  style={{
                    padding: 12, background: '#fff', borderRadius: 8, cursor: 'pointer',
                    border: s.selectedComposeId === node.id ? '2px solid #1677ff' : '1px solid #e8e8e8',
                    boxShadow: s.selectedComposeId === node.id ? '0 0 0 2px rgba(22,119,255,0.2)' : '0 1px 2px rgba(0,0,0,0.04)',
                  }}>
                  <Typography.Text strong style={{ fontSize: 13 }}>{node.props?.label || typeLabel(node.type)}</Typography.Text>
                  <Tag style={{ marginLeft: 8, fontSize: 10 }}>{typeLabel(node.type)}</Tag>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ====== 右栏：预览 + 推送 ====== */}
        <div style={{ width: 360, minWidth: 280, borderLeft: '1px solid #f0f0f0', background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <Tabs size="small" style={{ padding: '0 8px' }}
            items={[
              {
                key: 'preview', label: <span><EyeOutlined />预览</span>,
                children: (
                  <div style={{ padding: 8, maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
                    <Button icon={<CompressOutlined />} loading={s.finalLoading} onClick={() => s.setStep('preview')} size="small" block style={{ marginBottom: 8 }}>
                      编译预览
                    </Button>
                    {s.finalError && <Typography.Text type="danger" style={{ fontSize: 12 }}>{s.finalError}</Typography.Text>}
                    {s.finalLoading && <Spin tip="编译中…" style={{ display: 'block', marginTop: 16 }} />}
                    {s.finalPreview?.image_base64 && (
                      <img src={`data:image/png;base64,${s.finalPreview.image_base64}`} alt="预览" style={{ maxWidth: '100%', borderRadius: 8 }} />
                    )}
                    {!s.finalPreview && !s.finalLoading && !s.finalError && (
                      <Empty description="点击编译生成预览" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 24 }} />
                    )}
                  </div>
                ),
              },
              {
                key: 'push', label: <span><SendOutlined />推送</span>,
                children: (
                  <div style={{ padding: 8, maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
                    <Typography.Text strong style={{ fontSize: 12 }}>投递通道</Typography.Text>
                    <Select mode="multiple" style={{ width: '100%', marginTop: 4, marginBottom: 8 }}
                      value={s.channelIds} onChange={s.setChannelIds} placeholder="选择通道"
                      options={s.channels.map((c) => ({ value: c.id, label: c.name }))} />
                    <ChannelRecipientInfo channelIds={s.channelIds} />
                  </div>
                ),
              },
              {
                key: 'props', label: <span><SettingOutlined />属性</span>,
                children: (
                  <div style={{ padding: 8 }}>
                    {s.selectedComposeId ? (
                      <Typography.Text style={{ fontSize: 12 }}>选中: {s.selectedComposeId.slice(0, 8)}</Typography.Text>
                    ) : (
                      <Empty description="点击画布组件查看属性" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
