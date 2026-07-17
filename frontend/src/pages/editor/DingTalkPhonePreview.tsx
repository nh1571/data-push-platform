/**
 * 钉钉手机端「推送到达」预览（按真实逻辑尺寸与 Markdown 卡片样式打磨）。
 *
 * 顺序：图前文案 → 合成推送图 → 图后文案（不会把图后文案合到图前）。
 * 消息体无内部滚动条；仅会话列表区域可滚。
 */
import type { CSSProperties, ReactNode } from 'react'
import { dingTalkToPreviewHtml, isEmptyRich } from './dingtalkMd'

export type DingTalkPushContent = {
  title?: string
  botName?: string
  /** 图前 Markdown */
  markdownBefore?: string
  /** 图后 Markdown */
  markdownAfter?: string
  /** @deprecated 等价于 markdownBefore */
  markdown?: string
  image?: ReactNode
  emptyHint?: string
}

type Props = {
  content: DingTalkPushContent
  deviceWidth?: number
  deviceHeight?: number
}

const CHAT_BG = '#EDEDED'
const BUBBLE_BG = '#FFFFFF'
const TEXT = '#171A1D'
const MUTED = '#8F959E'
const LINK = '#0089FF'

export function DingTalkPhonePreview({
  content,
  deviceWidth = 375,
  deviceHeight = 780,
}: Props) {
  const bezel = 12
  const outerW = deviceWidth + bezel * 2
  const statusH = 48
  const navH = 48
  const homeH = 22
  const chatH = deviceHeight - statusH - navH - homeH

  const avatar = 40
  const sidePad = 12
  const gap = 8
  const bubbleMax = deviceWidth - sidePad * 2 - avatar - gap
  const contentPadX = 12
  const imageInnerW = bubbleMax - contentPadX * 2

  const before = (content.markdownBefore ?? content.markdown ?? '').trim()
  const after = (content.markdownAfter ?? '').trim()
  const hasBefore = before && !isEmptyRich(before)
  const hasAfter = after && !isEmptyRich(after)
  const hasImage = Boolean(content.image)
  const empty = !hasBefore && !hasAfter && !hasImage

  const shell: CSSProperties = {
    width: outerW,
    maxWidth: '100%',
    margin: '0 auto',
    background: 'linear-gradient(160deg,#2c2c2e 0%,#1c1c1e 100%)',
    borderRadius: 40,
    padding: bezel,
    boxShadow: '0 20px 50px rgba(0,0,0,0.32)',
    boxSizing: 'border-box',
  }

  const screen: CSSProperties = {
    width: deviceWidth,
    height: deviceHeight,
    background: CHAT_BG,
    borderRadius: 32,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  }

  return (
    <div style={shell}>
      <div style={screen}>
        {/* 刘海/状态栏 */}
        <div
          style={{
            height: statusH,
            background: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <div
              style={{
                width: 96,
                height: 22,
                background: '#1c1c1e',
                borderRadius: 12,
              }}
            />
          </div>
          <div
            style={{
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 18px 2px',
              fontSize: 12,
              fontWeight: 600,
              color: TEXT,
            }}
          >
            <span>9:41</span>
            <span style={{ fontSize: 10, letterSpacing: 1, opacity: 0.75 }}>●●● 5G ▮▮▮</span>
          </div>
        </div>

        {/* 导航 */}
        <div
          style={{
            height: navH,
            background: '#FFFFFF',
            borderBottom: '0.5px solid #E5E5E5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 14,
              fontSize: 22,
              color: TEXT,
              lineHeight: 1,
              fontWeight: 300,
            }}
          >
            ‹
          </span>
          <div style={{ textAlign: 'center', maxWidth: '68%' }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 17,
                color: TEXT,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {content.title || '数据推送群'}
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>群聊</div>
          </div>
          <span style={{ position: 'absolute', right: 16, fontSize: 18, color: TEXT }}>···</span>
        </div>

        {/* 会话列表：唯一可滚动区 */}
        <div
          style={{
            flex: 1,
            height: chatH,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            padding: `${sidePad}px ${sidePad}px 28px`,
            boxSizing: 'border-box',
            background: CHAT_BG,
          }}
        >
          <div
            style={{
              textAlign: 'center',
              fontSize: 11,
              color: MUTED,
              marginBottom: 14,
              lineHeight: 1.4,
            }}
          >
            今天 09:41
          </div>

          <div style={{ display: 'flex', gap, alignItems: 'flex-start' }}>
            {/* 机器人头像 */}
            <div
              style={{
                width: avatar,
                height: avatar,
                borderRadius: 8,
                background: 'linear-gradient(145deg, #5eb1ff 0%, #0089ff 55%, #0066cc 100%)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
              }}
            >
              推
            </div>

            <div style={{ maxWidth: bubbleMax, minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 12,
                  color: MUTED,
                  marginBottom: 5,
                  lineHeight: 1.2,
                }}
              >
                {content.botName || '数据推送机器人'}
              </div>

              {/* 钉钉 Markdown 消息卡片：一条推送视觉单元 */}
              <div
                style={{
                  background: BUBBLE_BG,
                  borderRadius: 10,
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  maxHeight: 'none',
                  overflowY: 'visible',
                }}
              >
                {empty ? (
                  <div
                    style={{
                      padding: '18px 14px',
                      fontSize: 14,
                      color: MUTED,
                      lineHeight: 1.5,
                    }}
                  >
                    {content.emptyHint || '暂无推送内容'}
                  </div>
                ) : (
                  <>
                    {hasBefore ? (
                      <MdBlock htmlOrMd={before} padBottom={!hasImage && !hasAfter} />
                    ) : null}

                    {hasImage ? (
                      <div
                        style={{
                          borderTop: hasBefore ? '0.5px solid #F0F0F0' : undefined,
                          borderBottom: hasAfter ? '0.5px solid #F0F0F0' : undefined,
                          padding: hasBefore || hasAfter ? '8px' : 0,
                          background: '#FAFAFA',
                          overflow: 'visible',
                        }}
                      >
                        <div
                          style={{
                            width: imageInnerW,
                            maxWidth: '100%',
                            borderRadius: 6,
                            overflow: 'hidden',
                            background: '#fff',
                            border: '0.5px solid #ECECEC',
                          }}
                        >
                          {content.image}
                        </div>
                      </div>
                    ) : null}

                    {hasAfter ? <MdBlock htmlOrMd={after} padBottom /> : null}
                  </>
                )}
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: MUTED,
                  marginTop: 6,
                  lineHeight: 1.3,
                }}
              >
                图前 / 图 / 图后顺序 · 多画布已合成一张图
              </div>
            </div>
          </div>
        </div>

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
              width: 118,
              height: 4,
              borderRadius: 2,
              background: '#C8C8C8',
            }}
          />
        </div>
      </div>
    </div>
  )
}

function MdBlock({
  htmlOrMd,
  padBottom = true,
}: {
  htmlOrMd: string
  padBottom?: boolean
}) {
  return (
    <div
      className="dingtalk-md-msg"
      style={{
        padding: padBottom ? '11px 12px 12px' : '11px 12px 8px',
        fontSize: 15,
        lineHeight: 1.55,
        color: TEXT,
        wordBreak: 'break-word',
        letterSpacing: 0.1,
      }}
      dangerouslySetInnerHTML={{
        __html: dingTalkToPreviewHtml(htmlOrMd),
      }}
    />
  )
}

// 预览用：链接色与钉钉一致（class 可选）
void LINK
