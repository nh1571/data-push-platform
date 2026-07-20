/**
 * 左侧数据面板：数据源选择 + SQL 编辑 + 参数 + 取数预览 + 组件库。
 */
import {
  CodeOutlined,
  DatabaseOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  Button,
  Collapse,
  Empty,
  Input,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { DataSource, SqlParamDef } from '../../../api/types'
import type { DataPreviewCtx } from '../studioUtils'

export interface DataPanelProps {
  // 数据源
  sources: DataSource[]
  dataSourceId: string | undefined
  onDataSourceChange: (id: string) => void
  sql: string
  onSqlChange: (v: string) => void
  querying: boolean
  onQuery: () => void
  // 数据集
  activeDatasetId: string
  datasetTabs: { id: string; name: string }[]
  onDatasetChange: (id: string) => void
  onAddDataset: () => void
  // 参数
  paramDefs: SqlParamDef[]
  resolvedPreview: Record<string, string>
  // 查询结果
  fields: string[]
  rows: unknown[][]
  // 组件库
  componentTypes: { type: string; label: string; icon?: React.ReactNode }[]
  onCreateComponent: (type: string) => void
  cartCount: number
  libraryCount: number
}

export function DataPanel({
  sources,
  dataSourceId,
  onDataSourceChange,
  sql,
  onSqlChange,
  querying,
  onQuery,
  activeDatasetId,
  datasetTabs,
  onDatasetChange,
  onAddDataset,
  paramDefs,
  resolvedPreview,
  fields,
  rows,
  componentTypes,
  onCreateComponent,
  cartCount,
  libraryCount,
}: DataPanelProps) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      {/* 数据源 + SQL */}
      <Collapse
        defaultActiveKey={['data']}
        ghost
        size="small"
        items={[
          {
            key: 'data',
            label: (
              <Space size={4}>
                <DatabaseOutlined />
                <span>数据</span>
                {cartCount > 0 && <Tag color="blue" style={{ fontSize: 10 }}>{cartCount}</Tag>}
              </Space>
            ),
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* 数据集 Tabs */}
                <Tabs
                  size="small"
                  activeKey={activeDatasetId}
                  onChange={onDatasetChange}
                  tabBarExtraContent={
                    <Button size="small" type="text" icon={<PlusOutlined />} onClick={onAddDataset} />
                  }
                  items={datasetTabs.map((d) => ({ key: d.id, label: d.name }))}
                />

                {/* 数据源选择 */}
                <Select
                  size="small"
                  style={{ width: '100%' }}
                  placeholder="选择数据源"
                  value={dataSourceId}
                  onChange={onDataSourceChange}
                  options={sources.map((s) => ({ value: s.id, label: s.name }))}
                />

                {/* SQL 编辑器 */}
                <Input.TextArea
                  rows={6}
                  value={sql}
                  onChange={(e) => onSqlChange(e.target.value)}
                  placeholder="SELECT ..."
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />

                {/* 参数 */}
                {paramDefs.length > 0 && (
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      参数:{' '}
                      {paramDefs.map((p) => (
                        <Tag key={p.name} style={{ fontSize: 10 }}>{p.name}={resolvedPreview[p.name] || '?'}</Tag>
                      ))}
                    </Typography.Text>
                  </div>
                )}

                {/* 取数按钮 */}
                <Button
                  type="primary"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  loading={querying}
                  onClick={onQuery}
                  block
                >
                  取数预览
                </Button>

                {/* 查询结果 */}
                {fields.length > 0 && (
                  <Table
                    size="small"
                    dataSource={rows.slice(0, 20).map((r, i) => {
                      const obj: Record<string, unknown> = { _key: i }
                      fields.forEach((f, j) => { obj[f] = r[j] })
                      return obj
                    })}
                    columns={fields.map((f) => ({ title: f, dataIndex: f, ellipsis: true, width: 100 }))}
                    rowKey="_key"
                    scroll={{ x: 'max-content', y: 150 }}
                    pagination={false}
                  />
                )}
                {fields.length === 0 && !querying && (
                  <Empty description="选择数据源并取数" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ fontSize: 12 }} />
                )}
              </div>
            ),
          },
        ]}
      />

      {/* 组件库 */}
      <Collapse
        defaultActiveKey={['components']}
        ghost
        size="small"
        items={[
          {
            key: 'components',
            label: (
              <Space size={4}>
                <CodeOutlined />
                <span>组件库</span>
                {libraryCount > 0 && <Tag style={{ fontSize: 10 }}>{libraryCount}</Tag>}
              </Space>
            ),
            children: (
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                {componentTypes.map((ct) => (
                  <Button
                    key={ct.type}
                    size="small"
                    block
                    onClick={() => onCreateComponent(ct.type)}
                  >
                    {ct.label}
                  </Button>
                ))}
              </Space>
            ),
          },
        ]}
      />
    </div>
  )
}
