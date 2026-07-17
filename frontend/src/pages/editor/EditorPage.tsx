/**
 * Content workbench — component artboard designer (Phase S1).
 * Layout: component palette | artboard outline + canvas | data/props + preview
 */
import {
  ArrowLeftOutlined,
  CopyOutlined,
  DeleteOutlined,
  HolderOutlined,
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
  Drawer,
  Input,
  List,
  Modal,
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
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from 'react'
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
  bindingHint,
  cloneNode,
  defaultAlertArtboard,
  defaultDailyArtboard,
  emptyArtboard,
  ensureSecondaryDataset,
  extractArtboardFromJob,
  fieldDropSlots,
  findNode,
  flattenOutline,
  moveNodeTo,
  moveSibling,
  newComponent,
  parentAndIndex,
  removeNode,
  syncMainDataset,
  TABLE_STYLES,
  THEME_PACKS,
  updateNode,
  upsertDataset,
  type FieldBindRole,
} from './studioUtils'

function colorToHex(color: Color | string): string {
  if (typeof color === 'string') return color
  return color.toHexString()
}

const PALETTE = [
  { type: 'Text', label: '文本' },
  { type: 'Kpi', label: 'KPI' },
  { type: 'Table', label: '数据表' },
  { type: 'ChartBar', label: '柱状图' },
  { type: 'ChartLine', label: '折线图' },
  { type: 'ChartPie', label: '饼图' },
  { type: 'Alert', label: '告警条' },
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
  /** FanRuan-style: fields cached per dataset id after 取数 */
  const [fieldsByDataset, setFieldsByDataset] = useState<Record<string, string[]>>({})
  const [activeDatasetId, setActiveDatasetId] = useState('main')
  const [markdownText, setMarkdownText] = useState('')
  const [imageBase64, setImageBase64] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')

  const [querying, setQuerying] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [tplOpen, setTplOpen] = useState(false)
  const [templates, setTemplates] = useState<StudioTemplate[]>([])
  const [tplLoading, setTplLoading] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<string | null>(null)
  /** Currently dragging a data field (帆软字段拖拽) */
  const [fieldDrag, setFieldDrag] = useState<{
    column: string
    datasetId: string
  } | null>(null)

  const tree = artboard.tree
  const outline = useMemo(() => (tree ? flattenOutline(tree) : []), [tree])
  const selected = useMemo(
    () => (selectedId && tree ? findNode(tree, selectedId) : null),
    [selectedId, tree],
  )
  const themeColor = artboard.artboard?.theme?.color || '#1677ff'
  const themePack = artboard.artboard?.theme?.pack || 'business'
  const datasets = artboard.datasets || []
  const activeDs = datasets.find((d) => d.id === activeDatasetId) || datasets[0]
  const datasetOptions = datasets.map((d) => ({
    value: d.id,
    label: d.name || d.id,
  }))

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

  const buildDoc = (): ArtboardDoc => {
    let doc = syncMainDataset(artboard, dataSourceId, sql)
    // Fill missing data_source_id on secondary datasets with main source
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
    const slotSql =
      slot === 'main' ? sql : String(activeDs?.sql || sql)
    const slotDs = String(activeDs?.data_source_id || dataSourceId)
    setQuerying(true)
    try {
      const res = await queryPreview({
        data_source_id: slotDs,
        sql: slotSql,
        max_rows: 50,
      })
      setPreviewColumns(res.columns)
      setPreviewRows(res.rows)
      setFieldsByDataset((prev) => ({ ...prev, [slot]: res.columns }))
      if (slot === 'main') {
        setArtboard((prev) => syncMainDataset(prev, dataSourceId, sql))
      } else {
        setArtboard((prev) =>
          upsertDataset(prev, {
            id: slot,
            name: activeDs?.name,
            data_source_id: slotDs,
            sql: slotSql,
          }),
        )
      }
      message.success(`[${slot}] 取数 ${res.row_count} 行 · 请把左侧/右侧字段拖到组件槽位`)
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
      setPreviewHtml(res.html || '')
      setArtboard(res.artboard || doc)
      message.success(`编译完成（主集 ${res.row_count} 行）`)
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
      const doc = buildDoc()
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
    if (!dataSourceId) setSql(next.datasets?.[0]?.sql || sql)
    else if (board.datasets?.[0]?.sql) setSql(String(board.datasets[0].sql))
    setArtboard(next)
    setActiveDatasetId('main')
    setSelectedId(null)
    message.info(
      kind === 'daily' ? '已应用日报模板' : kind === 'alert' ? '已应用告警模板' : '已清空画板',
    )
  }

  const applyThemePack = (packId: string) => {
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
  }

  const loadTemplates = async () => {
    setTplLoading(true)
    try {
      setTemplates(await listStudioTemplates())
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setTplLoading(false)
    }
  }

  const openTemplateLibrary = () => {
    setTplOpen(true)
    void loadTemplates()
  }

  const applyLibraryTemplate = (tpl: StudioTemplate) => {
    const board = tpl.artboard || emptyArtboard()
    const next = dataSourceId
      ? syncMainDataset(board, dataSourceId, board.datasets?.[0]?.sql || sql)
      : board
    if (board.datasets?.[0]?.sql) setSql(String(board.datasets[0].sql))
    setArtboard(next)
    setSelectedId(null)
    setTplOpen(false)
    message.success(`已应用模板：${tpl.name}`)
  }

  const saveAsTemplate = () => {
    Modal.confirm({
      title: '保存当前画板为模板',
      content: (
        <Input
          id="tpl-name-input"
          placeholder="模板名称"
          defaultValue={name || '我的模板'}
        />
      ),
      onOk: async () => {
        const el = document.getElementById('tpl-name-input') as HTMLInputElement | null
        const tplName = (el?.value || name || '我的模板').trim()
        try {
          await createStudioTemplate({
            name: tplName,
            description: '用户保存的画板模板',
            artboard: buildDoc(),
          })
          message.success('模板已入库')
          void loadTemplates()
        } catch (err) {
          message.error(getErrorMessage(err))
          throw err
        }
      },
    })
  }

  const onDragStartNode = (id: string) => {
    setDragId(id)
    setFieldDrag(null)
  }

  const onFieldDragStart = (column: string, datasetId: string, e: DragEvent) => {
    setFieldDrag({ column, datasetId })
    setDragId(null)
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData(
      'application/x-studio-field',
      JSON.stringify({ column, datasetId }),
    )
    e.dataTransfer.setData('text/plain', column)
  }

  const applyFieldToNode = (
    nodeId: string,
    column: string,
    datasetId: string,
    role: FieldBindRole = 'auto',
  ) => {
    if (!tree) return
    const node = findNode(tree, nodeId)
    if (!node) return
    const patch = applyColumnToNode(node, column, role, datasetId)
    if (!Object.keys(patch).length) {
      message.info('此组件不接收字段绑定')
      return
    }
    setTree(updateNode(tree, nodeId, patch))
    setSelectedId(nodeId)
    const roleLabel =
      role === 'category'
        ? '分类'
        : role === 'value'
          ? '数值'
          : role === 'text'
            ? '文案'
            : role === 'dataset'
              ? '数据集'
              : '自动'
    message.success(`已绑定 ${datasetId}.${column} → ${node.type}（${roleLabel}）`)
  }

  const onDropOnNode = (targetId: string, asChild: boolean) => {
    if (!tree || !dragId || dragId === targetId) {
      setDragId(null)
      setDropHint(null)
      return
    }
    if (asChild) {
      // drop into container (or treat non-container as insert after under same parent)
      const target = findNode(tree, targetId)
      if (target?.type === 'Container' || targetId === 'root') {
        const kids = target?.children?.length ?? tree.children?.length ?? 0
        setTree(moveNodeTo(tree, dragId, targetId === 'root' ? 'root' : targetId, kids))
        message.success('已移入容器')
      } else {
        const pos = parentAndIndex(tree, targetId)
        if (pos) {
          setTree(moveNodeTo(tree, dragId, pos.parentId, pos.index + 1))
          message.success('已调整顺序')
        }
      }
    } else {
      const pos = parentAndIndex(tree, targetId)
      if (pos) {
        setTree(moveNodeTo(tree, dragId, pos.parentId, pos.index))
        message.success('已调整顺序')
      }
    }
    setDragId(null)
    setDropHint(null)
  }

  const duplicateSelected = () => {
    if (!tree || !selectedId || !selected) return
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
    message.success('已复制组件')
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
            <Button onClick={openTemplateLibrary}>模板库</Button>
            <Button onClick={() => applyTemplate('daily')}>日报</Button>
            <Button onClick={() => applyTemplate('alert')}>告警</Button>
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

      <Alert
        type="info"
        showIcon
        banner
        message="帆软式绑定：① 取数 ② 从「字段」拖字段到组件槽位（分类/数值/文案）③ 编译预览"
        description={
          fieldDrag
            ? `正在拖字段：${fieldDrag.datasetId}.${fieldDrag.column} — 松手放到高亮槽位`
            : '图表有两个槽：分类、数值；KPI 拖数值；文本拖入插入 {{列}}。也可点击字段绑定到当前选中组件。'
        }
      />

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
            数据集字段（拖到画板组件）
          </Typography.Text>
          <div style={{ margin: '6px 0 4px' }}>
            <Select
              size="small"
              style={{ width: '100%' }}
              value={activeDatasetId}
              onChange={setActiveDatasetId}
              options={datasetOptions}
            />
          </div>
          <div
            style={{
              marginBottom: 12,
              minHeight: 48,
              padding: 6,
              background: fieldDrag ? '#e6f4ff' : '#fff',
              border: '1px solid #f0f0f0',
              borderRadius: 6,
            }}
          >
            {(fieldsByDataset[activeDatasetId] || previewColumns).length === 0 ? (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                先在右侧「数据」取数，字段会出现在这里
              </Typography.Text>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(fieldsByDataset[activeDatasetId] || previewColumns).map((c) => (
                  <Tag
                    key={c}
                    draggable
                    color={fieldDrag?.column === c ? 'blue' : 'default'}
                    style={{ cursor: 'grab', userSelect: 'none', marginBottom: 2 }}
                    onDragStart={(e) => onFieldDragStart(c, activeDatasetId, e)}
                    onDragEnd={() => setFieldDrag(null)}
                    onClick={() => {
                      if (selectedId && selected) {
                        applyFieldToNode(selectedId, c, activeDatasetId, 'auto')
                      } else {
                        message.info('先选中组件，或把字段拖到组件槽位')
                      }
                    }}
                  >
                    ≡ {c}
                  </Tag>
                ))}
              </div>
            )}
          </div>

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            画板结构（拖动手柄排序 / 拖到容器上移入）
          </Typography.Text>
          {dropHint ? (
            <Typography.Text type="warning" style={{ fontSize: 11, display: 'block' }}>
              {dropHint}
            </Typography.Text>
          ) : null}
          <List
            size="small"
            style={{ marginTop: 8 }}
            dataSource={outline}
            locale={{ emptyText: '暂无组件，请从上方添加或套用模板' }}
            renderItem={(item) => (
              <List.Item
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  onDragStartNode(item.id)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDropHint(
                    item.type === 'Container'
                      ? `放到「${item.label}」内`
                      : `插到「${item.label}」前`,
                  )
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  onDropOnNode(item.id, item.type === 'Container')
                }}
                onDragEnd={() => {
                  setDragId(null)
                  setDropHint(null)
                }}
                style={{
                  padding: '6px 8px',
                  cursor: 'grab',
                  background:
                    selectedId === item.id
                      ? '#e6f4ff'
                      : dragId === item.id
                        ? '#fff7e6'
                        : undefined,
                  borderRadius: 4,
                  paddingLeft: 8 + item.depth * 12,
                  opacity: dragId === item.id ? 0.6 : 1,
                  border:
                    dropHint && dragId
                      ? '1px dashed transparent'
                      : undefined,
                }}
                onClick={() => setSelectedId(item.id)}
              >
                <Space size={4}>
                  <HolderOutlined style={{ color: '#999' }} />
                  <Tag style={{ margin: 0 }}>{item.type}</Tag>
                  <span style={{ fontSize: 12 }}>{item.label}</span>
                </Space>
              </List.Item>
            )}
          />
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (tree && dragId) {
                setTree(moveNodeTo(tree, dragId, 'root', tree.children?.length || 0))
                setDragId(null)
                setDropHint(null)
                message.success('已移到画板末尾')
              }
            }}
            style={{
              marginTop: 8,
              padding: 8,
              border: '1px dashed #d9d9d9',
              borderRadius: 4,
              fontSize: 11,
              color: '#999',
              textAlign: 'center',
            }}
          >
            拖到此处 → 画板顶层末尾
          </div>
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
                  fieldDragActive={!!fieldDrag}
                  onFieldDrop={(nodeId, role) => {
                    const fd = fieldDrag
                    if (!fd) return
                    applyFieldToNode(nodeId, fd.column, fd.datasetId, role)
                    setFieldDrag(null)
                  }}
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
                      <Typography.Text type="secondary">主题包</Typography.Text>
                      <Select
                        style={{ width: '100%', marginTop: 4 }}
                        value={themePack}
                        onChange={applyThemePack}
                        options={THEME_PACKS.map((p) => ({
                          value: p.id,
                          label: p.label,
                        }))}
                      />
                    </div>
                    <div>
                      <Typography.Text type="secondary">画板顶栏标题</Typography.Text>
                      <Input
                        style={{ marginTop: 4 }}
                        value={String(artboard.artboard?.chrome_title || '')}
                        onChange={(e) =>
                          setArtboard((prev) => ({
                            ...prev,
                            artboard: { ...prev.artboard, chrome_title: e.target.value },
                          }))
                        }
                        placeholder="支持 {{列名}}"
                      />
                      <div style={{ marginTop: 6 }}>
                        <Switch
                          size="small"
                          checked={artboard.artboard?.show_chrome !== false}
                          onChange={(v) =>
                            setArtboard((prev) => ({
                              ...prev,
                              artboard: { ...prev.artboard, show_chrome: v },
                            }))
                          }
                        />{' '}
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          显示顶栏色条
                        </Typography.Text>
                      </div>
                    </div>
                    <div>
                      <Typography.Text type="secondary">数据集</Typography.Text>
                      <Space style={{ width: '100%', marginTop: 4 }} wrap>
                        <Select
                          style={{ minWidth: 140 }}
                          value={activeDatasetId}
                          onChange={(id) => {
                            setActiveDatasetId(id)
                            const d = datasets.find((x) => x.id === id)
                            if (d?.id === 'main') {
                              /* sql state is main */
                            } else if (d?.sql) {
                              /* keep secondary sql in artboard only */
                            }
                            setPreviewColumns([])
                            setPreviewRows([])
                          }}
                          options={datasetOptions}
                        />
                        <Button
                          size="small"
                          onClick={() => {
                            setArtboard((prev) => ensureSecondaryDataset(prev))
                            setActiveDatasetId('trend')
                            message.info('已添加第二数据集 trend，可写独立 SQL')
                          }}
                        >
                          + 第二数据集
                        </Button>
                      </Space>
                    </div>
                    <div>
                      <Typography.Text type="secondary">
                        数据源（{activeDatasetId === 'main' ? '主任务' : activeDatasetId}）
                      </Typography.Text>
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
                            setArtboard((prev) =>
                              upsertDataset(prev, {
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
                        rows={6}
                        value={
                          activeDatasetId === 'main'
                            ? sql
                            : String(activeDs?.sql || '')
                        }
                        onChange={(e) => {
                          if (activeDatasetId === 'main') setSql(e.target.value)
                          else
                            setArtboard((prev) =>
                              upsertDataset(prev, {
                                id: activeDatasetId,
                                name: activeDs?.name,
                                data_source_id: activeDs?.data_source_id,
                                sql: e.target.value,
                              }),
                            )
                        }}
                      />
                    </div>
                    <Button block loading={querying} onClick={() => void onQuery()}>
                      运行取数（当前数据集）
                    </Button>
                    {selected && tree ? (
                      <Alert
                        type="success"
                        showIcon
                        style={{ fontSize: 12 }}
                        message={`当前组件：${selected.type}`}
                        description={bindingHint(selected, previewColumns)}
                      />
                    ) : (
                      <Alert
                        type="warning"
                        showIcon
                        style={{ fontSize: 12 }}
                        message="请先在中间画板或左侧结构里点选一个组件，再绑数据"
                      />
                    )}
                    {previewColumns.length > 0 ? (
                      <>
                        <div>
                          <Typography.Text type="secondary">
                            字段（拖到画板槽位 / 点选绑当前组件）
                          </Typography.Text>
                          <div style={{ marginTop: 6 }}>
                            {previewColumns.map((c) => (
                              <Tag
                                key={c}
                                draggable
                                color="processing"
                                style={{ cursor: 'grab', marginBottom: 4, userSelect: 'none' }}
                                onDragStart={(e) => onFieldDragStart(c, activeDatasetId, e)}
                                onDragEnd={() => setFieldDrag(null)}
                                onClick={() => {
                                  if (!selectedId) {
                                    message.info('先选中组件，或把字段拖到槽位')
                                    return
                                  }
                                  applyFieldToNode(selectedId, c, activeDatasetId, 'auto')
                                }}
                              >
                                ≡ {c}
                              </Tag>
                            ))}
                          </div>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            图表请拖到「分类 / 数值」两个槽；KPI 拖数值；文本插入 {'{{列}}'}。
                          </Typography.Text>
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
                      <Space wrap>
                        <Typography.Text type="secondary">主题色覆盖</Typography.Text>
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
                          checkedChildren="任务启用"
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
                    onDuplicate={duplicateSelected}
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

      <Drawer
        title="模板库"
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        width={400}
        extra={
          <Button type="primary" size="small" onClick={saveAsTemplate}>
            保存当前为模板
          </Button>
        }
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          系统模板 + 你保存的自定义模板。应用后会替换当前画板结构（数据源保持）。
        </Typography.Paragraph>
        <List
          loading={tplLoading}
          dataSource={templates}
          locale={{ emptyText: '暂无模板（迁移/启动后会种子系统模板）' }}
          renderItem={(tpl) => (
            <List.Item
              actions={[
                <Button
                  key="use"
                  type="link"
                  size="small"
                  onClick={() => applyLibraryTemplate(tpl)}
                >
                  应用
                </Button>,
                !tpl.is_system ? (
                  <Button
                    key="del"
                    type="link"
                    danger
                    size="small"
                    onClick={() => {
                      Modal.confirm({
                        title: `删除模板「${tpl.name}」？`,
                        onOk: async () => {
                          await deleteStudioTemplate(tpl.id)
                          message.success('已删除')
                          void loadTemplates()
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
                description={tpl.description || tpl.scene_id || tpl.id.slice(0, 8)}
              />
            </List.Item>
          )}
        />
      </Drawer>
    </div>
  )
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
        minHeight: 36,
        marginTop: 6,
        padding: '6px 8px',
        borderRadius: 4,
        border: over
          ? '2px solid #1677ff'
          : active
            ? '1px dashed #69b1ff'
            : '1px dashed #e8e8e8',
        background: over ? '#bae0ff' : active ? '#f0f7ff' : '#fafafa',
        fontSize: 11,
        color: '#666',
        textAlign: 'center',
      }}
    >
      <div>{label}</div>
      <div style={{ fontWeight: 600, color: bound && bound !== '？' ? '#1677ff' : '#bbb' }}>
        {bound || '拖字段到此处'}
      </div>
    </div>
  )
}

function ArtboardBlock({
  node,
  selectedId,
  onSelect,
  fieldDragActive,
  onFieldDrop,
}: {
  node: StudioNode
  selectedId: string | null
  onSelect: (id: string) => void
  fieldDragActive: boolean
  onFieldDrop: (nodeId: string, role: FieldBindRole) => void
}) {
  const selected = selectedId === node.id
  const slots = fieldDropSlots(node)
  const border = selected
    ? '2px solid #1677ff'
    : fieldDragActive && slots.length
      ? '1px dashed #69b1ff'
      : '1px dashed #d9d9d9'
  const style: CSSProperties = {
    border,
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    cursor: 'pointer',
    background: selected ? '#f0f7ff' : '#fff',
    boxShadow: fieldDragActive && slots.length ? '0 0 0 2px rgba(22,119,255,0.12)' : undefined,
  }

  const dropBody = fieldDragActive && slots.length > 0 && (
    <div style={{ display: 'flex', gap: 6 }}>
      {slots.map((s) => (
        <FieldSlot
          key={s.role}
          label={s.label}
          active={fieldDragActive}
          bound={
            s.role === 'category'
              ? String(node.binding?.category_column || '')
              : s.role === 'value'
                ? String(node.binding?.value_column || '')
                : s.role === 'text'
                  ? '文案'
                  : String(node.binding?.dataset_id || '')
          }
          onDrop={() => onFieldDrop(node.id, s.role)}
        />
      ))}
    </div>
  )

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
              <ArtboardBlock
                node={ch}
                selectedId={selectedId}
                onSelect={onSelect}
                fieldDragActive={fieldDragActive}
                onFieldDrop={onFieldDrop}
              />
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
        {dropBody}
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
        {dropBody}
      </div>
    )
  }

  if (node.type === 'Table') {
    return (
      <div style={style} onClick={(e) => { e.stopPropagation(); onSelect(node.id) }}>
        <Typography.Text type="secondary">
          📊 数据表 · @{String(node.binding?.dataset_id || 'main')}
        </Typography.Text>
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
        {dropBody}
      </div>
    )
  }

  if (node.type === 'Chart') {
    const ct = String(node.props?.chart_type || 'bar')
    const cat = String(node.binding?.category_column || '？')
    const val = String(node.binding?.value_column || '？')
    const ds = String(node.binding?.dataset_id || 'main')
    const icon = ct === 'pie' ? '🥧 饼图' : ct === 'line' ? '📈 折线' : '📊 柱状图'
    return (
      <div style={style} onClick={(e) => { e.stopPropagation(); onSelect(node.id) }}>
        <Typography.Text strong style={{ fontSize: 13 }}>
          {icon}
          {node.props?.title ? ` · ${String(node.props.title)}` : ''}
        </Typography.Text>
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          @{ds} 分类=<Tag style={{ margin: 0 }}>{cat}</Tag> 数值=
          <Tag style={{ margin: 0 }}>{val}</Tag>
        </div>
        {!fieldDragActive ? (
          <div
            style={{
              marginTop: 8,
              height: 56,
              borderRadius: 4,
              background:
                ct === 'pie'
                  ? 'conic-gradient(#1677ff 0 35%, #52c41a 0 60%, #faad14 0 80%, #ff4d4f 0)'
                  : ct === 'line'
                    ? 'linear-gradient(180deg, transparent 40%, #e6f4ff 40%), linear-gradient(135deg, transparent 48%, #1677ff 48% 52%, transparent 52%)'
                    : 'repeating-linear-gradient(90deg,#1677ff 0 18px,transparent 18px 28px)',
              opacity: 0.85,
            }}
          />
        ) : (
          dropBody
        )}
      </div>
    )
  }

  if (node.type === 'Alert') {
    return (
      <div
        style={{
          ...style,
          background: '#fff2f0',
          borderColor: selected ? '#1677ff' : '#ffccc7',
        }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(node.id)
        }}
      >
        <Typography.Text style={{ color: '#a8071a', fontSize: 13 }}>
          ⚠ {String(node.props?.text || '告警')}
        </Typography.Text>
        {dropBody}
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
  datasetOptions,
  fieldDragActive,
  onFieldSlotDrop,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: {
  node: StudioNode
  columns: string[]
  datasetOptions: { value: string; label: string }[]
  fieldDragActive: boolean
  onFieldSlotDrop: (role: FieldBindRole) => void
  onChange: (patch: Partial<StudioNode>) => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const visibleWhen = String(node.props?.visible_when || 'always')
  const slots = fieldDropSlots(node)
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space wrap>
        <Tag>{node.type}</Tag>
        <Button size="small" onClick={() => onMove(-1)}>
          上移
        </Button>
        <Button size="small" onClick={() => onMove(1)}>
          下移
        </Button>
        <Button size="small" icon={<CopyOutlined />} onClick={onDuplicate}>
          复制
        </Button>
        <Button size="small" danger icon={<DeleteOutlined />} onClick={onDelete}>
          删除
        </Button>
      </Space>
      <div>
        <Typography.Text type="secondary">显示开关</Typography.Text>
        <div>
          <Switch
            checked={node.visible !== false}
            onChange={(v) => onChange({ visible: v })}
          />
        </div>
      </div>
      <div>
        <Typography.Text type="secondary">条件显隐（编译时按绑定数据集行数）</Typography.Text>
        <Select
          style={{ width: '100%', marginTop: 4 }}
          value={visibleWhen || 'always'}
          onChange={(v) =>
            onChange({
              props: { ...node.props, visible_when: v === 'always' ? '' : v },
            })
          }
          options={[
            { value: 'always', label: '始终显示' },
            { value: 'row_count>0', label: '有数据时显示' },
            { value: 'row_count==0', label: '无数据时显示' },
            { value: 'never', label: '始终隐藏' },
          ]}
        />
      </div>
      <Alert
        type="success"
        showIcon
        style={{ fontSize: 12 }}
        message="帆软式：拖字段到下方槽位"
        description={bindingHint(node, columns)}
      />
      {slots.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {slots.map((s) => (
            <div key={s.role} style={{ flex: '1 1 120px' }}>
              <FieldSlot
                label={s.label}
                active={fieldDragActive}
                bound={
                  s.role === 'category'
                    ? String(node.binding?.category_column || '')
                    : s.role === 'value'
                      ? String(node.binding?.value_column || '')
                      : s.role === 'text'
                        ? String(node.props?.text || '').slice(0, 20)
                        : String(node.binding?.dataset_id || '')
                }
                onDrop={() => onFieldSlotDrop(s.role)}
              />
            </div>
          ))}
        </div>
      ) : null}
      {['Text', 'Kpi', 'Table', 'Chart', 'Alert'].includes(String(node.type)) ? (
        <div>
          <Typography.Text type="secondary">绑定数据集</Typography.Text>
          <Select
            style={{ width: '100%', marginTop: 4 }}
            value={String(node.binding?.dataset_id || 'main')}
            onChange={(v) =>
              onChange({ binding: { ...node.binding, dataset_id: v } })
            }
            options={
              datasetOptions.length
                ? datasetOptions
                : [{ value: 'main', label: 'main' }]
            }
          />
        </div>
      ) : null}
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
          <Alert
            type="info"
            showIcon
            style={{ fontSize: 12 }}
            message="表格使用绑定数据集的全部结果"
          />
          <div>
            <Typography.Text type="secondary">表风格</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={String(node.props?.style || 'business')}
              onChange={(v) => onChange({ props: { ...node.props, style: v } })}
              options={TABLE_STYLES.map((s) => ({ value: s.id, label: s.label }))}
            />
          </div>
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
      {node.type === 'Chart' ? (
        <>
          <Alert
            type="info"
            showIcon
            style={{ fontSize: 12 }}
            message="分类列 + 数值列；可切换绑定数据集（如趋势用 trend）"
          />
          <div>
            <Typography.Text type="secondary">图表类型</Typography.Text>
            <Radio.Group
              style={{ marginTop: 4, display: 'block' }}
              value={String(node.props?.chart_type || 'bar')}
              onChange={(e) => {
                const map: Record<string, string> = {
                  bar: '柱状图',
                  pie: '饼图',
                  line: '折线图',
                }
                onChange({
                  props: {
                    ...node.props,
                    chart_type: e.target.value,
                    title: node.props?.title || map[e.target.value] || '图表',
                  },
                })
              }}
            >
              <Radio.Button value="bar">柱</Radio.Button>
              <Radio.Button value="line">折线</Radio.Button>
              <Radio.Button value="pie">饼</Radio.Button>
            </Radio.Group>
          </div>
          <div>
            <Typography.Text type="secondary">标题</Typography.Text>
            <Input
              style={{ marginTop: 4 }}
              value={String(node.props?.title || '')}
              onChange={(e) => onChange({ props: { ...node.props, title: e.target.value } })}
            />
          </div>
          <div>
            <Typography.Text type="secondary">分类列（类别）</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              allowClear
              showSearch
              placeholder="如：院区、科室"
              value={(node.binding?.category_column as string) || undefined}
              onChange={(v) =>
                onChange({
                  binding: { ...node.binding, category_column: v || '', dataset_id: 'main' },
                })
              }
              options={columns.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <div>
            <Typography.Text type="secondary">数值列</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              allowClear
              showSearch
              placeholder="如：门诊量、金额"
              value={(node.binding?.value_column as string) || undefined}
              onChange={(v) =>
                onChange({
                  binding: { ...node.binding, value_column: v || '', dataset_id: 'main' },
                })
              }
              options={columns.map((c) => ({ value: c, label: c }))}
            />
          </div>
          {columns.length === 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              请先在「数据」里对当前数据集取数，才能从下拉选择列名。
            </Typography.Text>
          ) : null}
        </>
      ) : null}
      {node.type === 'Alert' ? (
        <>
          <div>
            <Typography.Text type="secondary">级别</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={String(node.props?.level || 'error')}
              onChange={(v) => onChange({ props: { ...node.props, level: v } })}
              options={[
                { value: 'error', label: '严重' },
                { value: 'warning', label: '警告' },
                { value: 'info', label: '信息' },
                { value: 'success', label: '成功' },
              ]}
            />
          </div>
          <div>
            <Typography.Text type="secondary">文案（支持 {'{{列}}'}）</Typography.Text>
            <Input.TextArea
              style={{ marginTop: 4 }}
              rows={3}
              value={String(node.props?.text || '')}
              onChange={(e) => onChange({ props: { ...node.props, text: e.target.value } })}
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
