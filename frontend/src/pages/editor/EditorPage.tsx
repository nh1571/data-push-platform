/**
 * Content workbench — component artboard designer (Phase S1).
 * Layout: component palette | artboard outline + canvas | data/props + preview
 */
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SaveOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  ColorPicker,
  Input,
  List,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import type { Color } from 'antd/es/color-picker'
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getPushJob,
  listChannels,
  listDataSources,
  queryPreview,
  studioCompile,
  studioSaveJob,
  studioTestPush,
} from '../../api'
import { getErrorMessage } from '../../api/client'
import type { ArtboardDoc, Channel, DataSource, StudioNode } from '../../api/types'
import {
  appendChild,
  defaultDailyArtboard,
  emptyArtboard,
  extractArtboardFromJob,
  findNode,
  flattenOutline,
  moveSibling,
  newComponent,
  removeNode,
  updateNode,
} from './studioUtils'

function colorToHex(color: Color | string): string {
  if (typeof color === 'string') return color
  return color.toHexString()
}

const PALETTE = [
  { type: 'Text', label: '文本' },
  { type: 'Kpi', label: 'KPI 指标' },
  { type: 'Table', label: '数据表' },
  { type: 'Container', label: '横向分栏' },
  { type: 'Divider', label: '分隔线' },
]

