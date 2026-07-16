import type { ArtboardDoc, StudioDataset, StudioNode } from '../../api/types'

export function nid(): string {
  return Math.random().toString(16).slice(2, 14)
}

export const THEME_PACKS = [
  { id: 'business', label: '商务蓝', color: '#1677ff' },
  { id: 'alert', label: '告警红', color: '#ff4d4f' },
  { id: 'forest', label: '森绿', color: '#389e0d' },
  { id: 'violet', label: '紫晶', color: '#722ed1' },
  { id: 'slate', label: '沉稳灰', color: '#434343' },
]

export const TABLE_STYLES = [
  { id: 'business', label: '商务' },
  { id: 'compact', label: '紧凑' },
  { id: 'alert', label: '告警' },
]

const DEMO_MAIN_SQL =
  "SELECT '演示院区' AS 院区, 1200 AS 门诊量, 80 AS 住院, '12.5%' AS 同比\n" +
  "UNION ALL SELECT '对照', 980, 72, '-3.2%'"

const DEMO_TREND_SQL =
  "SELECT '周一' AS 日, 100 AS 量 UNION ALL SELECT '周二', 120 " +
  "UNION ALL SELECT '周三', 90 UNION ALL SELECT '周四', 140 UNION ALL SELECT '周五', 130"

export function defaultDailyArtboard(): ArtboardDoc {
  const t1 = nid()
  const k1 = nid()
  const k2 = nid()
  const tb = nid()
  const f1 = nid()
  const row = nid()
  return {
    version: 3,
    kind: 'artboard',
    scene_id: 'daily_report',
    artboard: {
      width: 750,
      theme: { pack: 'business', color: '#1677ff', table_style: 'business' },
      layout_default: 'flow',
      show_chrome: true,
      chrome_title: '{{院区}} 运营日报',
    },
    datasets: [
      { id: 'main', name: '主查询', data_source_id: null, sql: DEMO_MAIN_SQL },
      { id: 'trend', name: '趋势', data_source_id: null, sql: DEMO_TREND_SQL },
    ],
    tree: {
      id: 'root',
      type: 'Container',
      props: { direction: 'column', gap: 12 },
      binding: {},
      children: [
        {
          id: t1,
          type: 'Text',
          props: { variant: 'h1', text: '{{院区}} 运营日报' },
          binding: { dataset_id: 'main' },
          visible: true,
        },
        {
          id: row,
          type: 'Container',
          props: { direction: 'row', gap: 8 },
          binding: {},
          visible: true,
          children: [
            {
              id: k1,
              type: 'Kpi',
              props: { label: '门诊量' },
              binding: { dataset_id: 'main', value_column: '门诊量', label: '门诊量' },
              visible: true,
            },
            {
              id: k2,
              type: 'Kpi',
              props: { label: '住院' },
              binding: { dataset_id: 'main', value_column: '住院', label: '住院' },
              visible: true,
            },
          ],
        },
        {
          id: tb,
          type: 'Table',
          props: { style: 'business', color_ratios: true, max_rows: 50 },
          binding: { dataset_id: 'main' },
          visible: true,
        },
        {
          id: nid(),
          type: 'Chart',
          props: { chart_type: 'bar', title: '门诊量对比', max_rows: 12 },
          binding: {
            dataset_id: 'main',
            category_column: '院区',
            value_column: '门诊量',
          },
          visible: true,
        },
        {
          id: nid(),
          type: 'Chart',
          props: { chart_type: 'line', title: '近一周趋势', max_rows: 14 },
          binding: {
            dataset_id: 'trend',
            category_column: '日',
            value_column: '量',
          },
          visible: true,
        },
        {
          id: f1,
          type: 'Text',
          props: { variant: 'caption', text: '数据来源：数据推送中台 · 仅供内部参考' },
          binding: {},
          visible: true,
        },
      ],
    },
    compose: { mode: 'image_primary', markdown_caption: true },
  }
}

