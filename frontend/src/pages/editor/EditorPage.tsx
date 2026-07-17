/**
 * Content workbench — component assembly model:
 *   数据 → 组件(绑定出活件) → 组装 → 预览/推送
 * Binding shows real values, not field titles as fake content.
 */
import {
  ArrowLeftOutlined,
  CopyOutlined,
  DeleteOutlined,
  HolderOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  ColorPicker,
  Drawer,
  Input,
  List,
  Modal,
  Radio,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { Color } from 'antd/es/color-picker'
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  createStudioTemplate,
  deleteStudioTemplate,
  getPushJob,
  listChannels,
  listDataSources,
  listStudioTemplates,
  queryPreview,
  studioCompile,
  studioSaveJob,
  studioTestPush,
} from '../../api'
import { getErrorMessage } from '../../api/client'
import type { ArtboardDoc, Channel, DataSource, StudioNode, StudioTemplate } from '../../api/types'
import {
  appendChild,
  applyColumnToNode,
  cloneNode,
  defaultAlertArtboard,
  defaultDailyArtboard,
  emptyArtboard,
  ensureSecondaryDataset,
  extractArtboardFromJob,
  fieldDropSlots,
  liveComponentView,
  listComponentInstances,
  moveNodeTo,
  moveSibling,
  newComponent,
  removeNode,
  syncMainDataset,
  TABLE_STYLES,
  THEME_PACKS,
  updateNode,
  upsertDataset,
  type DataPreviewCtx,
  type FieldBindRole,
} from './studioUtils'

function colorToHex(color: Color | string): string {
  if (typeof color === 'string') return color
  return color.toHexString()
}

const PALETTE = [
  { type: 'Text', label: '文案' },
  { type: 'Kpi', label: 'KPI' },
  { type: 'Table', label: '表格' },
  { type: 'ChartBar', label: '柱状图' },
  { type: 'ChartLine', label: '折线图' },
  { type: 'ChartPie', label: '饼图' },
  { type: 'Alert', label: '告警条' },
  { type: 'Container', label: '分栏容器' },
  { type: 'Divider', label: '分隔线' },
]

type StepKey = 'data' | 'component' | 'compose' | 'preview'

const STEP_ITEMS = [
  { key: 'data' as const, title: '1. 数据' },
  { key: 'component' as const, title: '2. 组件' },
  { key: 'compose' as const, title: '3. 组装' },
  { key: 'preview' as const, title: '4. 预览' },
]

