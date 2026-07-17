/**
 * 内容工作台（Studio 编辑器）主页面 — 推送「模板」编排，而非一次性静态图。
 *
 * 正式 JobRun 每次推送会重新取数、解析参数并按本页保存的 artboard 重渲染。
 *
 * ## 五步向导（StepKey）
 * 1. **data**   数据：多数据集 SQL / 参数定义 / 样例取数
 * 2. **make**   做组件：字段绑定 + 本地 Live 预览 + 组件清单
 * 3. **compose** 组装画布：自由布局 ComposeCanvas（位置/大小/风格模板）
 * 4. **message** 组装推送：多段落（文案/画布）组合 + 钉钉手机实时预览
 * 5. **preview** 预览推送：服务端 studioCompile 成图 + 试推 / 保存任务
 *
 * ## 状态要点
 * - `artboard`：完整 ArtboardDoc（datasets + canvases + compose.segments）
 * - `fieldsByDataset` / `rowsByDataset`：各数据集 queryPreview 缓存
 * - `draft`：做组件步骤当前编辑中的表单；确认后写入 tree
 * - 服务端 compile **仅在 preview 步骤**触发；组装推送用本地 Live 预览
 *
 * 路由：`/editor` | `/editor/:jobId`
 *
 * 依赖：ComposeCanvas / CanvasLivePreview / DingTalkPhonePreview / LiveChart / RichTextEditor
 */
import {
  ArrowLeftOutlined,
  DeleteOutlined,
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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getPushJob,
  listChannels,
  listDataSources,
  queryPreview,
  resolveSqlParams,
  studioCompile,
  studioSaveJob,
  studioTestPush,
} from '../../api'
import { getErrorMessage } from '../../api/client'
import type {
  ArtboardDoc,
  Channel,
  DataSource,
  SqlParamDef,
  StudioCompileResponse,
  StudioComposeSegment,
  StudioNode,
} from '../../api/types'
import { seriesFromTable, type ChartStyle } from './chartOption'
import {
  canvasChildren,
  cloneNodeForCanvas,
  listCanvases,
  newCanvas,
  normalizeArtboardDoc,
  setCanvasTree,
  updateCanvasInDoc,
} from './artboardModel'
import { CanvasLivePreview } from './CanvasLivePreview'
import {
  ComposeCanvas,
  ensureComposeLayouts,
  type ComposeLayout,
} from './ComposeCanvas'
import { DingTalkPhonePreview, type DingTalkPushContent } from './DingTalkPhonePreview'
import { htmlToDingTalkMd, isEmptyRich } from './dingtalkMd'
import { LiveChart } from './LiveChart'
import {
  appendFieldToken,
  isEmptyRichHtml,
  looksLikeHtml,
  RichTextEditor,
} from './RichTextEditor'
import {
  appendChild,
  defaultAlertArtboard,
  defaultDailyArtboard,
  emptyArtboard,
  extractArtboardFromJob,
  firstRowMap,
  newComponent,
  nid,
  removeNode,
  substituteRow,
  syncMainDataset,
  TABLE_STYLES,
  THEME_PACKS,
  updateNode,
  upsertDataset,
  type DataPreviewCtx,
} from './studioUtils'

const COMPOSE_STYLE_OPTIONS = [
  { value: 'card', label: '卡片' },
  { value: 'plain', label: '无边框' },
  { value: 'border', label: '描边' },
  { value: 'shadow', label: '阴影' },
]

const COMPOSE_PROP_KEYS = [
  'compose_x',
  'compose_y',
  'compose_w',
  'compose_h',
  'compose_style',
  'compose_bg',
  'compose_radius',
  'compose_padding',
  'compose_color',
  'compose_opacity',
  'compose_width',
  'preview_image',
  // 内容样式（组装画布可调）
  'content_font_size',
  'content_font_weight',
  'content_color',
  'content_align',
  'content_line_height',
  'label_font_size',
  'label_color',
  'label_font_weight',
  'title_font_size',
  'chart_label_size',
  'axis_font_size',
  'show_label',
  'show_legend',
  'show_grid',
] as const

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

/** 五步向导的步骤键 */
type StepKey = 'data' | 'make' | 'compose' | 'message' | 'preview'

/** Steps 组件展示用元数据 */
const STEPS = [
  { key: 'data' as const, title: '1. 数据', desc: 'SQL/参数模板' },
  { key: 'make' as const, title: '2. 做组件', desc: '绑定字段' },
  { key: 'compose' as const, title: '3. 组装画布', desc: '多图画布' },
  { key: 'message' as const, title: '4. 组装推送', desc: '文案+多图' },
  { key: 'preview' as const, title: '5. 预览推送', desc: '样例预演' },
]

/** 「做组件」步骤中的临时表单（确认前未写入 tree） */
type DraftForm = {
  type: string
  dataset_id: string
  value_column?: string
  value_columns?: string[]
  category_column?: string
  label?: string
  text?: string
  chart_type?: string
  title?: string
  subtitle?: string
  variant?: string
  table_style?: string
  level?: string
  show_label?: boolean
  show_legend?: boolean
  show_grid?: boolean
  smooth?: boolean
  stack?: boolean
  donut?: boolean
  rose?: boolean
  sort?: 'none' | 'asc' | 'desc'
  top_n?: number | null
  x_label_rotate?: number
  bar_border_radius?: number
  line_width?: number
  area_opacity?: number
}

/** 按组件类型生成空 draft 表单默认值 */
function emptyDraft(type: string, datasetId: string): DraftForm {
  const chartBase: DraftForm = {
    type: 'Chart',
    dataset_id: datasetId,
    text: '',
    title: '',
    subtitle: '',
    label: '',
    value_columns: [],
    show_label: true,
    show_legend: false,
    show_grid: true,
    smooth: true,
    stack: false,
    donut: false,
    rose: false,
    sort: 'none',
    top_n: null,
    x_label_rotate: 0,
    bar_border_radius: 4,
    line_width: 2.5,
    area_opacity: 0.28,
  }
  if (type === 'ChartBar') return { ...chartBase, chart_type: 'bar', title: '柱状图' }
  if (type === 'ChartLine') return { ...chartBase, chart_type: 'line', title: '折线图' }
  if (type === 'ChartArea') return { ...chartBase, chart_type: 'area', title: '面积图' }
  if (type === 'ChartHBar') return { ...chartBase, chart_type: 'hbar', title: '条形图' }
  if (type === 'ChartPie')
    return { ...chartBase, chart_type: 'pie', title: '饼图', show_legend: true }
  const base: DraftForm = { type, dataset_id: datasetId, text: '', title: '', label: '' }
  if (type === 'Text')
    return {
      ...base,
      type: 'Text',
      variant: 'rich',
      text: '<p>在此编写推送文案，可用工具栏设置<strong>加粗</strong>、颜色、列表等。</p><p>插入字段：{{列名}}</p>',
    }
  if (type === 'Alert') return { ...base, type: 'Alert', level: 'error', text: '请注意异常指标' }
  if (type === 'Kpi') return { ...base, type: 'Kpi', label: '指标' }
  if (type === 'Table') return { ...base, type: 'Table', table_style: 'business' }
  if (type === 'Divider') return { ...base, type: 'Divider' }
  return base
}

/** 已有节点 → draft（编辑清单项时回填） */
function nodeToDraft(node: StudioNode): DraftForm {
  const b = node.binding || {}
  const p = node.props || {}
  const vcols = b.value_columns
  return {
    type: String(node.type),
    dataset_id: String(b.dataset_id || 'main'),
    value_column: String(b.value_column || ''),
    value_columns: Array.isArray(vcols)
      ? vcols.map(String)
      : b.value_column
        ? [String(b.value_column)]
        : [],
    category_column: String(b.category_column || ''),
    label: String(b.label || p.label || ''),
    text: String(p.text || ''),
    chart_type: String(p.chart_type || 'bar'),
    title: String(p.title || ''),
    subtitle: String(p.subtitle || ''),
    variant: String(p.variant || 'body'),
    table_style: String(p.style || 'business'),
    level: String(p.level || 'error'),
    show_label: p.show_label !== false,
    show_legend: Boolean(p.show_legend || p.legend),
    show_grid: p.show_grid !== false,
    smooth: p.smooth !== false,
    stack: Boolean(p.stack),
    donut: Boolean(p.donut),
    rose: Boolean(p.rose),
    sort: (p.sort as DraftForm['sort']) || 'none',
    top_n: (p.top_n as number) ?? null,
    x_label_rotate: Number(p.x_label_rotate || 0),
    bar_border_radius: Number(p.bar_border_radius ?? 4),
    line_width: Number(p.line_width ?? 2.5),
    area_opacity: Number(p.area_opacity ?? 0.28),
  }
}

