/**
 * 多画布 Artboard 模型工具。
 *
 * 兼容旧文档：仅有 `tree` 时自动升为单画布 `canvases[0]`。
 * 推送顺序由 `compose.segments` 描述：文案段 + 画布段交错。
 */
import type { ArtboardDoc, StudioCanvasBoard, StudioComposeSegment, StudioNode } from '../../api/types'
import { nid } from './studioUtils'

/** 保证 root 容器结构 */
export function emptyCanvasTree(): StudioNode {
  return {
    id: 'root',
    type: 'Container',
    props: { direction: 'column', gap: 12 },
    children: [],
    binding: {},
  }
}

export function newCanvas(name?: string, width = 750): StudioCanvasBoard {
  return {
    id: `canvas_${nid()}`,
    name: name || '画布',
    width,
    show_chrome: true,
    chrome_title: '数据推送',
    theme: { pack: 'business', color: '#1677ff', table_style: 'business' },
    tree: emptyCanvasTree(),
  }
}

/** 从旧 tree 或已有 canvases 得到画布列表（至少 1 个） */
export function listCanvases(doc: ArtboardDoc): StudioCanvasBoard[] {
  if (doc.canvases && doc.canvases.length > 0) {
    return doc.canvases.map((c, i) => ({
      ...c,
      id: c.id || `canvas_${i}`,
      name: c.name || `画布 ${i + 1}`,
      tree: c.tree || emptyCanvasTree(),
      width: c.width || doc.artboard?.width || 750,
    }))
  }
  // 旧文档：单一 tree
  const tree = doc.tree || emptyCanvasTree()
  return [
    {
      id: 'canvas_main',
      name: '画布 1',
      width: doc.artboard?.width || 750,
      show_chrome: doc.artboard?.show_chrome,
      chrome_title: doc.artboard?.chrome_title,
      theme: doc.artboard?.theme,
      tree,
    },
  ]
}

/** 从各画布树收集组件实例，作为 library 缺省迁移源 */
export function harvestLibrary(doc: ArtboardDoc): StudioNode[] {
  if (doc.library && doc.library.length > 0) {
    return doc.library.map((n) => ({ ...n }))
  }
  const seen = new Map<string, StudioNode>()
  for (const c of listCanvases(doc)) {
    for (const n of canvasChildren(c)) {
      if (n?.id && !seen.has(n.id)) seen.set(n.id, { ...n })
    }
  }
  // 兼容仅有 tree
  if (seen.size === 0 && doc.tree?.children) {
    for (const n of doc.tree.children) {
      if (n?.id && !seen.has(n.id)) seen.set(n.id, { ...n })
    }
  }
  return [...seen.values()]
}

/** 深拷贝节点（新 id），用于「放到画布」；保留 library_id 溯源 */
export function cloneNodeForCanvas(src: StudioNode, layoutIndex = 0): StudioNode {
  const raw = JSON.parse(JSON.stringify(src)) as StudioNode
  const libId = String(src.props?.library_id || src.id)
  raw.id = `n_${nid()}`
  raw.props = {
    ...(raw.props || {}),
    library_id: libId,
    // 清旧坐标，进入画布后由 ensureComposeLayouts 补
    compose_x: 12,
    compose_y: 12 + layoutIndex * 200,
    compose_w: raw.props?.compose_w ?? 700,
    compose_h: raw.props?.compose_h ?? 180,
  }
  return raw
}

/** 归一化文档：补 library + canvases + segments，并回写 tree=第一画布 */
export function normalizeArtboardDoc(doc: ArtboardDoc): ArtboardDoc {
  const canvases = listCanvases(doc)
  const library = harvestLibrary({ ...doc, canvases })
  const compose = { ...(doc.compose || {}) }
  let segments = compose.segments
  if (!segments || !segments.length) {
    segments = defaultSegments(canvases, compose.text_before, compose.text_after)
  } else {
    // 丢弃已删除画布的段
    const ids = new Set(canvases.map((c) => c.id))
    segments = segments.filter(
      (s) => s.type === 'text' || (s.type === 'canvas' && ids.has(s.canvas_id)),
    )
    // 新画布若未出现在 segments，追加到末尾（图前/图后文案之间）
    const present = new Set(
      segments.filter((s) => s.type === 'canvas').map((s) => (s as { canvas_id: string }).canvas_id),
    )
    for (const c of canvases) {
      if (!present.has(c.id)) {
        // 插在最后一个文案段之前（通常即图后文案）
        const lastTextIdx: number = findLastIndex(segments, (s) => s.type === 'text')
        const seg: StudioComposeSegment = {
          id: `seg_${nid()}`,
          type: 'canvas',
          canvas_id: c.id,
        }
        if (lastTextIdx > 0) {
          segments = [
            ...segments.slice(0, lastTextIdx),
            seg,
            ...segments.slice(lastTextIdx),
          ]
        } else {
          segments = [...segments, seg]
        }
      }
    }
  }
  return {
    ...doc,
    library,
    canvases,
    tree: canvases[0]?.tree || doc.tree,
    artboard: {
      ...doc.artboard,
      width: canvases[0]?.width || doc.artboard?.width || 750,
      show_chrome: canvases[0]?.show_chrome ?? doc.artboard?.show_chrome,
      chrome_title: canvases[0]?.chrome_title ?? doc.artboard?.chrome_title,
      theme: canvases[0]?.theme || doc.artboard?.theme,
    },
    compose: {
      ...compose,
      segments,
      text_format: compose.text_format || 'html',
    },
  }
}

function findLastIndex<T>(arr: T[], pred: (t: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i]!)) return i
  }
  return -1
}

export function defaultSegments(
  canvases: StudioCanvasBoard[],
  textBefore?: string,
  textAfter?: string,
): StudioComposeSegment[] {
  const segs: StudioComposeSegment[] = []
  segs.push({
    id: `seg_${nid()}`,
    type: 'text',
    html: textBefore || '',
  })
  for (const c of canvases) {
    segs.push({ id: `seg_${nid()}`, type: 'canvas', canvas_id: c.id })
  }
  segs.push({
    id: `seg_${nid()}`,
    type: 'text',
    html: textAfter || '',
  })
  return segs
}

export function canvasChildren(c: StudioCanvasBoard | undefined): StudioNode[] {
  return [...(c?.tree?.children || [])]
}

export function updateCanvasInDoc(
  doc: ArtboardDoc,
  canvasId: string,
  patch: Partial<StudioCanvasBoard>,
): ArtboardDoc {
  const n = normalizeArtboardDoc(doc)
  const canvases = (n.canvases || []).map((c) =>
    c.id === canvasId ? { ...c, ...patch, tree: patch.tree || c.tree } : c,
  )
  const active = canvases.find((c) => c.id === canvasId)
  return {
    ...n,
    canvases,
    // 兼容：若改的是第一画布，同步 tree
    tree: canvases[0]?.tree || n.tree,
    artboard:
      active && canvases[0]?.id === canvasId
        ? {
            ...n.artboard,
            width: active.width ?? n.artboard?.width,
            show_chrome: active.show_chrome,
            chrome_title: active.chrome_title,
            theme: active.theme || n.artboard?.theme,
          }
        : n.artboard,
  }
}

export function setCanvasTree(
  doc: ArtboardDoc,
  canvasId: string,
  tree: StudioNode,
): ArtboardDoc {
  return updateCanvasInDoc(doc, canvasId, { tree })
}