export function EditorPage() {
  const { jobId } = useParams<{ jobId?: string }>()
  const navigate = useNavigate()

  const [step, setStep] = useState<StepKey>('data')
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

  const [fieldsByDataset, setFieldsByDataset] = useState<Record<string, string[]>>({})
  const [rowsByDataset, setRowsByDataset] = useState<Record<string, unknown[][]>>({})
  const [activeDatasetId, setActiveDatasetId] = useState('main')

  const [markdownText, setMarkdownText] = useState('')
  const [imageBase64, setImageBase64] = useState('')

  const [querying, setQuerying] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [tplOpen, setTplOpen] = useState(false)
  const [templates, setTemplates] = useState<StudioTemplate[]>([])
  const [tplLoading, setTplLoading] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [fieldDrag, setFieldDrag] = useState<{ column: string; datasetId: string } | null>(null)

  const tree = artboard.tree
  const selected = useMemo(
    () => (selectedId && tree ? findNodeLocal(tree, selectedId) : null),
    [selectedId, tree],
  )
  const themeColor = artboard.artboard?.theme?.color || '#1677ff'
  const themePack = artboard.artboard?.theme?.pack || 'business'
  const datasets = artboard.datasets || []
  const activeDs = datasets.find((d) => d.id === activeDatasetId) || datasets[0]
  const datasetOptions = datasets.map((d) => ({ value: d.id, label: d.name || d.id }))

  const dataCtx: DataPreviewCtx = useMemo(() => {
    const ctx: DataPreviewCtx = {}
    const ids = new Set([
      ...Object.keys(fieldsByDataset),
      ...Object.keys(rowsByDataset),
      ...datasets.map((d) => d.id),
    ])
    for (const id of ids) {
      ctx[id] = {
        columns: fieldsByDataset[id] || [],
        rows: rowsByDataset[id] || [],
      }
    }
    return ctx
  }, [fieldsByDataset, rowsByDataset, datasets])

  const instances = useMemo(() => listComponentInstances(tree), [tree])
  const previewColumns = fieldsByDataset[activeDatasetId] || []
  const previewRows = rowsByDataset[activeDatasetId] || []

  const setTree = (next: StudioNode) => setArtboard((prev) => ({ ...prev, tree: next }))

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
          setStep('data')
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
        if (extracted) setArtboard(extracted)
        else {
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
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [jobId, loadMeta])

  const buildDoc = (): ArtboardDoc => {
    let doc = syncMainDataset(artboard, dataSourceId, sql)
    doc = {
      ...doc,
      datasets: (doc.datasets || []).map((d) => ({
        ...d,
        data_source_id: d.data_source_id || dataSourceId || null,
      })),
    }
    return doc
  }

  const onQuery = async () => {
    if (!dataSourceId) {
      message.error('请选择数据源')
      return
    }
    const slot = activeDs?.id || 'main'
    const slotSql = slot === 'main' ? sql : String(activeDs?.sql || sql)
    const slotDs = String(activeDs?.data_source_id || dataSourceId)
    setQuerying(true)
    try {
      const res = await queryPreview({
        data_source_id: slotDs,
        sql: slotSql,
        max_rows: 50,
      })
      setFieldsByDataset((prev) => ({ ...prev, [slot]: res.columns }))
      setRowsByDataset((prev) => ({ ...prev, [slot]: res.rows }))
      if (slot === 'main') setArtboard((prev) => syncMainDataset(prev, dataSourceId, sql))
      else
        setArtboard((prev) =>
          upsertDataset(prev, {
            id: slot,
            name: activeDs?.name,
            data_source_id: slotDs,
            sql: slotSql,
          }),
        )
      message.success(`数据集「${slot}」取数 ${res.row_count} 行 · 可去「组件」步绑定`)
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
      const doc = buildDoc()
      const res = await studioCompile({
        artboard: doc,
        data_source_id: dataSourceId,
        sql,
        want_image: true,
        max_rows: 50,
      })
      setMarkdownText(res.markdown_text || '')
      setImageBase64(res.image_base64 || '')
      setArtboard(res.artboard || doc)
      message.success('推送内容已编译')
      setStep('preview')
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
      const doc = buildDoc()
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
      if (jobId !== saved.id) navigate(`/editor/${saved.id}`, { replace: true })
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
      message.error('请选择通道')
      return
    }
    setPushing(true)
    try {
      const res = await studioTestPush({
        artboard: buildDoc(),
        data_source_id: dataSourceId,
        sql,
        channel_ids: channelIds,
        push_job_id: currentJobId,
      })
      if (res.markdown_text) setMarkdownText(res.markdown_text)
      if (res.success) message.success('试推成功')
      else message.error('试推部分失败')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setPushing(false)
    }
  }

  const applyFieldToNode = (
    nodeId: string,
    column: string,
    datasetId: string,
    role: FieldBindRole = 'auto',
  ) => {
    if (!tree) return
    const node = findNodeLocal(tree, nodeId)
    if (!node) return
    const patch = applyColumnToNode(node, column, role, datasetId)
    if (!Object.keys(patch).length) {
      message.info('此组件不接收该绑定')
      return
    }
    setTree(updateNode(tree, nodeId, patch))
    setSelectedId(nodeId)
    message.success(`已绑定 ${datasetId}.${column}`)
  }

  const onFieldDragStart = (column: string, datasetId: string, e: DragEvent) => {
    setFieldDrag({ column, datasetId })
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', column)
  }

  const addComponent = (type: string) => {
    if (!tree) return
    const node = newComponent(type)
    if (selected?.type === 'Container') setTree(appendChild(tree, selected.id, node))
    else setTree(appendChild(tree, 'root', node))
    setSelectedId(node.id)
    setStep('component')
    message.success(`已添加${PALETTE.find((p) => p.type === type)?.label || type}，请绑定数据`)
  }

  const applyTemplate = (kind: 'daily' | 'alert' | 'blank') => {
    const board =
      kind === 'daily'
        ? defaultDailyArtboard()
        : kind === 'alert'
          ? defaultAlertArtboard()
          : emptyArtboard()
    const next = dataSourceId
      ? syncMainDataset(board, dataSourceId, board.datasets?.[0]?.sql || sql)
      : board
    if (board.datasets?.[0]?.sql) setSql(String(board.datasets[0].sql))
    setArtboard(next)
    setSelectedId(null)
    setFieldsByDataset({})
    setRowsByDataset({})
    message.info('已应用模板，请重新取数后再绑定')
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

  const stepIndex = STEP_ITEMS.findIndex((s) => s.key === step)

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
              内容工作台
            </Typography.Title>
            <Input
              style={{ width: 200 }}
              placeholder="推送名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </Space>
          <Space wrap>
            <Button
              onClick={() => {
                setTplOpen(true)
                setTplLoading(true)
                listStudioTemplates()
                  .then(setTemplates)
                  .catch((e) => message.error(getErrorMessage(e)))
                  .finally(() => setTplLoading(false))
              }}
            >
              模板库
            </Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void onSave()}>
              {currentJobId ? '保存' : '保存为任务'}
            </Button>
          </Space>
        </Space>
        <div style={{ marginTop: 12, maxWidth: 720 }}>
          <Steps
            size="small"
            current={stepIndex}
            onChange={(i) => setStep(STEP_ITEMS[i]!.key)}
            items={STEP_ITEMS.map((s) => ({ title: s.title }))}
          />
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        banner
        message="推送内容 = 多个组件组装。先准备数据 → 给每个组件绑定字段（看实值）→ 再组装顺序 → 最后整页预览。"
        description={
          fieldDrag
            ? `正在拖字段 ${fieldDrag.datasetId}.${fieldDrag.column}，放到组件的绑定槽上`
            : '绑定成功后 KPI/文案应显示数据值，而不是字段名。'
        }
      />

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
        {/* ===== STEP: DATA ===== */}
        {step === 'data' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, maxWidth: 560 }}>
              <Typography.Title level={5}>准备数据集</Typography.Title>
              <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                数据是原料。取数成功后，字段才能拖到组件上。
              </Typography.Paragraph>
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                  <Typography.Text type="secondary">当前数据集</Typography.Text>
                  <Space style={{ width: '100%', marginTop: 4 }} wrap>
                    <Select
                      style={{ minWidth: 160 }}
                      value={activeDatasetId}
                      onChange={setActiveDatasetId}
                      options={datasetOptions}
                    />
                    <Button
                      size="small"
                      onClick={() => {
                        setArtboard((p) => ensureSecondaryDataset(p))
                        setActiveDatasetId('trend')
                      }}
                    >
                      + 第二数据集
                    </Button>
                  </Space>
                </div>
                <div>
                  <Typography.Text type="secondary">数据源</Typography.Text>
                  <Select
                    style={{ width: '100%', marginTop: 4 }}
                    showSearch
                    optionFilterProp="label"
                    placeholder="选择数据源"
                    value={
                      activeDatasetId === 'main'
                        ? dataSourceId
                        : (activeDs?.data_source_id as string) || dataSourceId
                    }
                    onChange={(v) => {
                      if (activeDatasetId === 'main') setDataSourceId(v)
                      else
                        setArtboard((p) =>
                          upsertDataset(p, {
                            id: activeDatasetId,
                            name: activeDs?.name,
                            data_source_id: v,
                            sql: activeDs?.sql,
                          }),
                        )
                    }}
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
                    rows={8}
                    value={activeDatasetId === 'main' ? sql : String(activeDs?.sql || '')}
                    onChange={(e) => {
                      if (activeDatasetId === 'main') setSql(e.target.value)
                      else
                        setArtboard((p) =>
                          upsertDataset(p, {
                            id: activeDatasetId,
                            name: activeDs?.name,
                            data_source_id: activeDs?.data_source_id,
                            sql: e.target.value,
                          }),
                        )
                    }}
                  />
                </div>
                <Button type="primary" block loading={querying} onClick={() => void onQuery()}>
                  运行取数
                </Button>
                <Button
                  block
                  disabled={!previewColumns.length}
                  onClick={() => setStep('component')}
                >
                  下一步：去绑定组件 →
                </Button>
              </Space>
            </div>
            <div style={{ flex: 1, minWidth: 280 }}>
              <Typography.Title level={5}>字段与样例</Typography.Title>
              {!previewColumns.length ? (
                <Alert type="warning" showIcon message="尚未取数" description="运行 SQL 后这里列出可拖字段" />
              ) : (
                <>
                  <div style={{ marginBottom: 8 }}>
                    {previewColumns.map((c) => (
                      <Tag
                        key={c}
                        draggable
                        color="blue"
                        style={{ cursor: 'grab', marginBottom: 4, userSelect: 'none' }}
                        onDragStart={(e) => onFieldDragStart(c, activeDatasetId, e)}
                        onDragEnd={() => setFieldDrag(null)}
                      >
                        ≡ {c}
                      </Tag>
                    ))}
                  </div>
                  <Table
                    size="small"
                    pagination={false}
                    scroll={{ x: true, y: 280 }}
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
              )}
            </div>
          </div>
        )}

        {/* ===== STEP: COMPONENT ===== */}
        {step === 'component' && (
          <>
            {/* left: palette + fields */}
            <div
              style={{
                width: 220,
                borderRight: '1px solid #f0f0f0',
                background: '#fafafa',
                overflow: 'auto',
                padding: 12,
                flexShrink: 0,
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                添加组件类型
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
                可拖字段（当前数据集）
              </Typography.Text>
              <Select
                size="small"
                style={{ width: '100%', margin: '6px 0' }}
                value={activeDatasetId}
                onChange={setActiveDatasetId}
                options={datasetOptions}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {previewColumns.length === 0 ? (
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    请先在「数据」步取数
                  </Typography.Text>
                ) : (
                  previewColumns.map((c) => (
                    <Tag
                      key={c}
                      draggable
                      color={fieldDrag?.column === c ? 'blue' : 'default'}
                      style={{ cursor: 'grab', userSelect: 'none' }}
                      onDragStart={(e) => onFieldDragStart(c, activeDatasetId, e)}
                      onDragEnd={() => setFieldDrag(null)}
                      onClick={() => {
                        if (!selectedId || !selected) {
                          message.info('先点选中间的组件卡片')
                          return
                        }
                        applyFieldToNode(selectedId, c, activeDatasetId, 'auto')
                      }}
                    >
                      ≡ {c}
                    </Tag>
                  ))
                )}
              </div>
              <Button style={{ marginTop: 16 }} block onClick={() => setStep('data')}>
                ← 数据
              </Button>
              <Button
                style={{ marginTop: 8 }}
                type="primary"
                block
                onClick={() => setStep('compose')}
              >
                下一步：组装 →
              </Button>
            </div>

            {/* center: component cards with LIVE values */}
            <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#f5f5f5' }}>
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                组件实例（绑定后应看到数据值）
              </Typography.Title>
              {instances.length === 0 ? (
                <Alert
                  type="info"
                  showIcon
                  message="还没有组件"
                  description="从左侧添加 KPI / 表 / 图 / 文案等，再拖字段绑定。"
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640 }}>
                  {instances.map((node) => {
                    const live = liveComponentView(node, dataCtx)
                    const active = selectedId === node.id
                    return (
                      <div
                        key={node.id}
                        onClick={() => setSelectedId(node.id)}
                        style={{
                          background: '#fff',
                          borderRadius: 8,
                          padding: 12,
                          border: active ? '2px solid #1677ff' : '1px solid #e8e8e8',
                          cursor: 'pointer',
                          boxShadow: active ? '0 0 0 3px rgba(22,119,255,0.12)' : undefined,
                        }}
                      >
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Space>
                            <Tag color={live.bound && !live.warning ? 'success' : 'default'}>
                              {node.type}
                            </Tag>
                            <Typography.Text strong>{live.title}</Typography.Text>
                            {live.warning ? <Tag color="warning">{live.warning}</Tag> : null}
                          </Space>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            @{String(node.binding?.dataset_id || 'main')}
                          </Typography.Text>
                        </Space>
                        {/* REAL VALUE — not field name as content */}
                        <div
                          style={{
                            marginTop: 10,
                            padding: '10px 12px',
                            background: live.warning ? '#fffbe6' : '#f6ffed',
                            borderRadius: 6,
                            border: `1px solid ${live.warning ? '#ffe58f' : '#b7eb8f'}`,
                          }}
                        >
                          <Typography.Text
                            style={{
                              fontSize: node.type === 'Kpi' ? 22 : 14,
                              fontWeight: node.type === 'Kpi' ? 700 : 500,
                              color: '#135200',
                              display: 'block',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {live.primary}
                          </Typography.Text>
                          {live.secondary ? (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {live.secondary}
                            </Typography.Text>
                          ) : null}
                        </div>
                        {active && fieldDropSlots(node).length > 0 ? (
                          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            {fieldDropSlots(node).map((s) => (
                              <FieldSlot
                                key={s.role}
                                label={s.label}
                                active={!!fieldDrag}
                                bound={
                                  s.role === 'category'
                                    ? String(node.binding?.category_column || '')
                                    : s.role === 'value'
                                      ? String(node.binding?.value_column || '')
                                      : s.role === 'text'
                                        ? '文案插值'
                                        : String(node.binding?.dataset_id || '')
                                }
                                onDrop={() => {
                                  if (!fieldDrag) return
                                  applyFieldToNode(
                                    node.id,
                                    fieldDrag.column,
                                    fieldDrag.datasetId,
                                    s.role,
                                  )
                                  setFieldDrag(null)
                                }}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* right: props for selected */}
            <div
              style={{
                width: 300,
                borderLeft: '1px solid #f0f0f0',
                overflow: 'auto',
                padding: 12,
                background: '#fff',
                flexShrink: 0,
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                选中组件设置
              </Typography.Text>
              {selected && tree && selectedId ? (
                <ComponentProps
                  node={selected}
                  columns={
                    fieldsByDataset[String(selected.binding?.dataset_id || activeDatasetId)] ||
                    previewColumns
                  }
                  datasetOptions={datasetOptions}
                  fieldDragActive={!!fieldDrag}
                  onFieldSlotDrop={(role) => {
                    if (!fieldDrag || !selectedId) return
                    applyFieldToNode(
                      selectedId,
                      fieldDrag.column,
                      fieldDrag.datasetId,
                      role,
                    )
                    setFieldDrag(null)
                  }}
                  onChange={(patch) => setTree(updateNode(tree, selectedId, patch))}
                  onMove={(dir) => setTree(moveSibling(tree, selectedId, dir))}
                  onDuplicate={() => {
                    const copy = cloneNode(selected)
                    const insertAfter = (r: StudioNode): StudioNode => {
                      const kids = r.children || []
                      const idx = kids.findIndex((c) => c.id === selectedId)
                      if (idx >= 0) {
                        const nk = [...kids]
                        nk.splice(idx + 1, 0, copy)
                        return { ...r, children: nk }
                      }
                      return { ...r, children: kids.map(insertAfter) }
                    }
                    setTree(insertAfter(tree))
                    setSelectedId(copy.id)
                  }}
                  onDelete={() => {
                    setTree(removeNode(tree, selectedId))
                    setSelectedId(null)
                  }}
                />
              ) : (
                <Typography.Paragraph type="secondary" style={{ marginTop: 12, fontSize: 13 }}>
                  点击中间的组件卡片，然后把左侧字段拖到绑定槽（分类 / 数值 / 文案）。
                </Typography.Paragraph>
              )}
            </div>
          </>
        )}

        {/* ===== STEP: COMPOSE ===== */}
        {step === 'compose' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', gap: 16 }}>
            <div style={{ width: 320, flexShrink: 0 }}>
              <Typography.Title level={5}>组装顺序</Typography.Title>
              <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                拖动手柄调整推送内容中组件的上下顺序（顶层）。
              </Typography.Paragraph>
              <List
                size="small"
                dataSource={tree?.children || []}
                locale={{ emptyText: '无组件，回「组件」步添加' }}
                renderItem={(node, index) => {
                  const live = liveComponentView(node, dataCtx)
                  return (
                    <List.Item
                      draggable
                      onDragStart={() => setDragId(node.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (!tree || !dragId || dragId === node.id) return
                        setTree(moveNodeTo(tree, dragId, 'root', index))
                        setDragId(null)
                      }}
                      onDragEnd={() => setDragId(null)}
                      style={{
                        cursor: 'grab',
                        background: dragId === node.id ? '#fff7e6' : '#fff',
                        borderRadius: 6,
                        marginBottom: 6,
                        padding: '8px 10px',
                        border: '1px solid #f0f0f0',
                      }}
                    >
                      <Space>
                        <HolderOutlined />
                        <Tag>{index + 1}</Tag>
                        <span>{live.title}</span>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {live.primary}
                        </Typography.Text>
                      </Space>
                    </List.Item>
                  )
                }}
              />
              <Space style={{ marginTop: 12 }}>
                <Button onClick={() => setStep('component')}>← 组件</Button>
                <Button type="primary" onClick={() => setStep('preview')}>
                  下一步：预览 →
                </Button>
              </Space>
            </div>
            <div style={{ flex: 1 }}>
              <Typography.Title level={5}>版式与主题</Typography.Title>
              <Space direction="vertical" style={{ width: '100%', maxWidth: 400 }} size="middle">
                <div>
                  <Typography.Text type="secondary">主题包</Typography.Text>
                  <Select
                    style={{ width: '100%', marginTop: 4 }}
                    value={themePack}
                    onChange={(packId) => {
                      const pack = THEME_PACKS.find((p) => p.id === packId)
                      if (!pack) return
                      setArtboard((prev) => ({
                        ...prev,
                        artboard: {
                          ...prev.artboard,
                          theme: {
                            ...prev.artboard?.theme,
                            pack: pack.id,
                            color: pack.color,
                            table_style:
                              pack.id === 'alert'
                                ? 'alert'
                                : prev.artboard?.theme?.table_style || 'business',
                          },
                        },
                      }))
                    }}
                    options={THEME_PACKS.map((p) => ({ value: p.id, label: p.label }))}
                  />
                </div>
                <div>
                  <Typography.Text type="secondary">顶栏标题（支持 {'{{列}}'}）</Typography.Text>
                  <Input
                    style={{ marginTop: 4 }}
                    value={String(artboard.artboard?.chrome_title || '')}
                    onChange={(e) =>
                      setArtboard((prev) => ({
                        ...prev,
                        artboard: { ...prev.artboard, chrome_title: e.target.value },
                      }))
                    }
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
                            theme: { ...prev.artboard?.theme, color: colorToHex(c) },
                          },
                        }))
                      }
                    />
                    <Switch
                      checked={artboard.artboard?.show_chrome !== false}
                      onChange={(v) =>
                        setArtboard((prev) => ({
                          ...prev,
                          artboard: { ...prev.artboard, show_chrome: v },
                        }))
                      }
                    />
                    顶栏色条
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
            </div>
          </div>
        )}

        {/* ===== STEP: PREVIEW ===== */}
        {step === 'preview' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <Space style={{ marginBottom: 12 }}>
                <Button onClick={() => setStep('compose')}>← 组装</Button>
                <Button type="primary" loading={compiling} onClick={() => void onCompile()}>
                  编译推送内容
                </Button>
                <Button
                  icon={<PlayCircleOutlined />}
                  loading={pushing}
                  onClick={() => void onTestPush()}
                >
                  试推
                </Button>
              </Space>
              {imageBase64 ? (
                <img
                  src={imageBase64}
                  alt="push preview"
                  style={{ maxWidth: '100%', border: '1px solid #eee', borderRadius: 8 }}
                />
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message="点击「编译推送内容」生成整页预览图/文案"
                />
              )}
              {markdownText ? (
                <div style={{ marginTop: 16 }}>
                  <Typography.Text type="secondary">文案投影 (Markdown)</Typography.Text>
                  <Input.TextArea
                    readOnly
                    rows={8}
                    value={markdownText}
                    style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
                  />
                </div>
              ) : null}
            </div>
            <div style={{ width: 280, flexShrink: 0 }}>
              <Typography.Title level={5}>投递</Typography.Title>
              <div>
                <Typography.Text type="secondary">通道</Typography.Text>
                <Select
                  mode="multiple"
                  style={{ width: '100%', marginTop: 4 }}
                  value={channelIds}
                  onChange={setChannelIds}
                  options={channels.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${c.type})`,
                  }))}
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <Switch checked={enabled} onChange={setEnabled} /> 任务启用
              </div>
              <div style={{ marginTop: 16 }}>
                <Typography.Text type="secondary">组件清单摘要</Typography.Text>
                <List
                  size="small"
                  style={{ marginTop: 8 }}
                  dataSource={instances.filter((n) => n.type !== 'Container')}
                  renderItem={(n) => {
                    const live = liveComponentView(n, dataCtx)
                    return (
                      <List.Item>
                        <Space direction="vertical" size={0}>
                          <Space>
                            <Tag>{n.type}</Tag>
                            {live.warning ? (
                              <Tag color="warning">待完善</Tag>
                            ) : (
                              <Tag color="success">就绪</Tag>
                            )}
                          </Space>
                          <Typography.Text style={{ fontSize: 12 }}>{live.primary}</Typography.Text>
                        </Space>
                      </List.Item>
                    )
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <Drawer
        title="模板库"
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        width={400}
        extra={
          <Space>
            <Button size="small" onClick={() => applyTemplate('daily')}>
              日报
            </Button>
            <Button size="small" onClick={() => applyTemplate('alert')}>
              告警
            </Button>
            <Button
              type="primary"
              size="small"
              onClick={() => {
                Modal.confirm({
                  title: '保存当前为模板',
                  content: (
                    <Input id="tpl-name-input" defaultValue={name || '我的模板'} placeholder="名称" />
                  ),
                  onOk: async () => {
                    const el = document.getElementById('tpl-name-input') as HTMLInputElement | null
                    await createStudioTemplate({
                      name: (el?.value || '我的模板').trim(),
                      artboard: buildDoc(),
                    })
                    message.success('已保存')
                    setTemplates(await listStudioTemplates())
                  },
                })
              }}
            >
              存为模板
            </Button>
          </Space>
        }
      >
        <List
          loading={tplLoading}
          dataSource={templates}
          renderItem={(tpl) => (
            <List.Item
              actions={[
                <Button
                  key="a"
                  type="link"
                  size="small"
                  onClick={() => {
                    const board = tpl.artboard || emptyArtboard()
                    setArtboard(
                      dataSourceId
                        ? syncMainDataset(board, dataSourceId, board.datasets?.[0]?.sql || sql)
                        : board,
                    )
                    if (board.datasets?.[0]?.sql) setSql(String(board.datasets[0].sql))
                    setFieldsByDataset({})
                    setRowsByDataset({})
                    setTplOpen(false)
                    setStep('data')
                    message.success(`已应用 ${tpl.name}，请重新取数`)
                  }}
                >
                  应用
                </Button>,
                !tpl.is_system ? (
                  <Button
                    key="d"
                    type="link"
                    danger
                    size="small"
                    onClick={() => {
                      Modal.confirm({
                        title: '删除模板？',
                        onOk: async () => {
                          await deleteStudioTemplate(tpl.id)
                          setTemplates(await listStudioTemplates())
                        },
                      })
                    }}
                  >
                    删除
                  </Button>
                ) : null,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={
                  <Space>
                    {tpl.name}
                    {tpl.is_system ? <Tag>系统</Tag> : <Tag color="blue">自定义</Tag>}
                  </Space>
                }
                description={tpl.description || tpl.scene_id}
              />
            </List.Item>
          )}
        />
      </Drawer>
    </div>
  )
}

function findNodeLocal(root: StudioNode, id: string): StudioNode | null {
  if (root.id === id) return root
  for (const ch of root.children || []) {
    const f = findNodeLocal(ch, id)
    if (f) return f
  }
  return null
}

function FieldSlot({
  label,
  active,
  bound,
  onDrop,
}: {
  label: string
  active: boolean
  bound?: string
  onDrop: () => void
}) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={(e) => {
        if (!active) return
        e.preventDefault()
        e.stopPropagation()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        onDrop()
      }}
      style={{
        flex: 1,
        minHeight: 40,
        padding: 6,
        borderRadius: 4,
        border: over ? '2px solid #1677ff' : active ? '1px dashed #69b1ff' : '1px dashed #d9d9d9',
        background: over ? '#bae0ff' : active ? '#e6f4ff' : '#fafafa',
        fontSize: 11,
        textAlign: 'center',
      }}
    >
      <div style={{ color: '#666' }}>{label}</div>
      <div style={{ fontWeight: 600, color: bound ? '#1677ff' : '#bbb' }}>
        {bound || '拖字段到此'}
      </div>
    </div>
  )
}

function ComponentProps({
  node,
  datasetOptions,
  fieldDragActive,
  onFieldSlotDrop,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: {
  node: StudioNode
  columns?: string[]
  datasetOptions: { value: string; label: string }[]
  fieldDragActive: boolean
  onFieldSlotDrop: (role: FieldBindRole) => void
  onChange: (patch: Partial<StudioNode>) => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const slots = fieldDropSlots(node)
  return (
    <Space direction="vertical" style={{ width: '100%', marginTop: 8 }} size="middle">
      <Space wrap>
        <Tag>{node.type}</Tag>
        <Button size="small" onClick={() => onMove(-1)}>
          上
        </Button>
        <Button size="small" onClick={() => onMove(1)}>
          下
        </Button>
        <Button size="small" icon={<CopyOutlined />} onClick={onDuplicate}>
          复制
        </Button>
        <Button size="small" danger icon={<DeleteOutlined />} onClick={onDelete}>
          删
        </Button>
      </Space>

      {['Text', 'Kpi', 'Table', 'Chart', 'Alert'].includes(String(node.type)) ? (
        <div>
          <Typography.Text type="secondary">数据集</Typography.Text>
          <Select
            style={{ width: '100%', marginTop: 4 }}
            value={String(node.binding?.dataset_id || 'main')}
            onChange={(v) => onChange({ binding: { ...node.binding, dataset_id: v } })}
            options={datasetOptions.length ? datasetOptions : [{ value: 'main', label: 'main' }]}
          />
        </div>
      ) : null}

      {slots.length > 0 ? (
        <div>
          <Typography.Text type="secondary">绑定槽（拖字段）</Typography.Text>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {slots.map((s) => (
              <div key={s.role} style={{ flex: '1 1 100px' }}>
                <FieldSlot
                  label={s.label}
                  active={fieldDragActive}
                  bound={
                    s.role === 'category'
                      ? String(node.binding?.category_column || '')
                      : s.role === 'value'
                        ? String(node.binding?.value_column || '')
                        : s.role === 'text'
                          ? '插值'
                          : String(node.binding?.dataset_id || '')
                  }
                  onDrop={() => onFieldSlotDrop(s.role)}
                />
              </div>
            ))}
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
            从左侧把字段拖进上方槽位；槽位上显示的是「绑定了哪个字段」，中间卡片显示「实值」。
          </Typography.Text>
        </div>
      ) : null}

      {node.type === 'Text' || node.type === 'Alert' ? (
        <div>
          <Typography.Text type="secondary">文案模板</Typography.Text>
          <Input.TextArea
            style={{ marginTop: 4 }}
            rows={3}
            value={String(node.props?.text || '')}
            onChange={(e) => onChange({ props: { ...node.props, text: e.target.value } })}
          />
          {node.type === 'Text' ? (
            <Select
              style={{ width: '100%', marginTop: 8 }}
              value={String(node.props?.variant || 'body')}
              onChange={(v) => onChange({ props: { ...node.props, variant: v } })}
              options={[
                { value: 'h1', label: '标题' },
                { value: 'body', label: '正文' },
                { value: 'caption', label: '脚注' },
              ]}
            />
          ) : (
            <Select
              style={{ width: '100%', marginTop: 8 }}
              value={String(node.props?.level || 'error')}
              onChange={(v) => onChange({ props: { ...node.props, level: v } })}
              options={[
                { value: 'error', label: '严重' },
                { value: 'warning', label: '警告' },
                { value: 'info', label: '信息' },
              ]}
            />
          )}
        </div>
      ) : null}

      {node.type === 'Chart' ? (
        <div>
          <Typography.Text type="secondary">图表类型 / 标题</Typography.Text>
          <Radio.Group
            style={{ marginTop: 4, display: 'block' }}
            value={String(node.props?.chart_type || 'bar')}
            onChange={(e) =>
              onChange({ props: { ...node.props, chart_type: e.target.value } })
            }
          >
            <Radio.Button value="bar">柱</Radio.Button>
            <Radio.Button value="line">线</Radio.Button>
            <Radio.Button value="pie">饼</Radio.Button>
          </Radio.Group>
          <Input
            style={{ marginTop: 8 }}
            placeholder="图表标题（样式用，不是数据）"
            value={String(node.props?.title || '')}
            onChange={(e) => onChange({ props: { ...node.props, title: e.target.value } })}
          />
        </div>
      ) : null}

      {node.type === 'Table' ? (
        <div>
          <Typography.Text type="secondary">表风格</Typography.Text>
          <Select
            style={{ width: '100%', marginTop: 4 }}
            value={String(node.props?.style || 'business')}
            onChange={(v) => onChange({ props: { ...node.props, style: v } })}
            options={TABLE_STYLES.map((s) => ({ value: s.id, label: s.label }))}
          />
        </div>
      ) : null}

      {node.type === 'Container' ? (
        <Radio.Group
          value={String(node.props?.direction || 'column')}
          onChange={(e) => onChange({ props: { ...node.props, direction: e.target.value } })}
        >
          <Radio.Button value="column">纵向</Radio.Button>
          <Radio.Button value="row">横向</Radio.Button>
        </Radio.Group>
      ) : null}

      <div>
        <Typography.Text type="secondary">条件显隐</Typography.Text>
        <Select
          style={{ width: '100%', marginTop: 4 }}
          value={String(node.props?.visible_when || 'always')}
          onChange={(v) =>
            onChange({
              props: { ...node.props, visible_when: v === 'always' ? '' : v },
            })
          }
          options={[
            { value: 'always', label: '始终显示' },
            { value: 'row_count>0', label: '有数据时' },
            { value: 'row_count==0', label: '无数据时' },
            { value: 'never', label: '隐藏' },
          ]}
        />
      </div>
    </Space>
  )
}