export function EditorPage() {
  const { jobId } = useParams<{ jobId?: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState<DataSource[]>([])
  const [channels, setChannels] = useState<Channel[]>([])

  const [name, setName] = useState('')
  const [dataSourceId, setDataSourceId] = useState<string | undefined>()
  const [sql, setSql] = useState('SELECT 1 AS demo')
  const [channelIds, setChannelIds] = useState<string[]>([])
  const [enabled, setEnabled] = useState(true)
  const [currentJobId, setCurrentJobId] = useState<string | null>(jobId ?? null)

  const [artboard, setArtboard] = useState<ArtboardDoc>(() => defaultDailyArtboard())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [previewColumns, setPreviewColumns] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<unknown[][]>([])
  const [markdownText, setMarkdownText] = useState('')
  const [imageBase64, setImageBase64] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')

  const [querying, setQuerying] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)

  const tree = artboard.tree
  const outline = useMemo(() => (tree ? flattenOutline(tree) : []), [tree])
  const selected = useMemo(
    () => (selectedId && tree ? findNode(tree, selectedId) : null),
    [selectedId, tree],
  )
  const themeColor = artboard.artboard?.theme?.color || '#1677ff'

  const setTree = (next: StudioNode) => {
    setArtboard((prev) => ({ ...prev, tree: next }))
  }

  const loadMeta = useCallback(async () => {
    const [ds, ch] = await Promise.all([listDataSources(), listChannels()])
    setSources(ds)
    setChannels(ch)
  }, [])

  useEffect(() => {
    setLoading(true)
    loadMeta()
      .then(async () => {
        if (!jobId) {
          const board = defaultDailyArtboard()
          setArtboard(board)
          setCurrentJobId(null)
          setName('')
          setDataSourceId(undefined)
          setSql(board.datasets?.[0]?.sql || 'SELECT 1 AS demo')
          setChannelIds([])
          setEnabled(true)
          setSelectedId(null)
          setMarkdownText('')
          setImageBase64('')
          setPreviewHtml('')
          setPreviewColumns([])
          setPreviewRows([])
          return
        }
        const job = await getPushJob(jobId)
        setCurrentJobId(job.id)
        setName(job.name)
        setDataSourceId(job.data_source_id)
        setSql(job.query_sql)
        setChannelIds(job.channel_ids ?? [])
        setEnabled(job.enabled)
        const extracted = extractArtboardFromJob(job.render_spec)
        if (extracted) {
          setArtboard(extracted)
        } else {
          const board = defaultDailyArtboard()
          board.datasets = [
            {
              id: 'main',
              name: '主查询',
              data_source_id: job.data_source_id,
              sql: job.query_sql,
            },
          ]
          setArtboard(board)
        }
        setSelectedId(null)
        setMarkdownText('')
        setImageBase64('')
        setPreviewHtml('')
        setPreviewColumns([])
        setPreviewRows([])
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [jobId, loadMeta])

  const onQuery = async () => {
    if (!dataSourceId) {
      message.error('请选择数据源')
      return
    }
    setQuerying(true)
    try {
      const res = await queryPreview({ data_source_id: dataSourceId, sql, max_rows: 50 })
      setPreviewColumns(res.columns)
      setPreviewRows(res.rows)
      message.success(`取数 ${res.row_count} 行`)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setQuerying(false)
    }
  }

  const onCompile = async () => {
    if (!dataSourceId) {
      message.error('请选择数据源')
      return
    }
    setCompiling(true)
    try {
      const doc: ArtboardDoc = {
        ...artboard,
        datasets: [
          {
            id: 'main',
            name: '主查询',
            data_source_id: dataSourceId,
            sql,
          },
        ],
      }
      const res = await studioCompile({
        artboard: doc,
        data_source_id: dataSourceId,
        sql,
        want_image: true,
        max_rows: 50,
      })
      setMarkdownText(res.markdown_text || '')
      setImageBase64(res.image_base64 || '')
      setPreviewHtml(res.html || '')
      setArtboard(res.artboard || doc)
      message.success(`编译完成（${res.row_count} 行）`)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setCompiling(false)
    }
  }

  const onSave = async () => {
    if (!name.trim()) {
      message.error('请输入推送名称')
      return
    }
    if (!dataSourceId) {
      message.error('请选择数据源')
      return
    }
    setSaving(true)
    try {
      const doc: ArtboardDoc = {
        ...artboard,
        datasets: [{ id: 'main', name: '主查询', data_source_id: dataSourceId, sql }],
      }
      const saved = await studioSaveJob({
        id: currentJobId,
        name: name.trim(),
        data_source_id: dataSourceId,
        query_sql: sql,
        artboard: doc,
        channel_ids: channelIds,
        enabled,
      })
      setCurrentJobId(saved.id)
      message.success('已保存为任务')
      if (jobId !== saved.id) {
        navigate(`/editor/${saved.id}`, { replace: true })
      }
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const onTestPush = async () => {
    if (!dataSourceId) {
      message.error('请选择数据源')
      return
    }
    if (!channelIds.length) {
      message.error('请选择至少一个通道')
      return
    }
    setPushing(true)
    try {
      const doc: ArtboardDoc = {
        ...artboard,
        datasets: [{ id: 'main', name: '主查询', data_source_id: dataSourceId, sql }],
      }
      const res = await studioTestPush({
        artboard: doc,
        data_source_id: dataSourceId,
        sql,
        channel_ids: channelIds,
        push_job_id: currentJobId,
      })
      if (res.markdown_text) setMarkdownText(res.markdown_text)
      if (res.success) message.success('试推成功')
      else message.error('试推部分失败，请查看通道配置')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setPushing(false)
    }
  }

  const addComponent = (type: string) => {
    if (!tree) return
    const node = newComponent(type)
    // If selected is Container, add into it; else append to root
    if (selected && selected.type === 'Container') {
      setTree(appendChild(tree, selected.id, node))
    } else {
      setTree(appendChild(tree, 'root', node))
    }
    setSelectedId(node.id)
  }

  const applyTemplate = (kind: 'daily' | 'blank') => {
    const board = kind === 'daily' ? defaultDailyArtboard() : emptyArtboard()
    if (dataSourceId) {
      board.datasets = [{ id: 'main', name: '主查询', data_source_id: dataSourceId, sql }]
    } else {
      setSql(board.datasets?.[0]?.sql || sql)
    }
    setArtboard(board)
    setSelectedId(null)
    message.info(kind === 'daily' ? '已应用日报模板' : '已清空为空白画板')
  }

  const tableData = useMemo(
    () =>
      previewRows.map((row, rowIdx) => {
        const record: Record<string, unknown> = { __key: rowIdx }
        previewColumns.forEach((col, colIdx) => {
          record[col] = row[colIdx]
        })
        return record
      }),
    [previewRows, previewColumns],
  )

  return (
    <div style={{ margin: -24, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Top bar */}
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/push-jobs')}>
              任务管理
            </Button>
            <Typography.Title level={5} style={{ margin: 0 }}>
              组件画板
            </Typography.Title>
            <Input
              style={{ width: 220 }}
              placeholder="推送名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
            <Tag color="blue">Flow 画板</Tag>
          </Space>
          <Space wrap>
            <Button onClick={() => applyTemplate('daily')}>日报模板</Button>
            <Button onClick={() => applyTemplate('blank')}>空白</Button>
            <Button icon={<SearchOutlined />} loading={querying} onClick={() => void onQuery()}>
              取数
            </Button>
            <Button loading={compiling} onClick={() => void onCompile()}>
              编译预览
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={() => void onSave()}
            >
              {currentJobId ? '保存' : '保存为任务'}
            </Button>
            <Button
              icon={<PlayCircleOutlined />}
              loading={pushing}
              onClick={() => void onTestPush()}
            >
              试推
            </Button>
          </Space>
        </Space>
      </div>

      {!currentJobId ? (
        <Alert
          type="info"
          showIcon
          banner
          message="组件画板：从左侧添加组件，绑定数据，编译成图/文案，再保存或试推"
        />
      ) : null}

      {/* Three columns */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Left: palette + outline */}
        <div
          style={{
            width: 240,
            borderRight: '1px solid #f0f0f0',
            background: '#fafafa',
            overflow: 'auto',
            padding: 12,
            flexShrink: 0,
          }}
        >
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            组件库
          </Typography.Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 16px' }}>
            {PALETTE.map((p) => (
              <Button
                key={p.type}
                size="small"
                icon={<PlusOutlined />}
                onClick={() => addComponent(p.type)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            画板结构
          </Typography.Text>
          <List
            size="small"
            style={{ marginTop: 8 }}
            dataSource={outline}
            locale={{ emptyText: '暂无组件，请从上方添加或套用模板' }}
            renderItem={(item) => (
              <List.Item
                style={{
                  padding: '6px 8px',
                  cursor: 'pointer',
                  background: selectedId === item.id ? '#e6f4ff' : undefined,
                  borderRadius: 4,
                  paddingLeft: 8 + item.depth * 12,
                }}
                onClick={() => setSelectedId(item.id)}
              >
                <Space size={4}>
                  <Tag style={{ margin: 0 }}>{item.type}</Tag>
                  <span style={{ fontSize: 12 }}>{item.label}</span>
                </Space>
              </List.Item>
            )}
          />
        </div>

        {/* Center: artboard canvas representation */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 16,
            background: '#e8eaed',
          }}
        >
          <div
            style={{
              width: artboard.artboard?.width || 750,
              maxWidth: '100%',
              margin: '0 auto',
              background: '#fff',
              borderRadius: 8,
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              padding: 16,
              minHeight: 320,
            }}
          >
            <div
              style={{
                height: 4,
                background: themeColor,
                borderRadius: 2,
                marginBottom: 12,
              }}
            />
            {(tree?.children || []).length === 0 ? (
              <Typography.Text type="secondary">
                空画板 — 点左侧组件添加，或使用「日报模板」
              </Typography.Text>
            ) : (
              (tree?.children || []).map((node) => (
                <ArtboardBlock
                  key={node.id}
                  node={node}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: data + props + preview */}
        <div
          style={{
            width: 380,
            borderLeft: '1px solid #f0f0f0',
            background: '#fff',
            overflow: 'auto',
            padding: 12,
            flexShrink: 0,
          }}
        >
          <Tabs
            size="small"
            items={[
              {
                key: 'data',
                label: '数据',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <div>
                      <Typography.Text type="secondary">数据源</Typography.Text>
                      <Select
                        style={{ width: '100%', marginTop: 4 }}
                        showSearch
                        optionFilterProp="label"
                        placeholder="选择数据源"
                        value={dataSourceId}
                        onChange={setDataSourceId}
                        options={sources.map((s) => ({
                          value: s.id,
                          label: `${s.name} (${s.type})`,
                        }))}
                      />
                    </div>
                    <div>
                      <Typography.Text type="secondary">SQL</Typography.Text>
                      <Input.TextArea
                        style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
                        rows={6}
                        value={sql}
                        onChange={(e) => setSql(e.target.value)}
                      />
                    </div>
                    <Button block loading={querying} onClick={() => void onQuery()}>
                      运行取数
                    </Button>
                    {previewColumns.length > 0 ? (
                      <>
                        <div>
                          <Typography.Text type="secondary">列（点击填入 KPI）</Typography.Text>
                          <div style={{ marginTop: 6 }}>
                            {previewColumns.map((c) => (
                              <Tag
                                key={c}
                                style={{ cursor: 'pointer', marginBottom: 4 }}
                                onClick={() => {
                                  if (selected?.type === 'Kpi' && tree && selectedId) {
                                    setTree(
                                      updateNode(tree, selectedId, {
                                        binding: {
                                          ...selected.binding,
                                          value_column: c,
                                          label: c,
                                        },
                                        props: { ...selected.props, label: c },
                                      }),
                                    )
                                    message.success(`已绑定 ${c}`)
                                  } else {
                                    message.info('请先选中 KPI 组件再点列名')
                                  }
                                }}
                              >
                                {c}
                              </Tag>
                            ))}
                          </div>
                        </div>
                        <Table
                          size="small"
                          pagination={false}
                          scroll={{ x: true, y: 160 }}
                          rowKey="__key"
                          dataSource={tableData}
                          columns={previewColumns.map((c) => ({
                            title: c,
                            dataIndex: c,
                            ellipsis: true,
                            width: 100,
                            render: (v: unknown) =>
                              v === null || v === undefined ? '—' : String(v),
                          }))}
                        />
                      </>
                    ) : null}
                    <div>
                      <Typography.Text type="secondary">通道（试推）</Typography.Text>
                      <Select
                        mode="multiple"
                        style={{ width: '100%', marginTop: 4 }}
                        placeholder="选择通道"
                        value={channelIds}
                        onChange={setChannelIds}
                        options={channels.map((c) => ({
                          value: c.id,
                          label: `${c.name} (${c.type})`,
                        }))}
                      />
                    </div>
                    <div>
                      <Space>
                        <Typography.Text type="secondary">主题色</Typography.Text>
                        <ColorPicker
                          value={themeColor}
                          onChange={(c) =>
                            setArtboard((prev) => ({
                              ...prev,
                              artboard: {
                                ...prev.artboard,
                                theme: {
                                  ...prev.artboard?.theme,
                                  color: colorToHex(c),
                                },
                              },
                            }))
                          }
                        />
                        <Switch
                          checkedChildren="启用"
                          unCheckedChildren="停用"
                          checked={enabled}
                          onChange={setEnabled}
                        />
                      </Space>
                    </div>
                    <div>
                      <Typography.Text type="secondary">导出模式</Typography.Text>
                      <Radio.Group
                        style={{ marginTop: 4, display: 'block' }}
                        value={artboard.compose?.mode || 'image_primary'}
                        onChange={(e) =>
                          setArtboard((prev) => ({
                            ...prev,
                            compose: { ...prev.compose, mode: e.target.value },
                          }))
                        }
                      >
                        <Radio.Button value="image_primary">图为主</Radio.Button>
                        <Radio.Button value="markdown_primary">文为主</Radio.Button>
                        <Radio.Button value="mixed">混合</Radio.Button>
                      </Radio.Group>
                    </div>
                  </Space>
                ),
              },
              {
                key: 'props',
                label: '属性',
                children: selected && tree && selectedId ? (
                  <ComponentProps
                    node={selected}
                    columns={previewColumns}
                    onChange={(patch) => setTree(updateNode(tree, selectedId, patch))}
                    onMove={(dir) => setTree(moveSibling(tree, selectedId, dir))}
                    onDelete={() => {
                      setTree(removeNode(tree, selectedId))
                      setSelectedId(null)
                    }}
                  />
                ) : (
                  <Typography.Text type="secondary">选中画板上的组件以编辑属性</Typography.Text>
                ),
              },
              {
                key: 'preview',
                label: '预览',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button block type="primary" loading={compiling} onClick={() => void onCompile()}>
                      重新编译
                    </Button>
                    {imageBase64 ? (
                      <div>
                        <Typography.Text type="secondary">成图</Typography.Text>
                        <img
                          src={imageBase64}
                          alt="preview"
                          style={{ width: '100%', marginTop: 8, border: '1px solid #eee' }}
                        />
                      </div>
                    ) : previewHtml ? (
                      <Alert
                        type="warning"
                        showIcon
                        message="未生成 PNG（可装 playwright chromium），下方为 HTML 结构"
                      />
                    ) : (
                      <Typography.Text type="secondary">点击「编译预览」生成图/文</Typography.Text>
                    )}
                    {markdownText ? (
                      <div>
                        <Typography.Text type="secondary">文案 (Markdown)</Typography.Text>
                        <Input.TextArea
                          value={markdownText}
                          readOnly
                          rows={10}
                          style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
                        />
                      </div>
                    ) : null}
                  </Space>
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  )
}

function ArtboardBlock({
  node,
  selectedId,
  onSelect,
}: {
  node: StudioNode
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const selected = selectedId === node.id
  const border = selected ? '2px solid #1677ff' : '1px dashed #d9d9d9'
  const style: CSSProperties = {
    border,
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    cursor: 'pointer',
    background: selected ? '#f0f7ff' : '#fff',
  }

  if (node.type === 'Container') {
    const row = String(node.props?.direction) === 'row'
    return (
      <div style={style} onClick={(e) => { e.stopPropagation(); onSelect(node.id) }}>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {row ? '横向容器' : '容器'}
        </Typography.Text>
        <div style={{ display: 'flex', flexDirection: row ? 'row' : 'column', gap: 8, marginTop: 4 }}>
          {(node.children || []).map((ch) => (
            <div key={ch.id} style={{ flex: row ? 1 : undefined }}>
              <ArtboardBlock node={ch} selectedId={selectedId} onSelect={onSelect} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (node.type === 'Text') {
    const variant = String(node.props?.variant || 'body')
    return (
      <div style={style} onClick={(e) => { e.stopPropagation(); onSelect(node.id) }}>
        <Typography.Text
          strong={variant === 'h1'}
          type={variant === 'caption' ? 'secondary' : undefined}
          style={{ fontSize: variant === 'h1' ? 16 : 13 }}
        >
          {String(node.props?.text || '文本')}
        </Typography.Text>
      </div>
    )
  }

  if (node.type === 'Kpi') {
    return (
      <div style={style} onClick={(e) => { e.stopPropagation(); onSelect(node.id) }}>
        <Card size="small" styles={{ body: { padding: 8 } }}>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {String(node.binding?.label || node.props?.label || 'KPI')}
          </Typography.Text>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#1677ff' }}>
            {String(node.binding?.value_column || '—')}
          </div>
        </Card>
      </div>
    )
  }

  if (node.type === 'Table') {
    return (
      <div style={style} onClick={(e) => { e.stopPropagation(); onSelect(node.id) }}>
        <Typography.Text type="secondary">📊 数据表组件</Typography.Text>
        <div
          style={{
            marginTop: 6,
            height: 48,
            background: 'linear-gradient(#fafafa 50%, #fff 50%)',
            backgroundSize: '100% 24px',
            border: '1px solid #eee',
            borderRadius: 4,
          }}
        />
      </div>
    )
  }

  if (node.type === 'Divider') {
    return (
      <div style={style} onClick={(e) => { e.stopPropagation(); onSelect(node.id) }}>
        <hr style={{ border: 'none', borderTop: '1px solid #ddd', margin: 4 }} />
      </div>
    )
  }

  return (
    <div style={style} onClick={(e) => { e.stopPropagation(); onSelect(node.id) }}>
      {String(node.type)}
    </div>
  )
}

function ComponentProps({
  node,
  columns,
  onChange,
  onMove,
  onDelete,
}: {
  node: StudioNode
  columns: string[]
  onChange: (patch: Partial<StudioNode>) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}) {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space>
        <Tag>{node.type}</Tag>
        <Button size="small" onClick={() => onMove(-1)}>
          上移
        </Button>
        <Button size="small" onClick={() => onMove(1)}>
          下移
        </Button>
        <Button size="small" danger icon={<DeleteOutlined />} onClick={onDelete}>
          删除
        </Button>
      </Space>
      <div>
        <Typography.Text type="secondary">显示</Typography.Text>
        <div>
          <Switch
            checked={node.visible !== false}
            onChange={(v) => onChange({ visible: v })}
          />
        </div>
      </div>
      {node.type === 'Text' ? (
        <>
          <div>
            <Typography.Text type="secondary">样式</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={String(node.props?.variant || 'body')}
              onChange={(v) => onChange({ props: { ...node.props, variant: v } })}
              options={[
                { value: 'h1', label: '标题' },
                { value: 'body', label: '正文' },
                { value: 'caption', label: '脚注' },
              ]}
            />
          </div>
          <div>
            <Typography.Text type="secondary">文案（支持 {'{{列名}}'}）</Typography.Text>
            <Input.TextArea
              style={{ marginTop: 4 }}
              rows={3}
              value={String(node.props?.text || '')}
              onChange={(e) => onChange({ props: { ...node.props, text: e.target.value } })}
            />
          </div>
        </>
      ) : null}
      {node.type === 'Kpi' ? (
        <>
          <div>
            <Typography.Text type="secondary">标签</Typography.Text>
            <Input
              style={{ marginTop: 4 }}
              value={String(node.binding?.label || node.props?.label || '')}
              onChange={(e) =>
                onChange({
                  props: { ...node.props, label: e.target.value },
                  binding: { ...node.binding, label: e.target.value },
                })
              }
            />
          </div>
          <div>
            <Typography.Text type="secondary">数值列</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              allowClear
              showSearch
              placeholder="选择列"
              value={(node.binding?.value_column as string) || undefined}
              onChange={(v) =>
                onChange({
                  binding: { ...node.binding, value_column: v || '', label: v || node.binding?.label },
                  props: { ...node.props, label: v || node.props?.label },
                })
              }
              options={columns.map((c) => ({ value: c, label: c }))}
            />
          </div>
        </>
      ) : null}
      {node.type === 'Table' ? (
        <>
          <div>
            <Typography.Text type="secondary">百分比着色</Typography.Text>
            <div>
              <Switch
                checked={node.props?.color_ratios !== false}
                onChange={(v) => onChange({ props: { ...node.props, color_ratios: v } })}
              />
            </div>
          </div>
          <div>
            <Typography.Text type="secondary">最大行数</Typography.Text>
            <Input
              style={{ marginTop: 4 }}
              type="number"
              value={Number(node.props?.max_rows || 50)}
              onChange={(e) =>
                onChange({ props: { ...node.props, max_rows: Number(e.target.value) || 50 } })
              }
            />
          </div>
        </>
      ) : null}
      {node.type === 'Container' ? (
        <div>
          <Typography.Text type="secondary">方向</Typography.Text>
          <Radio.Group
            style={{ marginTop: 4, display: 'block' }}
            value={String(node.props?.direction || 'column')}
            onChange={(e) => onChange({ props: { ...node.props, direction: e.target.value } })}
          >
            <Radio.Button value="column">纵向</Radio.Button>
            <Radio.Button value="row">横向</Radio.Button>
          </Radio.Group>
        </div>
      ) : null}
    </Space>
  )
}
