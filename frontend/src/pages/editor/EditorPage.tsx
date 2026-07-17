/**
 * 简单清爽四步：
 * 1 数据 → 2 组件购物车（造组件+绑字段+基础样式，加入清单）
 * → 3 组装（顺序/宽度/配色）→ 4 预览推送
 */
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  HolderOutlined,
  PlusOutlined,
  SaveOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  ColorPicker,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
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
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  defaultAlertArtboard,
  defaultDailyArtboard,
  emptyArtboard,
  ensureSecondaryDataset,
  extractArtboardFromJob,
  liveComponentView,
  moveNodeTo,
  newComponent,
  nid,
  removeNode,
  syncMainDataset,
  TABLE_STYLES,
  THEME_PACKS,
  updateNode,
  upsertDataset,
  type DataPreviewCtx,
} from './studioUtils'

function colorToHex(color: Color | string): string {
  if (typeof color === 'string') return color
  return color.toHexString()
}

/** Content components only (购物车不含纯容器) */
const CART_TYPES = [
  { type: 'Kpi', label: 'KPI 数字' },
  { type: 'Text', label: '文案' },
  { type: 'Table', label: '表格' },
  { type: 'ChartBar', label: '柱状图' },
  { type: 'ChartLine', label: '折线图' },
  { type: 'ChartPie', label: '饼图' },
  { type: 'Alert', label: '告警条' },
  { type: 'Divider', label: '分隔线' },
]

type StepKey = 'data' | 'cart' | 'compose' | 'preview'

const STEPS = [
  { key: 'data' as const, title: '1. 数据' },
  { key: 'cart' as const, title: '2. 组件清单' },
  { key: 'compose' as const, title: '3. 组装' },
  { key: 'preview' as const, title: '4. 预览' },
]

type DraftForm = {
  type: string
  dataset_id: string
  // data binding
  value_column?: string
  category_column?: string
  label?: string
  text?: string
  chart_type?: string
  title?: string
  // simple style (组件步)
  variant?: string
  table_style?: string
  level?: string
}

function emptyDraft(type: string, datasetId: string): DraftForm {
  const base: DraftForm = { type, dataset_id: datasetId, text: '', title: '', label: '' }
  if (type === 'ChartBar') return { ...base, type: 'Chart', chart_type: 'bar', title: '柱状图' }
  if (type === 'ChartLine') return { ...base, type: 'Chart', chart_type: 'line', title: '折线图' }
  if (type === 'ChartPie') return { ...base, type: 'Chart', chart_type: 'pie', title: '饼图' }
  if (type === 'Text') return { ...base, type: 'Text', variant: 'body', text: '' }
  if (type === 'Alert') return { ...base, type: 'Alert', level: 'error', text: '' }
  if (type === 'Kpi') return { ...base, type: 'Kpi', label: '' }
  if (type === 'Table') return { ...base, type: 'Table', table_style: 'business' }
  if (type === 'Divider') return { ...base, type: 'Divider' }
  return base
}

function nodeToDraft(node: StudioNode): DraftForm {
  const t = String(node.type)
  const b = node.binding || {}
  const p = node.props || {}
  return {
    type: t,
    dataset_id: String(b.dataset_id || 'main'),
    value_column: String(b.value_column || ''),
    category_column: String(b.category_column || ''),
    label: String(b.label || p.label || ''),
    text: String(p.text || ''),
    chart_type: String(p.chart_type || 'bar'),
    title: String(p.title || ''),
    variant: String(p.variant || 'body'),
    table_style: String(p.style || 'business'),
    level: String(p.level || 'error'),
  }
}

