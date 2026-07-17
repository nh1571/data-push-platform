/**
 * 钉钉手机端消息预览（示意 UI，非官方 SDK）。
 *
 * 用于组装推送步骤：实时展示文案（钉钉 MD 子集）+ 画布占位/实时组件，
 * 避免每次改字都等服务端 Playwright 截图。
 */
import type { CSSProperties, ReactNode } from 'react'
import { dingTalkToPreviewHtml, isEmptyRich } from './dingtalkMd'

export type DingTalkBubble =
  | { kind: 'text'; htmlOrMd: string; label?: string }
  | { kind: 'image'; node: ReactNode; label?: string }
  | { kind: 'hint'; text: string }

type Props = {
  title?: string
  bubbles: DingTalkBubble[]
  /** 手机框宽度 */
  width?: number
}

const phoneShell: CSSProperties = {
  width: 320,
  maxWidth: '100%',
  margin: '0 auto',
  background: '#111',
  borderRadius: 28,
  padding: 10,
  boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
}

const screen: CSSProperties = {
  background: '#ededed',
  borderRadius: 20,
  overflow: 'hidden',
  minHeight: 520,
  display: 'flex',
  flexDirection: 'column',
}

export function DingTalkPhonePreview({ title, bubbles, width = 320 }: Props) {
  return (
    <div style={{ ...phoneShell, width }}>
      <div style={screen}>
        {/* 状态栏 */}
        <div
          style={{
            height: 28,
            background: '#1f1f1f',
            color: '#fff',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 14px',
          }}
        >
          <span>9:41</span>
          <span style={{ opacity: 0.75 }}>钉钉预览</span>
        </div>
        {/* 导航栏 */}
        <div
          style={{
            background: '#fff',
            borderBottom: '1px solid #e8e8e8',
            padding: '10px 12px',
            fontWeight: 600,
            fontSize: 15,
            textAlign: 'center',
            color: '#171a1d',
          }}
        >
          {title || '群消息'}
        </div>
        {/* 聊天区 */}
        <div
          style={{
            flex: 1,
            padding: '12px 10px 20px',
            overflow: 'auto',
            background: '#ededed',
          }}
        >
          <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginBottom: 12 }}>
            以下为钉钉消息示意 · 支持钉钉 Markdown 子集
          </div>
          {bubbles.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 40 }}>
              暂无内容
            </div>
          ) : (
            bubbles.map((b, i) => <Bubble key={i} bubble={b} />)
          )}
        </div>
      </div>
    </div>
  )
}

function Bubble({ bubble }: { bubble: DingTalkBubble }) {
  if (bubble.kind === 'hint') {
    return (
      <div
        style={{
          textAlign: 'center',
          fontSize: 11,
          color: '#8a8a8a',
          margin: '10px 0',
        }}
      >
        {bubble.text}
      </div>
    )
  }

  // 机器人消息：白底气泡 + 左侧小头像
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 6,
          background: 'linear-gradient(135deg,#3296fa,#0089ff)',
          color: '#fff',
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        机
      </div>
      <div style={{ maxWidth: '78%', minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 3 }}>
          数据推送机器人
          {bubble.label ? ` · ${bubble.label}` : ''}
        </div>
        <div
          style={{
            background: '#fff',
            borderRadius: '4px 10px 10px 10px',
            padding: bubble.kind === 'image' ? 6 : '8px 10px',
            fontSize: 14,
            lineHeight: 1.55,
            color: '#171a1d',
            boxShadow: '0 1px 1px rgba(0,0,0,0.04)',
            wordBreak: 'break-word',
          }}
        >
          {bubble.kind === 'text' ? (
            isEmptyRich(bubble.htmlOrMd) ? (
              <span style={{ color: '#bbb' }}>（空文案）</span>
            ) : (
              <div
                className="dingtalk-md-preview"
                dangerouslySetInnerHTML={{
                  __html: dingTalkToPreviewHtml(bubble.htmlOrMd),
                }}
              />
            )
          ) : (
            bubble.node
          )}
        </div>
      </div>
    </div>
  )
}