export function defaultAlertArtboard(): ArtboardDoc {
  return {
    version: 3,
    kind: 'artboard',
    scene_id: 'alert',
    artboard: {
      width: 750,
      theme: { pack: 'alert', color: '#ff4d4f', table_style: 'alert' },
      layout_default: 'flow',
      show_chrome: true,
      chrome_title: '指标告警',
    },
    datasets: [
      {
        id: 'main',
        name: '异常明细',
        data_source_id: null,
        sql:
          "SELECT 'A科室' AS 科室, '门诊量' AS 指标, '-25%' AS 同比, '超阈值' AS 状态\n" +
          "UNION ALL SELECT 'B科室', '住院', '-8%', '关注'",
      },
    ],
    tree: {
      id: 'root',
      type: 'Container',
      props: { direction: 'column', gap: 12 },
      children: [
        {
          id: nid(),
          type: 'Alert',
          props: {
            level: 'error',
            text: '监测到 {{科室}} 等指标异常，请及时处理。',
          },
          binding: { dataset_id: 'main' },
          visible: true,
        },
        {
          id: nid(),
          type: 'Table',
          props: { style: 'alert', color_ratios: true, max_rows: 50 },
          binding: { dataset_id: 'main' },
          visible: true,
        },
        {
          id: nid(),
          type: 'Text',
          props: { variant: 'caption', text: '告警由数据推送中台自动生成' },
          binding: {},
          visible: true,
        },
      ],
    },
    compose: { mode: 'image_primary', markdown_caption: true },
  }
}

export function emptyArtboard(): ArtboardDoc {
  return {
    version: 3,
    kind: 'artboard',
    artboard: {
      width: 750,
      theme: { pack: 'business', color: '#1677ff', table_style: 'business' },
      layout_default: 'flow',
      show_chrome: true,
      chrome_title: '数据推送',
    },
    datasets: [{ id: 'main', name: '主查询', data_source_id: null, sql: 'SELECT 1 AS demo' }],
    tree: {
      id: 'root',
      type: 'Container',
      props: { direction: 'column', gap: 12 },
      children: [],
      binding: {},
    },
    compose: { mode: 'image_primary', markdown_caption: true },
  }
}

export function findNode(root: StudioNode | undefined, id: string): StudioNode | null {
  if (!root) return null
  if (root.id === id) return root
  for (const ch of root.children || []) {
    const found = findNode(ch, id)
    if (found) return found
  }
  return null
}

export function updateNode(
  root: StudioNode,
  id: string,
  patch: Partial<StudioNode>,
): StudioNode {
  if (root.id === id) {
    return {
      ...root,
      ...patch,
      props: patch.props !== undefined ? { ...root.props, ...patch.props } : root.props,
      binding:
        patch.binding !== undefined ? { ...root.binding, ...patch.binding } : root.binding,
    }
  }
  return {
    ...root,
    children: (root.children || []).map((ch) => updateNode(ch, id, patch)),
  }
}

export function removeNode(root: StudioNode, id: string): StudioNode {
  if (root.id === id) return root
  return {
    ...root,
    children: (root.children || [])
      .filter((ch) => ch.id !== id)
      .map((ch) => removeNode(ch, id)),
  }
}

export function moveSibling(root: StudioNode, id: string, dir: -1 | 1): StudioNode {
  const children = [...(root.children || [])]
  const idx = children.findIndex((c) => c.id === id)
  if (idx < 0) {
    return {
      ...root,
      children: children.map((ch) => moveSibling(ch, id, dir)),
    }
  }
  const j = idx + dir
  if (j < 0 || j >= children.length) return root
  const next = [...children]
  const tmp = next[idx]!
  next[idx] = next[j]!
  next[j] = tmp
  return { ...root, children: next }
}

export function appendChild(root: StudioNode, parentId: string, node: StudioNode): StudioNode {
  if (root.id === parentId) {
    return { ...root, children: [...(root.children || []), node] }
  }
  return {
    ...root,
    children: (root.children || []).map((ch) => appendChild(ch, parentId, node)),
  }
}

/** Deep-clone a node tree with new ids (for duplicate). */
export function cloneNode(node: StudioNode): StudioNode {
  return {
    ...node,
    id: nid(),
    props: { ...node.props },
    binding: { ...node.binding },
    children: (node.children || []).map(cloneNode),
  }
}

export function detachNode(
  root: StudioNode,
  id: string,
): { root: StudioNode; node: StudioNode | null } {
  if (root.id === id) return { root, node: null }
  const children = root.children || []
  const idx = children.findIndex((c) => c.id === id)
  if (idx >= 0) {
    const node = children[idx]!
    return {
      root: { ...root, children: [...children.slice(0, idx), ...children.slice(idx + 1)] },
      node,
    }
  }
  let found: StudioNode | null = null
  const nextChildren = children.map((ch) => {
    if (found) return ch
    const res = detachNode(ch, id)
    if (res.node) {
      found = res.node
      return res.root
    }
    return ch
  })
  return { root: { ...root, children: nextChildren }, node: found }
}

