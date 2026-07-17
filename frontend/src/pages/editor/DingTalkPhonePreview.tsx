/**
 * 钉钉手机端「一条推送消息」真实尺寸预览。
 *
 * 调研结论（钉钉机器人群聊 / Markdown）：
 * - 一次推送应对应聊天里的 **一条** 机器人消息（markdown 卡片），不是 N 个气泡
 * - markdown.title 只在会话列表/通知透出，聊天气泡内主要是 text 正文
 * - 正文支持钉钉 MD 子集（# 标题、**加粗**、列表、链接、<font color>、![](url)）
 * - 成图以「整图」形式出现在消息流中，消息体 **高度随内容撑开，无内部滚动条**
 * - 仅会话列表区域可滚动；单条消息不会出现嵌套 scrollbar
 *
 * 尺寸参考：常见手机逻辑宽 375px（iPhone 标准），聊天气泡约屏宽 − 头像 − 边距。
 */
import type { CSSProperties, ReactNode } from 'react'
import { dingTalkToPreviewHtml, isEmptyRich } from './dingtalkMd'

export type DingTalkPushContent = {
  /** 会话列表/通知标题（markdown.title） */
  title?: string
  /** 机器人显示名 */
  botName?: string
  /**
   * 钉钉 Markdown 正文（已做 {{字段}} 替换的 HTML 或 MD）。
   * 多段文案应已合并为一段。
   */
  markdown?: string
  /**
   * 合成后的推送图（多画布已纵向拼成一块）。
   * 钉钉 OpenAPI 常为独立 image 消息；产品预览按「一条推送」叠在同一卡片内示意。
   */
  image?: ReactNode
  /** 空状态说明 */
  emptyHint?: string
}

type Props = {
  content: DingTalkPushContent
  /** 设备逻辑宽度，默认 375（真实手机常见） */
  deviceWidth?: number
  /** 屏幕高度，默认 720（可视聊天区） */
  deviceHeight?: number
}

/** 钉钉群聊常见灰底 */
const CHAT_BG = '#EDEDED'
const BUBBLE_BG = '#FFFFFF'
const TEXT = '#171A1D'
const MUTED = '#8A8A8A'

export function DingTalkPhonePreview({
  content,
  deviceWidth = 375,
  deviceHeight = 720,
}: Props) {
  // 外框：模拟真机边框 + 圆角；内容区严格 deviceWidth
  const bezel = 10
  const outerW = deviceWidth + bezel * 2
  const statusH = 44
  const navH = 44
  const homeH = 20
  const chatH = deviceHeight - statusH - navH - homeH

  // 气泡：左头像 36 + gap 8 + 右边距 12 → 内容约 deviceWidth - 68
  const avatar = 36
  const bubbleMax = deviceWidth - 12 - avatar - 8 - 12
  // 图片在气泡内再减 padding
  const imageInnerW = bubbleMax - 16

  const hasMd = content.markdown && !isEmptyRich(content.markdown)
  const hasImage = Boolean(content.image)
  const empty = !hasMd && !hasImage

  const shell: CSSProperties = {
    width: outerW,
    maxWidth: '100%',
    margin: '0 auto',
    background: '#1c1c1e',
    borderRadius: 36,
    padding: bezel,
    boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
    boxSizing: 'border-box',
  }

  const screen: CSSProperties = {
    width: deviceWidth,
    height: deviceHeight,
    background: CHAT_BG,
    borderRadius: 28,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  }

  return (
    <div style={shell}>
      <div style={screen}>
        {/* 状态栏 — 真机比例 */}
        <div
          style={{
            height: statusH,
            background: '#FFFFFF',
            color: TEXT,
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            padding: '0 20px 6px',
            boxSizing: 'border-box',
            borderBottom: 'none',
          }}
        >
          <span>9:41</span>
          <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7 }}>████ ▄▄ 📶</span>
        </div>

        {/* 群聊导航 — 钉钉白底顶栏 */}
        <div
          style={{
            height: navH,
            background: '#FFFFFF',
            borderBottom: '1px solid #E7E7E7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <span style={{ position: 'absolute', left: 12, fontSize: 20, color: TEXT, lineHeight: 1 }}>
            ‹
          </span>
          <div style={{ textAlign: 'center', maxWidth: '70%' }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 16,
                color: TEXT,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {content.title || '数据推送群'}
            </div>
          </div>
          <span style={{ position: 'absolute', right: 14, fontSize: 18, color: TEXT }}>···</span>
        </div>

        {/* 会话区：仅此处可滚动；消息卡片本身不滚动 */}
        <div
          style={{
            flex: 1,
            height: chatH,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            padding: '12px 12px 24px',
            boxSizing: 'border-box',
            background: CHAT_BG,
          }}
        >
          <div
            style={{
              textAlign: 'center',
              fontSize: 11,
              color: MUTED,
              margin: '4px 0 14px',
              lineHeight: 1.4,
            }}
          >
            模拟手机 {deviceWidth}×{deviceHeight} · 一条机器人推送
          </div>

          {/* —— 唯一一条机器人消息 —— */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div
              style={{
                width: avatar,
                height: avatar,
                borderRadius: 6,
                background: 'linear-gradient(145deg, #4da3ff, #0089ff)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              推
            </div>
            <div style={{ maxWidth: bubbleMax, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 4, lineHeight: 1.2 }}>
                {content.botName || '数据推送机器人'}
              </div>

              {/* 钉钉 markdown 卡片：白底、圆角、无内部滚动 */}
              <div
                style={{
                  background: BUBBLE_BG,
                  borderRadius: 8,
                  overflow: 'hidden',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                  // 关键：消息体随内容增高，禁止 overflow:auto
                  maxHeight: 'none',
                  overflowY: 'visible',
                }}
              >
                {empty ? (
                  <div
                    style={{
                      padding: '16px 12px',
                      fontSize: 13,
                      color: MUTED,
                      lineHeight: 1.5,
                    }}
                  >
                    {content.emptyHint || '暂无推送内容：请编辑文案或组装画布'}
                  </div>
                ) : (
                  <>
                    {hasMd ? (
                      <div
                        className="dingtalk-md-msg"
                        style={{
                          padding: '10px 12px',
                          fontSize: 15,
                          lineHeight: 1.55,
                          color: TEXT,
                          wordBreak: 'break-word',
                          // 钉钉正文排版
                        }}
                        dangerouslySetInnerHTML={{
                          __html: dingTalkToPreviewHtml(String(content.markdown)),
                        }}
                      />
                    ) : null}
                    {hasImage ? (
                      <div
                        style={{
                          // 图与上文案之间细分割，贴近钉钉图文卡片
                          borderTop: hasMd ? '1px solid #F0F0F0' : undefined,
                          padding: hasMd ? '8px' : 0,
                          // 整图展示，禁止裁切滚动
                          overflow: 'visible',
                        }}
                      >
                        {/* 强制子图按气泡宽度展示 */}
                        <div style={{ width: imageInnerW, maxWidth: '100%' }}>
                          {content.image}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Home indicator */}
        <div
          style={{
            height: homeH,
            background: CHAT_BG,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 120,
              height: 4,
              borderRadius: 2,
              background: '#c4c4c4',
            }}
          />
        </div>
      </div>
    </div>
  )
}

/** @deprecated 旧多气泡 API；请用 content 单消息 */
export type DingTalkBubble =
  | { kind: 'text'; htmlOrMd: string; label?: string }
  | { kind: 'image'; node: ReactNode; label?: string }
  | { kind: 'hint'; text: string }