function draftToNode(draft: DraftForm, existingId?: string): StudioNode {
  const id = existingId || nid()
  const ds = draft.dataset_id || 'main'
  const t = draft.type

  if (t === 'Kpi') {
    return {
      id,
      type: 'Kpi',
      visible: true,
      props: { label: draft.label || draft.value_column || '指标' },
      binding: {
        dataset_id: ds,
        value_column: draft.value_column || '',
        label: draft.label || draft.value_column || '指标',
      },
    }
  }
  if (t === 'Chart') {
    return {
      id,
      type: 'Chart',
      visible: true,
      props: {
        chart_type: draft.chart_type || 'bar',
        title: draft.title || '',
        max_rows: 12,
      },
      binding: {
        dataset_id: ds,
        category_column: draft.category_column || '',
        value_column: draft.value_column || '',
      },
    }
  }
  if (t === 'Text') {
    return {
      id,
      type: 'Text',
      visible: true,
      props: { variant: draft.variant || 'body', text: draft.text || '' },
      binding: { dataset_id: ds },
    }
  }
  if (t === 'Alert') {
    return {
      id,
      type: 'Alert',
      visible: true,
      props: { level: draft.level || 'error', text: draft.text || '' },
      binding: { dataset_id: ds },
    }
  }
  if (t === 'Table') {
    return {
      id,
      type: 'Table',
      visible: true,
      props: {
        style: draft.table_style || 'business',
        color_ratios: true,
        max_rows: 50,
      },
      binding: { dataset_id: ds },
    }
  }
  if (t === 'Divider') {
    return { id, type: 'Divider', visible: true, props: {}, binding: {} }
  }
  return newComponent(t)
}

function findNode(root: StudioNode, id: string): StudioNode | null {
  if (root.id === id) return root
  for (const ch of root.children || []) {
    const f = findNode(ch, id)
    if (f) return f
  }
  return null
}