/**
 * Move node to a new parent at index.
 * parentId = 'root' for top-level. Refuses moving a node into its own descendant.
 */
export function moveNodeTo(
  root: StudioNode,
  nodeId: string,
  parentId: string,
  index: number,
): StudioNode {
  if (nodeId === 'root' || nodeId === parentId) return root
  // prevent drop into self/descendant
  const moving = findNode(root, nodeId)
  if (!moving) return root
  if (parentId !== 'root' && findNode(moving, parentId)) return root

  const { root: without, node } = detachNode(root, nodeId)
  if (!node) return root

  const insert = (r: StudioNode): StudioNode => {
    if (r.id === parentId) {
      const kids = [...(r.children || [])]
      const i = Math.max(0, Math.min(index, kids.length))
      kids.splice(i, 0, node)
      return { ...r, children: kids }
    }
    return { ...r, children: (r.children || []).map(insert) }
  }
  return insert(without)
}

export function parentAndIndex(
  root: StudioNode,
  id: string,
): { parentId: string; index: number } | null {
  const kids = root.children || []
  const idx = kids.findIndex((c) => c.id === id)
  if (idx >= 0) return { parentId: root.id, index: idx }
  for (const ch of kids) {
    const found = parentAndIndex(ch, id)
    if (found) return found
  }
  return null
}

export function flattenOutline(
  node: StudioNode,
  depth = 0,
): { id: string; type: string; depth: number; label: string }[] {
  const label = nodeLabel(node)
  const self = node.id === 'root' ? [] : [{ id: node.id, type: String(node.type), depth, label }]
  const kids = (node.children || []).flatMap((ch) =>
    flattenOutline(ch, depth + (node.id === 'root' ? 0 : 1)),
  )
  return [...self, ...kids]
}

export function nodeLabel(node: StudioNode): string {
  const t = String(node.type)
  if (t === 'Text') return String(node.props?.text || '文本').slice(0, 24)
  if (t === 'Kpi')
    return `KPI · ${String(node.binding?.label || node.props?.label || node.binding?.value_column || '指标')}`
  if (t === 'Table') return '数据表'
  if (t === 'Chart') {
    const ct = String(node.props?.chart_type || 'bar')
    const map: Record<string, string> = { bar: '柱状图', pie: '饼图', line: '折线图' }
    const title = String(node.props?.title || '')
    return `${map[ct] || ct}${title ? ` · ${title}` : ''}`
  }
  if (t === 'Alert') return `告警 · ${String(node.props?.text || '').slice(0, 16)}`
  if (t === 'Container')
    return String(node.props?.direction) === 'row' ? '横向容器' : '纵向容器'
  if (t === 'Divider') return '分隔线'
  return t
}

export function bindingHint(node: StudioNode, _columns: string[] = []): string {
  const t = String(node.type)
  const b = node.binding || {}
  const ds = String(b.dataset_id || 'main')
  void _columns
  if (t === 'Text') {
    return `数据集 ${ds}：文案 {{列名}} 用该集第一行替换。`
  }
  if (t === 'Kpi') {
    const col = String(b.value_column || '')
    if (!col) return `数据集 ${ds}：选数值列（第一行）。`
    return `数据集 ${ds} · 列「${col}」第一行。`
  }
  if (t === 'Table') {
    return `数据集 ${ds}：整表渲染，可设表风格与最大行数。`
  }
  if (t === 'Chart') {
    const cat = String(b.category_column || '')
    const val = String(b.value_column || '')
    const ct = String(node.props?.chart_type || 'bar')
    const map: Record<string, string> = { bar: '柱状图', pie: '饼图', line: '折线图' }
    if (!cat || !val) return `数据集 ${ds}：${map[ct]} 需分类列 + 数值列。`
    return `${map[ct]} @${ds}：${cat} → ${val}`
  }
  if (t === 'Alert') {
    return `告警条文案支持 {{列}}，取数据集 ${ds} 第一行。`
  }
  return '布局/装饰组件，不直接绑列。'
}

