/**
 * 内容工作台 V2 — 三栏持续布局。
 *
 * 左栏：数据 + 组件库
 * 中栏：画布
 * 右栏：属性 / 预览 / 推送
 *
 * 编译管线和 artboard 模型沿用 V1。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { message } from 'antd'
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
import type { ArtboardDoc, Channel, DataSource, PushJob, SqlParamDef, StudioCompileResponse } from '../../api/types'
import {
  canvasChildren,
  listCanvases,
  newCanvas,
  normalizeArtboardDoc,
} from './artboardModel'
import {
  emptyArtboard,
  extractArtboardFromJob,
  firstRowMap,
  newComponent,
  nid,
  substituteRow,
  syncMainDataset,
  type DatasetMaps,
  type StudioNode,
} from './studioUtils'
import { EditorTopBar } from './EditorTopBar'
import { DataPanel } from './panels/DataPanel'
import { CanvasPanel, type CanvasInfo } from './panels/CanvasPanel'
import { SidePanel } from './panels/SidePanel'

// ---- 组件类型 ----
const COMPONENT_TYPES = [
  { type: 'Text', label: '文本' },
  { type: 'Kpi', label: 'KPI 指标' },
  { type: 'Table', label: '表格' },
  { type: 'ChartBar', label: '柱状图' },
  { type: 'ChartLine', label: '折线图' },
  { type: 'ChartPie', label: '饼图' },
  { type: 'Alert', label: '提示条' },
  { type: 'Divider', label: '分割线' },
  { type: 'Container', label: '容器' },
]

export function EditorPageV2() {
  const { jobId } = useParams<{ jobId?: string }>()
  const navigate = useNavigate()

  // ---- 核心状态 ----
  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState<DataSource[]>([])
  const [channels, setChannels] = useState<Channel[]>([])

  const [name, setName] = useState('')
  const [dataSourceId, setDataSourceId] = useState<string | undefined>()
  const [sql, setSql] = useState(
    "SELECT '演示院区' AS 院区, 1200 AS 门诊量, 80 AS 住院\nUNION ALL SELECT '对照', 980, 72",
  )
  const [channelIds, setChannelIds] = useState<string[]>([])
  const [currentJobId, setCurrentJobId] = useState<string | null>(jobId ?? null)

  const [artboard, setArtboard] = useState<ArtboardDoc>(() => emptyArtboard())
  const [fieldsByDataset, setFieldsByDataset] = useState<Record<string, string[]>>({})
  const [rowsByDataset, setRowsByDataset] = useState<Record<string, unknown[][]>>({})
  const [activeDatasetId, setActiveDatasetId] = useState('main')

  const [finalPreview, setFinalPreview] = useState<StudioCompileResponse | null>(null)
  const [finalLoading, setFinalLoading] = useState(false)
  const [finalError, setFinalError] = useState<string | null>(null)
  const [querying, setQuerying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null)
  const [sideTab, setSideTab] = useState('properties')
  const [resolvedPreview, setResolvedPreview] = useState<Record<string, string>>({})

  // ---- 派生状态 ----
  const canvases = useMemo(() => listCanvases(artboard), [artboard])
  const effectiveCanvasId =
    activeCanvasId && canvases.some((c) => c.id === activeCanvasId)
      ? activeCanvasId
      : canvases[0]?.id || null
  const activeCanvas = canvases.find((c) => c.id === effectiveCanvasId) || canvases[0]
  const tree = activeCanvas?.tree || artboard.tree
  const cart = useMemo(() => canvasChildren(activeCanvas), [activeCanvas])
  const library = useMemo(() => artboard.library || [], [artboard])
  const datasets = artboard.datasets || []
  const activeDs = datasets.find((d) => d.id === activeDatasetId) || datasets[0]
  const datasetTabs = datasets.map((d) => ({ id: d.id, name: d.name || d.id }))
  const fields = fieldsByDataset[activeDatasetId] || []
  const rows = rowsByDataset[activeDatasetId] || []

  const canvasInfos: CanvasInfo[] = canvases.map((c) => ({ id: c.id, name: c.name || '画布', width: c.width || 750 }))
  const dataMaps: DatasetMaps = useMemo(() => {
    const m: DatasetMaps = {}
    for (const dsId of Object.keys(fieldsByDataset)) {
      const cols = fieldsByDataset[dsId] || []
      const rws = rowsByDataset[dsId] || []
      if (rws.length === 0) continue
      const first = rws[0] as unknown[]
      const map: Record<string, unknown> = {}
      cols.forEach((c, j) => { map[c] = first[j] })
      m[dsId] = { fields: cols, firstRow: map }
    }
    return m
  }, [fieldsByDataset, rowsByDataset])

  // ---- 加载 ----
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
          return
        }
        const job: PushJob = await getPushJob(jobId)
        setCurrentJobId(job.id)
        setName(job.name)
        setDataSourceId(job.data_source_id)
        setSql(job.query_sql)
        setChannelIds(job.channel_ids ?? [])
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
    doc = normalizeArtboardDoc(doc)
    return doc
  }, [artboard, dataSourceId, sql])

  // ---- 取数 ----
  const onQuery = useCallback(async () => {
    if (!dataSourceId) { message.error('请先选择数据源'); return }
    if (!sql.trim()) { message.error('请填写 SQL'); return }
    setQuerying(true)
    try {
      const res = await queryPreview({ data_source_id: dataSourceId, sql, max_rows: 200 })
      setFieldsByDataset((p) => ({ ...p, main: res.columns }))
      setRowsByDataset((p) => ({ ...p, main: res.rows }))
      if (res.resolved_params) setResolvedPreview(res.resolved_params)
      setArtboard((p) =>
        syncMainDataset(p, dataSourceId!, sql),
      )
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally { setQuerying(false) }
  }, [dataSourceId, sql])

  // ---- 组件操作 ----
  const onCreateComponent = useCallback((type: string) => {
    if (!fields.length || rows.length === 0) {
      message.warning('请先完成取数预览')
      return
    }
    const row = rows[0] as unknown[]
    const rowMap: Record<string, unknown> = {}
    fields.forEach((f, j) => { rowMap[f] = row[j] })
    const node = newComponent(type as StudioNode['type'], nid(), { label: type })
    // 放入组件库
    setArtboard((prev) => ({
      ...prev,
      library: [...(prev.library || []), node],
    }))
    message.success(`已添加「${type}」到组件库`)
  }, [fields, rows])

  const placeOnCanvas = useCallback((nodeId: string) => {
    const node = library.find((n) => n.id === nodeId)
    if (!node) return
    const cloned = { ...node, id: nid() }
    setArtboard((prev) => {
      const n = normalizeArtboardDoc(prev)
      const cid = effectiveCanvasId || n.canvases?.[0]?.id
      if (!cid) return { ...n, tree: { ...n.tree, children: [...(n.tree.children || []), cloned] } }
      const idx = n.canvases!.findIndex((c) => c.id === cid)
      if (idx === -1) return n
      const updated = [...n.canvases!]
      const canvas = { ...updated[idx] }
      canvas.tree = { ...canvas.tree, children: [...(canvas.tree.children || []), cloned] }
      updated[idx] = canvas
      return { ...n, canvases: updated }
    })
    setSelectedNodeId(cloned.id)
  }, [library, effectiveCanvasId])

  const onAddCanvas = useCallback(() => {
    setArtboard((prev) => {
      const n = normalizeArtboardDoc(prev)
      const nc = newCanvas(`画布 ${(n.canvases?.length || 0) + 1}`)
      return { ...n, canvases: [...(n.canvases || []), nc] }
    })
  }, [])

  // ---- 编译 ----
  const onCompile = useCallback(async () => {
    if (!dataSourceId) { setFinalError('请先选择数据源并取数'); return }
    const cartCount = cart.length
    if (cartCount === 0) { setFinalError('画布上没有组件'); return }
    setFinalLoading(true)
    setFinalError(null)
    try {
      const res = await studioCompile({
        artboard: buildDoc(),
        data_source_id: dataSourceId,
        sql,
        want_image: true,
        max_rows: 50,
      })
      setFinalPreview(res)
      if (!res.image_base64 && res.image_error) setFinalError(res.image_error)
      setSideTab('preview')
    } catch (err) {
      setFinalPreview(null)
      setFinalError(getErrorMessage(err))
    } finally { setFinalLoading(false) }
  }, [dataSourceId, sql, cart, buildDoc])

  // ---- 保存 ----
  const onSave = useCallback(async () => {
    if (!name.trim()) { message.warning('请输入作业名称'); return }
    setSaving(true)
    try {
      const doc = buildDoc()
      const res = await studioSaveJob({
        name,
        data_source_id: dataSourceId!,
        artboard: doc,
        sql,
        channel_ids: channelIds,
      })
      setCurrentJobId(res.job_id)
      message.success('保存成功')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally { setSaving(false) }
  }, [name, dataSourceId, sql, channelIds, buildDoc])

  // ---- 推送 ----
  const onTestPush = useCallback(async () => {
    if (!dataSourceId) { message.warning('请先选择数据源'); return }
    if (channelIds.length === 0) { message.warning('请选择推送通道'); return }
    setPushing(true)
    setSideTab('push')
    try {
      await studioTestPush({
        artboard: buildDoc(),
        data_source_id: dataSourceId,
        sql,
        channel_ids: channelIds,
        max_rows: 50,
      })
      message.success('推送成功')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally { setPushing(false) }
  }, [dataSourceId, sql, channelIds, buildDoc])

  // ---- 渲染 ----
  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>加载中...</div>
  }

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', margin: -12 }}>
      {/* 顶栏 */}
      <EditorTopBar
        name={name}
        onNameChange={setName}
        jobId={currentJobId}
        saving={saving}
        pushing={pushing}
        onSave={onSave}
        onTestPush={onTestPush}
      />

      {/* 三栏主体 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左栏：数据 + 组件库 */}
        <div style={{ width: 300, minWidth: 260, borderRight: '1px solid #f0f0f0', background: '#fafafa' }}>
          <DataPanel
            sources={sources}
            dataSourceId={dataSourceId}
            onDataSourceChange={setDataSourceId}
            sql={sql}
            onSqlChange={setSql}
            querying={querying}
            onQuery={onQuery}
            activeDatasetId={activeDatasetId}
            datasetTabs={datasetTabs}
            onDatasetChange={setActiveDatasetId}
            onAddDataset={() => message.info('多数据集支持即将推出')}
            paramDefs={(activeDs?.params as SqlParamDef[]) || []}
            resolvedPreview={resolvedPreview}
            fields={fields}
            rows={rows}
            componentTypes={COMPONENT_TYPES}
            onCreateComponent={onCreateComponent}
            cartCount={cart.length}
            libraryCount={library.length}
          />
        </div>

        {/* 中栏：画布 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <CanvasPanel
            canvases={canvasInfos}
            activeCanvasId={effectiveCanvasId}
            onCanvasChange={setActiveCanvasId}
            onAddCanvas={onAddCanvas}
            canvasWidth={activeCanvas?.width || 750}
            nodes={cart}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onLayoutChange={() => {}}
            data={dataMaps}
          >
            {/* 组件库拖放到画布 */}
            <div style={{ padding: 8 }}>
              {library.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: '#999' }}>组件库（点击放入画布）：</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {library.map((node) => (
                      <div
                        key={node.id}
                        onClick={() => placeOnCanvas(node.id)}
                        style={{
                          padding: '4px 10px',
                          border: '1px solid #d9d9d9',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 12,
                          background: selectedNodeId === node.id ? '#e6f4ff' : '#fff',
                        }}
                      >
                        {node.props?.label || node.type}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {cart.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {cart.map((node) => (
                    <div
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      style={{
                        padding: 8,
                        border: selectedNodeId === node.id ? '2px solid #1677ff' : '1px solid #e8e8e8',
                        borderRadius: 4,
                        cursor: 'pointer',
                        background: '#fff',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{node.props?.label || node.type}</span>
                      <span style={{ fontSize: 10, color: '#999', marginLeft: 8 }}>{node.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CanvasPanel>
        </div>

        {/* 右栏：属性 / 预览 / 推送 */}
        <div style={{ width: 360, minWidth: 300 }}>
          <SidePanel
            activeTab={sideTab}
            onTabChange={setSideTab}
            channelIds={channelIds}
            onChannelIdsChange={setChannelIds}
            compileResult={finalPreview}
            compileLoading={finalLoading}
            compileError={finalError}
            onCompile={onCompile}
            pushing={pushing}
            onTestPush={onTestPush}
            propertiesContent={
              selectedNodeId ? (
                <div style={{ fontSize: 12 }}>
                  <p>选中组件: <code>{selectedNodeId.slice(0, 8)}</code></p>
                  <p style={{ color: '#999' }}>属性编辑器接入中...</p>
                </div>
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  )
}