/** Flat cart = root children only (simple list, no nested containers in cart UX) */
function cartItems(tree?: StudioNode): StudioNode[] {
  return (tree?.children || []).filter((n) => n.type !== 'Container')
}

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

  const [artboard, setArtboard] = useState<ArtboardDoc>(() => emptyArtboard())
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftForm | null>(null)

  const [fieldsByDataset, setFieldsByDataset] = useState<Record<string, string[]>>({})
  const [rowsByDataset, setRowsByDataset] = useState<Record<string, unknown[][]>>({})
  const [activeDatasetId, setActiveDatasetId] = useState('main')

  const [markdownText, setMarkdownText] = useState('')
  const [imageBase64, setImageBase64] = useState('')
  const [querying, setQuerying] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const tree = artboard.tree
  const datasets = artboard.datasets || []
  const activeDs = datasets.find((d) => d.id === activeDatasetId) || datasets[0]
  const datasetOptions = datasets.map((d) => ({ value: d.id, label: d.name || d.id }))
  const cart = useMemo(() => cartItems(tree), [tree])
  const fields = fieldsByDataset[draft?.dataset_id || activeDatasetId] || []
  const previewColumns = fieldsByDataset[activeDatasetId] || []
  const previewRows = rowsByDataset[activeDatasetId] || []

  const dataCtx: DataPreviewCtx = useMemo(() => {
    const ctx: DataPreviewCtx = {}
    for (const id of new Set([...Object.keys(fieldsByDataset), ...Object.keys(rowsByDataset)])) {
      ctx[id] = { columns: fieldsByDataset[id] || [], rows: rowsByDataset[id] || [] }
    }
    return ctx
  }, [fieldsByDataset, rowsByDataset])

  const setTree = (next: StudioNode) => setArtboard((p) => ({ ...p, tree: next }))

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
          setArtboard(emptyArtboard())
          setCurrentJobId(null)
          setName('')
          setDataSourceId(undefined)
          setSql('SELECT 1 AS demo')
          setChannelIds([])
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
        setArtboard(
          extracted ||
            syncMainDataset(emptyArtboard(), job.data_source_id, job.query_sql),
        )
      })
      .catch((e) => message.error(getErrorMessage(e)))
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
      message.error('请先选数据源')
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
      setFieldsByDataset((p) => ({ ...p, [slot]: res.columns }))
      setRowsByDataset((p) => ({ ...p, [slot]: res.rows }))
      if (slot === 'main') setArtboard((p) => syncMainDataset(p, dataSourceId, sql))
      else
        setArtboard((p) =>
          upsertDataset(p, {
            id: slot,
            name: activeDs?.name,
            data_source_id: slotDs,
            sql: slotSql,
          }),
        )
      message.success(`取数成功 ${res.row_count} 行`)
    } catch (e) {
      message.error(getErrorMessage(e))
    } finally {
      setQuerying(false)
    }
  }

  const startNewComponent = (paletteType: string) => {
    setEditId(null)
    setDraft(emptyDraft(paletteType, activeDatasetId))
  }

  const startEditCartItem = (node: StudioNode) => {
    setEditId(node.id)
    setDraft(nodeToDraft(node))
    setStep('cart')
  }

  const addOrUpdateCart = () => {
    if (!draft || !tree) return
    // validate minimal
    if (draft.type === 'Kpi' && !draft.value_column) {
      message.error('KPI 请选择数值字段')
      return
    }
    if (draft.type === 'Chart' && (!draft.category_column || !draft.value_column)) {
      message.error('图表请选择分类字段和数值字段')
      return
    }
    if ((draft.type === 'Text' || draft.type === 'Alert') && !draft.text?.trim()) {
      message.error('请填写文案')
      return
    }

    const node = draftToNode(draft, editId || undefined)
    // preserve compose layout when editing
    if (editId) {
      const old = findNode(tree, editId)
      if (old?.props) {
        node.props = {
          ...node.props,
          compose_width: old.props.compose_width,
          compose_color: old.props.compose_color,
        }
      }
      setTree(updateNode(tree, editId, node))
      message.success('已更新组件')
    } else {
      setTree(appendChild(tree, 'root', node))
      message.success('已加入清单')
    }
    setDraft(null)
    setEditId(null)
  }

  const removeFromCart = (id: string) => {
    if (!tree) return
    setTree(removeNode(tree, id))
    if (editId === id) {
      setEditId(null)
      setDraft(null)
    }
    message.success('已从清单移除')
  }

  const onCompile = async () => {
    if (!dataSourceId) {
      message.error('请选择数据源')
      return
    }
    if (cart.length === 0) {
      message.error('清单为空，请先添加组件')
      return
    }
    setCompiling(true)
    try {
      const res = await studioCompile({
        artboard: buildDoc(),
        data_source_id: dataSourceId,
        sql,
        want_image: true,
        max_rows: 50,
      })
      setMarkdownText(res.markdown_text || '')
      setImageBase64(res.image_base64 || '')
      message.success('编译完成')
      setStep('preview')
    } catch (e) {
      message.error(getErrorMessage(e))
    } finally {
      setCompiling(false)
    }
  }

  const onSave = async () => {
    if (!name.trim()) {
      message.error('请填推送名称')
      return
    }
    if (!dataSourceId) {
      message.error('请选数据源')
      return
    }
    setSaving(true)
    try {
      const saved = await studioSaveJob({
        id: currentJobId,
        name: name.trim(),
        data_source_id: dataSourceId,
        query_sql: sql,
        artboard: buildDoc(),
        channel_ids: channelIds,
        enabled,
      })
      setCurrentJobId(saved.id)
      message.success('已保存')
      if (jobId !== saved.id) navigate(`/editor/${saved.id}`, { replace: true })
    } catch (e) {
      message.error(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const onTestPush = async () => {
    if (!dataSourceId || !channelIds.length) {
      message.error('需要数据源和通道')
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
      if (res.success) message.success('试推成功')
      else message.error('试推失败')
    } catch (e) {
      message.error(getErrorMessage(e))
    } finally {
      setPushing(false)
    }
  }

  const tableData = useMemo(
    () =>
      previewRows.map((row, i) => {
        const r: Record<string, unknown> = { __key: i }
        previewColumns.forEach((c, j) => {
          r[c] = row[j]
        })
        return r
      }),
    [previewRows, previewColumns],
  )

  const draftFields = fieldsByDataset[draft?.dataset_id || 'main'] || fields
  const stepIndex = STEPS.findIndex((s) => s.key === step)

  const insertFieldToken = (col: string) => {
    if (!draft) return
    const token = `{{${col}}}`
    setDraft({
      ...draft,
      text: draft.text ? `${draft.text}${token}` : token,
    })
  }

  const applyQuickTemplate = (kind: 'daily' | 'alert') => {
    const board = kind === 'daily' ? defaultDailyArtboard() : defaultAlertArtboard()
    const next = dataSourceId
      ? syncMainDataset(board, dataSourceId, board.datasets?.[0]?.sql || sql)
      : board
    if (board.datasets?.[0]?.sql) setSql(String(board.datasets[0].sql))
    if (next.tree) {
      const flat: StudioNode[] = []
      const walk = (n: StudioNode) => {
        if (n.id === 'root') {
          for (const ch of n.children || []) walk(ch)
          return
        }
        if (n.type === 'Container') {
          for (const ch of n.children || []) walk(ch)
          return
        }
        flat.push({ ...n, children: undefined })
      }
      walk(next.tree)
      next.tree = {
        id: 'root',
        type: 'Container',
        props: { direction: 'column', gap: 12 },
        children: flat,
        binding: {},
      }
    }
    setArtboard(next)
    setFieldsByDataset({})
    setRowsByDataset({})
    setDraft(null)
    setEditId(null)
    message.info('已用模板填充清单，请重新取数后检查各组件字段')
    setStep('data')
  }

  return (
    <div style={{ margin: -24, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
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
              任务
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
            <Tag icon={<ShoppingCartOutlined />} color="blue">
              清单 {cart.length}
            </Tag>
          </Space>
          <Space>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void onSave()}>
              保存
            </Button>
          </Space>
        </Space>
        <div style={{ marginTop: 12, maxWidth: 640 }}>
          <Steps
            size="small"
            current={stepIndex}
            onChange={(i) => setStep(STEPS[i]!.key)}
            items={STEPS.map((s) => ({ title: s.title }))}
          />
        </div>
      </div>

      <Alert
        banner
        type="info"
        showIcon
        message="造组件 → 放进清单 → 组装排版 → 预览推送。组件步只填数据和基础样式；位置/宽度/颜色在「组装」里调。"
      />

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16, background: '#f5f5f5' }}>
        {/* —— 1 数据 —— */}
        {step === 'data' && (
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, background: '#fff', padding: 16, borderRadius: 8 }}>
              <Typography.Title level={5}>① 准备数据</Typography.Title>
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                  <Typography.Text type="secondary">数据集</Typography.Text>
                  <Space wrap style={{ display: 'flex', marginTop: 4 }}>
                    <Select
                      style={{ minWidth: 140 }}
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
                      + 数据集
                    </Button>
                  </Space>
                </div>
                <div>
                  <Typography.Text type="secondary">数据源</Typography.Text>
                  <Select
                    style={{ width: '100%', marginTop: 4 }}
                    showSearch
                    optionFilterProp="label"
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
                            data_source_id: v,
                            sql: activeDs?.sql,
                            name: activeDs?.name,
                          }),
                        )
                    }}
                    options={sources.map((s) => ({
                      value: s.id,
                      label: `${s.name} (${s.type})`,
                    }))}
                    placeholder="选择数据源"
                  />
                </div>
                <div>
                  <Typography.Text type="secondary">SQL</Typography.Text>
                  <Input.TextArea
                    rows={7}
                    style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
                    value={activeDatasetId === 'main' ? sql : String(activeDs?.sql || '')}
                    onChange={(e) => {
                      if (activeDatasetId === 'main') setSql(e.target.value)
                      else
                        setArtboard((p) =>
                          upsertDataset(p, {
                            id: activeDatasetId,
                            sql: e.target.value,
                            data_source_id: activeDs?.data_source_id,
                            name: activeDs?.name,
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
                  type="default"
                  disabled={!previewColumns.length}
                  onClick={() => setStep('cart')}
                >
                  下一步：添加组件 →
                </Button>
              </Space>
            </div>
            <div style={{ flex: 1, background: '#fff', padding: 16, borderRadius: 8 }}>
              <Typography.Title level={5}>字段预览</Typography.Title>
              {!previewColumns.length ? (
                <Empty description="取数后显示字段" />
              ) : (
                <>
                  <div style={{ marginBottom: 8 }}>
                    {previewColumns.map((c) => (
                      <Tag key={c}>{c}</Tag>
                    ))}
                  </div>
                  <Table
                    size="small"
                    pagination={false}
                    scroll={{ y: 320, x: true }}
                    rowKey="__key"
                    dataSource={tableData}
                    columns={previewColumns.map((c) => ({
                      title: c,
                      dataIndex: c,
                      ellipsis: true,
                      width: 90,
                      render: (v: unknown) =>
                        v === null || v === undefined ? '—' : String(v),
                    }))}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {/* —— 2 组件购物车 —— */}
        {step === 'cart' && (
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 16 }}>
            {/* 造组件表单 */}
            <div style={{ width: 360, background: '#fff', padding: 16, borderRadius: 8, flexShrink: 0 }}>
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                {editId ? '编辑组件' : '新建组件'}
              </Typography.Title>
              {!draft ? (
                <>
                  <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                    点一种类型开始配置，填好后点「加入清单」。
                  </Typography.Paragraph>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {CART_TYPES.map((p) => (
                      <Button
                        key={p.type}
                        icon={<PlusOutlined />}
                        onClick={() => startNewComponent(p.type)}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  <Divider />
                  <Space>
                    <Button onClick={() => applyQuickTemplate('daily')}>用日报模板填充清单</Button>
                    <Button onClick={() => applyQuickTemplate('alert')}>告警模板</Button>
                  </Space>
                </>
              ) : (
                <Form layout="vertical" size="middle">
                  <Form.Item label="类型">
                    <Tag color="blue">{draft.type}</Tag>
                    {draft.chart_type ? <Tag>{draft.chart_type}</Tag> : null}
                  </Form.Item>
                  {draft.type !== 'Divider' ? (
                    <Form.Item label="数据集">
                      <Select
                        value={draft.dataset_id}
                        onChange={(v) => setDraft({ ...draft, dataset_id: v })}
                        options={datasetOptions}
                      />
                    </Form.Item>
                  ) : null}

                  {/* 数据绑定：只下拉，不搞复杂槽 */}
                  {draft.type === 'Kpi' ? (
                    <>
                      <Form.Item label="数值字段" required>
                        <Select
                          allowClear
                          placeholder="选一列"
                          value={draft.value_column || undefined}
                          onChange={(v) =>
                            setDraft({
                              ...draft,
                              value_column: v,
                              label: draft.label || v,
                            })
                          }
                          options={draftFields.map((c) => ({ value: c, label: c }))}
                        />
                      </Form.Item>
                      <Form.Item label="显示名称">
                        <Input
                          value={draft.label}
                          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                          placeholder="如：门诊量"
                        />
                      </Form.Item>
                    </>
                  ) : null}

                  {draft.type === 'Chart' ? (
                    <>
                      <Form.Item label="分类字段" required>
                        <Select
                          allowClear
                          placeholder="横轴 / 扇区名"
                          value={draft.category_column || undefined}
                          onChange={(v) => setDraft({ ...draft, category_column: v })}
                          options={draftFields.map((c) => ({ value: c, label: c }))}
                        />
                      </Form.Item>
                      <Form.Item label="数值字段" required>
                        <Select
                          allowClear
                          placeholder="柱高 / 数值"
                          value={draft.value_column || undefined}
                          onChange={(v) => setDraft({ ...draft, value_column: v })}
                          options={draftFields.map((c) => ({ value: c, label: c }))}
                        />
                      </Form.Item>
                      <Form.Item label="图表标题（可选）">
                        <Input
                          value={draft.title}
                          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                        />
                      </Form.Item>
                    </>
                  ) : null}

                  {draft.type === 'Text' || draft.type === 'Alert' ? (
                    <>
                      <Form.Item label="文案">
                        <Input.TextArea
                          rows={3}
                          value={draft.text}
                          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                          placeholder="可点下方字段插入 {{列名}}"
                        />
                      </Form.Item>
                      <div style={{ marginBottom: 12 }}>
                        {draftFields.map((c) => (
                          <Tag
                            key={c}
                            style={{ cursor: 'pointer', marginBottom: 4 }}
                            onClick={() => insertFieldToken(c)}
                          >
                            + {c}
                          </Tag>
                        ))}
                      </div>
                      {draft.type === 'Text' ? (
                        <Form.Item label="文字样式">
                          <Select
                            value={draft.variant}
                            onChange={(v) => setDraft({ ...draft, variant: v })}
                            options={[
                              { value: 'h1', label: '标题' },
                              { value: 'body', label: '正文' },
                              { value: 'caption', label: '脚注' },
                            ]}
                          />
                        </Form.Item>
                      ) : (
                        <Form.Item label="告警级别">
                          <Select
                            value={draft.level}
                            onChange={(v) => setDraft({ ...draft, level: v })}
                            options={[
                              { value: 'error', label: '严重' },
                              { value: 'warning', label: '警告' },
                              { value: 'info', label: '信息' },
                            ]}
                          />
                        </Form.Item>
                      )}
                    </>
                  ) : null}

                  {draft.type === 'Table' ? (
                    <Form.Item label="表格样式">
                      <Select
                        value={draft.table_style}
                        onChange={(v) => setDraft({ ...draft, table_style: v })}
                        options={TABLE_STYLES.map((s) => ({ value: s.id, label: s.label }))}
                      />
                    </Form.Item>
                  ) : null}

                  {!draftFields.length && draft.type !== 'Divider' ? (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message="当前数据集还没取数，请回「数据」步运行 SQL"
                    />
                  ) : null}

                  <Space style={{ width: '100%' }} direction="vertical">
                    <Button type="primary" block onClick={addOrUpdateCart}>
                      {editId ? '保存修改' : '加入清单'}
                    </Button>
                    <Button
                      block
                      onClick={() => {
                        setDraft(null)
                        setEditId(null)
                      }}
                    >
                      取消
                    </Button>
                  </Space>
                </Form>
              )}
            </div>

            {/* 购物车清单 */}
            <div style={{ flex: 1, background: '#fff', padding: 16, borderRadius: 8 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  <ShoppingCartOutlined /> 组件清单（{cart.length}）
                </Typography.Title>
                <Space>
                  <Button onClick={() => setStep('data')}>← 数据</Button>
                  <Button
                    type="primary"
                    disabled={!cart.length}
                    onClick={() => setStep('compose')}
                  >
                    去组装 →
                  </Button>
                </Space>
              </Space>
              {cart.length === 0 ? (
                <Empty description="清单为空，左侧新建组件并「加入清单」" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {cart.map((node, i) => {
                    const live = liveComponentView(node, dataCtx)
                    return (
                      <div
                        key={node.id}
                        style={{
                          border: '1px solid #f0f0f0',
                          borderRadius: 8,
                          padding: 12,
                          background: editId === node.id ? '#e6f4ff' : '#fafafa',
                        }}
                      >
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Space>
                            <Tag>{i + 1}</Tag>
                            <Tag color="blue">{node.type}</Tag>
                            <Typography.Text strong>{live.title}</Typography.Text>
                            {live.warning ? <Tag color="orange">{live.warning}</Tag> : <Tag color="green">就绪</Tag>}
                          </Space>
                          <Space>
                            <Button size="small" type="link" onClick={() => startEditCartItem(node)}>
                              编辑
                            </Button>
                            <Button
                              size="small"
                              type="link"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => removeFromCart(node.id)}
                            />
                          </Space>
                        </Space>
                        <div
                          style={{
                            marginTop: 8,
                            padding: 8,
                            background: '#fff',
                            borderRadius: 4,
                            fontSize: 14,
                            fontWeight: node.type === 'Kpi' ? 700 : 400,
                          }}
                        >
                          {live.primary}
                          {live.secondary ? (
                            <div style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>
                              {live.secondary}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* —— 3 组装：只排版 —— */}
        {step === 'compose' && (
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, background: '#fff', padding: 16, borderRadius: 8 }}>
              <Typography.Title level={5}>③ 组装（顺序 / 宽度 / 颜色）</Typography.Title>
              <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                这里不改字段绑定。要改数据点「回组件清单」编辑。
              </Typography.Paragraph>
              {cart.length === 0 ? (
                <Empty description="清单为空" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cart.map((node, index) => {
                    const live = liveComponentView(node, dataCtx)
                    const width = Number(node.props?.compose_width ?? 100)
                    const color = String(node.props?.compose_color || '')
                    return (
                      <div
                        key={node.id}
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
                          border: '1px solid #e8e8e8',
                          borderRadius: 8,
                          padding: 12,
                          background: dragId === node.id ? '#fff7e6' : '#fff',
                          cursor: 'grab',
                        }}
                      >
                        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                          <Space>
                            <HolderOutlined />
                            <Tag>{index + 1}</Tag>
                            <Typography.Text strong>{live.title}</Typography.Text>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {live.primary}
                            </Typography.Text>
                          </Space>
                          <Button size="small" type="link" onClick={() => startEditCartItem(node)}>
                            改数据/样式
                          </Button>
                        </Space>
                        <Space style={{ marginTop: 10 }} wrap>
                          <span style={{ fontSize: 12, color: '#666' }}>宽度%</span>
                          <InputNumber
                            min={20}
                            max={100}
                            step={10}
                            value={width}
                            onChange={(v) => {
                              if (!tree) return
                              setTree(
                                updateNode(tree, node.id, {
                                  props: { ...node.props, compose_width: v ?? 100 },
                                }),
                              )
                            }}
                          />
                          <span style={{ fontSize: 12, color: '#666' }}>强调色</span>
                          <ColorPicker
                            value={color || undefined}
                            allowClear
                            onChange={(c, hex) => {
                              if (!tree) return
                              const val = hex || (typeof c === 'string' ? c : colorToHex(c))
                              setTree(
                                updateNode(tree, node.id, {
                                  props: {
                                    ...node.props,
                                    compose_color: val || undefined,
                                  },
                                }),
                              )
                            }}
                            onClear={() => {
                              if (!tree) return
                              const { compose_color: _, ...rest } = node.props || {}
                              setTree(
                                updateNode(tree, node.id, {
                                  props: { ...rest, compose_color: undefined },
                                }),
                              )
                            }}
                          />
                        </Space>
                      </div>
                    )
                  })}
                </div>
              )}
              <Divider />
              <Typography.Text type="secondary">整页主题</Typography.Text>
              <Select
                style={{ width: 200, marginLeft: 8 }}
                value={artboard.artboard?.theme?.pack || 'business'}
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
                      },
                    },
                  }))
                }}
                options={THEME_PACKS.map((p) => ({ value: p.id, label: p.label }))}
              />
              <div style={{ marginTop: 16 }}>
                <Space>
                  <Button onClick={() => setStep('cart')}>← 组件清单</Button>
                  <Button type="primary" onClick={() => setStep('preview')}>
                    去预览 →
                  </Button>
                </Space>
              </div>
            </div>
          </div>
        )}

        {/* —— 4 预览 —— */}
        {step === 'preview' && (
          <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, background: '#fff', padding: 16, borderRadius: 8 }}>
              <Space style={{ marginBottom: 12 }}>
                <Button onClick={() => setStep('compose')}>← 组装</Button>
                <Button type="primary" loading={compiling} onClick={() => void onCompile()}>
                  生成推送内容
                </Button>
                <Button loading={pushing} onClick={() => void onTestPush()}>
                  试推
                </Button>
              </Space>
              {imageBase64 ? (
                <img
                  src={imageBase64}
                  alt="preview"
                  style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #eee' }}
                />
              ) : (
                <Empty description="点「生成推送内容」出图" />
              )}
              {markdownText ? (
                <Input.TextArea
                  style={{ marginTop: 12, fontFamily: 'monospace', fontSize: 12 }}
                  rows={6}
                  readOnly
                  value={markdownText}
                />
              ) : null}
            </div>
            <div style={{ width: 260, background: '#fff', padding: 16, borderRadius: 8 }}>
              <Typography.Title level={5}>投递</Typography.Title>
              <Typography.Text type="secondary">通道</Typography.Text>
              <Select
                mode="multiple"
                style={{ width: '100%', marginTop: 4 }}
                value={channelIds}
                onChange={setChannelIds}
                options={channels.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
              <div style={{ marginTop: 12 }}>
                <Switch checked={enabled} onChange={setEnabled} /> 启用任务
              </div>
              <Divider />
              <Typography.Text type="secondary">清单 {cart.length} 项</Typography.Text>
              <ul style={{ paddingLeft: 18, marginTop: 8, fontSize: 13 }}>
                {cart.map((n) => (
                  <li key={n.id}>{liveComponentView(n, dataCtx).title}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
