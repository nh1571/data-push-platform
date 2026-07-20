/**
 * 推送面板：通道选择 + 收件人展示 + 编译结果 + 推送按钮。
 *
 * 解决 V1 选通道时看不到收件人/模式/配置状态的问题。
 */
import {
  ApiOutlined,
  CompressOutlined,
  ReloadOutlined,
  SendOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Empty,
  List,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { useEffect, useState } from 'react'
import { getChannel, listChannels, listIdentities } from '../../../api'
import { getErrorMessage } from '../../../api/client'
import type { Channel, Identity } from '../../../api/types'
import type { StudioCompileResponse } from '../studioUtils'

/** 通道详情（含解密配置和收件人） */
interface ChannelDetail {
  channel: Channel
  recipients: Identity[]
  loading: boolean
  error?: string
}

export interface PushTabProps {
  channelIds: string[]
  onChannelIdsChange: (ids: string[]) => void
  compileResult: StudioCompileResponse | null
  compileLoading: boolean
  compileError: string | null
  onCompile: () => void
  pushing: boolean
  onTestPush: () => void
}

/** 从 type 提取模式标签 */
function modeLabel(type: string): string {
  const m: Record<string, string> = {
    'dingtalk.webhook_robot': 'Webhook 机器人',
    'dingtalk.work_notice': '工作通知',
    'dingtalk.openapi_group_robot': '应用机器人·群发',
    'dingtalk.openapi_oto_robot': '应用机器人·单发',
  }
  return m[type] || type
}

/** 单个通道条目：模式、名称、收件人 */
function ChannelItem({
  channelId,
  detail,
  onRemove,
}: {
  channelId: string
  detail?: ChannelDetail
  onRemove: () => void
}) {
  if (!detail || detail.loading) {
    return (
      <List.Item>
        <Spin size="small" /> <Typography.Text style={{ marginLeft: 8 }}>加载通道信息...</Typography.Text>
      </List.Item>
    )
  }
  if (detail.error) {
    return (
      <List.Item actions={[<Button key="rm" size="small" danger onClick={onRemove}>移除</Button>]}>
        <Typography.Text type="danger">{detail.error}</Typography.Text>
      </List.Item>
    )
  }
  const { channel, recipients } = detail
  return (
    <List.Item
      actions={[<Button key="rm" size="small" danger onClick={onRemove}>移除</Button>]}
    >
      <List.Item.Meta
        avatar={<ApiOutlined style={{ fontSize: 18, color: '#1677ff' }} />}
        title={
          <Space size={4}>
            <span>{channel.name}</span>
            <Tag style={{ fontSize: 11 }}>{modeLabel(channel.type)}</Tag>
          </Space>
        }
        description={
          <Space direction="vertical" size={2}>
            {recipients.length === 0 ? (
              <Typography.Text type="warning" style={{ fontSize: 12 }}>
                未配置收件人 — 请前往通道页或通讯录补全
              </Typography.Text>
            ) : (
              <Space size={4} wrap>
                {recipients.map((r) => (
                  <Tag
                    key={r.id}
                    icon={r.kind === 'person' ? <UserOutlined /> : <TeamOutlined />}
                    color={r.kind === 'person' ? 'blue' : 'green'}
                    style={{ fontSize: 11 }}
                  >
                    {r.name}
                    {r.external_id ? ` (${r.external_id.slice(0, 16)}${r.external_id.length > 16 ? '...' : ''})` : ''}
                  </Tag>
                ))}
              </Space>
            )}
          </Space>
        }
      />
    </List.Item>
  )
}

export function PushTab({
  channelIds,
  onChannelIdsChange,
  compileResult,
  compileLoading,
  compileError,
  onCompile,
  pushing,
  onTestPush,
}: PushTabProps) {
  const [allChannels, setAllChannels] = useState<Channel[]>([])
  const [details, setDetails] = useState<Record<string, ChannelDetail>>({})

  // 加载通道列表
  useEffect(() => {
    listChannels().then(setAllChannels).catch(() => {})
  }, [])

  // 为已选通道加载详情（配置 + 收件人）
  useEffect(() => {
    channelIds.forEach((cid) => {
      if (details[cid]) return
      setDetails((prev) => ({ ...prev, [cid]: { channel: {} as Channel, recipients: [], loading: true } }))
      getChannel(cid)
        .then(async (ch) => {
          // 从通道 config 中提取 recipient_identity_ids 加载收件人
          const cfg = ch.config || {}
          const ids: string[] = Array.isArray(cfg.recipient_identity_ids)
            ? (cfg.recipient_identity_ids as string[])
            : []
          let recipients: Identity[] = []
          if (ids.length > 0) {
            try {
              // 过滤出已选的 identity
              const all = await listIdentities({ channel_type: 'dingtalk' })
              recipients = all.filter((i) => ids.includes(i.id))
            } catch { /* ignore */ }
          }
          setDetails((prev) => ({
            ...prev,
            [cid]: { channel: ch, recipients, loading: false },
          }))
        })
        .catch((e) => {
          setDetails((prev) => ({
            ...prev,
            [cid]: { channel: {} as Channel, recipients: [], loading: false, error: getErrorMessage(e) },
          }))
        })
    })
  }, [channelIds, details])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 通道选择 */}
      <div>
        <Typography.Text strong style={{ fontSize: 13 }}>投递通道</Typography.Text>
        <Select
          mode="multiple"
          style={{ width: '100%', marginTop: 4 }}
          value={channelIds}
          onChange={onChannelIdsChange}
          placeholder="选择通道"
          options={allChannels.map((c) => ({ value: c.id, label: `${c.name} (${modeLabel(c.type)})` }))}
        />
      </div>

      {/* 通道收件人详情 */}
      {channelIds.length > 0 && (
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>收件人</Typography.Text>
          <List
            size="small"
            style={{ marginTop: 4 }}
            dataSource={channelIds}
            renderItem={(cid) => (
              <ChannelItem
                channelId={cid}
                detail={details[cid]}
                onRemove={() => onChannelIdsChange(channelIds.filter((id) => id !== cid))}
              />
            )}
          />
        </div>
      )}

      {/* 编译区域 */}
      <div>
        <Space style={{ marginBottom: 8 }}>
          <Button
            icon={<CompressOutlined />}
            loading={compileLoading}
            onClick={onCompile}
            size="small"
          >
            编译预览
          </Button>
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={onCompile}
            disabled={compileLoading}
          >
            刷新
          </Button>
        </Space>

        {compileError && (
          <Alert type="error" message={compileError} showIcon style={{ marginBottom: 8 }} />
        )}

        {compileLoading && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin tip="编译中..." />
          </div>
        )}

        {compileResult && !compileLoading && (
          <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 8 }}>
            {compileResult.image_base64 ? (
              <img
                src={`data:image/png;base64,${compileResult.image_base64}`}
                alt="推送预览"
                style={{ maxWidth: '100%', borderRadius: 4 }}
              />
            ) : compileResult.html ? (
              <div dangerouslySetInnerHTML={{ __html: compileResult.html }} />
            ) : (
              <Empty description="编译无内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
        )}
      </div>

      {/* 推送按钮 */}
      <Button
        type="primary"
        icon={<SendOutlined />}
        loading={pushing}
        onClick={onTestPush}
        block
        disabled={channelIds.length === 0}
      >
        {channelIds.length === 0 ? '请先选择通道' : '测试推送'}
      </Button>
    </div>
  )
}
