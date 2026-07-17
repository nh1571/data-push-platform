/**
 * Milestone workbench:
 * 1 数据
 * 2 做组件（表单 + 大预览）→ 加入小清单
 * 3 画布组装（可视化位置/大小/配色）
 * 4 预览最终推送成片（进入自动编译）
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
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Steps,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { Color } from 'antd/es/color-picker'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type {
  ArtboardDoc,
  Channel,
  DataSource,
  StudioCompileResponse,
  StudioNode,
} from '../../api/types'
import {
  appendChild,
  defaultAlertArtboard,
  defaultDailyArtboard,
  emptyArtboard,
  extractArtboardFromJob,
  moveNodeTo,
  newComponent,
  nid,
  removeNode,
  syncMainDataset,
  TABLE_STYLES,
  THEME_PACKS,
  updateNode,
  upsertDataset,
} from './studioUtils'

function colorToHex(color: Color | string): string {
  if (typeof color === 'string') return color
  return color.toHexString()
}

const CART_TYPES = [
  { type: 'Kpi', label: 'KPI' },
  { type: 'Text', label: '文案' },
  { type: 'Table', label: '表格' },
  { type: 'ChartBar', label: '柱状图' },
  { type: 'ChartLine', label: '折线图' },
  { type: 'ChartArea', label: '面积图' },
  { type: 'ChartHBar', label: '条形图' },
  { type: 'ChartPie', label: '饼图' },
  { type: 'Alert', label: '告警' },
  { type: 'Divider', label: '分隔' },
]

const CHART_TYPES = [
  { value: 'bar', label: '柱状图' },
  { value: 'line', label: '折线图' },
  { value: 'area', label: '面积图' },
  { value: 'hbar', label: '条形图' },
  { value: 'pie', label: '饼图' },
]

const CHART_THEMES = [
  { value: 'white', label: '默认白' },
  { value: 'macarons', label: 'Macarons' },
  { value: 'wonderland', label: 'Wonderland' },
  { value: 'walden', label: 'Walden' },
  { value: 'roma', label: 'Roma' },
  { value: 'shine', label: 'Shine' },
  { value: 'infographic', label: 'Infographic' },
  { value: 'dark', label: '深色' },
]

type StepKey = 'data' | 'make' | 'compose' | 'preview'

const STEPS = [
  { key: 'data' as const, title: '1. 数据' },
  { key: 'make' as const, title: '2. 做组件' },
  { key: 'compose' as const, title: '3. 组装画布' },
  { key: 'preview' as const, title: '4. 预览推送' },
]

type DraftForm = {
  type: string
  dataset_id: string
  value_column?: string
  category_column?: string
  label?: string
  text?: string
  chart_type?: string
  title?: string
  variant?: string
  table_style?: string
  level?: string
  // chart style (pyecharts / BI-like)
  chart_theme?: string
  show_label?: boolean
  smooth?: boolean
  stack?: boolean
  donut?: boolean
  rose?: boolean
  legend?: boolean
}

function emptyDraft(type: string, datasetId: string): DraftForm {
  const chartBase: DraftForm = {
    type: 'Chart',
    dataset_id: datasetId,
    text: '',
    title: '',
    label: '',
    chart_theme: 'macarons',
    show_label: true,
    smooth: true,
    stack: false,
    donut: false,
    rose: false,
    legend: false,
  }
  if (type === 'ChartBar') return { ...chartBase, chart_type: 'bar', title: '柱状图' }
  if (type === 'ChartLine') return { ...chartBase, chart_type: 'line', title: '折线图' }
  if (type === 'ChartArea') return { ...chartBase, chart_type: 'area', title: '面积图' }
  if (type === 'ChartHBar') return { ...chartBase, chart_type: 'hbar', title: '条形图' }
  if (type === 'ChartPie')
    return { ...chartBase, chart_type: 'pie', title: '饼图', donut: false, legend: true }
  const base: DraftForm = { type, dataset_id: datasetId, text: '', title: '', label: '' }
  if (type === 'Text') return { ...base, type: 'Text', variant: 'body', text: '标题文案' }
  if (type === 'Alert') return { ...base, type: 'Alert', level: 'error', text: '请注意异常指标' }
  if (type === 'Kpi') return { ...base, type: 'Kpi', label: '指标' }
  if (type === 'Table') return { ...base, type: 'Table', table_style: 'business' }
  if (type === 'Divider') return { ...base, type: 'Divider' }
  return base
}

function nodeToDraft(node: StudioNode): DraftForm {
  const b = node.binding || {}
  const p = node.props || {}
  return {
    type: String(node.type),
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
    chart_theme: String(p.theme || p.chart_theme || 'macarons'),
    show_label: p.show_label !== false,
    smooth: p.smooth !== false,
    stack: Boolean(p.stack),
    donut: Boolean(p.donut),
    rose: Boolean(p.rose),
    legend: Boolean(p.legend),
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
        theme: draft.chart_theme || 'macarons',
        show_label: draft.show_label !== false,
        smooth: draft.smooth !== false,
        stack: Boolean(draft.stack),
        donut: Boolean(draft.donut),
        rose: Boolean(draft.rose),
        legend: Boolean(draft.legend),
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
      props: { style: draft.table_style || 'business', color_ratios: true, max_rows: 50 },
      binding: { dataset_id: ds },
    }
  }
  if (t === 'Divider') return { id, type: 'Divider', visible: true, props: {}, binding: {} }
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

function cartItems(tree?: StudioNode): StudioNode[] {
  return [...(tree?.children || [])]
}

function typeLabel(t: string, chart?: string): string {
  if (t === 'Chart') {
    const m: Record<string, string> = {
      bar: '柱状图',
      line: '折线图',
      area: '面积图',
      hbar: '条形图',
      pie: '饼图',
    }
    return m[chart || 'bar'] || '图表'
  }
  const m: Record<string, string> = {
    Kpi: 'KPI',
    Text: '文案',
    Table: '表格',
    Alert: '告警',
    Divider: '分隔',
  }
  return m[t] || t
}

function readyDatasets(
  datasets: { id: string; name?: string }[],
  fieldsByDataset: Record<string, string[]>,
): { value: string; label: string }[] {
  return datasets
    .filter((d) => (fieldsByDataset[d.id] || []).length > 0)
    .map((d) => ({
      value: d.id,
      label: `${d.name || d.id}（${fieldsByDataset[d.id]?.length || 0} 列）`,
    }))
}

/** Artboard with a single component for maker preview (no page chrome). */
function singleComponentArtboard(
  base: ArtboardDoc,
  node: StudioNode,
  dataSourceId?: string,
  sql?: string,
): ArtboardDoc {
  const theme = base.artboard?.theme || { pack: 'business', color: '#1677ff' }
  const datasets = (base.datasets || []).map((d) => ({
    ...d,
    data_source_id: d.data_source_id || dataSourceId || null,
    sql: d.id === 'main' ? sql || d.sql : d.sql,
  }))
  return {
    version: 3,
    kind: 'artboard',
    artboard: {
      width: 720,
      show_chrome: false,
      theme,
      layout_default: 'flow',
    },
    datasets,
    tree: {
      id: 'root',
      type: 'Container',
      props: { direction: 'column', gap: 8 },
      binding: {},
      children: [{ ...node, children: undefined }],
    },
    compose: { mode: 'image_primary', markdown_caption: false },
  }
}

