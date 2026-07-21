/**
 * 通讯录身份表单页（新建 / 编辑）。
 *
 * - `/address-book/new` — 新建
 * - `/address-book/:id` — 编辑
 *
 * 支持三种类型：个人 (person)、群聊 (group)、Webhook
 */
import { Button, Card, Form, Input, message, Select, Space, Spin } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createIdentity, getIdentity, updateIdentity } from '../../api'
import { getErrorMessage } from '../../api/client'
import type { Identity, IdentityCreate, IdentityUpdate } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'

const CHANNEL_OPTIONS = [{ value: 'dingtalk', label: '钉钉' }]

const EXTERNAL_ID_PLACEHOLDERS: Record<string, string> = {
  person: '钉钉 userId，如 zhangsan001',
  group: 'open_conversation_id，如 cidXXX',
  webhook: 'https://oapi.dingtalk.com/robot/send?...',
}
const EXTERNAL_ID_EXTRAS: Record<string, string> = {
  person: '钉钉用户 userId',
  group: '群会话 openConversationId',
  webhook: '钉钉群机器人完整 webhook 地址',
}

export function IdentityFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isNew = !id
  const [form] = Form.useForm<IdentityCreate>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const kind = Form.useWatch('kind', form)

  /** 编辑模式：加载已有身份 */
  const loadIdentity = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const row: Identity = await getIdentity(id)
      form.setFieldsValue({
        name: row.name,
        kind: row.kind,
        channel_type: row.channel_type,
        external_id: row.external_id,
        external_extra: row.external_extra ?? undefined,
        external_name: row.external_name ?? undefined,
      })
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [id, form])

  useEffect(() => {
    void loadIdentity()
  }, [loadIdentity])

  /** 提交 */
  const onFinish = async (values: IdentityCreate) => {
    setSaving(true)
    try {
      if (isNew) {
        await createIdentity(values)
        message.success('创建成功')
      } else {
        const body: IdentityUpdate = { ...values }
        await updateIdentity(id!, body)
        message.success('已更新')
      }
      navigate('/address-book')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const kindLabel = (kind as string) || 'person'

  return (
    <div>
      <PageHeader
        title={isNew ? '新建身份' : '编辑身份'}
        description="把通道上的用户、群或 Webhook 登记到通讯录，供通道配置时引用。"
      />
      <Card style={{ maxWidth: 560 }}>
        <Spin spinning={!isNew && loading}>
          <Form
            form={form}
            layout="vertical"
            onFinish={(v) => void onFinish(v)}
            requiredMark={false}
            initialValues={{
              name: '',
              kind: 'person',
              channel_type: 'dingtalk',
              external_id: '',
              external_extra: '',
              external_name: '',
            }}
          >
            <Form.Item
              name="name"
              label="显示名称"
              rules={[{ required: true, message: '请输入名称' }]}
            >
              <Input placeholder="如 张三、运维报警群、运营群机器人" maxLength={128} />
            </Form.Item>

            <Form.Item
              name="kind"
              label="类型"
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  { value: 'person', label: '个人' },
                  { value: 'group', label: '群聊' },
                  { value: 'webhook', label: 'Webhook' },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="channel_type"
              label="通道"
              rules={[{ required: true, message: '请选择通道' }]}
            >
              <Select options={CHANNEL_OPTIONS} disabled />
            </Form.Item>

            <Form.Item
              name="external_id"
              label={kind === 'webhook' ? 'Webhook URL' : '外部 ID'}
              rules={[{ required: true, message: kind === 'webhook' ? '请输入 Webhook URL' : '请输入外部 ID' }]}
              extra={EXTERNAL_ID_EXTRAS[kindLabel]}
            >
              {kind === 'webhook' ? (
                <Input.TextArea rows={3} placeholder={EXTERNAL_ID_PLACEHOLDERS[kindLabel]} maxLength={1024} />
              ) : (
                <Input placeholder={EXTERNAL_ID_PLACEHOLDERS[kindLabel]} maxLength={255} />
              )}
            </Form.Item>

            {kind === 'webhook' ? (
              <Form.Item
                name="external_extra"
                label="Access Token"
                extra="可选，如果 webhook URL 里已包含 access_token 则不用填"
              >
                <Input.Password autoComplete="new-password" placeholder="webhook 的 access_token" maxLength={255} />
              </Form.Item>
            ) : null}

            <Form.Item
              name="external_name"
              label="通道侧名称"
              extra="可选，该身份在通道上的原始显示名"
            >
              <Input placeholder="可选" maxLength={128} />
            </Form.Item>

            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={saving}>
                  {isNew ? '创建' : '保存'}
                </Button>
                <Button onClick={() => navigate('/address-book')}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        </Spin>
      </Card>
    </div>
  )
}
