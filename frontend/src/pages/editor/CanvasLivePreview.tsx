/**
 * 画布实时预览（本地 LiveComponent，不请求 Playwright）。
 *
 * 钉钉消息内图片是「整图展示、高度随内容撑开」，消息体本身无滚动条。
 * 本组件按气泡宽度等比缩放，不设内部 maxHeight/overflow:auto。
 */
import type { StudioNode } from '../../api/types'
import { LiveComponent, type DatasetMaps } from './LiveComponent'

export type CanvasPreviewSpec = {
  id?: string
  name?: string
  nodes: StudioNode[]
  logicalWidth?: number
  chrome?: { show?: boolean; title?: string; color?: string }
}

type Props = {
  /** 单画布：nodes；多画布：传入 canvases 纵向拼成一块（一条推送图） */
  nodes?: StudioNode[]
  canvases?: CanvasPreviewSpec[]
  data: DatasetMaps
  logicalWidth?: number
  /** 消息气泡内可用宽（钉钉约屏宽-头像-边距，常见 ~240–280） */
  displayWidth?: number
  chrome?: { show?: boolean; title?: string; color?: string }
  /** 是否显示「实时示意」脚注（正式钉钉消息无此条，默认 false） */
  showHint?: boolean
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

function OneCanvas({
  nodes,
  data,
  logicalWidth,
  displayWidth,
  chrome,
}: {
  nodes: StudioNode[]
  data: DatasetMaps
  logicalWidth: number
  displayWidth: number
  chrome?: { show?: boolean; title?: string; color?: string }
}) {
  const scale = displayWidth / logicalWidth
  const layouts = nodes.map((n, i) => ({ node: n, layout: readLayout(n, logicalWidth, i) }))
  const bottom = layouts.reduce((m, { layout }) => Math.max(m, layout.y + layout.h + 16), 80)
  const scaledH = Math.max(40, bottom * scale)

  return (
    <div style={{ width: displayWidth, background: '#fff' }}>
      {chrome?.show !== false ? (
        <div
          style={{
            background: chrome?.color || '#1677ff',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            padding: '8px 10px',
            lineHeight: 1.3,
          }}
        >
          {chrome?.title || '数据推送'}
        </div>
      ) : null}
      {/* 高度随内容；禁止 overflow:auto —— 钉钉成图/消息内无滚动条 */}
      <div
        style={{
          width: displayWidth,
          height: scaledH,
          overflow: 'hidden',
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
            <div style={{ padding: 32, textAlign: 'center', color: '#999', fontSize: 13 }}>
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
    </div>
  )
}

export function CanvasLivePreview({
  nodes,
  canvases,
  data,
  logicalWidth = 750,
  displayWidth = 248,
  chrome,
  showHint = false,
}: Props) {
  const list: CanvasPreviewSpec[] =
    canvases && canvases.length > 0
      ? canvases
      : [{ nodes: nodes || [], logicalWidth, chrome }]

  return (
    <div style={{ width: displayWidth, maxWidth: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((c, i) => (
          <OneCanvas
            key={c.id || i}
            nodes={c.nodes}
            data={data}
            logicalWidth={c.logicalWidth || logicalWidth}
            displayWidth={displayWidth}
            chrome={c.chrome ?? chrome}
          />
        ))}
      </div>
      {showHint ? (
        <div
          style={{
            fontSize: 10,
            color: '#b0b0b0',
            textAlign: 'center',
            paddingTop: 4,
          }}
        >
          本地实时示意 · 正式推送为服务端整图截图
        </div>
      ) : null}
    </div>
  )
}
