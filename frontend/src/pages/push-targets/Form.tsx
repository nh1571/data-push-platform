/**
 * 推送目标表单 — 新建/编辑 PushTarget。
 *
 * 选择通道 + 选择身份列表，名称自动生成（预览）。
 */
import { ArrowLeftOutlined, LinkOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Card, Form, message, Select, Space, Spin, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createPushTarget, getPushTarget, listChannels, listIdentities, updatePushTarget } from '../../api'
import { getErrorMessage } from '../../api/client'
import type { Channel, Identity, PushTarget } from '../../api/types'

interface FormValues {
  channel_id: string
  identity_ids: string[]
}

export function PushTargetFormPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const [form] = Form.useForm<FormValues>()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [channels, setChannels] = useState<Channel[]>([])
  const [identities, setIdentities] = useState<Identity[]>([])

  // 加载通道和身份列表
  useEffect(() => {
    setLoading(true)
    Promise.all([listChannels(), listIdentities()])
      .then(([ch, ids]) => {
        setChannels(ch)
        setIdentities(ids)
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  // 编辑模式：加载已有 PushTarget
  useEffect(() => {
    if (isNew || !id) return
    setLoading(true)
    getPushTarget(id)
      .then((pt: PushTarget) => {
        form.setFieldsValue({
          channel_id: pt.channel_id,
          identity_ids: pt.identities.map((i) => i.id),
        })
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [form, id, isNew])

  // 实时名称预览
  const selectedChannelId = Form.useWatch('channel_id', form)
  const selectedIdentityIds: string[] = Form.useWatch('identity_ids', form) || []
  const namePreview = useMemo(() => {
    const ch = channels.find((c) => c.id === selectedChannelId)
    const chName = ch?.name || '—'
    const idNames = selectedIdentityIds
      .map((iid) => identities.find((i) => i.id === iid)?.name || iid.slice(0, 6))
      .join(', ')
    return idNames ? `${chName} → ${idNames}` : '请选择通道和身份'
  }, [selectedChannelId, selectedIdentityIds, channels, identities])

  const onSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (isNew) {
        const created = await createPushTarget({
          channel_id: values.channel_id,
          identity_ids: values.identity_ids,
        })
        message.success('创建成功')
        navigate(`/push-targets/${created.id}`, { replace: true })
      } else {
        await updatePushTarget(id!, {
          channel_id: values.channel_id,
          identity_ids: values.identity_ids,
        })
        message.success('保存成功')
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return // 表单验证错误
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // 按 kind 分组身份
  const identityGroups = useMemo(() => {
    const groups: Record<string, Identity[]> = {}
    for (const ident of identities) {
      const key = ident.kind || 'other'
      if (!groups[key]) groups[key] = []
      groups[key].push(ident)
    }
    return groups
  }, [identities])

  const kindMeta: Record<string, { icon: React.ReactNode; label: string }> = {
    person: { icon: <UserOutlined />, label: '个人' },
    group: { icon: <TeamOutlined />, label: '群' },
    webhook: { icon: <LinkOutlined />, label: 'Webhook' },
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/push-targets')}>
          返回
        </Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {isNew ? '新建推送目标' : '编辑推送目标'}
        </Typography.Title>
      </Space>

      <Spin spinning={loading}>
        <Form form={form} layout="vertical" style={{ maxWidth: 560 }}>
          <Form.Item
            name="channel_id"
            label="推送通道（能力）"
            rules={[{ required: true, message: '请选择通道' }]}
          >
            <Select
              placeholder="选择推送通道"
              options={channels.map((c) => ({ value: c.id, label: `${c.name} (${c.type})` }))}
              showSearch
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item
            name="identity_ids"
            label="收件人（目的实体）"
            rules={[{ required: true, type: 'array', min: 1, message: '请至少选择一个收件人' }]}
          >
            <Select
              mode="multiple"
              placeholder="选择收件人"
              showSearch
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
            >
              {Object.entries(identityGroups).map(([kind, items]) => {
                const meta = kindMeta[kind] || { icon: null, label: kind }
                return (
                  <Select.OptGroup key={kind} label={`${meta.icon} ${meta.label} (${items.length})`}>
                    {items.map((ident) => (
                      <Select.Option key={ident.id} value={ident.id}>
                        {ident.name}
                        <span style={{ color: '#8c8c8c', fontSize: 11, marginLeft: 6 }}>
                          {ident.external_id.slice(0, 20)}
                        </span>
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                )
              })}
            </Select>
          </Form.Item>

          {/* 名称预览 */}
          <Card size="small" style={{ marginBottom: 24, background: '#fafafa' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              名称预览
            </Typography.Text>
            <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>
              {namePreview}
            </div>
          </Card>

          <Form.Item>
            <Space>
              <Button type="primary" loading={saving} onClick={() => void onSave()}>
                {isNew ? '创建' : '保存'}
              </Button>
              <Button onClick={() => navigate('/push-targets')}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Spin>
    </div>
  )
}
