import type { ArtboardDoc, StudioNode } from '../../api/types'

export function nid(): string {
  return Math.random().toString(16).slice(2, 14)
}

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
      theme: { color: '#1677ff', table_style: 'business' },
      layout_default: 'flow',
    },
    datasets: [
      {
        id: 'main',
        name: '主查询',
        data_source_id: null,
        sql:
          "SELECT '演示院区' AS 院区, 1200 AS 门诊量, 80 AS 住院, '12.5%' AS 同比\n" +
          "UNION ALL SELECT '对照', 980, 72, '-3.2%'",
      },
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

export function emptyArtboard(): ArtboardDoc {
  return {
    version: 3,
    kind: 'artboard',
    artboard: {
      width: 750,
      theme: { color: '#1677ff', table_style: 'business' },
      layout_default: 'flow',
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

/** Move node among siblings under the same parent (root-level list for S1). */
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

export function flattenOutline(
  node: StudioNode,
  depth = 0,
): { id: string; type: string; depth: number; label: string }[] {
  const label = nodeLabel(node)
  const self = node.id === 'root' ? [] : [{ id: node.id, type: String(node.type), depth, label }]
  const kids = (node.children || []).flatMap((ch) => flattenOutline(ch, depth + (node.id === 'root' ? 0 : 1)))
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
    const title = String(node.props?.title || '')
    return `${ct === 'pie' ? '饼图' : '柱状图'}${title ? ` · ${title}` : ''}`
  }
  if (t === 'Container')
    return String(node.props?.direction) === 'row' ? '横向容器' : '纵向容器'
  if (t === 'Divider') return '分隔线'
  return t
}

/** Human-readable binding summary for UI guidance. */
export function bindingHint(node: StudioNode, columns: string[]): string {
  const t = String(node.type)
  const b = node.binding || {}
  if (t === 'Text') {
    return '文案里写 {{列名}}，编译时用「取数结果第一行」替换。例如 {{院区}} 运营日报'
  }
  if (t === 'Kpi') {
    const col = String(b.value_column || '')
    if (!col) return '请在属性里选「数值列」，或取数后点列名芯片绑定。取第一行该列的值。'
    if (columns.length && !columns.includes(col))
      return `已绑列「${col}」但当前结果集没有该列，请重新选列。`
    return `显示第一行「${col}」的值作为大数字。`
  }
  if (t === 'Table') {
    return '整表渲染：SQL 返回的所有行/列（可限制最大行数）。无需逐列绑定。'
  }
  if (t === 'Chart') {
    const cat = String(b.category_column || '')
    const val = String(b.value_column || '')
    const ct = String(node.props?.chart_type || 'bar')
    if (!cat || !val)
      return `请指定「分类列」和「数值列」。${ct === 'pie' ? '饼图' : '柱状图'}按每一行画一个系列。`
    return `${ct === 'pie' ? '饼图' : '柱状图'}：分类=${cat}，数值=${val}（每行一个扇区/柱）。`
  }
  return '此组件不直接绑数据列。'
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
        binding: {
          dataset_id: 'main',
          category_column: '',
          value_column: '',
        },
        visible: true,
      }
    case 'ChartPie':
      return {
        id,
        type: 'Chart',
        props: { chart_type: 'pie', title: '饼图', max_rows: 12 },
        binding: {
          dataset_id: 'main',
          category_column: '',
          value_column: '',
        },
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

/** Apply a column chip click to the selected node in a smart way. */
export function applyColumnToNode(
  node: StudioNode,
  column: string,
  role?: 'category' | 'value' | 'auto',
): Partial<StudioNode> {
  const t = String(node.type)
  const mode = role || 'auto'
  if (t === 'Text') {
    const prev = String(node.props?.text || '')
    const token = `{{${column}}}`
    return { props: { ...node.props, text: prev ? `${prev} ${token}` : token } }
  }
  if (t === 'Kpi') {
    return {
      props: { ...node.props, label: column },
      binding: { ...node.binding, value_column: column, label: column, dataset_id: 'main' },
    }
  }
  if (t === 'Chart') {
    const b: Record<string, unknown> = { ...node.binding, dataset_id: 'main' }
    if (mode === 'category' || (mode === 'auto' && !b.category_column)) {
      b.category_column = column
    } else if (mode === 'value' || mode === 'auto') {
      b.value_column = column
    }
    return { binding: b }
  }
  if (t === 'Table') {
    return { binding: { ...node.binding, dataset_id: 'main' } }
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