export function newComponent(type: string): StudioNode {
  const id = nid()
  switch (type) {
    case 'Text':
      return {
        id,
        type: 'Text',
        props: { variant: 'body', text: '请输入文案，可用 {{列名}}' },
        binding: { dataset_id: 'main' },
        visible: true,
      }
    case 'Kpi':
      return {
        id,
        type: 'Kpi',
        props: { label: '指标' },
        binding: { dataset_id: 'main', value_column: '', label: '指标' },
        visible: true,
      }
    case 'Table':
      return {
        id,
        type: 'Table',
        props: { style: 'business', color_ratios: true, max_rows: 50 },
        binding: { dataset_id: 'main' },
        visible: true,
      }
    case 'Chart':
    case 'ChartBar':
      return {
        id,
        type: 'Chart',
        props: { chart_type: 'bar', title: '柱状图', max_rows: 12 },
        binding: { dataset_id: 'main', category_column: '', value_column: '' },
        visible: true,
      }
    case 'ChartPie':
      return {
        id,
        type: 'Chart',
        props: { chart_type: 'pie', title: '饼图', max_rows: 12 },
        binding: { dataset_id: 'main', category_column: '', value_column: '' },
        visible: true,
      }
    case 'ChartLine':
      return {
        id,
        type: 'Chart',
        props: { chart_type: 'line', title: '折线图', max_rows: 14 },
        binding: { dataset_id: 'main', category_column: '', value_column: '' },
        visible: true,
      }
    case 'Alert':
      return {
        id,
        type: 'Alert',
        props: { level: 'error', text: '请注意：{{指标}} 出现异常' },
        binding: { dataset_id: 'main' },
        visible: true,
      }
    case 'Divider':
      return { id, type: 'Divider', props: {}, binding: {}, visible: true }
    case 'Container':
      return {
        id,
        type: 'Container',
        props: { direction: 'row', gap: 8 },
        binding: {},
        visible: true,
        children: [],
      }
    default:
      return { id, type, props: {}, binding: {}, visible: true }
  }
}

export function applyColumnToNode(
  node: StudioNode,
  column: string,
  role?: 'category' | 'value' | 'auto',
): Partial<StudioNode> {
  const t = String(node.type)
  const mode = role || 'auto'
  if (t === 'Text' || t === 'Alert') {
    const key = t === 'Alert' ? 'text' : 'text'
    const prev = String(node.props?.[key] || '')
    const token = `{{${column}}}`
    return { props: { ...node.props, [key]: prev ? `${prev} ${token}` : token } }
  }
  if (t === 'Kpi') {
    return {
      props: { ...node.props, label: column },
      binding: { ...node.binding, value_column: column, label: column, dataset_id: node.binding?.dataset_id || 'main' },
    }
  }
  if (t === 'Chart') {
    const b: Record<string, unknown> = {
      ...node.binding,
      dataset_id: node.binding?.dataset_id || 'main',
    }
    if (mode === 'category' || (mode === 'auto' && !b.category_column)) {
      b.category_column = column
    } else if (mode === 'value' || mode === 'auto') {
      b.value_column = column
    }
    return { binding: b }
  }
  if (t === 'Table') {
    return { binding: { ...node.binding, dataset_id: node.binding?.dataset_id || 'main' } }
  }
  return {}
}

export function extractArtboardFromJob(renderSpec: unknown): ArtboardDoc | null {
  if (!renderSpec || typeof renderSpec !== 'object' || Array.isArray(renderSpec)) return null
  const spec = renderSpec as Record<string, unknown>
  if (spec.kind === 'artboard' && spec.tree) return spec as ArtboardDoc
  const nested = spec.artboard_doc || spec.studio
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const n = nested as ArtboardDoc
    if (n.tree) return n
  }
  return null
}

export function syncMainDataset(
  board: ArtboardDoc,
  dataSourceId: string | undefined,
  sql: string,
): ArtboardDoc {
  const datasets = [...(board.datasets || [])]
  const mainIdx = datasets.findIndex((d) => d.id === 'main')
  const main: StudioDataset = {
    id: 'main',
    name: '主查询',
    data_source_id: dataSourceId ?? null,
    sql,
  }
  if (mainIdx >= 0) datasets[mainIdx] = { ...datasets[mainIdx], ...main }
  else datasets.unshift(main)
  return { ...board, datasets }
}

export function upsertDataset(board: ArtboardDoc, ds: StudioDataset): ArtboardDoc {
  const datasets = [...(board.datasets || [])]
  const i = datasets.findIndex((d) => d.id === ds.id)
  if (i >= 0) datasets[i] = { ...datasets[i], ...ds }
  else datasets.push(ds)
  return { ...board, datasets }
}

export function ensureSecondaryDataset(board: ArtboardDoc): ArtboardDoc {
  const has = (board.datasets || []).some((d) => d.id !== 'main')
  if (has) return board
  return upsertDataset(board, {
    id: 'trend',
    name: '第二数据集',
    data_source_id: null,
    sql: DEMO_TREND_SQL,
  })
}