/** draft → StudioNode（新建或覆盖 existingId） */
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
    const vcols =
      draft.value_columns && draft.value_columns.length
        ? draft.value_columns
        : draft.value_column
          ? [draft.value_column]
          : []
    return {
      id,
      type: 'Chart',
      visible: true,
      props: {
        chart_type: draft.chart_type || 'bar',
        title: draft.title || '',
        subtitle: draft.subtitle || '',
        max_rows: 50,
        show_label: draft.show_label !== false,
        show_legend: Boolean(draft.show_legend),
        show_grid: draft.show_grid !== false,
        smooth: draft.smooth !== false,
        stack: Boolean(draft.stack),
        donut: Boolean(draft.donut),
        rose: Boolean(draft.rose),
        legend: Boolean(draft.show_legend),
        sort: draft.sort || 'none',
        top_n: draft.top_n ?? null,
        x_label_rotate: draft.x_label_rotate ?? 0,
        bar_border_radius: draft.bar_border_radius ?? 4,
        line_width: draft.line_width ?? 2.5,
        area_opacity: draft.area_opacity ?? 0.28,
        value_columns: vcols,
      },
      binding: {
        dataset_id: ds,
        category_column: draft.category_column || '',
        value_column: vcols[0] || '',
        value_columns: vcols,
      },
    }
  }
  if (t === 'Text') {
    return {
      id,
      type: 'Text',
      visible: true,
      props: {
        variant: draft.variant || 'rich',
        text: draft.text || '',
        html: draft.text || '',
        content_format: 'html',
      },
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

/** 组件类型中文标签 */
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

/** 已取数（有字段缓存）的数据集选项，供绑定下拉 */
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

/**
 * 最终预览区：优先展示服务端 PNG；失败时回退 HTML iframe。
 */
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

/**
 * 内容工作台页面组件。
 * 管理五步状态机、artboard 文档、取数缓存、保存与试推。
 */
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

  // 最终预览：服务端 compile 结果（主要在 preview / message 步骤使用）
  const [finalPreview, setFinalPreview] = useState<StudioCompileResponse | null>(null)
  const [finalLoading, setFinalLoading] = useState(false)
  const [finalError, setFinalError] = useState<string | null>(null)

  const [querying, setQuerying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [selectedComposeId, setSelectedComposeId] = useState<string | null>(null)
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null)
  const [resolvedPreview, setResolvedPreview] = useState<Record<string, string>>({})
  const [renderedSqlPreview, setRenderedSqlPreview] = useState('')

  const canvases = useMemo(() => listCanvases(artboard), [artboard])
  const effectiveCanvasId =
    activeCanvasId && canvases.some((c) => c.id === activeCanvasId)
      ? activeCanvasId
      : canvases[0]?.id || null
  const activeCanvas = canvases.find((c) => c.id === effectiveCanvasId) || canvases[0]
  const tree = activeCanvas?.tree || artboard.tree
  const datasets = artboard.datasets || []
  const activeDs = datasets.find((d) => d.id === activeDatasetId) || datasets[0]
  const datasetOptions = datasets.map((d) => ({ value: d.id, label: d.name || d.id }))
  /** 当前画布上已放置的组件 */
  const cart = useMemo(() => canvasChildren(activeCanvas), [activeCanvas])
  /** 组件库（做组件产出，组装时挑选） */
  const library = useMemo(
    () => artboard.library || [],
    [artboard.library],
  )
  const libraryCount = library.length
  /** 所有画布上已放置组件数 */
  const allCartCount = useMemo(
    () => canvases.reduce((n, c) => n + canvasChildren(c).length, 0),
    [canvases],
  )
  const draftFields = fieldsByDataset[draft?.dataset_id || activeDatasetId] || []
  const previewColumns = fieldsByDataset[activeDatasetId] || []
  const previewRows = rowsByDataset[activeDatasetId] || []

  const setTree = (next: StudioNode) => {
    setArtboard((p) => {
      const n = normalizeArtboardDoc(p)
      const cid = effectiveCanvasId || n.canvases?.[0]?.id
      if (!cid) return { ...n, tree: next }
      return setCanvasTree(n, cid, next)
    })
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
          normalizeArtboardDoc(
            extracted || syncMainDataset(emptyArtboard(), job.data_source_id, job.query_sql),
          ),
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
    return normalizeArtboardDoc(doc)
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

  const patchCompose = useCallback((patch: NonNullable<ArtboardDoc['compose']>) => {
    setArtboard((prev) => ({
      ...prev,
      compose: { ...prev.compose, text_format: 'html', ...patch },
    }))
  }, [])

  // 仅第 5 步自动服务端编译；组装推送用本地实时预览（避免 Playwright 过慢）
  useEffect(() => {
    if (step !== 'preview') return
    if (!dataSourceId) {
      setFinalError('请先完成数据源选择与取数')
      return
    }
    if (allCartCount === 0) {
      setFinalError('画布上没有组件：请在「组装画布」从组件库放到画布')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, allCartCount, dataSourceId])

  const activeParamDefs = useMemo((): SqlParamDef[] => {
    const ds = datasets.find((d) => d.id === activeDatasetId)
    return (ds?.params as SqlParamDef[]) || []
  }, [datasets, activeDatasetId])

  const setActiveParamDefs = (params: SqlParamDef[]) => {
    const ds = datasets.find((d) => d.id === activeDatasetId)
    setArtboard((p) =>
      upsertDataset(p, {
        id: activeDatasetId,
        name: ds?.name || (activeDatasetId === 'main' ? '主查询' : activeDatasetId),
        data_source_id:
          activeDatasetId === 'main'
            ? dataSourceId
            : ds?.data_source_id || dataSourceId || null,
        sql: activeDatasetId === 'main' ? sql : String(ds?.sql || ''),
        params,
      }),
    )
  }

  const refreshResolvedPreview = async () => {
    const slotSql =
      activeDatasetId === 'main' ? sql : String(activeDs?.sql || '')
    try {
      const res = await resolveSqlParams({
        sql: slotSql,
        param_defs: activeParamDefs,
      })
      setResolvedPreview(res.resolved || {})
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void refreshResolvedPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDatasetId, sql, activeDs?.sql, JSON.stringify(activeParamDefs)])

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
    const paramDefs = (dsMeta?.params as SqlParamDef[]) || []
    setQuerying(true)
    try {
      const res = await queryPreview({
        data_source_id: slotDs,
        sql: slotSql,
        param_defs: paramDefs,
        max_rows: 200,
      })
      setFieldsByDataset((p) => ({ ...p, [datasetId]: res.columns }))
      setRowsByDataset((p) => ({ ...p, [datasetId]: res.rows }))
      if (res.resolved_params) setResolvedPreview(res.resolved_params)
      if (res.rendered_sql) setRenderedSqlPreview(res.rendered_sql)
      if (datasetId === 'main') {
        setArtboard((p) =>
          upsertDataset(syncMainDataset(p, slotDs, slotSql), {
            id: 'main',
            name: dsMeta?.name || '主查询',
            data_source_id: slotDs,
            sql: slotSql,
            params: paramDefs,
          }),
        )
        setDataSourceId(slotDs)
        setSql(slotSql)
      } else {
        setArtboard((p) =>
          upsertDataset(p, {
            id: datasetId,
            name: dsMeta?.name,
            data_source_id: slotDs,
            sql: slotSql,
            params: paramDefs,
          }),
        )
      }
      const rp = res.resolved_params || {}
      const hint = Object.keys(rp).length
        ? ` · 参数 ${Object.entries(rp)
            .slice(0, 4)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}`
        : ''
      message.success(`「${dsMeta?.name || datasetId}」取数 ${res.row_count} 行${hint}`)
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
  }

  const addToCart = async () => {
    if (!draft || !tree) return
    const vcols =
      draft.value_columns && draft.value_columns.length
        ? draft.value_columns
        : draft.value_column
          ? [draft.value_column]
          : []
    if (draft.type === 'Kpi' && !draft.value_column && !vcols.length) {
      message.error('请选择数值字段')
      return
    }
    if (draft.type === 'Chart' && (!draft.category_column || !vcols.length)) {
      message.error('请选择分类字段和至少一个数值字段')
      return
    }
    if (draft.type === 'Text' || draft.type === 'Alert') {
      const plain = String(draft.text || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
      if (!plain) {
        message.error('请填写文案')
        return
      }
    }

    let node = draftToNode(draft, editId || undefined)

    // 组件写入「组件库」；不自动铺到画布，需在组装步挑选
    setArtboard((prev) => {
      const n = normalizeArtboardDoc(prev)
      let lib = [...(n.library || [])]
      if (editId) {
        const oldLib = lib.find((x) => x.id === editId)
        const kept: Record<string, unknown> = {}
        if (oldLib?.props) {
          for (const k of COMPOSE_PROP_KEYS) {
            if (oldLib.props[k] !== undefined) kept[k] = oldLib.props[k]
          }
        }
        const nextNode = {
          ...node,
          id: editId,
          props: {
            ...node.props,
            ...kept,
            library_id: String(oldLib?.props?.library_id || editId),
          },
        }
        lib = lib.map((x) => (x.id === editId ? nextNode : x))
        // 同步已放到各画布、同源的实例（保留 compose_* 布局）
        const libKey = String(nextNode.props?.library_id || editId)
        const canvasesNext = (n.canvases || []).map((c) => {
          if (!c.tree) return c
          let t = c.tree
          for (const ch of c.tree.children || []) {
            const src = String(ch.props?.library_id || ch.id)
            if (src !== libKey && ch.id !== editId) continue
            const layoutKeep: Record<string, unknown> = {}
            for (const k of COMPOSE_PROP_KEYS) {
              if (ch.props?.[k] !== undefined) layoutKeep[k] = ch.props[k]
            }
            t = updateNode(t, ch.id, {
              ...nextNode,
              id: ch.id,
              props: { ...nextNode.props, ...layoutKeep, library_id: libKey },
            })
          }
          return { ...c, tree: t }
        })
        return {
          ...n,
          library: lib,
          canvases: canvasesNext,
          tree: canvasesNext[0]?.tree || n.tree,
        }
      }
      const withLib = {
        ...node,
        props: { ...node.props, library_id: node.id },
      }
      return { ...n, library: [...lib, withLib] }
    })
    message.success(editId ? '组件已更新' : '已加入组件库（请到组装画布挑选上板）')
    setDraft(null)
    setEditId(null)
  }

  /** Instant local preview data for current draft (no server). */
  const makerLocal = useMemo(() => {
    if (!draft) return null
    const dsId = draft.dataset_id || 'main'
    const cols = fieldsByDataset[dsId] || []
    const rows = rowsByDataset[dsId] || []
    const ctx: DataPreviewCtx = { [dsId]: { columns: cols, rows } }
    if (draft.type === 'Chart') {
      const vcols =
        draft.value_columns && draft.value_columns.length
          ? draft.value_columns
          : draft.value_column
            ? [draft.value_column]
            : []
      if (!draft.category_column || !vcols.length || !cols.length) return { kind: 'empty' as const }
      const { labels, series } = seriesFromTable(cols, rows, draft.category_column, vcols)
      const style: ChartStyle = {
        chart_type: draft.chart_type || 'bar',
        title: draft.title,
        subtitle: draft.subtitle,
        show_label: draft.show_label !== false,
        show_legend: Boolean(draft.show_legend) || vcols.length > 1,
        show_grid: draft.show_grid !== false,
        smooth: draft.smooth !== false,
        stack: Boolean(draft.stack),
        donut: Boolean(draft.donut),
        rose: Boolean(draft.rose),
        sort: draft.sort || 'none',
        top_n: draft.top_n,
        x_label_rotate: draft.x_label_rotate,
        bar_border_radius: draft.bar_border_radius,
        line_width: draft.line_width,
        area_opacity: draft.area_opacity,
      }
      return { kind: 'chart' as const, labels, series, style }
    }
    if (draft.type === 'Kpi') {
      const col = draft.value_column || ''
      const row = firstRowMap(ctx, dsId)
      const val = row && col ? row[col] : null
      return {
        kind: 'kpi' as const,
        label: draft.label || col || '指标',
        value: val === null || val === undefined ? '—' : String(val),
        hint: col ? `${dsId}.${col}` : '未选字段',
      }
    }
    if (draft.type === 'Table') {
      return { kind: 'table' as const, columns: cols, rows: rows.slice(0, 8) }
    }
    if (draft.type === 'Text' || draft.type === 'Alert') {
      const row = firstRowMap(ctx, dsId)
      const text = substituteRow(draft.text || '', row)
      return {
        kind: 'text' as const,
        text,
        alert: draft.type === 'Alert',
        level: draft.level || 'error',
        variant: draft.variant || 'body',
      }
    }
    if (draft.type === 'Divider') return { kind: 'divider' as const }
    return { kind: 'empty' as const }
  }, [draft, fieldsByDataset, rowsByDataset])

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
      message.success('模板已保存（运行时按参数动态渲染）')
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
  const canvasWidth = Number(artboard.artboard?.width) || 750

  /** 首行字段映射（图外 {{列}} 本地替换，不重编译） */
  const firstRowForShell = useMemo(() => {
    const row = firstRowMap(
      { main: { columns: fieldsByDataset.main || [], rows: rowsByDataset.main || [] } },
      'main',
    )
    return (
      row ||
      firstRowMap(
        {
          [activeDatasetId]: {
            columns: fieldsByDataset[activeDatasetId] || [],
            rows: rowsByDataset[activeDatasetId] || [],
          },
        },
        activeDatasetId,
      )
    )
  }, [fieldsByDataset, rowsByDataset, activeDatasetId])

  /** Local substitute for push shell text (instant, no recompile). */
  const shellPreview = useMemo(() => {
    const row2 = firstRowForShell
    return {
      title: substituteRow(String(artboard.compose?.title || name || '数据推送'), row2),
      before: substituteRow(String(artboard.compose?.text_before || ''), row2),
      after: substituteRow(String(artboard.compose?.text_after || ''), row2),
    }
  }, [
    artboard.compose?.title,
    artboard.compose?.text_before,
    artboard.compose?.text_after,
    firstRowForShell,
    name,
  ])

  const composeSegments = useMemo((): StudioComposeSegment[] => {
    return normalizeArtboardDoc(artboard).compose?.segments || []
  }, [artboard])

  /**
   * 钉钉「一条推送」实时内容：
   * - 图前文案 / 图后文案按 segments 相对画布位置切分（不会把图后文案画到图前）
   * - 多画布纵向合成一块图
   */
  const livePushContent = useMemo((): DingTalkPushContent => {
    const mode = String(artboard.compose?.mode || 'image_primary')
    const segs = composeSegments
    const row = firstRowForShell
    const title = substituteRow(String(artboard.compose?.title || name || '数据推送'), row)

    const beforeParts: string[] = []
    const afterParts: string[] = []
    let seenCanvas = false
    for (const s of segs) {
      if (s.type === 'canvas') {
        seenCanvas = true
        continue
      }
      if (s.type !== 'text') continue
      const raw = substituteRow(String(s.html || ''), row)
      if (isEmptyRich(raw) || isEmptyRichHtml(raw)) continue
      const md = htmlToDingTalkMd(raw) || raw
      if (seenCanvas) afterParts.push(md)
      else beforeParts.push(md)
    }
    const markdownBefore = mode === 'image_only' ? '' : beforeParts.join('\n\n')
    const markdownAfter = mode === 'image_only' ? '' : afterParts.join('\n\n')

    const canvasOrder = segs
      .filter((s): s is Extract<StudioComposeSegment, { type: 'canvas' }> => s.type === 'canvas')
      .map((s) => canvases.find((c) => c.id === s.canvas_id))
      .filter(Boolean) as typeof canvases
    const canvasList = (canvasOrder.length > 0 ? canvasOrder : canvases).filter(
      (c) => canvasChildren(c).length > 0,
    )

    const imgW = 248
    const showImage = mode !== 'markdown_primary' && canvasList.length > 0
    const image = showImage ? (
      <CanvasLivePreview
        canvases={canvasList.map((c) => ({
          id: c.id,
          name: c.name,
          nodes: canvasChildren(c),
          logicalWidth: Number(c.width) || 750,
          chrome: {
            show: c.show_chrome !== false,
            title: String(c.chrome_title || name || '数据推送'),
            color: String(c.theme?.color || artboard.artboard?.theme?.color || '#1677ff'),
          },
        }))}
        data={{ fieldsByDataset, rowsByDataset }}
        displayWidth={imgW}
        showHint={false}
      />
    ) : undefined

    return {
      title,
      botName: '数据推送机器人',
      markdownBefore,
      markdownAfter,
      image,
      emptyHint:
        mode === 'markdown_primary'
          ? '仅 Markdown 模式：请填写文案段'
          : '请填写文案，并在组装画布把组件放到画布上',
    }
  }, [
    artboard.compose?.mode,
    artboard.compose?.title,
    artboard.artboard?.theme?.color,
    composeSegments,
    canvases,
    fieldsByDataset,
    rowsByDataset,
    firstRowForShell,
    name,
  ])

  const placeLibraryOnCanvas = useCallback(
    (libNode: StudioNode) => {
      if (!tree || !effectiveCanvasId) return
      const already = cart.some(
        (n) =>
          n.id === libNode.id ||
          String(n.props?.library_id || '') === libNode.id ||
          String(n.props?.library_id || '') === String(libNode.props?.library_id || ''),
      )
      if (already) {
        message.info('该组件已在当前画布上')
        return
      }
      const clone = cloneNodeForCanvas(libNode, cart.length)
      setTree(appendChild(tree, 'root', clone))
      setSelectedComposeId(clone.id)
      message.success('已放到当前画布')
    },
    [tree, effectiveCanvasId, cart, setTree],
  )

  const removeFromCanvas = useCallback(
    (nodeId: string) => {
      if (!tree) return
      setTree(removeNode(tree, nodeId))
      if (selectedComposeId === nodeId) setSelectedComposeId(null)
      message.success('已从画布移除')
    },
    [tree, selectedComposeId],
  )

  const removeFromLibrary = useCallback(
    (libId: string) => {
      setArtboard((prev) => {
        const n = normalizeArtboardDoc(prev)
        const lib = (n.library || []).filter((x) => x.id !== libId)
        const canvasesNext = (n.canvases || []).map((c) => {
          if (!c.tree) return c
          let t = c.tree
          for (const ch of [...(c.tree.children || [])]) {
            const src = String(ch.props?.library_id || ch.id)
            if (src === libId || ch.id === libId) {
              t = removeNode(t, ch.id)
            }
          }
          return { ...c, tree: t }
        })
        return {
          ...n,
          library: lib,
          canvases: canvasesNext,
          tree: canvasesNext[0]?.tree || n.tree,
        }
      })
      message.success('已从组件库删除')
    },
    [],
  )

  /** 同步 segments 并回写兼容字段 text_before/after */
  const setSegments = useCallback((segs: StudioComposeSegment[]) => {
    const texts = segs.filter((s): s is Extract<StudioComposeSegment, { type: 'text' }> => s.type === 'text')
    setArtboard((prev) => ({
      ...normalizeArtboardDoc(prev),
      compose: {
        ...prev.compose,
        text_format: 'html',
        segments: segs,
        text_before: texts[0]?.html || '',
        text_after: texts.length > 1 ? texts[texts.length - 1]?.html || '' : '',
      },
    }))
  }, [])

  const patchSegmentHtml = useCallback(
    (segId: string, html: string) => {
      const segs = composeSegments.map((s) =>
        s.id === segId && s.type === 'text' ? { ...s, html } : s,
      )
      setSegments(segs)
    },
    [composeSegments, setSegments],
  )

  const moveSegment = useCallback(
    (index: number, dir: -1 | 1) => {
      const next = [...composeSegments]
      const j = index + dir
      if (j < 0 || j >= next.length) return
      const tmp = next[index]!
      next[index] = next[j]!
      next[j] = tmp
      setSegments(next)
    },
    [composeSegments, setSegments],
  )

  const addTextSegment = useCallback(
    (afterIndex?: number) => {
      const seg: StudioComposeSegment = { id: `seg_${nid()}`, type: 'text', html: '' }
      const next = [...composeSegments]
      if (afterIndex == null || afterIndex < 0) next.push(seg)
      else next.splice(afterIndex + 1, 0, seg)
      setSegments(next)
    },
    [composeSegments, setSegments],
  )

  const removeSegment = useCallback(
    (segId: string) => {
      const target = composeSegments.find((s) => s.id === segId)
      if (!target) return
      // 画布段不可在此删除（回第 3 步删画布）；文案段至少保留 1 个
      if (target.type === 'canvas') return
      const textCount = composeSegments.filter((s) => s.type === 'text').length
      if (textCount <= 1) {
        patchSegmentHtml(segId, '')
        return
      }
      setSegments(composeSegments.filter((s) => s.id !== segId))
    },
    [composeSegments, setSegments, patchSegmentHtml],
  )

  const patchComposeLayout = useCallback(
    (id: string, layout: Partial<ComposeLayout>) => {
      setArtboard((prev) => {
        const n = normalizeArtboardDoc(prev)
        const cid = effectiveCanvasId || n.canvases?.[0]?.id
        if (!cid) return prev
        const canvas = (n.canvases || []).find((c) => c.id === cid)
        if (!canvas?.tree) return prev
        const node = findNode(canvas.tree, id)
        if (!node) return prev
        const tree = updateNode(canvas.tree, id, {
          props: { ...node.props, ...layout },
        })
        return setCanvasTree(n, cid, tree)
      })
    },
    [effectiveCanvasId],
  )

  // 进入组装画布时为当前画布缺失坐标的节点补默认布局
  useEffect(() => {
    if (step !== 'compose') return
    setArtboard((prev) => {
      const n = normalizeArtboardDoc(prev)
      const cid = effectiveCanvasId || n.canvases?.[0]?.id
      if (!cid) return n
      const canvas = (n.canvases || []).find((c) => c.id === cid)
      if (!canvas?.tree) return n
      const patches = ensureComposeLayouts(canvasChildren(canvas), canvas.width || canvasWidth)
      if (!patches.length) return n
      let tree = canvas.tree
      for (const { id, patch } of patches) {
        const node = findNode(tree, id)
        if (!node) continue
        tree = updateNode(tree, id, { props: { ...node.props, ...patch } })
      }
      return setCanvasTree(n, cid, tree)
    })
  }, [step, cart.length, canvasWidth, effectiveCanvasId])

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
            <div>
              <Typography.Title level={5} style={{ margin: 0 }}>
                内容工作台
                <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
                  制作推送模板 · 每次推送按参数动态取数成图
                </Typography.Text>
              </Typography.Title>
            </div>
            <Input
              style={{ width: 200 }}
              placeholder="模板 / 任务名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
            <Tag icon={<ShoppingCartOutlined />} color="blue">
              库 {libraryCount} · 画布 {allCartCount}
            </Tag>
          </Space>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void onSave()}>
            保存模板
          </Button>
        </Space>
        <div style={{ marginTop: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            此处配置的是<strong>模板</strong>（SQL、参数、组件绑定、画布版式、图外文案）。调度/试推时会重新解析参数、取数并渲染，不是固定一张截图。
          </Typography.Text>
        </div>
        <div style={{ marginTop: 12, maxWidth: 900 }}>
          <Steps
            size="small"
            current={stepIndex}
            onChange={(i) => setStep(STEPS[i]!.key)}
            items={STEPS.map((s) => ({ title: s.title, description: s.desc }))}
          />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: '#eef0f3' }}>
        {/* ============================================================
            步骤 1 · 数据（data）
            - 多数据集 SQL / 参数模板
            - 样例取数 → 填充 fieldsByDataset / rowsByDataset
            - 主数据集与任务级 dataSourceId、sql 同步
            ============================================================ */}
        {step === 'data' && (
          <div style={{ height: '100%', overflow: 'auto', padding: 16 }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
              <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    数据集管理
                  </Typography.Title>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    配置模板侧的 SQL 与参数（如 {'{{yesterday}}'}）；此处「取数」仅用于绑字段样例。正式推送每次重新执行 SQL。
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
                      <Typography.Text type="secondary">
                        SQL（支持 {'{{参数名}}'}，如 {'{{yesterday}}'} / {'{{today}}'} / 自定义）
                      </Typography.Text>
                      <Input.TextArea
                        rows={6}
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
                                params: activeParamDefs,
                              }),
                            )
                        }}
                        placeholder={
                          "SELECT * FROM t WHERE dt = '{{yesterday}}'"
                        }
                      />
                    </div>

                    <div>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Typography.Text type="secondary">SQL 参数</Typography.Text>
                        <Button
                          size="small"
                          type="dashed"
                          onClick={() => {
                            const n = activeParamDefs.length + 1
                            setActiveParamDefs([
                              ...activeParamDefs,
                              {
                                name: n === 1 ? 'biz_date' : `param_${n}`,
                                label: n === 1 ? '业务日期' : `参数${n}`,
                                source: 'auto',
                                auto: 'yesterday',
                                format: '%Y-%m-%d',
                              },
                            ])
                          }}
                        >
                          + 参数
                        </Button>
                      </Space>
                      <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 8px' }}>
                        内置可用：today / yesterday / tomorrow / now / this_month_start …
                        每次取数与推送都会重新计算自动参数。
                      </Typography.Paragraph>
                      {activeParamDefs.length === 0 ? (
                        <Alert
                          type="info"
                          showIcon
                          style={{ marginBottom: 8 }}
                          message="未自定义参数时，SQL 里写 {{yesterday}} 等内置名也会自动替换"
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {activeParamDefs.map((p, idx) => (
                            <div
                              key={`${p.name}-${idx}`}
                              style={{
                                border: '1px solid #f0f0f0',
                                borderRadius: 6,
                                padding: 8,
                                background: '#fafafa',
                              }}
                            >
                              <Space wrap style={{ width: '100%' }}>
                                <Input
                                  style={{ width: 110 }}
                                  placeholder="name"
                                  value={p.name}
                                  onChange={(e) => {
                                    const next = [...activeParamDefs]
                                    next[idx] = { ...p, name: e.target.value }
                                    setActiveParamDefs(next)
                                  }}
                                />
                                <Select
                                  style={{ width: 100 }}
                                  value={p.source || 'auto'}
                                  onChange={(v) => {
                                    const next = [...activeParamDefs]
                                    next[idx] = { ...p, source: v }
                                    setActiveParamDefs(next)
                                  }}
                                  options={[
                                    { value: 'auto', label: '自动' },
                                    { value: 'static', label: '固定值' },
                                    { value: 'runtime', label: '运行时' },
                                  ]}
                                />
                                {(p.source || 'auto') === 'auto' ? (
                                  <Select
                                    style={{ width: 140 }}
                                    value={p.auto || 'yesterday'}
                                    onChange={(v) => {
                                      const next = [...activeParamDefs]
                                      next[idx] = { ...p, auto: v }
                                      setActiveParamDefs(next)
                                    }}
                                    options={[
                                      { value: 'yesterday', label: '昨天' },
                                      { value: 'today', label: '今天' },
                                      { value: 'tomorrow', label: '明天' },
                                      { value: 'now', label: '当前时间' },
                                      { value: 'this_month_start', label: '本月1日' },
                                      { value: 'this_month_end', label: '本月末' },
                                      { value: 'last_month_start', label: '上月1日' },
                                      { value: 'last_month_end', label: '上月末' },
                                      { value: 'last_7_days_start', label: '近7天起' },
                                      { value: 'last_30_days_start', label: '近30天起' },
                                    ]}
                                  />
                                ) : (
                                  <Input
                                    style={{ width: 140 }}
                                    placeholder="固定值/默认值"
                                    value={p.value || p.default || ''}
                                    onChange={(e) => {
                                      const next = [...activeParamDefs]
                                      next[idx] = {
                                        ...p,
                                        value: e.target.value,
                                        default: e.target.value,
                                      }
                                      setActiveParamDefs(next)
                                    }}
                                  />
                                )}
                                <Input
                                  style={{ width: 120 }}
                                  placeholder="格式 %Y-%m-%d"
                                  value={p.format || ''}
                                  onChange={(e) => {
                                    const next = [...activeParamDefs]
                                    next[idx] = { ...p, format: e.target.value }
                                    setActiveParamDefs(next)
                                  }}
                                />
                                <Button
                                  size="small"
                                  danger
                                  type="text"
                                  icon={<DeleteOutlined />}
                                  onClick={() =>
                                    setActiveParamDefs(
                                      activeParamDefs.filter((_, i) => i !== idx),
                                    )
                                  }
                                />
                              </Space>
                              {p.name && resolvedPreview[p.name] !== undefined ? (
                                <div style={{ fontSize: 12, color: '#1677ff', marginTop: 4 }}>
                                  本次解析：{p.name} = {resolvedPreview[p.name]}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                      {Object.keys(resolvedPreview).length > 0 ? (
                        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                          SQL 中将替换：
                          {Object.entries(resolvedPreview).map(([k, v]) => (
                            <Tag key={k} style={{ marginBottom: 4 }}>
                              {`{{${k}}}`}→{v}
                            </Tag>
                          ))}
                        </div>
                      ) : null}
                      {renderedSqlPreview ? (
                        <Input.TextArea
                          style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 11 }}
                          rows={2}
                          readOnly
                          value={renderedSqlPreview}
                          placeholder="取数后显示实际执行 SQL"
                        />
                      ) : null}
                    </div>

                    <Button
                      type="primary"
                      loading={querying}
                      onClick={() => void onQueryDataset(activeDatasetId)}
                    >
                      运行取数（应用参数）
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

        {/* ============================================================
            步骤 2 · 做组件（make）
            - 左：组件类型与字段绑定表单（draft）
            - 中：本地即时预览（LiveChart / KPI / 表 / 文案，无服务端）
            - 右/底：组件清单 cart，确认后写入 artboard.tree
            ============================================================ */}
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
                      <Form.Item label="数值字段（可多选=多系列）" required>
                        <Select
                          mode="multiple"
                          allowClear
                          value={
                            draft.value_columns?.length
                              ? draft.value_columns
                              : draft.value_column
                                ? [draft.value_column]
                                : []
                          }
                          onChange={(v) =>
                            setDraft({
                              ...draft,
                              value_columns: v,
                              value_column: v[0],
                              show_legend: v.length > 1 ? true : draft.show_legend,
                            })
                          }
                          options={draftFields.map((c) => ({ value: c, label: c }))}
                          placeholder="选 1 个或多个数值列"
                        />
                      </Form.Item>
                      <Form.Item label="标题 / 副标题">
                        <Input
                          value={draft.title}
                          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                          placeholder="标题"
                          style={{ marginBottom: 6 }}
                        />
                        <Input
                          value={draft.subtitle}
                          onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                          placeholder="副标题（可选）"
                        />
                      </Form.Item>
                      <Form.Item label="排序 / TopN">
                        <Space wrap>
                          <Select
                            style={{ width: 110 }}
                            value={draft.sort || 'none'}
                            onChange={(v) => setDraft({ ...draft, sort: v })}
                            options={[
                              { value: 'none', label: '不排序' },
                              { value: 'desc', label: '数值降序' },
                              { value: 'asc', label: '数值升序' },
                            ]}
                          />
                          <InputNumber
                            min={0}
                            max={100}
                            placeholder="Top N"
                            value={draft.top_n ?? undefined}
                            onChange={(v) => setDraft({ ...draft, top_n: v })}
                          />
                        </Space>
                      </Form.Item>
                      <Form.Item label="显示">
                        <Space wrap>
                          <span>
                            <Switch
                              size="small"
                              checked={draft.show_label !== false}
                              onChange={(v) => setDraft({ ...draft, show_label: v })}
                            />{' '}
                            标签
                          </span>
                          <span>
                            <Switch
                              size="small"
                              checked={Boolean(draft.show_legend)}
                              onChange={(v) => setDraft({ ...draft, show_legend: v })}
                            />{' '}
                            图例
                          </span>
                          <span>
                            <Switch
                              size="small"
                              checked={draft.show_grid !== false}
                              onChange={(v) => setDraft({ ...draft, show_grid: v })}
                            />{' '}
                            网格
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
                            draft.chart_type === 'area' ||
                            draft.chart_type === 'hbar') && (
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
                                玫瑰图
                              </span>
                            </>
                          )}
                        </Space>
                      </Form.Item>
                      <Form.Item label="细节">
                        <Space wrap>
                          <span style={{ fontSize: 12 }}>X轴旋转</span>
                          <InputNumber
                            min={0}
                            max={90}
                            value={draft.x_label_rotate ?? 0}
                            onChange={(v) => setDraft({ ...draft, x_label_rotate: v ?? 0 })}
                          />
                          {(draft.chart_type === 'bar' || draft.chart_type === 'hbar') && (
                            <>
                              <span style={{ fontSize: 12 }}>圆角</span>
                              <InputNumber
                                min={0}
                                max={20}
                                value={draft.bar_border_radius ?? 4}
                                onChange={(v) =>
                                  setDraft({ ...draft, bar_border_radius: v ?? 4 })
                                }
                              />
                            </>
                          )}
                          {(draft.chart_type === 'line' || draft.chart_type === 'area') && (
                            <>
                              <span style={{ fontSize: 12 }}>线宽</span>
                              <InputNumber
                                min={1}
                                max={8}
                                step={0.5}
                                value={draft.line_width ?? 2.5}
                                onChange={(v) => setDraft({ ...draft, line_width: v ?? 2.5 })}
                              />
                            </>
                          )}
                        </Space>
                      </Form.Item>
                    </>
                  ) : null}
                  {draft.type === 'Text' ? (
                    <>
                      <Form.Item
                        label="富文本文案"
                        extra="自由排版：标题/加粗/颜色/列表/对齐。点字段插入 {{列名}}。"
                      >
                        <RichTextEditor
                          value={draft.text || ''}
                          onChange={(html) => setDraft({ ...draft, text: html, variant: 'rich' })}
                          minHeight={200}
                        />
                      </Form.Item>
                      <div style={{ marginBottom: 12 }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          插入数据字段：
                        </Typography.Text>
                        <div style={{ marginTop: 4 }}>
                          {draftFields.map((c) => (
                            <Tag
                              key={c}
                              color="blue"
                              style={{ cursor: 'pointer', marginBottom: 4 }}
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  text: `${draft.text || ''}<span>{{${c}}}</span>`,
                                })
                              }
                            >
                              +{`{{${c}}}`}
                            </Tag>
                          ))}
                          {!draftFields.length ? (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              请先对所选数据集取数
                            </Typography.Text>
                          ) : null}
                        </div>
                      </div>
                    </>
                  ) : null}
                  {draft.type === 'Alert' ? (
                    <>
                      <Form.Item label="告警文案">
                        <Input.TextArea
                          rows={3}
                          value={draft.text}
                          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                          placeholder="可插入 {{列名}}"
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
                    {editId ? '更新组件' : '确认并加入组件库'}
                  </Button>
                  <Button
                    block
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      setDraft(null)
                      setEditId(null)
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
                  disabled={!libraryCount}
                  onClick={() => setStep('compose')}
                >
                  去组装画布 →
                </Button>
              </div>
            </div>

            {/* 大预览 — 前端 ECharts 即时渲染，不走服务端截图 */}
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                组件预览
                <Typography.Text type="secondary" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>
                  本地 ECharts 即时渲染（改配置即变，无需等待服务端）
                </Typography.Text>
              </Typography.Title>
              <div
                style={{
                  background: '#fff',
                  borderRadius: 8,
                  padding: 16,
                  minHeight: 400,
                  border: '1px solid #e8e8e8',
                }}
              >
                {!draft || !makerLocal ? (
                  <Empty description="选择左侧组件类型并配置后，此处即时预览" />
                ) : makerLocal.kind === 'chart' ? (
                  <LiveChart
                    labels={makerLocal.labels}
                    series={makerLocal.series}
                    style={makerLocal.style}
                    height={380}
                  />
                ) : makerLocal.kind === 'kpi' ? (
                  <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                    <div style={{ color: '#888', fontSize: 14 }}>{makerLocal.label}</div>
                    <div
                      style={{
                        fontSize: 48,
                        fontWeight: 700,
                        color: '#1677ff',
                        marginTop: 8,
                      }}
                    >
                      {makerLocal.value}
                    </div>
                    <div style={{ color: '#bbb', fontSize: 12, marginTop: 8 }}>
                      {makerLocal.hint}
                    </div>
                  </div>
                ) : makerLocal.kind === 'table' ? (
                  <Table
                    size="small"
                    pagination={false}
                    scroll={{ x: true, y: 320 }}
                    rowKey={(_, i) => String(i)}
                    dataSource={makerLocal.rows.map((row, i) => {
                      const r: Record<string, unknown> = { key: i }
                      makerLocal.columns.forEach((c, j) => {
                        r[c] = row[j]
                      })
                      return r
                    })}
                    columns={makerLocal.columns.map((c) => ({
                      title: c,
                      dataIndex: c,
                      ellipsis: true,
                    }))}
                  />
                ) : makerLocal.kind === 'text' ? (
                  makerLocal.alert ? (
                    <div
                      style={{
                        padding: 24,
                        fontSize: 14,
                        color:
                          makerLocal.level === 'error'
                            ? '#a8071a'
                            : makerLocal.level === 'warning'
                              ? '#d48806'
                              : '#0958d9',
                        background: '#fff2f0',
                        borderRadius: 8,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {makerLocal.text || '（空文案）'}
                    </div>
                  ) : (
                    <div
                      className="comp-rich-preview"
                      style={{
                        padding: 16,
                        lineHeight: 1.65,
                        fontSize: 14,
                        color: '#222',
                      }}
                      dangerouslySetInnerHTML={{
                        __html: makerLocal.text || '<p>（空文案）</p>',
                      }}
                    />
                  )
                ) : makerLocal.kind === 'divider' ? (
                  <div style={{ padding: 40 }}>
                    <div style={{ borderTop: '1px solid #d9d9d9' }} />
                  </div>
                ) : (
                  <Empty description="请完善必填字段后预览" />
                )}
              </div>
            </div>

            {/* 组件库（做组件产出） */}
            <div
              style={{
                width: 168,
                background: '#fafafa',
                borderLeft: '1px solid #f0f0f0',
                overflow: 'auto',
                padding: 8,
                flexShrink: 0,
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                组件库 {libraryCount}
              </Typography.Text>
              <div style={{ fontSize: 10, color: '#999', marginTop: 4, lineHeight: 1.3 }}>
                不会自动上画布；到「组装画布」挑选
              </div>
              {libraryCount === 0 ? (
                <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>暂无</div>
              ) : (
                library.map((n, i) => (
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
                        onClick={() => removeFromLibrary(n.id)}
                      />
                    </div>
                    <div style={{ marginTop: 4 }}>
                      {typeLabel(String(n.type), String(n.props?.chart_type || ''))}
                    </div>
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
                ))
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            步骤 3 · 组装画布（compose）
            - 左侧组件库挑选上板；画布内可删除
            ============================================================ */}
        {step === 'compose' && (
          <div style={{ height: '100%', display: 'flex', minHeight: 0 }}>
            <div
              style={{
                width: 200,
                background: '#fafafa',
                borderRight: '1px solid #f0f0f0',
                overflow: 'auto',
                padding: 10,
                flexShrink: 0,
              }}
            >
              <Typography.Text strong style={{ fontSize: 13 }}>
                组件库
              </Typography.Text>
              <Typography.Paragraph type="secondary" style={{ fontSize: 11, marginTop: 4 }}>
                点「放到画布」加入当前画布；可删除。
              </Typography.Paragraph>
              {libraryCount === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="请回「做组件」添加"
                  style={{ marginTop: 24 }}
                />
              ) : (
                library.map((n) => {
                  const onBoard = cart.some(
                    (c) =>
                      c.id === n.id ||
                      String(c.props?.library_id || '') === n.id ||
                      String(c.props?.library_id || '') ===
                        String(n.props?.library_id || ''),
                  )
                  return (
                    <div
                      key={n.id}
                      style={{
                        marginBottom: 8,
                        background: '#fff',
                        border: '1px solid #eee',
                        borderRadius: 8,
                        padding: 8,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 500 }}>
                        {typeLabel(String(n.type), String(n.props?.chart_type || ''))}
                      </div>
                      <Space size={4} style={{ marginTop: 6 }} wrap>
                        <Button
                          size="small"
                          type={onBoard ? 'default' : 'primary'}
                          disabled={onBoard}
                          onClick={() => placeLibraryOnCanvas(n)}
                        >
                          {onBoard ? '已在画布' : '放到画布'}
                        </Button>
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => removeFromLibrary(n.id)}
                        />
                      </Space>
                    </div>
                  )
                })
              )}
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              <Space style={{ marginBottom: 12 }} wrap>
                <Button onClick={() => setStep('make')}>← 做组件</Button>
                <Button
                  type="primary"
                  disabled={allCartCount === 0}
                  onClick={() => setStep('message')}
                >
                  组装推送 →
                </Button>
              </Space>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                从左侧<strong>挑选</strong>组件到当前画布；画布上手柄可<strong>删除</strong>。
                多画布各自独立选件，下一步合成一条推送。
              </Typography.Paragraph>
              <Space wrap style={{ marginBottom: 10 }}>
                {canvases.map((c) => (
                  <Button
                    key={c.id}
                    type={c.id === effectiveCanvasId ? 'primary' : 'default'}
                    size="small"
                    onClick={() => setActiveCanvasId(c.id)}
                  >
                    {c.name}
                    <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 11 }}>
                      ({canvasChildren(c).length})
                    </Typography.Text>
                  </Button>
                ))}
                <Button
                  size="small"
                  type="dashed"
                  onClick={() => {
                    setArtboard((prev) => {
                      const n = normalizeArtboardDoc(prev)
                      const c = newCanvas(`画布 ${(n.canvases?.length || 0) + 1}`)
                      // 只加画布，segments 由 normalize 自动插入
                      return normalizeArtboardDoc({
                        ...n,
                        canvases: [...(n.canvases || []), c],
                      })
                    })
                  }}
                >
                  + 新画布
                </Button>
                {canvases.length > 1 ? (
                  <Button
                    size="small"
                    danger
                    onClick={() => {
                      if (!effectiveCanvasId) return
                      setArtboard((prev) => {
                        const n = normalizeArtboardDoc(prev)
                        const canvasesNext = (n.canvases || []).filter(
                          (c) => c.id !== effectiveCanvasId,
                        )
                        const segs = (n.compose?.segments || []).filter(
                          (s) => s.type !== 'canvas' || s.canvas_id !== effectiveCanvasId,
                        )
                        setActiveCanvasId(canvasesNext[0]?.id || null)
                        return {
                          ...n,
                          canvases: canvasesNext,
                          tree: canvasesNext[0]?.tree,
                          compose: { ...n.compose, segments: segs },
                        }
                      })
                    }}
                  >
                    删除当前画布
                  </Button>
                ) : null}
              </Space>
              <ComposeCanvas
                canvasWidth={Number(activeCanvas?.width) || canvasWidth}
                canvasMinHeight={420}
                chrome={{
                  show: activeCanvas?.show_chrome !== false,
                  title: String(
                    activeCanvas?.chrome_title ||
                      artboard.artboard?.chrome_title ||
                      name ||
                      '数据推送',
                  ),
                  color: String(
                    activeCanvas?.theme?.color || artboard.artboard?.theme?.color || '#1677ff',
                  ),
                }}
                nodes={cart}
                selectedId={selectedComposeId}
                data={{ fieldsByDataset, rowsByDataset }}
                themeColor={String(
                  activeCanvas?.theme?.color || artboard.artboard?.theme?.color || '#1677ff',
                )}
                onSelect={setSelectedComposeId}
                onChangeLayout={patchComposeLayout}
                onRemove={removeFromCanvas}
                typeLabel={typeLabel}
              />
            </div>

            {/* 右侧：风格 + 位置尺寸 + 主题 */}
            <div
              style={{
                width: 280,
                background: '#fff',
                borderLeft: '1px solid #f0f0f0',
                padding: 12,
                overflow: 'auto',
                flexShrink: 0,
              }}
            >
              <Typography.Text strong>当前画布设置</Typography.Text>
              <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                已放置 {cart.length} 个组件
                {selectedComposeId ? (
                  <Button
                    size="small"
                    danger
                    type="link"
                    style={{ marginLeft: 4 }}
                    onClick={() => removeFromCanvas(selectedComposeId)}
                  >
                    删除选中
                  </Button>
                ) : null}
              </div>
              <div style={{ marginTop: 12 }}>
                <Typography.Text type="secondary">画布名称</Typography.Text>
                <Input
                  style={{ marginTop: 4 }}
                  value={String(activeCanvas?.name || '')}
                  onChange={(e) => {
                    if (!effectiveCanvasId) return
                    setArtboard((prev) =>
                      updateCanvasInDoc(prev, effectiveCanvasId, { name: e.target.value }),
                    )
                  }}
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <Typography.Text type="secondary">整页主题</Typography.Text>
                <Select
                  style={{ width: '100%', marginTop: 4 }}
                  value={activeCanvas?.theme?.pack || artboard.artboard?.theme?.pack || 'business'}
                  onChange={(packId) => {
                    const pack = THEME_PACKS.find((p) => p.id === packId)
                    if (!pack || !effectiveCanvasId) return
                    setArtboard((prev) =>
                      updateCanvasInDoc(prev, effectiveCanvasId, {
                        theme: {
                          ...(activeCanvas?.theme || {}),
                          pack: pack.id,
                          color: pack.color,
                        },
                      }),
                    )
                  }}
                  options={THEME_PACKS.map((p) => ({ value: p.id, label: p.label }))}
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <Typography.Text type="secondary">顶栏标题</Typography.Text>
                <Input
                  style={{ marginTop: 4 }}
                  value={String(activeCanvas?.chrome_title || '')}
                  onChange={(e) => {
                    if (!effectiveCanvasId) return
                    setArtboard((prev) =>
                      updateCanvasInDoc(prev, effectiveCanvasId, {
                        chrome_title: e.target.value,
                      }),
                    )
                  }}
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <Switch
                  checked={activeCanvas?.show_chrome !== false}
                  onChange={(v) => {
                    if (!effectiveCanvasId) return
                    setArtboard((prev) =>
                      updateCanvasInDoc(prev, effectiveCanvasId, { show_chrome: v }),
                    )
                  }}
                />{' '}
                显示顶栏
              </div>

              {selectedCompose && tree ? (
                <div style={{ marginTop: 20 }}>
                  <Typography.Text strong>选中组件</Typography.Text>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                    {typeLabel(
                      String(selectedCompose.type),
                      String(selectedCompose.props?.chart_type || ''),
                    )}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <Typography.Text type="secondary">风格</Typography.Text>
                    <Select
                      style={{ width: '100%', marginTop: 4 }}
                      value={String(selectedCompose.props?.compose_style || 'card')}
                      options={COMPOSE_STYLE_OPTIONS}
                      onChange={(v) =>
                        patchComposeLayout(selectedCompose.id, { compose_style: v })
                      }
                    />
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 8,
                    }}
                  >
                    <div>
                      <Typography.Text type="secondary">X</Typography.Text>
                      <InputNumber
                        style={{ width: '100%', marginTop: 4 }}
                        min={0}
                        max={canvasWidth - 40}
                        value={Number(selectedCompose.props?.compose_x ?? 12)}
                        onChange={(v) =>
                          patchComposeLayout(selectedCompose.id, {
                            compose_x: Math.round(Number(v ?? 0)),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Typography.Text type="secondary">Y</Typography.Text>
                      <InputNumber
                        style={{ width: '100%', marginTop: 4 }}
                        min={0}
                        value={Number(selectedCompose.props?.compose_y ?? 12)}
                        onChange={(v) =>
                          patchComposeLayout(selectedCompose.id, {
                            compose_y: Math.round(Number(v ?? 0)),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Typography.Text type="secondary">宽</Typography.Text>
                      <InputNumber
                        style={{ width: '100%', marginTop: 4 }}
                        min={40}
                        max={canvasWidth}
                        step={4}
                        value={Number(selectedCompose.props?.compose_w ?? canvasWidth - 24)}
                        onChange={(v) =>
                          patchComposeLayout(selectedCompose.id, {
                            compose_w: Math.round(Number(v ?? 40)),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Typography.Text type="secondary">高</Typography.Text>
                      <InputNumber
                        style={{ width: '100%', marginTop: 4 }}
                        min={24}
                        max={2000}
                        step={4}
                        value={Number(selectedCompose.props?.compose_h ?? 200)}
                        onChange={(v) =>
                          patchComposeLayout(selectedCompose.id, {
                            compose_h: Math.round(Number(v ?? 24)),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#999' }}>
                    也可在画布上拖右下角自由缩放（最小 40×24）
                  </div>

                  {/* —— 内容样式：字号 / 字重 / 颜色 / 对齐 —— */}
                  <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                    <Typography.Text strong>内容样式</Typography.Text>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      字号、字重、颜色、对齐（文案/KPI/告警/表）；图表另可调标题与标签
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                      }}
                    >
                      <div>
                        <Typography.Text type="secondary">正文字号</Typography.Text>
                        <InputNumber
                          style={{ width: '100%', marginTop: 4 }}
                          min={10}
                          max={72}
                          placeholder="默认"
                          value={
                            selectedCompose.props?.content_font_size != null
                              ? Number(selectedCompose.props.content_font_size)
                              : undefined
                          }
                          onChange={(v) =>
                            patchComposeLayout(selectedCompose.id, {
                              content_font_size: v == null ? undefined : Number(v),
                            } as Partial<ComposeLayout>)
                          }
                        />
                      </div>
                      <div>
                        <Typography.Text type="secondary">字重</Typography.Text>
                        <Select
                          style={{ width: '100%', marginTop: 4 }}
                          allowClear
                          placeholder="默认"
                          value={
                            selectedCompose.props?.content_font_weight != null
                              ? String(selectedCompose.props.content_font_weight)
                              : undefined
                          }
                          options={[
                            { value: '400', label: '常规' },
                            { value: '500', label: '中等' },
                            { value: '600', label: '半粗' },
                            { value: '700', label: '加粗' },
                          ]}
                          onChange={(v) =>
                            patchComposeLayout(selectedCompose.id, {
                              content_font_weight: v || undefined,
                            } as Partial<ComposeLayout>)
                          }
                        />
                      </div>
                      <div>
                        <Typography.Text type="secondary">对齐</Typography.Text>
                        <Select
                          style={{ width: '100%', marginTop: 4 }}
                          allowClear
                          placeholder="默认"
                          value={
                            selectedCompose.props?.content_align
                              ? String(selectedCompose.props.content_align)
                              : undefined
                          }
                          options={[
                            { value: 'left', label: '左' },
                            { value: 'center', label: '中' },
                            { value: 'right', label: '右' },
                          ]}
                          onChange={(v) =>
                            patchComposeLayout(selectedCompose.id, {
                              content_align: v || undefined,
                            } as Partial<ComposeLayout>)
                          }
                        />
                      </div>
                      <div>
                        <Typography.Text type="secondary">行高</Typography.Text>
                        <InputNumber
                          style={{ width: '100%', marginTop: 4 }}
                          min={1}
                          max={3}
                          step={0.05}
                          placeholder="1.55"
                          value={
                            selectedCompose.props?.content_line_height != null
                              ? Number(selectedCompose.props.content_line_height)
                              : undefined
                          }
                          onChange={(v) =>
                            patchComposeLayout(selectedCompose.id, {
                              content_line_height: v == null ? undefined : Number(v),
                            } as Partial<ComposeLayout>)
                          }
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <Typography.Text type="secondary">文字颜色</Typography.Text>
                      <div style={{ marginTop: 4 }}>
                        <ColorPicker
                          allowClear
                          value={
                            selectedCompose.props?.content_color
                              ? String(selectedCompose.props.content_color)
                              : undefined
                          }
                          onChange={(c) =>
                            patchComposeLayout(selectedCompose.id, {
                              content_color: c ? colorToHex(c) : '',
                            } as Partial<ComposeLayout>)
                          }
                        />
                      </div>
                    </div>

                    {(selectedCompose.type === 'Kpi' ||
                      selectedCompose.type === 'Text' ||
                      selectedCompose.type === 'Alert') && (
                      <div style={{ marginTop: 10 }}>
                        <Typography.Text type="secondary">
                          {selectedCompose.type === 'Kpi' ? '标签字号' : '辅助字号'}
                        </Typography.Text>
                        <InputNumber
                          style={{ width: '100%', marginTop: 4 }}
                          min={10}
                          max={48}
                          placeholder={selectedCompose.type === 'Kpi' ? '自动' : '可选'}
                          value={
                            selectedCompose.props?.label_font_size != null
                              ? Number(selectedCompose.props.label_font_size)
                              : undefined
                          }
                          onChange={(v) =>
                            patchComposeLayout(selectedCompose.id, {
                              label_font_size: v == null ? undefined : Number(v),
                            } as Partial<ComposeLayout>)
                          }
                        />
                      </div>
                    )}

                    {selectedCompose.type === 'Chart' ? (
                      <div style={{ marginTop: 12 }}>
                        <Typography.Text type="secondary">图表字号</Typography.Text>
                        <div
                          style={{
                            marginTop: 6,
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 8,
                          }}
                        >
                          <div>
                            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                              标题
                            </Typography.Text>
                            <InputNumber
                              style={{ width: '100%', marginTop: 2 }}
                              min={10}
                              max={36}
                              placeholder="15"
                              value={
                                selectedCompose.props?.title_font_size != null
                                  ? Number(selectedCompose.props.title_font_size)
                                  : undefined
                              }
                              onChange={(v) =>
                                patchComposeLayout(selectedCompose.id, {
                                  title_font_size: v == null ? undefined : Number(v),
                                } as Partial<ComposeLayout>)
                              }
                            />
                          </div>
                          <div>
                            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                              数据标签
                            </Typography.Text>
                            <InputNumber
                              style={{ width: '100%', marginTop: 2 }}
                              min={8}
                              max={24}
                              placeholder="10"
                              value={
                                selectedCompose.props?.chart_label_size != null
                                  ? Number(selectedCompose.props.chart_label_size)
                                  : undefined
                              }
                              onChange={(v) =>
                                patchComposeLayout(selectedCompose.id, {
                                  chart_label_size: v == null ? undefined : Number(v),
                                } as Partial<ComposeLayout>)
                              }
                            />
                          </div>
                          <div>
                            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                              坐标轴
                            </Typography.Text>
                            <InputNumber
                              style={{ width: '100%', marginTop: 2 }}
                              min={8}
                              max={20}
                              placeholder="11"
                              value={
                                selectedCompose.props?.axis_font_size != null
                                  ? Number(selectedCompose.props.axis_font_size)
                                  : undefined
                              }
                              onChange={(v) =>
                                patchComposeLayout(selectedCompose.id, {
                                  axis_font_size: v == null ? undefined : Number(v),
                                } as Partial<ComposeLayout>)
                              }
                            />
                          </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <Switch
                            size="small"
                            checked={selectedCompose.props?.show_label !== false}
                            onChange={(v) =>
                              patchComposeLayout(selectedCompose.id, {
                                show_label: v,
                              } as Partial<ComposeLayout>)
                            }
                          />{' '}
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            显示数据标签
                          </Typography.Text>
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <Switch
                            size="small"
                            checked={Boolean(selectedCompose.props?.show_legend)}
                            onChange={(v) =>
                              patchComposeLayout(selectedCompose.id, {
                                show_legend: v,
                              } as Partial<ComposeLayout>)
                            }
                          />{' '}
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            显示图例
                          </Typography.Text>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <Typography.Text type="secondary">圆角</Typography.Text>
                    <InputNumber
                      style={{ width: '100%', marginTop: 4 }}
                      min={0}
                      max={32}
                      value={Number(selectedCompose.props?.compose_radius ?? 8)}
                      onChange={(v) =>
                        patchComposeLayout(selectedCompose.id, {
                          compose_radius: Number(v ?? 0),
                        })
                      }
                    />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Typography.Text type="secondary">内边距</Typography.Text>
                    <InputNumber
                      style={{ width: '100%', marginTop: 4 }}
                      min={0}
                      max={48}
                      value={Number(selectedCompose.props?.compose_padding ?? 0)}
                      onChange={(v) =>
                        patchComposeLayout(selectedCompose.id, {
                          compose_padding: Number(v ?? 0),
                        })
                      }
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <Typography.Text type="secondary">边框/强调色</Typography.Text>
                    <div style={{ marginTop: 4 }}>
                      <ColorPicker
                        allowClear
                        value={
                          selectedCompose.props?.compose_color
                            ? String(selectedCompose.props.compose_color)
                            : undefined
                        }
                        onChange={(c) =>
                          patchComposeLayout(selectedCompose.id, {
                            compose_color: c ? colorToHex(c) : '',
                          })
                        }
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Typography.Text type="secondary">背景色</Typography.Text>
                    <div style={{ marginTop: 4 }}>
                      <ColorPicker
                        allowClear
                        value={
                          selectedCompose.props?.compose_bg
                            ? String(selectedCompose.props.compose_bg)
                            : undefined
                        }
                        onChange={(c) =>
                          patchComposeLayout(selectedCompose.id, {
                            compose_bg: c ? colorToHex(c) : '',
                          })
                        }
                      />
                    </div>
                  </div>

                  <Button
                    size="small"
                    style={{ marginTop: 12 }}
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
                  message="点画布上的组件：拖拽缩放尺寸，右侧调字号/颜色/对齐等"
                />
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            步骤 4 · 组装推送（message）
            - segments：文案 / 多画布交错，顺序即钉钉 parts
            - 右侧钉钉手机实时预览（本地 Live，无 Playwright）
            ============================================================ */}
        {step === 'message' && (
          <div style={{ height: '100%', display: 'flex', minHeight: 0 }}>
            <div style={{ flex: '1 1 52%', overflow: 'auto', padding: 16, minWidth: 360 }}>
              <Space style={{ marginBottom: 12 }} wrap>
                <Button onClick={() => setStep('compose')}>← 组装画布</Button>
                <Button type="primary" onClick={() => setStep('preview')}>
                  预览推送 →
                </Button>
                <Button size="small" onClick={() => addTextSegment()}>
                  + 文案段
                </Button>
              </Space>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                本步编排的是<strong>一条钉钉推送</strong>：多画布会<strong>纵向合成一张图</strong>，文案合并为一段钉钉
                Markdown，不会变成多条群消息。右侧按真实手机宽度模拟到达效果（本地实时，无消息内滚动条）。
                {'{{列名}}'} 用样例首行替换示意。
              </Typography.Paragraph>

              <div style={{ marginBottom: 16 }}>
                <Typography.Text type="secondary">消息标题（钉钉通知标题，纯文本）</Typography.Text>
                <Input
                  style={{ marginTop: 4 }}
                  value={String(artboard.compose?.title || '')}
                  onChange={(e) => patchCompose({ title: e.target.value })}
                  placeholder="数据推送"
                />
              </div>

              <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                消息段落（拖序用上下箭头）
              </Typography.Text>

              {composeSegments.map((seg, idx) => {
                if (seg.type === 'canvas') {
                  const c = canvases.find((x) => x.id === seg.canvas_id)
                  return (
                    <div
                      key={seg.id}
                      style={{
                        marginBottom: 12,
                        padding: 12,
                        border: '1px dashed #91caff',
                        borderRadius: 8,
                        background: '#f0f7ff',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <div>
                          <Tag color="blue">画布（合成进一张图）</Tag>
                          <Typography.Text strong>
                            {c?.name || seg.canvas_id}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                            {canvasChildren(c).length} 个组件 · 与其它画布纵向拼成 1 条推送
                          </Typography.Text>
                        </div>
                        <Space size={4}>
                          <Button
                            size="small"
                            disabled={idx === 0}
                            onClick={() => moveSegment(idx, -1)}
                          >
                            ↑
                          </Button>
                          <Button
                            size="small"
                            disabled={idx >= composeSegments.length - 1}
                            onClick={() => moveSegment(idx, 1)}
                          >
                            ↓
                          </Button>
                          <Button size="small" onClick={() => setStep('compose')}>
                            编辑画布
                          </Button>
                        </Space>
                      </div>
                    </div>
                  )
                }
                return (
                  <div
                    key={seg.id}
                    style={{
                      marginBottom: 12,
                      padding: 12,
                      border: '1px solid #f0f0f0',
                      borderRadius: 8,
                      background: '#fff',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Space size={6}>
                        <Tag>文案</Tag>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          第 {idx + 1} 段
                        </Typography.Text>
                      </Space>
                      <Space size={4} wrap>
                        <Select
                          size="small"
                          placeholder="插入字段"
                          style={{ width: 130 }}
                          options={(
                            fieldsByDataset.main ||
                            fieldsByDataset[activeDatasetId] ||
                            []
                          ).map((col) => ({ value: col, label: col }))}
                          onChange={(col: string) => {
                            if (!col) return
                            patchSegmentHtml(
                              seg.id,
                              appendFieldToken(String(seg.html || ''), col),
                            )
                          }}
                        />
                        <Button
                          size="small"
                          disabled={idx === 0}
                          onClick={() => moveSegment(idx, -1)}
                        >
                          ↑
                        </Button>
                        <Button
                          size="small"
                          disabled={idx >= composeSegments.length - 1}
                          onClick={() => moveSegment(idx, 1)}
                        >
                          ↓
                        </Button>
                        <Button size="small" onClick={() => addTextSegment(idx)}>
                          + 后插
                        </Button>
                        <Button size="small" danger onClick={() => removeSegment(seg.id)}>
                          清空/删
                        </Button>
                      </Space>
                    </div>
                    <RichTextEditor
                      compact
                      minHeight={110}
                      value={String(seg.html || '')}
                      onChange={(html) => patchSegmentHtml(seg.id, html)}
                      placeholder="钉钉风格文案：标题、加粗、颜色、列表、链接… 例：【{{院区}}】运营日报"
                    />
                  </div>
                )
              })}

              <div style={{ marginBottom: 12, marginTop: 8 }}>
                <Switch
                  checked={Boolean(artboard.compose?.include_component_md)}
                  onChange={(v) => patchCompose({ include_component_md: v, markdown_caption: v })}
                />{' '}
                <Typography.Text type="secondary">
                  额外附带组件树 Markdown 摘要（一般不需要）
                </Typography.Text>
              </div>

              <div style={{ marginBottom: 12 }}>
                <Typography.Text type="secondary">推送模式</Typography.Text>
                <Select
                  style={{ width: '100%', marginTop: 4 }}
                  value={String(artboard.compose?.mode || 'image_primary')}
                  onChange={(v) => patchCompose({ mode: v })}
                  options={[
                    { value: 'image_primary', label: '图为主（推荐：按段落发文案 + 多图画布）' },
                    { value: 'image_only', label: '仅推送画布图' },
                    { value: 'markdown_primary', label: '仅 Markdown 文案（不成图）' },
                    { value: 'mixed', label: '混合（图 + 组件 Markdown）' },
                  ]}
                />
              </div>
            </div>

            {/* 右侧：钉钉手机实时预览 */}
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                padding: 16,
                background: 'linear-gradient(160deg,#e8eef5 0%,#f5f5f5 50%,#eceff3 100%)',
                borderLeft: '1px solid #e8e8e8',
              }}
            >
              <Typography.Title level={5} style={{ marginTop: 0, textAlign: 'center' }}>
                推送到达效果（一条消息）
              </Typography.Title>
              <Typography.Paragraph
                type="secondary"
                style={{ fontSize: 12, textAlign: 'center', marginBottom: 12 }}
              >
                375 逻辑宽手机 · 钉钉 Markdown 卡片 + 合成推送图
                <br />
                终片 PNG 见第 5 步编译（与正式投递一致）
              </Typography.Paragraph>
              <DingTalkPhonePreview content={livePushContent} deviceWidth={375} deviceHeight={780} />
              {String(artboard.compose?.mode || '') === 'markdown_primary' ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 12, maxWidth: 375, marginLeft: 'auto', marginRight: 'auto' }}
                  message="当前为「仅 Markdown」，不会附带画布截图"
                />
              ) : null}
              {canvases.length > 1 ? (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 12, maxWidth: 375, marginLeft: 'auto', marginRight: 'auto' }}
                  message={`当前 ${canvases.length} 个画布将合成 1 张推送图（1 条消息）`}
                />
              ) : null}
            </div>
          </div>
        )}

        {/* ============================================================
            步骤 5 · 预览推送（preview）
            - 服务端 studioCompile：HTML / PNG / Markdown / 解析参数
            - 试推 studioTestPush、保存 studioSaveJob
            - 样例预演；正式推送仍按当时数据动态渲染
            ============================================================ */}
        {step === 'preview' && (
          <div style={{ height: '100%', overflow: 'auto', padding: 16 }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              <Space style={{ marginBottom: 12 }} wrap>
                <Button onClick={() => setStep('message')}>← 组装推送</Button>
                <Button
                  type="primary"
                  loading={finalLoading}
                  onClick={() => {
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
                  重新编译
                </Button>
                <Button loading={pushing} onClick={() => void onTestPush()}>
                  试推
                </Button>
              </Space>

              {finalError ? (
                <Alert type="error" showIcon style={{ marginBottom: 12 }} message={finalError} />
              ) : null}

              <Typography.Title level={5}>样例预演（当前参数 / 当前取数）</Typography.Title>
              <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                下方是用<strong>此刻工作台样例数据</strong>渲染的终片，用于验收模板。
                正式调度或试推时会<strong>重新解析参数、重新取数、重新成图</strong>再投递（图前/图/图后结构一致）。
              </Typography.Paragraph>

              {/* 本次编译实际用到的 SQL 参数 — 强化「模板动态渲染」 */}
              <div
                style={{
                  background: '#fff',
                  borderRadius: 8,
                  padding: 16,
                  border: '1px solid #e8e8e8',
                  marginBottom: 16,
                }}
              >
                <Typography.Text strong>本次编译解析参数</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
                  工作台保存的是模板；这里是<strong>这一次</strong>预览时 SQL {'{{参数}}'} 被解析成的值（含
                  yesterday/today 等自动日期）。调度推送时会按当时再算一遍。
                </Typography.Paragraph>
                {finalLoading && !finalPreview ? (
                  <Spin size="small" />
                ) : finalPreview?.resolved_params &&
                  Object.keys(finalPreview.resolved_params).length > 0 ? (
                  <>
                    <Table
                      size="small"
                      pagination={false}
                      rowKey="name"
                      dataSource={Object.entries(finalPreview.resolved_params).map(
                        ([name, value]) => ({ name, value }),
                      )}
                      columns={[
                        { title: '参数名', dataIndex: 'name', width: 160 },
                        {
                          title: '本次解析值',
                          dataIndex: 'value',
                          render: (v: string) => (
                            <Typography.Text code style={{ fontSize: 12 }}>
                              {v}
                            </Typography.Text>
                          ),
                        },
                      ]}
                    />
                    {finalPreview.resolved_params_by_dataset &&
                    Object.keys(finalPreview.resolved_params_by_dataset).length > 1 ? (
                      <div style={{ marginTop: 12 }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          分数据集
                        </Typography.Text>
                        {Object.entries(finalPreview.resolved_params_by_dataset).map(
                          ([dsId, map]) => (
                            <div key={dsId} style={{ marginTop: 6, fontSize: 12 }}>
                              <Tag>{dsId}</Tag>
                              {Object.entries(map)
                                .map(([k, v]) => `${k}=${v}`)
                                .join(' · ')}
                            </div>
                          ),
                        )}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    本次编译未返回参数表（SQL 可能无 {'{{占位}}'}，或尚未完成编译）。
                    可在「数据」步为 SQL 配置 auto 参数后重新编译。
                  </Typography.Text>
                )}
                {finalPreview != null ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                    取数行数：{finalPreview.row_count ?? '—'}
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  background: '#fff',
                  borderRadius: 8,
                  padding: 16,
                  border: '1px solid #e8e8e8',
                  marginBottom: 16,
                }}
              >
                {!isEmptyRichHtml(shellPreview.before) ? (
                  looksLikeHtml(shellPreview.before) ? (
                    <div
                      className="comp-rich-preview"
                      style={{ marginBottom: 12, lineHeight: 1.6 }}
                      dangerouslySetInnerHTML={{ __html: shellPreview.before }}
                    />
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap', marginBottom: 12, lineHeight: 1.6 }}>
                      {shellPreview.before}
                    </div>
                  )
                ) : null}
                <RenderPreview
                  loading={finalLoading}
                  image={finalPreview?.image_base64}
                  html={
                    artboard.compose?.mode === 'markdown_primary'
                      ? null
                      : finalPreview?.html
                  }
                  error={finalPreview?.image_error || finalError}
                  emptyHint="正在生成或清单为空"
                  minHeight={320}
                />
                {!isEmptyRichHtml(shellPreview.after) ? (
                  looksLikeHtml(shellPreview.after) ? (
                    <div
                      className="comp-rich-preview"
                      style={{ marginTop: 12, lineHeight: 1.6 }}
                      dangerouslySetInnerHTML={{ __html: shellPreview.after }}
                    />
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap', marginTop: 12, lineHeight: 1.6 }}>
                      {shellPreview.after}
                    </div>
                  )
                ) : null}
              </div>

              {finalPreview?.parts?.length ? (
                <div style={{ marginBottom: 16 }}>
                  <Typography.Text type="secondary">消息 parts</Typography.Text>
                  <div style={{ marginTop: 6 }}>
                    {finalPreview.parts.map((p, i) => (
                      <Tag key={i} color={p.kind === 'image' ? 'blue' : 'default'}>
                        {i + 1}. {p.kind}
                        {p.content_preview ? ` · ${p.content_preview.slice(0, 40)}` : ''}
                      </Tag>
                    ))}
                  </div>
                </div>
              ) : null}

              <div
                style={{
                  marginTop: 8,
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
