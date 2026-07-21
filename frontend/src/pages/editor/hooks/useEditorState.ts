/**
 * 编辑器核心状态 hook。
 *
 * 从 EditorPage.tsx 提取所有 state、handler、effect，
 * 同时供 EditorPage（五步向导）和 EditorPageV2（三栏布局）使用。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { message } from 'antd'
import {
  getPushJob,
  listChannels,
  listDataSources,
  queryPreview,
  resolveSqlParams,
  studioCompile,
  studioSaveJob,
  studioTestPush,
} from '../../../api'
import { getErrorMessage } from '../../../api/client'
import type {
  ArtboardDoc,
  Channel,
  DataSource,
  SqlParamDef,
  StudioCompileResponse,
  StudioComposeSegment,
  StudioNode,
} from '../../../api/types'
import {
  canvasChildren,
  cloneNodeForCanvas,
  listCanvases,
  newCanvas,
  normalizeArtboardDoc,
  setCanvasTree,
} from '../artboardModel'
import {
  defaultAlertArtboard,
  defaultDailyArtboard,
  emptyArtboard,
  extractArtboardFromJob,
  nid,
  removeNode,
  syncMainDataset,
  upsertDataset,
} from '../studioUtils'

type StepKey = 'data' | 'make' | 'compose' | 'message' | 'preview'

// ---- Draft types (local to editor) ----
interface DraftForm {
  type: string
  label: string
  dataset_id: string
  field?: string
  value_field?: string
  category_field?: string
  kpi_value_field?: string
  kpi_label?: string
  kpi_sub?: string
  alert_level?: string
  alert_message_field?: string
  chart_type?: string
  table_style?: string
  columns?: { field: string; label?: string; width?: number; align?: string }[]
  width?: number
  height?: number
  color?: string
  bg?: string
  theme_pack?: string
  rich_html?: string
  [key: string]: unknown
}

export function useEditorState(jobId?: string) {
  const navigate = useNavigate()

  // ---- State ----
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
  const [exportImageRef, setExportImageRef] = useState('push-image.png')

  // ---- Derived state ----
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
  const cart = useMemo(() => canvasChildren(activeCanvas), [activeCanvas])
  const library = useMemo(() => artboard.library || [], [artboard.library])
  const libraryCount = library.length
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

  // ---- Data loading ----
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

  // ---- Build doc ----
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

  // ---- Compile ----
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

  // Auto-compile when on preview step with data + components
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

  // ---- SQL params ----
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
    const slotSql = activeDatasetId === 'main' ? sql : String(activeDs?.sql || '')
    try {
      const res = await resolveSqlParams({ sql: slotSql, param_defs: activeParamDefs })
      setResolvedPreview(res.resolved || {})
    } catch { /* ignore */ }
  }

  useEffect(() => {
    void refreshResolvedPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDatasetId, sql, activeDs?.sql, JSON.stringify(activeParamDefs)])

  // ---- Query ----
  const onQueryDataset = async (datasetId: string) => {
    const dsMeta = datasets.find((d) => d.id === datasetId)
    const slotSql = datasetId === 'main' ? sql : String(dsMeta?.sql || '')
    const slotDs = String(
      datasetId === 'main' ? dataSourceId : dsMeta?.data_source_id || dataSourceId || '',
    )
    if (!slotDs) { message.error('请先为该数据集选择数据源'); return }
    if (!slotSql.trim()) { message.error('请填写 SQL'); return }
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
            id: 'main', name: dsMeta?.name || '主查询', data_source_id: slotDs, sql: slotSql, params: paramDefs,
          }),
        )
        setDataSourceId(slotDs)
        setSql(slotSql)
      } else {
        setArtboard((p) =>
          upsertDataset(p, { id: datasetId, name: dsMeta?.name, data_source_id: slotDs, sql: slotSql, params: paramDefs }),
        )
      }
    } catch (err) { message.error(getErrorMessage(err)) }
    finally { setQuerying(false) }
  }

  const addDataset = () => {
    const nextId = `ds_${Date.now()}`
    setArtboard((p) =>
      normalizeArtboardDoc({
        ...p,
        datasets: [...(p.datasets || []), { id: nextId, name: nextId, data_source_id: dataSourceId || null, sql: '', params: [] }],
      }),
    )
    setActiveDatasetId(nextId)
  }

  const removeDataset = (id: string) => {
    if (id === 'main') { message.warning('主数据集不能删除'); return }
    setArtboard((p) => {
      const n = normalizeArtboardDoc(p)
      return { ...n, datasets: (n.datasets || []).filter((d) => d.id !== id) }
    })
    if (activeDatasetId === id) setActiveDatasetId('main')
  }

  // ---- Component authoring ----
  const startNew = (type: string) => {
    setEditId(null)
    setDraft({
      type,
      label: '',
      dataset_id: activeDatasetId,
      field: '',
      value_field: '',
      category_field: '',
      chart_type: 'bar',
      table_style: 'default',
      color: '#1677ff',
      width: 600,
      height: 300,
    })
  }

  const addToCart = () => {
    if (!draft) return
    if (!draft.label?.trim()) { message.warning('请输入组件标签'); return }
    const node: StudioNode = {
      id: editId || nid(),
      type: draft.type as StudioNode['type'],
      props: {
        label: draft.label,
        dataset_id: draft.dataset_id,
        field: draft.field,
        value_field: draft.value_field,
        category_field: draft.category_field,
        kpi_value_field: draft.kpi_value_field,
        kpi_label: draft.kpi_label,
        kpi_sub: draft.kpi_sub,
        alert_level: draft.alert_level || 'info',
        alert_message_field: draft.alert_message_field,
        chart_type: draft.chart_type || 'bar',
        table_style: draft.table_style || 'default',
        width: draft.width || 600,
        height: draft.height || 300,
        color: draft.color || '#1677ff',
        bg: draft.bg,
        theme_pack: draft.theme_pack,
        columns: draft.columns,
        rich_html: draft.rich_html,
      },
    }
    if (editId) {
      // Update existing
      setArtboard((prev) => {
        const lib = (prev.library || []).map((n) => (n.id === editId ? node : n))
        return { ...prev, library: lib }
      })
    } else {
      setArtboard((prev) => ({ ...prev, library: [...(prev.library || []), node] }))
      setStep('compose')
    }
    setEditId(null)
    setDraft(null)
  }

  // ---- Canvas ----
  const placeLibraryOnCanvas = (nodeId: string) => {
    const src = library.find((n) => n.id === nodeId)
    if (!src) return
    const canvasId = effectiveCanvasId || canvases[0]?.id
    if (!canvasId) { message.warning('请先创建画布'); return }
    setArtboard((prev) => {
      const n = normalizeArtboardDoc(prev)
      const idx = n.canvases!.findIndex((c) => c.id === canvasId)
      if (idx === -1) return n
      const updated = [...n.canvases!]
      const canvas = { ...updated[idx] }
      const children = canvas.tree?.children || []
      const autoY = children.reduce((max, ch) => Math.max(max, (ch.props?.compose_y as number) || 0), 0) + 20
      const cloned = cloneNodeForCanvas(src, { nextY: autoY })
      canvas.tree = { ...canvas.tree, children: [...children, cloned] }
      updated[idx] = canvas
      return { ...n, canvases: updated }
    })
  }

  const removeFromCanvas = (nodeId: string) => {
    setArtboard((prev) => {
      const n = normalizeArtboardDoc(prev)
      const cid = effectiveCanvasId || n.canvases?.[0]?.id
      if (!cid) return n
      const idx = n.canvases!.findIndex((c) => c.id === cid)
      if (idx === -1) return n
      const updated = [...n.canvases!]
      const canvas = { ...updated[idx] }
      canvas.tree = removeNode(canvas.tree, nodeId)
      updated[idx] = canvas
      return { ...n, canvases: updated }
    })
    if (selectedComposeId === nodeId) setSelectedComposeId(null)
  }

  const removeFromLibrary = (nodeId: string) => {
    setArtboard((prev) => {
      const n = normalizeArtboardDoc(prev)
      return { ...n, library: (n.library || []).filter((x) => x.id !== nodeId) }
    })
  }

  const patchComposeLayout = (nodeId: string, layout: Record<string, unknown>) => {
    setArtboard((prev) => {
      const n = normalizeArtboardDoc(prev)
      const cid = effectiveCanvasId || n.canvases?.[0]?.id
      if (!cid) return n
      const idx = n.canvases!.findIndex((c) => c.id === cid)
      if (idx === -1) return n
      const updated = [...n.canvases!]
      const canvas = { ...updated[idx] }
      const walk = (node: StudioNode): StudioNode => {
        if (node.id === nodeId) return { ...node, props: { ...node.props, ...layout } }
        return { ...node, children: node.children?.map(walk) }
      }
      canvas.tree = walk(canvas.tree)
      updated[idx] = canvas
      return { ...n, canvases: updated }
    })
  }

  const onAddCanvas = () => {
    setArtboard((prev) => {
      const n = normalizeArtboardDoc(prev)
      return { ...n, canvases: [...(n.canvases || []), newCanvas(`画布 ${(n.canvases?.length || 0) + 1}`)] }
    })
  }

  // ---- Segments ----
  const setSegments = (segments: StudioComposeSegment[]) => {
    setArtboard((prev) => {
      const n = normalizeArtboardDoc(prev)
      return { ...n, compose: { ...n.compose, text_format: 'html', segments } }
    })
  }

  const patchSegmentHtml = (idx: number, html: string) => {
    setArtboard((prev) => {
      const n = normalizeArtboardDoc(prev)
      const segs = [...(n.compose?.segments || [])]
      if (segs[idx]) segs[idx] = { ...segs[idx], html } as StudioComposeSegment
      return { ...n, compose: { ...n.compose, text_format: 'html', segments: segs } }
    })
  }

  const moveSegment = (from: number, to: number) => {
    setArtboard((prev) => {
      const n = normalizeArtboardDoc(prev)
      const segs = [...(n.compose?.segments || [])]
      const [item] = segs.splice(from, 1)
      segs.splice(to, 0, item!)
      return { ...n, compose: { ...n.compose, text_format: 'html', segments: segs } }
    })
  }

  const addTextSegment = (at: number) => {
    setArtboard((prev) => {
      const n = normalizeArtboardDoc(prev)
      const segs = [...(n.compose?.segments || [])]
      segs.splice(at, 0, { id: nid(), type: 'text' as const, html: '' })
      return { ...n, compose: { ...n.compose, text_format: 'html', segments: segs } }
    })
  }

  const removeSegment = (idx: number) => {
    setArtboard((prev) => {
      const n = normalizeArtboardDoc(prev)
      const segs = (n.compose?.segments || []).filter((_, i) => i !== idx)
      if (segs.length === 0 || !segs.some((s) => s.type !== 'text')) {
        // keep at least one non-text segment
        return n
      }
      return { ...n, compose: { ...n.compose, text_format: 'html', segments: segs } }
    })
  }

  // ---- Templates ----
  const applyTemplate = (kind: 'daily' | 'alert') => {
    const tmpl = kind === 'alert' ? defaultAlertArtboard() : defaultDailyArtboard()
    tmpl.datasets = (tmpl.datasets || []).map((d) => {
      if (d.id === 'main' && dataSourceId) {
        return { ...d, data_source_id: dataSourceId, sql: sql || d.sql }
      }
      return d
    })
    setArtboard(normalizeArtboardDoc(tmpl))
    setActiveDatasetId('main')
    setFieldsByDataset({})
    setRowsByDataset({})
    setStep('make')
  }

  // ---- Save ----
  const onSave = useCallback(async () => {
    if (!name.trim()) { message.warning('请输入作业名称'); return }
    setSaving(true)
    try {
      const doc = buildDoc()
      const res = await studioSaveJob({
        name,
        data_source_id: dataSourceId!,
        artboard: doc,
        query_sql: sql,
        channel_ids: channelIds,
      })
      setCurrentJobId(res.id)
      message.success('保存成功')
    } catch (err) { message.error(getErrorMessage(err)) }
    finally { setSaving(false) }
  }, [name, dataSourceId, sql, channelIds, buildDoc])

  // ---- Test push ----
  const onTestPush = useCallback(async () => {
    if (!dataSourceId) { message.warning('请先选择数据源'); return }
    if (!channelIds.length) { message.warning('请选择推送通道'); return }
    setPushing(true)
    try {
      await studioTestPush({
        artboard: buildDoc(),
        data_source_id: dataSourceId,
        sql,
        channel_ids: channelIds,
        max_rows: 50,
      })
      message.success('推送成功')
    } catch (err) { message.error(getErrorMessage(err)) }
    finally { setPushing(false) }
  }, [dataSourceId, sql, channelIds, buildDoc])

  // ---- Return everything ----
  return {
    // State
    step, setStep, loading, sources, channels,
    name, setName, dataSourceId, setDataSourceId, sql, setSql,
    channelIds, setChannelIds, enabled, setEnabled, currentJobId, setCurrentJobId,
    artboard, setArtboard, editId, setEditId, draft, setDraft,
    fieldsByDataset, setFieldsByDataset, rowsByDataset, setRowsByDataset,
    activeDatasetId, setActiveDatasetId,
    finalPreview, setFinalPreview, finalLoading, setFinalLoading, finalError, setFinalError,
    querying, setQuerying, saving, setSaving, pushing, setPushing,
    selectedComposeId, setSelectedComposeId, activeCanvasId, setActiveCanvasId,
    resolvedPreview, renderedSqlPreview, exportImageRef, setExportImageRef,
    // Derived
    canvases, effectiveCanvasId, activeCanvas, tree, datasets, activeDs, datasetOptions,
    cart, library, libraryCount, allCartCount,
    draftFields, previewColumns, previewRows, setTree,
    // Data
    loadMeta, buildDoc, runCompile, patchCompose,
    activeParamDefs, setActiveParamDefs, refreshResolvedPreview,
    onQueryDataset, addDataset, removeDataset,
    // Components
    startNew, addToCart,
    placeLibraryOnCanvas, removeFromCanvas, removeFromLibrary,
    patchComposeLayout, onAddCanvas,
    // Segments
    setSegments, patchSegmentHtml, moveSegment, addTextSegment, removeSegment,
    // Templates & save & push
    applyTemplate, onSave, onTestPush,
    // Navigate
    navigate,
  }
}
