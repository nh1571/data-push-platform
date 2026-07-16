import { ApiOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Form, Input, message, Select, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createChannel, getChannel, testChannel, updateChannel } from '../../api'
import { getErrorMessage } from '../../api/client'

const PROVIDERS = [{ value: 'dingtalk', label: '钉钉' }]

const MODE_OPTIONS = [
  { value: 'dingtalk.webhook_robot', label: '群机器人 Webhook' },
  { value: 'dingtalk.work_notice', label: '工作通知' },
]

const MASK = '******'

/** Legacy `dingtalk` is treated as webhook robot. */
function normalizeChannelType(type: string): string {
  if (type === 'dingtalk') return 'dingtalk.webhook_robot'
  return type
}

function providerFromType(type: string): string {
  const normalized = normalizeChannelType(type)
  if (normalized.startsWith('dingtalk.')) return 'dingtalk'
  return 'dingtalk'
}

interface FormValues {
  name: string
  provider: string
  type: string
  // webhook robot
  webhook_url?: string
  access_token?: string
  title?: string
  msgtype?: string
  // work notice
  app_key?: string
  app_secret?: string
  agent_id?: string
  userid_list?: string
  dept_id_list?: string
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
  const isWebhook =
    !channelType ||
    channelType === 'dingtalk.webhook_robot' ||
    channelType === 'dingtalk'
  const isWorkNotice = channelType === 'dingtalk.work_notice'

  useEffect(() => {
    if (isNew) {
      form.setFieldsValue({
        provider: 'dingtalk',
        type: 'dingtalk.webhook_robot',
        msgtype: 'markdown',
        title: '数据推送',
      })
      return
    }
    setLoading(true)
    getChannel(id)
      .then((row) => {
        const cfg = row.config || {}
        const type = normalizeChannelType(row.type)
        form.setFieldsValue({
          name: row.name,
          provider: providerFromType(row.type),
          type,
          webhook_url: cfg.webhook_url ? String(cfg.webhook_url) : undefined,
          access_token: cfg.access_token ? String(cfg.access_token) : undefined,
          title: cfg.title ? String(cfg.title) : undefined,
          msgtype: cfg.msgtype ? String(cfg.msgtype) : 'markdown',
          app_key: cfg.app_key ? String(cfg.app_key) : undefined,
          app_secret: cfg.app_secret ? String(cfg.app_secret) : undefined,
          agent_id: cfg.agent_id != null ? String(cfg.agent_id) : undefined,
          userid_list: cfg.userid_list ? String(cfg.userid_list) : undefined,
          dept_id_list: cfg.dept_id_list ? String(cfg.dept_id_list) : undefined,
        })
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [form, id, isNew])

  const buildConfig = (values: FormValues): Record<string, unknown> => {
    const type = normalizeChannelType(values.type)
    if (type === 'dingtalk.work_notice') {
      const config: Record<string, unknown> = {}
      if (values.app_key) config.app_key = values.app_key
      if (values.app_secret && values.app_secret !== MASK) {
        config.app_secret = values.app_secret
      }
      if (values.agent_id) config.agent_id = values.agent_id
      if (values.userid_list) config.userid_list = values.userid_list
      if (values.dept_id_list) config.dept_id_list = values.dept_id_list
      if (values.title) config.title = values.title
      return config
    }
    // webhook robot (default)
    const config: Record<string, unknown> = {}
    if (values.webhook_url) config.webhook_url = values.webhook_url
    if (values.access_token && values.access_token !== MASK) {
      config.access_token = values.access_token
    }
    if (values.title) config.title = values.title
    if (values.msgtype) config.msgtype = values.msgtype
    return config
  }

  const validateModeFields = (values: FormValues): string | null => {
    const type = normalizeChannelType(values.type)
    if (type === 'dingtalk.work_notice') {
      if (!values.app_key) return '请填写 app_key'
      if (isNew && (!values.app_secret || values.app_secret === MASK)) {
        return '请填写 app_secret'
      }
      if (!values.agent_id) return '请填写 agent_id'
      if (!values.userid_list && !values.dept_id_list) {
        return '请至少填写 userid_list 或 dept_id_list'
      }
      return null
    }
    if (!values.webhook_url && (!values.access_token || values.access_token === MASK)) {
      if (isNew) return '请填写 webhook_url 或 access_token'
    }
    return null
  }

  const onSave = async () => {
    try {
      const values = await form.validateFields()
      const type = normalizeChannelType(values.type)
      const validationError = validateModeFields(values)
      if (validationError) {
        message.error(validationError)
        return
      }
      setSaving(true)
      const config = buildConfig(values)
      if (isNew) {
        const created = await createChannel({
          name: values.name,
          type,
          config,
        })
        message.success('创建成功')
        navigate(`/channels/${created.id}`, { replace: true })
      } else {
        const body: {
          name: string
          type: string
          config?: Record<string, unknown>
        } = { name: values.name, type }

        if (type === 'dingtalk.work_notice') {
          const secretMasked = values.app_secret === MASK || !values.app_secret
          if (secretMasked) {
            // Keep other fields; omit app_secret so backend retains existing secret.
            body.config = {
              app_key: values.app_key,
              agent_id: values.agent_id,
              userid_list: values.userid_list || '',
              dept_id_list: values.dept_id_list || '',
            }
            if (values.title) body.config.title = values.title
          } else {
            body.config = config
          }
        } else {
          const accessMasked = values.access_token === MASK || !values.access_token
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
        <Form.Item name="provider" label="提供商" rules={[{ required: true }]}>
          <Select
            options={PROVIDERS}
            onChange={() => {
              // Keep mode in dingtalk family when provider changes.
              form.setFieldsValue({ type: 'dingtalk.webhook_robot' })
            }}
          />
        </Form.Item>
        <Form.Item name="type" label="模式" rules={[{ required: true, message: '请选择模式' }]}>
          <Select options={MODE_OPTIONS} />
        </Form.Item>

        {isWebhook ? (
          <>
            <Form.Item
              name="webhook_url"
              label="Webhook URL"
              extra="钉钉群机器人完整 webhook 地址"
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
          </>
        ) : null}

        {isWorkNotice ? (
          <>
            <Form.Item
              name="app_key"
              label="App Key"
              rules={[{ required: true, message: '请填写 app_key' }]}
            >
              <Input placeholder="钉钉应用 AppKey" />
            </Form.Item>
            <Form.Item
              name="app_secret"
              label="App Secret"
              extra={!isNew ? '已脱敏；留空则不修改' : undefined}
              rules={isNew ? [{ required: true, message: '请填写 app_secret' }] : undefined}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              name="agent_id"
              label="Agent ID"
              rules={[{ required: true, message: '请填写 agent_id' }]}
            >
              <Input placeholder="应用 AgentId" />
            </Form.Item>
            <Form.Item
              name="userid_list"
              label="用户 ID 列表"
              extra="多个用英文逗号分隔；与部门 ID 至少填一项"
            >
              <Input placeholder="user1,user2" />
            </Form.Item>
            <Form.Item
              name="dept_id_list"
              label="部门 ID 列表"
              extra="多个用英文逗号分隔；与用户 ID 至少填一项"
            >
              <Input placeholder="1,2" />
            </Form.Item>
            <Form.Item name="title" label="消息标题">
              <Input placeholder="数据推送" />
            </Form.Item>
          </>
        ) : null}

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
