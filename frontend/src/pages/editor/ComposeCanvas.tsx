/**
 * Free-form compose canvas: drag position, resize, style presets.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Empty, Typography } from 'antd'
import type { StudioNode } from '../../api/types'

export type ComposeLayout = {
  compose_x: number
  compose_y: number
  compose_w: number
  compose_h: number
  compose_style?: string
  compose_bg?: string
  compose_radius?: number
  compose_padding?: number
  compose_color?: string
  compose_opacity?: number
}

type Props = {
  canvasWidth: number
  canvasMinHeight: number
  chrome?: { show: boolean; title: string; color: string }
  nodes: StudioNode[]
  selectedId: string | null
  thumbs: Record<string, string>
  onSelect: (id: string | null) => void
  onChangeLayout: (id: string, layout: Partial<ComposeLayout>) => void
  typeLabel: (type: string, chart?: string) => string
}

function readLayout(node: StudioNode, canvasWidth: number, index: number): ComposeLayout {
  const p = node.props || {}
  const defaultY = 12 + index * 220
  // migrate legacy width %
  let w = Number(p.compose_w)
  if (!Number.isFinite(w) || w <= 0) {
    const pct = Number(p.compose_width)
    w = Number.isFinite(pct) && pct > 0 ? Math.round((canvasWidth * pct) / 100) : canvasWidth - 24
  }
  w = Math.max(120, Math.min(canvasWidth - 8, w))
  return {
    compose_x: Number.isFinite(Number(p.compose_x)) ? Number(p.compose_x) : 12,
    compose_y: Number.isFinite(Number(p.compose_y)) ? Number(p.compose_y) : defaultY,
    compose_w: w,
    compose_h: Number.isFinite(Number(p.compose_h)) ? Number(p.compose_h) : 200,
    compose_style: String(p.compose_style || 'card'),
    compose_bg: p.compose_bg ? String(p.compose_bg) : undefined,
    compose_radius: Number(p.compose_radius ?? 8),
    compose_padding: Number(p.compose_padding ?? 0),
    compose_color: p.compose_color ? String(p.compose_color) : undefined,
    compose_opacity: Number(p.compose_opacity ?? 1),
  }
}

function shellStyle(layout: ComposeLayout, selected: boolean): CSSProperties {
  const preset = layout.compose_style || 'card'
  const base: CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
    opacity: layout.compose_opacity ?? 1,
    borderRadius: layout.compose_radius ?? 8,
    padding: layout.compose_padding ?? 0,
    background: layout.compose_bg || '#fff',
  }
  if (preset === 'plain') {
    base.border = selected ? '2px solid #1677ff' : '1px dashed #d9d9d9'
    base.boxShadow = 'none'
  } else if (preset === 'border') {
    base.border = selected
      ? '2px solid #1677ff'
      : `1px solid ${layout.compose_color || '#d9d9d9'}`
    base.boxShadow = 'none'
  } else if (preset === 'shadow') {
    base.border = selected ? '2px solid #1677ff' : 'none'
    base.boxShadow = '0 4px 16px rgba(0,0,0,0.12)'
  } else {
    // card
    base.border = selected
      ? '2px solid #1677ff'
      : `1px solid ${layout.compose_color || '#e8e8e8'}`
    base.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'
  }
  return base
}

type DragMode = 'move' | 'resize' | null

export function ComposeCanvas({
  canvasWidth,
  canvasMinHeight,
  chrome,
  nodes,
  selectedId,
  thumbs,
  onSelect,
  onChangeLayout,
  typeLabel,
}: Props) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{
    id: string
    mode: DragMode
    startX: number
    startY: number
    orig: ComposeLayout
  } | null>(null)

  const layouts = nodes.map((n, i) => ({
    node: n,
    layout: readLayout(n, canvasWidth, i),
  }))

  const maxBottom = layouts.reduce(
    (m, { layout }) => Math.max(m, layout.compose_y + layout.compose_h + 24),
    canvasMinHeight,
  )

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!drag || !boardRef.current) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (drag.mode === 'move') {
        const x = Math.max(0, Math.min(canvasWidth - 40, drag.orig.compose_x + dx))
        const y = Math.max(0, drag.orig.compose_y + dy)
        onChangeLayout(drag.id, { compose_x: Math.round(x), compose_y: Math.round(y) })
      } else if (drag.mode === 'resize') {
        const w = Math.max(120, Math.min(canvasWidth - drag.orig.compose_x, drag.orig.compose_w + dx))
        const h = Math.max(80, drag.orig.compose_h + dy)
        onChangeLayout(drag.id, { compose_w: Math.round(w), compose_h: Math.round(h) })
      }
    },
    [drag, canvasWidth, onChangeLayout],
  )

  const onPointerUp = useCallback(() => setDrag(null), [])

  useEffect(() => {
    if (!drag) return
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [drag, onPointerMove, onPointerUp])

  const startDrag = (
    e: ReactPointerEvent,
    id: string,
    mode: DragMode,
    layout: ComposeLayout,
  ) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect(id)
    setDrag({
      id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...layout },
    })
  }

  return (
    <div
      style={{
        width: canvasWidth + 32,
        maxWidth: '100%',
        margin: '0 auto',
        background: '#c8c9cc',
        padding: 16,
        borderRadius: 8,
        userSelect: drag ? 'none' : undefined,
      }}
    >
      <div
        ref={boardRef}
        onClick={() => onSelect(null)}
        style={{
          width: canvasWidth,
          maxWidth: '100%',
          margin: '0 auto',
          background: '#fff',
          minHeight: maxBottom,
          borderRadius: 4,
          boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {chrome?.show ? (
          <div
            style={{
              background: chrome.color || '#1677ff',
              color: '#fff',
              padding: '12px 16px',
              fontWeight: 600,
              position: 'relative',
              zIndex: 1,
            }}
          >
            {chrome.title || '数据推送'}
          </div>
        ) : null}

        <div
          style={{
            position: 'relative',
            minHeight: maxBottom - (chrome?.show ? 48 : 0),
            height: maxBottom - (chrome?.show ? 48 : 0),
          }}
        >
          {nodes.length === 0 ? (
            <Empty
              style={{ paddingTop: 80 }}
              description="清单为空，请回「做组件」添加"
            />
          ) : (
            layouts.map(({ node, layout }, index) => {
              const selected = selectedId === node.id
              const thumb = thumbs[node.id] || String(node.props?.preview_image || '')
              const topOffset = chrome?.show ? 0 : 0
              return (
                <div
                  key={node.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(node.id)
                  }}
                  style={{
                    position: 'absolute',
                    left: layout.compose_x,
                    top: layout.compose_y + topOffset,
                    width: layout.compose_w,
                    height: layout.compose_h,
                    zIndex: selected ? 20 : 10 + index,
                    cursor: drag?.id === node.id && drag.mode === 'move' ? 'grabbing' : 'grab',
                  }}
                >
                  <div style={shellStyle(layout, selected)}>
                    <div
                      onPointerDown={(e) => startDrag(e, node.id, 'move', layout)}
                      style={{
                        fontSize: 11,
                        padding: '3px 8px',
                        background: selected ? '#e6f4ff' : 'rgba(0,0,0,0.04)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        borderBottom: '1px solid rgba(0,0,0,0.06)',
                        cursor: 'grab',
                      }}
                    >
                      <span style={{ opacity: 0.55 }}>⠿</span>
                      <Typography.Text style={{ fontSize: 11 }} ellipsis>
                        {typeLabel(
                          String(node.type),
                          String(node.props?.chart_type || ''),
                        )}
                      </Typography.Text>
                      <span style={{ marginLeft: 'auto', opacity: 0.45, fontSize: 10 }}>
                        {layout.compose_w}×{layout.compose_h}
                      </span>
                    </div>
                    <div
                      style={{
                        height: `calc(100% - 26px)`,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: layout.compose_bg || '#fafafa',
                      }}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          draggable={false}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            pointerEvents: 'none',
                          }}
                        />
                      ) : (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          无预览 · 点「刷新组件图」
                        </Typography.Text>
                      )}
                    </div>
                  </div>
                  {/* resize handle */}
                  {selected ? (
                    <div
                      onPointerDown={(e) => startDrag(e, node.id, 'resize', layout)}
                      style={{
                        position: 'absolute',
                        right: 2,
                        bottom: 2,
                        width: 14,
                        height: 14,
                        background: '#1677ff',
                        borderRadius: 2,
                        cursor: 'nwse-resize',
                        border: '2px solid #fff',
                        boxShadow: '0 0 2px rgba(0,0,0,0.3)',
                      }}
                      title="拖拽调整大小"
                    />
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

/** Initialize free-layout coords for nodes missing them. */
export function ensureComposeLayouts(
  nodes: StudioNode[],
  canvasWidth: number,
): { id: string; patch: Partial<ComposeLayout> }[] {
  const patches: { id: string; patch: Partial<ComposeLayout> }[] = []
  let y = 12
  for (const n of nodes) {
    const p = n.props || {}
    const has = p.compose_x != null && p.compose_y != null
    if (has) {
      const h = Number(p.compose_h) || 200
      const yy = Number(p.compose_y) || 0
      y = Math.max(y, yy + h + 12)
      continue
    }
    const w = canvasWidth - 24
    const h = 200
    patches.push({
      id: n.id,
      patch: {
        compose_x: 12,
        compose_y: y,
        compose_w: w,
        compose_h: h,
        compose_style: 'card',
      },
    })
    y += h + 12
  }
  return patches
}
