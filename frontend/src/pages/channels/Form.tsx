import { ApiOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Form, Input, message, Select, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createChannel, getChannel, testChannel, updateChannel } from '../../api'
import { getErrorMessage } from '../../api/client'

const CHANNEL_TYPES = [
  { value: 'dingtalk', label: '钉钉' },
  { value: 'feishu', label: '飞书' },
  { value: 'wecom', label: '企业微信' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'email', label: '邮件' },
]

const MASK = '******'

interface FormValues {
  name: string
  type: string
  webhook_url?: string
  access_token?: string
  title?: string
  msgtype?: string
}

export function ChannelFormPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const channelType = Form.useWatch('type', form)

  useEffect(() => {
    if (isNew) {
      form.setFieldsValue({ type: 'dingtalk', msgtype: 'markdown', title: '数据推送' })
      return
    }
    setLoading(true)
    getChannel(id)
      .then((row) => {
        const cfg = row.config || {}
        form.setFieldsValue({
          name: row.name,
          type: row.type,
          webhook_url: cfg.webhook_url ? String(cfg.webhook_url) : undefined,
          access_token: cfg.access_token ? String(cfg.access_token) : undefined,
          title: cfg.title ? String(cfg.title) : undefined,
          msgtype: cfg.msgtype ? String(cfg.msgtype) : 'markdown',
        })
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [form, id, isNew])

  const buildConfig = (values: FormValues): Record<string, unknown> => {
    const config: Record<string, unknown> = {}
    if (values.webhook_url) config.webhook_url = values.webhook_url
    if (values.access_token && values.access_token !== MASK) {
      config.access_token = values.access_token
    }
    if (values.title) config.title = values.title
    if (values.msgtype) config.msgtype = values.msgtype
    return config
  }

  const onSave = async () => {
    try {
      const values = await form.validateFields()
      if (!values.webhook_url && (!values.access_token || values.access_token === MASK)) {
        if (isNew || channelType === 'dingtalk') {
          message.error('请填写 webhook_url 或 access_token')
          return
        }
      }
      setSaving(true)
      const config = buildConfig(values)
      if (isNew) {
        const created = await createChannel({
          name: values.name,
          type: values.type,
          config,
        })
        message.success('创建成功')
        navigate(`/channels/${created.id}`, { replace: true })
      } else {
        // If access_token was masked and not re-entered, keep other fields and
        // only update when webhook_url provided; if only name/type, skip config.
        const accessMasked = values.access_token === MASK || !values.access_token
        const body: {
          name: string
          type: string
          config?: Record<string, unknown>
        } = { name: values.name, type: values.type }

        if (values.webhook_url || !accessMasked) {
          if (accessMasked && values.webhook_url) {
            body.config = {
              webhook_url: values.webhook_url,
              title: values.title,
              msgtype: values.msgtype,
            }
          } else {
            body.config = config
          }
        }
        await updateChannel(id, body)
        message.success('保存成功')
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const onTest = async () => {
    if (isNew) {
      message.info('请先保存后再测试')
      return
    }
    setTesting(true)
    try {
      const res = await testChannel(id)
      if (res.ok) message.success(res.message || '校验通过')
      else message.error(res.message || '校验失败')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/channels')}>
          返回
        </Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {isNew ? '新建通道' : '编辑通道'}
        </Typography.Title>
      </Space>

      <Form form={form} layout="vertical" style={{ maxWidth: 560 }} disabled={loading}>
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="例如：运营群机器人" />
        </Form.Item>
        <Form.Item name="type" label="类型" rules={[{ required: true }]}>
          <Select options={CHANNEL_TYPES} />
        </Form.Item>
        <Form.Item
          name="webhook_url"
          label="Webhook URL"
          extra="钉钉等机器人完整 webhook 地址"
        >
          <Input placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." />
        </Form.Item>
        <Form.Item
          name="access_token"
          label="Access Token"
          extra={!isNew ? '已脱敏；留空则不修改' : '与 Webhook URL 二选一'}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="title" label="消息标题">
          <Input placeholder="数据推送" />
        </Form.Item>
        <Form.Item name="msgtype" label="消息类型">
          <Select
            options={[
              { value: 'markdown', label: 'markdown' },
              { value: 'text', label: 'text' },
            ]}
          />
        </Form.Item>
        <Space>
          <Button type="primary" loading={saving} onClick={() => void onSave()}>
            保存
          </Button>
          {!isNew ? (
            <Button icon={<ApiOutlined />} loading={testing} onClick={() => void onTest()}>
              测试
            </Button>
          ) : null}
        </Space>
      </Form>
    </div>
  )
}
