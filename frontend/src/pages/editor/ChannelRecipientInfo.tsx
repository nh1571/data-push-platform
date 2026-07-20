/**
 * 通道收件人信息展示组件。
 *
 * 在编辑器推送步骤展示所选通道的收件人详情，
 * 解决 V1 选通道时看不到发给谁的问题。
 */
import { TeamOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons'
import { Spin, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { getChannel, listIdentities } from '../../api'
import type { Channel, Identity } from '../../api/types'

interface ChannelRecipientInfoProps {
  channelIds: string[]
}

interface ChannelInfo {
  channel: Channel
  recipients: Identity[]
  loading: boolean
}

function modeLabel(type: string): string {
  const m: Record<string, string> = {
    'dingtalk.webhook_robot': 'Webhook',
    'dingtalk.work_notice': '工作通知',
    'dingtalk.openapi_group_robot': '群发',
    'dingtalk.openapi_oto_robot': '单发',
  }
  return m[type] || type
}

export function ChannelRecipientInfo({ channelIds }: ChannelRecipientInfoProps) {
  const [channelInfos, setChannelInfos] = useState<Record<string, ChannelInfo>>({})

  useEffect(() => {
    if (!channelIds.length) return
    channelIds.forEach(async (cid) => {
      if (channelInfos[cid]) return
      setChannelInfos((prev) => ({
        ...prev,
        [cid]: { channel: {} as Channel, recipients: [], loading: true },
      }))
      try {
        const ch = await getChannel(cid)
        const cfg = (ch.config || {}) as Record<string, unknown>
        const ids: string[] = Array.isArray(cfg.recipient_identity_ids)
          ? (cfg.recipient_identity_ids as string[])
          : []
        let recipients: Identity[] = []
        if (ids.length > 0) {
          try {
            const all = await listIdentities({ channel_type: 'dingtalk' })
            recipients = all.filter((i) => ids.includes(i.id))
          } catch { /* ignore */ }
        }
        setChannelInfos((prev) => ({
          ...prev,
          [cid]: { channel: ch, recipients, loading: false },
        }))
      } catch {
        setChannelInfos((prev) => ({
          ...prev,
          [cid]: { ...prev[cid], loading: false },
        }))
      }
    })
  }, [channelIds])

  if (!channelIds.length) return null

  return (
    <div style={{ marginTop: 12 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        收件人
      </Typography.Text>
      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {channelIds.map((cid) => {
          const info = channelInfos[cid]
          if (!info || info.loading) {
            return (
              <div key={cid} style={{ fontSize: 12, color: '#999' }}>
                <Spin size="small" /> 加载中...
              </div>
            )
          }
          const { channel, recipients } = info
          return (
            <div
              key={cid}
              style={{
                padding: '6px 8px',
                background: '#fafafa',
                borderRadius: 4,
                border: '1px solid #f0f0f0',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 500 }}>
                {channel.name || cid.slice(0, 8)}
                <Tag style={{ marginLeft: 4, fontSize: 10 }}>{modeLabel(channel.type)}</Tag>
              </div>
              {recipients.length > 0 ? (
                <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {recipients.map((r) => (
                    <Tag
                      key={r.id}
                      icon={r.kind === 'person' ? <UserOutlined /> : <TeamOutlined />}
                      color={r.kind === 'person' ? 'blue' : 'green'}
                      style={{ fontSize: 11, margin: 0 }}
                    >
                      {r.name}
                      <span style={{ color: '#999', marginLeft: 2, fontSize: 10 }}>
                        ({r.external_id?.slice(0, 14)}{(r.external_id?.length || 0) > 14 ? '...' : ''})
                      </span>
                    </Tag>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#faad14', marginTop: 2 }}>
                  <WarningOutlined /> 未配置收件人 — 请前往「通道」页面补全
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
