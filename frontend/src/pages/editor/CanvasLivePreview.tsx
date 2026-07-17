/**
 * 画布实时预览（本地 LiveComponent，不请求 Playwright）。
 * 用于组装推送步骤钉钉气泡内的「图」示意。
 */
import type { StudioNode } from '../../api/types'
import { LiveComponent, type DatasetMaps } from './LiveComponent'

type Props = {
  nodes: StudioNode[]
  data: DatasetMaps
  /** 逻辑画布宽（与 compose 一致，默认 750） */
  logicalWidth?: number
  /** 预览区显示宽（手机气泡内，如 220） */
  displayWidth?: number
  chrome?: { show?: boolean; title?: string; color?: string }
  maxHeight?: number
}

function readLayout(node: StudioNode, canvasWidth: number, index: number) {
  const p = node.props || {}
  const defaultY = 12 + index * 180
  let w = Number(p.compose_w)
  if (!Number.isFinite(w) || w <= 0) {
    const pct = Number(p.compose_width)
    w = Number.isFinite(pct) && pct > 0 ? Math.round((canvasWidth * pct) / 100) : canvasWidth - 24
  }
  w = Math.max(80, Math.min(canvasWidth - 4, w))
  return {
    x: Number.isFinite(Number(p.compose_x)) ? Number(p.compose_x) : 8,
    y: Number.isFinite(Number(p.compose_y)) ? Number(p.compose_y) : defaultY,
    w,
    h: Number.isFinite(Number(p.compose_h)) ? Number(p.compose_h) : 140,
    bg: p.compose_bg ? String(p.compose_bg) : '#fff',
    radius: Number(p.compose_radius ?? 6),
    style: String(p.compose_style || 'card'),
    color: p.compose_color ? String(p.compose_color) : '#e8e8e8',
  }
}

export function CanvasLivePreview({
  nodes,
  data,
  logicalWidth = 750,
  displayWidth = 230,
  chrome,
  maxHeight = 320,
}: Props) {
  const scale = displayWidth / logicalWidth
  const layouts = nodes.map((n, i) => ({ node: n, layout: readLayout(n, logicalWidth, i) }))
  const bottom = layouts.reduce((m, { layout }) => Math.max(m, layout.y + layout.h + 16), 100)
  const scaledH = bottom * scale

  return (
    <div
      style={{
        width: '100%',
        background: '#fff',
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid #eee',
      }}
    >
      {chrome?.show !== false ? (
        <div
          style={{
            background: chrome?.color || '#1677ff',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            padding: '6px 8px',
          }}
        >
          {chrome?.title || '数据推送'}
        </div>
      ) : null}
      <div
        style={{
          width: displayWidth,
          maxWidth: '100%',
          height: Math.min(scaledH, maxHeight),
          overflow: 'auto',
          background: '#fafafa',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: logicalWidth,
            height: bottom,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {nodes.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#999', fontSize: 14 }}>
              画布为空
            </div>
          ) : (
            layouts.map(({ node, layout }) => (
              <div
                key={node.id}
                style={{
                  position: 'absolute',
                  left: layout.x,
                  top: layout.y,
                  width: layout.w,
                  height: layout.h,
                  overflow: 'hidden',
                  borderRadius: layout.radius,
                  background: layout.bg,
                  border:
                    layout.style === 'plain'
                      ? '1px dashed #ddd'
                      : `1px solid ${layout.color || '#e8e8e8'}`,
                  boxShadow:
                    layout.style === 'shadow' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                <LiveComponent
                  node={node}
                  data={data}
                  height={Math.max(40, layout.h - 4)}
                  themeColor={layout.color || '#1677ff'}
                />
              </div>
            ))
          )}
        </div>
      </div>
      <div
        style={{
          fontSize: 10,
          color: '#aaa',
          textAlign: 'center',
          padding: '3px 0',
          background: '#f7f7f7',
        }}
      >
        实时预览 · 正式推送为服务端截图
      </div>
    </div>
  )
}