function RenderPreview({
  image,
  html,
  error,
  loading,
  emptyHint,
  minHeight = 280,
}: {
  image?: string | null
  html?: string | null
  error?: string | null
  loading?: boolean
  emptyHint?: string
  minHeight?: number
}) {
  if (loading) {
    return (
      <div style={{ minHeight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin tip="渲染中…" />
      </div>
    )
  }
  if (image) {
    return (
      <div style={{ textAlign: 'center' }}>
        <img
          src={image}
          alt="preview"
          style={{
            maxWidth: '100%',
            borderRadius: 8,
            border: '1px solid #e8e8e8',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        />
        {error ? (
          <Alert type="warning" showIcon style={{ marginTop: 8, textAlign: 'left' }} message={error} />
        ) : null}
      </div>
    )
  }
  if (html) {
    return (
      <div>
        {error ? (
          <Alert type="warning" showIcon style={{ marginBottom: 8 }} message={error} />
        ) : (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 8 }}
            message="当前为 HTML 预览（PNG 成图引擎未就绪时的回退）"
          />
        )}
        <iframe
          title="html-preview"
          sandbox=""
          srcDoc={html}
          style={{
            width: '100%',
            minHeight,
            border: '1px solid #e8e8e8',
            borderRadius: 8,
            background: '#fff',
          }}
        />
      </div>
    )
  }
  return (
    <Empty
      style={{ minHeight, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
      description={emptyHint || '暂无预览'}
    />
  )
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
  const [sql, setSql] = useState(
    "SELECT '演示院区' AS 院区, 1200 AS 门诊量, 80 AS 住院\nUNION ALL SELECT '对照', 980, 72",
  )
  const [channelIds, setChannelIds] = useState<string[]>([])
  const [enabled, setEnabled] = useState(true)
  const [currentJobId, setCurrentJobId] = useState<string | null>(jobId ?? null)

  const [artboard, setArtboard] = useState<ArtboardDoc>(() => emptyArtboard())
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftForm | null>(null)

  const [fieldsByDataset, setFieldsByDataset] = useState<Record<string, string[]>>({})
  const [rowsByDataset, setRowsByDataset] = useState<Record<string, unknown[][]>>({})
  const [activeDatasetId, setActiveDatasetId] = useState('main')

  // Maker live preview
  const [makerPreview, setMakerPreview] = useState<StudioCompileResponse | null>(null)
  const [makerLoading, setMakerLoading] = useState(false)
  const makerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Final preview
  const [finalPreview, setFinalPreview] = useState<StudioCompileResponse | null>(null)
  const [finalLoading, setFinalLoading] = useState(false)
  const [finalError, setFinalError] = useState<string | null>(null)

  const [querying, setQuerying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [selectedComposeId, setSelectedComposeId] = useState<string | null>(null)

  // Per-component thumbnail cache for canvas
  const [thumbById, setThumbById] = useState<Record<string, string>>({})

  const tree = artboard.tree
  const datasets = artboard.datasets || []
  const activeDs = datasets.find((d) => d.id === activeDatasetId) || datasets[0]
  const datasetOptions = datasets.map((d) => ({ value: d.id, label: d.name || d.id }))
  const cart = useMemo(() => cartItems(tree), [tree])
  const draftFields = fieldsByDataset[draft?.dataset_id || activeDatasetId] || []
  const previewColumns = fieldsByDataset[activeDatasetId] || []
  const previewRows = rowsByDataset[activeDatasetId] || []

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
          extracted || syncMainDataset(emptyArtboard(), job.data_source_id, job.query_sql),
        )
      })
      .catch((e) => message.error(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [jobId, loadMeta])

  const buildDoc = useCallback((): ArtboardDoc => {
    let doc = syncMainDataset(artboard, dataSourceId, sql)
    doc = {
      ...doc,
      datasets: (doc.datasets || []).map((d) => ({
        ...d,
        data_source_id: d.data_source_id || dataSourceId || null,
      })),
    }
    return doc
  }, [artboard, dataSourceId, sql])

  const runCompile = useCallback(
    async (doc: ArtboardDoc) => {
      if (!dataSourceId) throw new Error('请先选择数据源并取数')
      return studioCompile({
        artboard: doc,
        data_source_id: dataSourceId,
        sql,
        want_image: true,
        max_rows: 50,
      })
    },
    [dataSourceId, sql],
  )

  // Debounced maker preview when draft changes
  useEffect(() => {
    if (step !== 'make' || !draft || !dataSourceId) {
      return
    }
    if (makerTimer.current) clearTimeout(makerTimer.current)
    makerTimer.current = setTimeout(() => {
      const node = draftToNode(draft, editId || 'draft-preview')
      // need fields for chart/kpi
      const needsData =
        node.type === 'Kpi' ||
        node.type === 'Chart' ||
        node.type === 'Table' ||
        node.type === 'Text' ||
        node.type === 'Alert'
      if (needsData && node.type === 'Kpi' && !node.binding?.value_column) {
        setMakerPreview(null)
        return
      }
      if (
        node.type === 'Chart' &&
        (!node.binding?.category_column || !node.binding?.value_column)
      ) {
        setMakerPreview(null)
        return
      }
      setMakerLoading(true)
      const doc = singleComponentArtboard(buildDoc(), node, dataSourceId, sql)
      runCompile(doc)
        .then(setMakerPreview)
        .catch((e) => {
          setMakerPreview(null)
          message.error(getErrorMessage(e))
        })
        .finally(() => setMakerLoading(false))
    }, 450)
    return () => {
      if (makerTimer.current) clearTimeout(makerTimer.current)
    }
  }, [draft, step, dataSourceId, sql, editId, buildDoc, runCompile])

  // Auto final preview when entering step 4
  useEffect(() => {
    if (step !== 'preview') return
    if (!dataSourceId) {
      setFinalError('请先完成数据源选择与取数')
      return
    }
    if (cart.length === 0) {
      setFinalError('组件清单为空，请先做组件并加入清单')
      setFinalPreview(null)
      return
    }
    setFinalLoading(true)
    setFinalError(null)
    runCompile(buildDoc())
      .then((res) => {
        setFinalPreview(res)
        if (!res.image_base64 && res.image_error) setFinalError(res.image_error)
      })
      .catch((e) => {
        setFinalPreview(null)
        setFinalError(getErrorMessage(e))
      })
      .finally(() => setFinalLoading(false))
  }, [step, cart.length, dataSourceId, buildDoc, runCompile])

  const onQueryDataset = async (datasetId: string) => {
    const dsMeta = datasets.find((d) => d.id === datasetId)
    const slotSql =
      datasetId === 'main' ? sql : String(dsMeta?.sql || '')
    const slotDs = String(
      datasetId === 'main'
        ? dataSourceId
        : dsMeta?.data_source_id || dataSourceId || '',
    )
    if (!slotDs) {
      message.error('请先为该数据集选择数据源')
      return
    }
    if (!slotSql.trim()) {
      message.error('请填写 SQL')
      return
    }
    setQuerying(true)
    try {
      const res = await queryPreview({
        data_source_id: slotDs,
        sql: slotSql,
        max_rows: 200,
      })
      setFieldsByDataset((p) => ({ ...p, [datasetId]: res.columns }))
      setRowsByDataset((p) => ({ ...p, [datasetId]: res.rows }))
      if (datasetId === 'main') {
        setArtboard((p) => syncMainDataset(p, slotDs, slotSql))
        setDataSourceId(slotDs)
        setSql(slotSql)
      } else {
        setArtboard((p) =>
          upsertDataset(p, {
            id: datasetId,
            name: dsMeta?.name,
            data_source_id: slotDs,
            sql: slotSql,
          }),
        )
      }
      message.success(`「${dsMeta?.name || datasetId}」取数 ${res.row_count} 行`)
    } catch (e) {
      message.error(getErrorMessage(e))
    } finally {
      setQuerying(false)
    }
  }

  const addDataset = () => {
    const id = `ds_${nid().slice(0, 6)}`
    const nameDs = `数据集${datasets.length + 1}`
    setArtboard((p) =>
      upsertDataset(p, {
        id,
        name: nameDs,
        data_source_id: dataSourceId || null,
        sql: 'SELECT 1 AS demo',
      }),
    )
    setActiveDatasetId(id)
    message.success(`已添加 ${nameDs}，请配置 SQL 并取数`)
  }

  const removeDataset = (id: string) => {
    if (id === 'main') {
      message.error('主数据集不可删除')
      return
    }
    setArtboard((p) => ({
      ...p,
      datasets: (p.datasets || []).filter((d) => d.id !== id),
    }))
    setFieldsByDataset((p) => {
      const n = { ...p }
      delete n[id]
      return n
    })
    setRowsByDataset((p) => {
      const n = { ...p }
      delete n[id]
      return n
    })
    if (activeDatasetId === id) setActiveDatasetId('main')
  }

  const readyDsOptions = readyDatasets(datasets, fieldsByDataset)

  const startNew = (paletteType: string) => {
    setEditId(null)
    const preferDs =
      readyDsOptions.find((d) => d.value === activeDatasetId)?.value ||
      readyDsOptions[0]?.value ||
      activeDatasetId
    setDraft(emptyDraft(paletteType, preferDs))
    setMakerPreview(null)
  }

  const addToCart = async () => {
    if (!draft || !tree) return
    if (draft.type === 'Kpi' && !draft.value_column) {
      message.error('请选择数值字段')
      return
    }
    if (draft.type === 'Chart' && (!draft.category_column || !draft.value_column)) {
      message.error('请选择分类字段和数值字段')
      return
    }
    if ((draft.type === 'Text' || draft.type === 'Alert') && !String(draft.text || '').trim()) {
      message.error('请填写文案')
      return
    }

    let node = draftToNode(draft, editId || undefined)
    // attach last maker preview as thumbnail
    if (makerPreview?.image_base64) {
      node = {
        ...node,
        props: { ...node.props, preview_image: makerPreview.image_base64 },
      }
      setThumbById((p) => ({ ...p, [node.id]: makerPreview.image_base64! }))
    }

    if (editId) {
      const old = findNode(tree, editId)
      if (old?.props) {
        node.props = {
          ...node.props,
          compose_width: old.props.compose_width,
          compose_color: old.props.compose_color,
          preview_image: node.props?.preview_image || old.props.preview_image,
        }
      }
      setTree(updateNode(tree, editId, node))
      message.success('组件已更新')
    } else {
      setTree(appendChild(tree, 'root', node))
      message.success('已加入清单')
    }
    setDraft(null)
    setEditId(null)
    setMakerPreview(null)
  }

  const refreshThumb = async (node: StudioNode) => {
    if (!dataSourceId) return
    try {
      const doc = singleComponentArtboard(buildDoc(), node, dataSourceId, sql)
      const res = await runCompile(doc)
      if (res.image_base64) {
        setThumbById((p) => ({ ...p, [node.id]: res.image_base64! }))
        if (tree) {
          setTree(
            updateNode(tree, node.id, {
              props: { ...node.props, preview_image: res.image_base64 },
            }),
          )
        }
      }
    } catch {
      /* ignore */
    }
  }

  const onSave = async () => {
    if (!name.trim() || !dataSourceId) {
      message.error('请填写名称并选择数据源')
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

  const stepIndex = STEPS.findIndex((s) => s.key === step)
  const selectedCompose = selectedComposeId && tree ? findNode(tree, selectedComposeId) : null

  const applyTemplate = (kind: 'daily' | 'alert') => {
    const board = kind === 'daily' ? defaultDailyArtboard() : defaultAlertArtboard()
    const next = dataSourceId
      ? syncMainDataset(board, dataSourceId, board.datasets?.[0]?.sql || sql)
      : board
    if (board.datasets?.[0]?.sql) setSql(String(board.datasets[0].sql))
    // flatten to cart
    if (next.tree) {
      const flat: StudioNode[] = []
      const walk = (n: StudioNode) => {
        if (n.id === 'root' || n.type === 'Container') {
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
    setThumbById({})
    setDraft(null)
    setStep('data')
    message.info('模板已载入，请取数后在「做组件」中检查预览')
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
              {cart.length}
            </Tag>
          </Space>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void onSave()}>
            保存
          </Button>
        </Space>
        <div style={{ marginTop: 12, maxWidth: 720 }}>
          <Steps
            size="small"
            current={stepIndex}
            onChange={(i) => setStep(STEPS[i]!.key)}
            items={STEPS.map((s) => ({ title: s.title }))}
          />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: '#eef0f3' }}>
        {/* ========== 1 数据：多数据集预生成 ========== */}
        {step === 'data' && (
          <div style={{ height: '100%', overflow: 'auto', padding: 16 }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
              <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    数据集管理
                  </Typography.Title>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    预先配置并取数多个数据集；做组件时再自由选用。
                  </Typography.Text>
                </div>
                <Space>
                  <Button type="dashed" icon={<PlusOutlined />} onClick={addDataset}>
                    新建数据集
                  </Button>
                  <Button
                    type="primary"
                    disabled={readyDsOptions.length === 0}
                    onClick={() => setStep('make')}
                  >
                    下一步：做组件 →
                  </Button>
                </Space>
              </Space>

              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {/* 数据集列表 */}
                <div style={{ width: 240, flexShrink: 0 }}>
                  {datasets.map((d) => {
                    const ready = (fieldsByDataset[d.id] || []).length > 0
                    const rows = (rowsByDataset[d.id] || []).length
                    const active = activeDatasetId === d.id
                    return (
                      <div
                        key={d.id}
                        onClick={() => setActiveDatasetId(d.id)}
                        style={{
                          background: active ? '#e6f4ff' : '#fff',
                          border: active ? '1px solid #1677ff' : '1px solid #f0f0f0',
                          borderRadius: 8,
                          padding: 10,
                          marginBottom: 8,
                          cursor: 'pointer',
                        }}
                      >
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Typography.Text strong style={{ fontSize: 13 }}>
                            {d.name || d.id}
                          </Typography.Text>
                          {d.id !== 'main' ? (
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={(e) => {
                                e.stopPropagation()
                                removeDataset(d.id)
                              }}
                            />
                          ) : (
                            <Tag style={{ margin: 0 }}>主</Tag>
                          )}
                        </Space>
                        <div style={{ marginTop: 4 }}>
                          {ready ? (
                            <Tag color="success">
                              已取数 {rows} 行 / {fieldsByDataset[d.id]?.length} 列
                            </Tag>
                          ) : (
                            <Tag>未取数</Tag>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 当前数据集编辑 */}
                <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: 16 }}>
                  <Typography.Title level={5} style={{ marginTop: 0 }}>
                    编辑：{activeDs?.name || activeDatasetId}
                  </Typography.Title>
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <div>
                      <Typography.Text type="secondary">名称</Typography.Text>
                      <Input
                        style={{ marginTop: 4 }}
                        value={String(activeDs?.name || '')}
                        onChange={(e) => {
                          const v = e.target.value
                          if (activeDatasetId === 'main') {
                            setArtboard((p) =>
                              upsertDataset(p, {
                                id: 'main',
                                name: v,
                                data_source_id: dataSourceId,
                                sql,
                              }),
                            )
                          } else {
                            setArtboard((p) =>
                              upsertDataset(p, {
                                id: activeDatasetId,
                                name: v,
                                data_source_id: activeDs?.data_source_id,
                                sql: activeDs?.sql,
                              }),
                            )
                          }
                        }}
                      />
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
                      />
                    </div>
                    <div>
                      <Typography.Text type="secondary">SQL</Typography.Text>
                      <Input.TextArea
                        rows={8}
                        style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
                        value={
                          activeDatasetId === 'main' ? sql : String(activeDs?.sql || '')
                        }
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
                    <Button
                      type="primary"
                      loading={querying}
                      onClick={() => void onQueryDataset(activeDatasetId)}
                    >
                      运行取数并缓存字段
                    </Button>
                  </Space>
                </div>

                {/* 预览当前结果 */}
                <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: 16, minWidth: 0 }}>
                  <Typography.Title level={5} style={{ marginTop: 0 }}>
                    结果预览
                  </Typography.Title>
                  {!previewColumns.length ? (
                    <Empty description="对该数据集取数后显示字段与样例行" />
                  ) : (
                    <>
                      <div style={{ marginBottom: 8 }}>
                        {previewColumns.map((c) => (
                          <Tag key={c} color="blue">
                            {c}
                          </Tag>
                        ))}
                      </div>
                      <Table
                        size="small"
                        pagination={false}
                        scroll={{ y: 360, x: true }}
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
            </div>
          </div>
        )}

        {/* ========== 2 做组件：配置 + 大预览 + 小清单 ========== */}
        {step === 'make' && (
          <div style={{ height: '100%', display: 'flex', minHeight: 0 }}>
            {/* 配置 */}
            <div
              style={{
                width: 300,
                background: '#fff',
                borderRight: '1px solid #f0f0f0',
                overflow: 'auto',
                padding: 12,
                flexShrink: 0,
              }}
            >
              <Typography.Text strong>选择组件类型</Typography.Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 12px' }}>
                {CART_TYPES.map((p) => (
                  <Button key={p.type} size="small" icon={<PlusOutlined />} onClick={() => startNew(p.type)}>
                    {p.label}
                  </Button>
                ))}
              </div>
              <Button size="small" type="link" onClick={() => applyTemplate('daily')}>
                载入日报模板到清单
              </Button>

              {!draft ? (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 12 }}
                  message="点上方类型开始"
                  description="配置数据与样式后，中间会实时显示组件样子，满意再加入清单。"
                />
              ) : (
                <Form layout="vertical" size="small" style={{ marginTop: 8 }}>
                  <Form.Item label="类型">
                    <Tag color="blue">
                      {typeLabel(draft.type, draft.chart_type)}
                    </Tag>
                  </Form.Item>
                  {draft.type !== 'Divider' ? (
                    <Form.Item
                      label="数据集"
                      extra={
                        readyDsOptions.length === 0
                          ? '请先在「数据」步对至少一个数据集取数'
                          : undefined
                      }
                    >
                      <Select
                        value={draft.dataset_id}
                        onChange={(v) =>
                          setDraft({
                            ...draft,
                            dataset_id: v,
                            value_column: undefined,
                            category_column: undefined,
                          })
                        }
                        options={
                          readyDsOptions.length
                            ? readyDsOptions
                            : datasetOptions
                        }
                        placeholder="选择已取数的数据集"
                      />
                    </Form.Item>
                  ) : null}
                  {draft.type === 'Kpi' ? (
                    <>
                      <Form.Item label="数值字段" required>
                        <Select
                          allowClear
                          value={draft.value_column || undefined}
                          onChange={(v) =>
                            setDraft({ ...draft, value_column: v, label: draft.label || v })
                          }
                          options={draftFields.map((c) => ({ value: c, label: c }))}
                          placeholder="必选"
                        />
                      </Form.Item>
                      <Form.Item label="显示名">
                        <Input
                          value={draft.label}
                          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                        />
                      </Form.Item>
                    </>
                  ) : null}
                  {draft.type === 'Chart' ? (
                    <>
                      <Form.Item label="图表类型">
                        <Select
                          value={draft.chart_type || 'bar'}
                          onChange={(v) => setDraft({ ...draft, chart_type: v })}
                          options={CHART_TYPES}
                        />
                      </Form.Item>
                      <Form.Item label="分类字段" required>
                        <Select
                          allowClear
                          value={draft.category_column || undefined}
                          onChange={(v) => setDraft({ ...draft, category_column: v })}
                          options={draftFields.map((c) => ({ value: c, label: c }))}
                        />
                      </Form.Item>
                      <Form.Item label="数值字段" required>
                        <Select
                          allowClear
                          value={draft.value_column || undefined}
                          onChange={(v) => setDraft({ ...draft, value_column: v })}
                          options={draftFields.map((c) => ({ value: c, label: c }))}
                        />
                      </Form.Item>
                      <Form.Item label="标题">
                        <Input
                          value={draft.title}
                          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                        />
                      </Form.Item>
                      <Form.Item label="图表主题（ECharts）">
                        <Select
                          value={draft.chart_theme || 'macarons'}
                          onChange={(v) => setDraft({ ...draft, chart_theme: v })}
                          options={CHART_THEMES}
                        />
                      </Form.Item>
                      <Form.Item label="样式选项">
                        <Space wrap>
                          <span>
                            <Switch
                              size="small"
                              checked={draft.show_label !== false}
                              onChange={(v) => setDraft({ ...draft, show_label: v })}
                            />{' '}
                            数据标签
                          </span>
                          {(draft.chart_type === 'line' || draft.chart_type === 'area') && (
                            <span>
                              <Switch
                                size="small"
                                checked={draft.smooth !== false}
                                onChange={(v) => setDraft({ ...draft, smooth: v })}
                              />{' '}
                              平滑
                            </span>
                          )}
                          {(draft.chart_type === 'bar' ||
                            draft.chart_type === 'line' ||
                            draft.chart_type === 'area') && (
                            <span>
                              <Switch
                                size="small"
                                checked={Boolean(draft.stack)}
                                onChange={(v) => setDraft({ ...draft, stack: v })}
                              />{' '}
                              堆叠
                            </span>
                          )}
                          {draft.chart_type === 'pie' && (
                            <>
                              <span>
                                <Switch
                                  size="small"
                                  checked={Boolean(draft.donut)}
                                  onChange={(v) => setDraft({ ...draft, donut: v })}
                                />{' '}
                                环形
                              </span>
                              <span>
                                <Switch
                                  size="small"
                                  checked={Boolean(draft.rose)}
                                  onChange={(v) => setDraft({ ...draft, rose: v })}
                                />{' '}
                                南丁格尔
                              </span>
                            </>
                          )}
                          <span>
                            <Switch
                              size="small"
                              checked={Boolean(draft.legend)}
                              onChange={(v) => setDraft({ ...draft, legend: v })}
                            />{' '}
                            图例
                          </span>
                        </Space>
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
                        />
                      </Form.Item>
                      <div style={{ marginBottom: 8 }}>
                        {draftFields.map((c) => (
                          <Tag
                            key={c}
                            style={{ cursor: 'pointer' }}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                text: `${draft.text || ''}{{${c}}}`,
                              })
                            }
                          >
                            +{c}
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
                        <Form.Item label="级别">
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
                    <Form.Item label="表样式">
                      <Select
                        value={draft.table_style}
                        onChange={(v) => setDraft({ ...draft, table_style: v })}
                        options={TABLE_STYLES.map((s) => ({ value: s.id, label: s.label }))}
                      />
                    </Form.Item>
                  ) : null}
                  {!draftFields.length && draft.type !== 'Divider' ? (
                    <Alert type="warning" showIcon message="请先回「数据」取数" style={{ marginBottom: 8 }} />
                  ) : null}
                  <Button type="primary" block onClick={() => void addToCart()}>
                    {editId ? '更新组件' : '确认并加入清单'}
                  </Button>
                  <Button
                    block
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      setDraft(null)
                      setEditId(null)
                      setMakerPreview(null)
                    }}
                  >
                    取消
                  </Button>
                </Form>
              )}
              <div style={{ marginTop: 16 }}>
                <Button block onClick={() => setStep('data')}>
                  ← 数据
                </Button>
                <Button
                  block
                  type="primary"
                  ghost
                  style={{ marginTop: 8 }}
                  disabled={!cart.length}
                  onClick={() => setStep('compose')}
                >
                  去组装画布 →
                </Button>
              </div>
            </div>

            {/* 大预览 */}
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                组件预览
                <Typography.Text type="secondary" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>
                  这里应看到组件真实样子（图/表/KPI），不是名称框
                </Typography.Text>
              </Typography.Title>
              <div
                style={{
                  background: '#fff',
                  borderRadius: 8,
                  padding: 16,
                  minHeight: 360,
                  border: '1px solid #e8e8e8',
                }}
              >
                {!draft ? (
                  <Empty description="选择左侧组件类型并配置后，此处实时预览" />
                ) : (
                  <RenderPreview
                    loading={makerLoading}
                    image={makerPreview?.image_base64}
                    html={makerPreview?.html}
                    error={makerPreview?.image_error}
                    emptyHint="请完善必填字段（如图表的分类/数值）后自动预览"
                    minHeight={320}
                  />
                )}
              </div>
            </div>

            {/* 小清单 */}
            <div
              style={{
                width: 160,
                background: '#fafafa',
                borderLeft: '1px solid #f0f0f0',
                overflow: 'auto',
                padding: 8,
                flexShrink: 0,
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                清单 {cart.length}
              </Typography.Text>
              {cart.length === 0 ? (
                <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>暂无</div>
              ) : (
                cart.map((n, i) => {
                  const thumb = thumbById[n.id] || String(n.props?.preview_image || '')
                  return (
                    <div
                      key={n.id}
                      style={{
                        marginTop: 8,
                        background: '#fff',
                        borderRadius: 6,
                        border: '1px solid #eee',
                        padding: 6,
                        fontSize: 11,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Tag style={{ margin: 0 }}>{i + 1}</Tag>
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => tree && setTree(removeNode(tree, n.id))}
                        />
                      </div>
                      <div style={{ marginTop: 4 }}>
                        {typeLabel(String(n.type), String(n.props?.chart_type || ''))}
                      </div>
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          style={{ width: '100%', marginTop: 4, borderRadius: 4 }}
                        />
                      ) : null}
                      <Button
                        type="link"
                        size="small"
                        style={{ padding: 0 }}
                        onClick={() => {
                          setEditId(n.id)
                          setDraft(nodeToDraft(n))
                        }}
                      >
                        编辑
                      </Button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* ========== 3 组装画布 ========== */}
        {step === 'compose' && (
          <div style={{ height: '100%', display: 'flex', minHeight: 0 }}>
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              <Space style={{ marginBottom: 12 }}>
                <Button onClick={() => setStep('make')}>← 做组件</Button>
                <Button type="primary" disabled={!cart.length} onClick={() => setStep('preview')}>
                  预览最终推送 →
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    cart.forEach((n) => void refreshThumb(n))
                    message.info('正在刷新组件缩略图…')
                  }}
                >
                  刷新组件图
                </Button>
              </Space>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                画布上调整顺序、宽度与颜色。拖拽排序；点选后在右侧改大小/配色。
              </Typography.Paragraph>
              {/* Visual canvas */}
              <div
                style={{
                  width: 780,
                  maxWidth: '100%',
                  margin: '0 auto',
                  background: '#d9d9d9',
                  padding: 16,
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    width: artboard.artboard?.width || 750,
                    maxWidth: '100%',
                    margin: '0 auto',
                    background: '#fff',
                    minHeight: 400,
                    borderRadius: 4,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
                    overflow: 'hidden',
                  }}
                >
                  {artboard.artboard?.show_chrome !== false ? (
                    <div
                      style={{
                        background: artboard.artboard?.theme?.color || '#1677ff',
                        color: '#fff',
                        padding: '12px 16px',
                        fontWeight: 600,
                      }}
                    >
                      {artboard.artboard?.chrome_title || name || '数据推送'}
                    </div>
                  ) : null}
                  <div style={{ padding: 12 }}>
                    {cart.length === 0 ? (
                      <Empty description="清单为空，请回「做组件」添加" />
                    ) : (
                      cart.map((node, index) => {
                        const w = Number(node.props?.compose_width ?? 100)
                        const accent = String(node.props?.compose_color || '')
                        const thumb =
                          thumbById[node.id] || String(node.props?.preview_image || '')
                        const selected = selectedComposeId === node.id
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
                            onClick={() => setSelectedComposeId(node.id)}
                            style={{
                              width: `${Math.max(20, Math.min(100, w))}%`,
                              display: w < 100 ? 'inline-block' : 'block',
                              verticalAlign: 'top',
                              boxSizing: 'border-box',
                              padding: 4,
                              cursor: 'grab',
                            }}
                          >
                            <div
                              style={{
                                border: selected
                                  ? '2px solid #1677ff'
                                  : accent
                                    ? `2px solid ${accent}`
                                    : '1px solid #e8e8e8',
                                borderRadius: 6,
                                overflow: 'hidden',
                                background: '#fafafa',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 11,
                                  padding: '2px 6px',
                                  background: selected ? '#e6f4ff' : '#f0f0f0',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <HolderOutlined />
                                <span>
                                  {index + 1}.{' '}
                                  {typeLabel(
                                    String(node.type),
                                    String(node.props?.chart_type || ''),
                                  )}
                                </span>
                              </div>
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt=""
                                  style={{ width: '100%', display: 'block' }}
                                />
                              ) : (
                                <div
                                  style={{
                                    padding: 24,
                                    textAlign: 'center',
                                    color: '#999',
                                    fontSize: 12,
                                  }}
                                >
                                  无预览图 · 点「刷新组件图」或回做组件重新加入
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧：选中组件版式 + 主题 */}
            <div
              style={{
                width: 260,
                background: '#fff',
                borderLeft: '1px solid #f0f0f0',
                padding: 12,
                overflow: 'auto',
                flexShrink: 0,
              }}
            >
              <Typography.Text strong>画布设置</Typography.Text>
              <div style={{ marginTop: 12 }}>
                <Typography.Text type="secondary">整页主题</Typography.Text>
                <Select
                  style={{ width: '100%', marginTop: 4 }}
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
              </div>
              <div style={{ marginTop: 12 }}>
                <Typography.Text type="secondary">顶栏标题</Typography.Text>
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
              <div style={{ marginTop: 12 }}>
                <Switch
                  checked={artboard.artboard?.show_chrome !== false}
                  onChange={(v) =>
                    setArtboard((prev) => ({
                      ...prev,
                      artboard: { ...prev.artboard, show_chrome: v },
                    }))
                  }
                />{' '}
                显示顶栏
              </div>

              {selectedCompose && tree ? (
                <div style={{ marginTop: 20 }}>
                  <Typography.Text strong>选中组件版式</Typography.Text>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                    {typeLabel(
                      String(selectedCompose.type),
                      String(selectedCompose.props?.chart_type || ''),
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Typography.Text type="secondary">宽度 %</Typography.Text>
                    <InputNumber
                      style={{ width: '100%', marginTop: 4 }}
                      min={25}
                      max={100}
                      step={5}
                      value={Number(selectedCompose.props?.compose_width ?? 100)}
                      onChange={(v) =>
                        setTree(
                          updateNode(tree, selectedCompose.id, {
                            props: {
                              ...selectedCompose.props,
                              compose_width: v ?? 100,
                            },
                          }),
                        )
                      }
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Typography.Text type="secondary">边框强调色</Typography.Text>
                    <div style={{ marginTop: 4 }}>
                      <ColorPicker
                        value={
                          selectedCompose.props?.compose_color
                            ? String(selectedCompose.props.compose_color)
                            : undefined
                        }
                        onChange={(c) =>
                          setTree(
                            updateNode(tree, selectedCompose.id, {
                              props: {
                                ...selectedCompose.props,
                                compose_color: colorToHex(c),
                              },
                            }),
                          )
                        }
                      />
                    </div>
                  </div>
                  <Button
                    size="small"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      setEditId(selectedCompose.id)
                      setDraft(nodeToDraft(selectedCompose))
                      setStep('make')
                    }}
                  >
                    回做组件改数据
                  </Button>
                </div>
              ) : (
                <Alert
                  style={{ marginTop: 16 }}
                  type="info"
                  showIcon
                  message="点画布上的组件进行版式调整"
                />
              )}
            </div>
          </div>
        )}

        {/* ========== 4 最终预览 ========== */}
        {step === 'preview' && (
          <div style={{ height: '100%', overflow: 'auto', padding: 16 }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              <Space style={{ marginBottom: 12 }} wrap>
                <Button onClick={() => setStep('compose')}>← 组装</Button>
                <Button
                  type="primary"
                  loading={finalLoading}
                  onClick={() => {
                    setStep('preview')
                    // force re-run by toggling
                    setFinalLoading(true)
                    setFinalError(null)
                    runCompile(buildDoc())
                      .then((res) => {
                        setFinalPreview(res)
                        if (!res.image_base64 && res.image_error)
                          setFinalError(res.image_error)
                      })
                      .catch((e) => setFinalError(getErrorMessage(e)))
                      .finally(() => setFinalLoading(false))
                  }}
                >
                  重新生成推送图
                </Button>
                <Button loading={pushing} onClick={() => void onTestPush()}>
                  试推
                </Button>
              </Space>

              {finalError ? (
                <Alert type="error" showIcon style={{ marginBottom: 12 }} message={finalError} />
              ) : null}

              <Typography.Title level={5}>最终推送效果</Typography.Title>
              <div
                style={{
                  background: '#fff',
                  borderRadius: 8,
                  padding: 16,
                  border: '1px solid #e8e8e8',
                }}
              >
                <RenderPreview
                  loading={finalLoading}
                  image={finalPreview?.image_base64}
                  html={finalPreview?.html}
                  error={finalPreview?.image_error || finalError}
                  emptyHint="正在生成或清单为空"
                  minHeight={400}
                />
              </div>

              {finalPreview?.markdown_text ? (
                <div style={{ marginTop: 16 }}>
                  <Typography.Text type="secondary">文案投影（Markdown）</Typography.Text>
                  <Input.TextArea
                    style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
                    rows={5}
                    readOnly
                    value={finalPreview.markdown_text}
                  />
                </div>
              ) : null}

              <div
                style={{
                  marginTop: 16,
                  background: '#fff',
                  padding: 16,
                  borderRadius: 8,
                  border: '1px solid #e8e8e8',
                }}
              >
                <Typography.Text strong>投递通道</Typography.Text>
                <Select
                  mode="multiple"
                  style={{ width: '100%', marginTop: 8 }}
                  value={channelIds}
                  onChange={setChannelIds}
                  options={channels.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="选择通道"
                />
                <div style={{ marginTop: 12 }}>
                  <Switch checked={enabled} onChange={setEnabled} /> 任务启用
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
