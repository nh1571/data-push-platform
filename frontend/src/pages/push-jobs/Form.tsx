/**
 * 推送任务「高级/原始」表单页。
 *
 * 以 Tabs 编辑基本信息、SQL、render_spec JSON、通道与调度；
 * 日常内容编排推荐走 `/editor`，本页适合直接改 JSON 规格或运维开关。
 * 「立即执行」使用**已保存**配置，未点保存的表单修改不生效。
 *
 * 路由：`/push-jobs/:id`（新建入口已重定向到列表）
 */
import { ArrowLeftOutlined, PlayCircleOutlined, SaveOutlined } from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Switch,
  Tabs,
  Typography,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  createPushJob,
  getPushJob,
  listChannels,
  listDataSources,
  runPushJob,
  updatePushJob,
} from '../../api'
import { getErrorMessage } from '../../api/client'
import type { Channel, DataSource, PushJob } from '../../api/types'

/** 表单值；render_spec 以文本编辑，提交前再 JSON.parse */
interface FormValues {
  name: string
  enabled: boolean
  skip_if_empty: boolean
  data_source_id: string
  query_sql: string
  render_spec_text: string
  channel_ids: string[]
  schedule_cron?: string
  schedule_enabled: boolean
}

/** 新建时的默认 render_spec 文本 */
function defaultRenderSpec(): string {
  return JSON.stringify({ type: 'text_md', title: '数据推送' }, null, 2)
}

/** 解析并校验 render_spec 必须为对象或数组 */
function parseRenderSpec(text: string): Record<string, unknown> | unknown[] {
  const parsed: unknown = JSON.parse(text)
  if (parsed === null || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
    throw new Error('render_spec 必须是 JSON 对象或数组')
  }
  return parsed as Record<string, unknown> | unknown[]
}

/** 推送任务表单页（基本 / 取数 / 渲染 / 通道 / 调度 / 运行） */
export function PushJobFormPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [sources, setSources] = useState<DataSource[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [job, setJob] = useState<PushJob | null>(null)
  const [activeTab, setActiveTab] = useState('basic')

  const loadMeta = useCallback(async () => {
    const [ds, ch] = await Promise.all([listDataSources(), listChannels()])
    setSources(ds)
    setChannels(ch)
  }, [])

  useEffect(() => {
    setLoading(true)
    loadMeta()
      .then(async () => {
        if (isNew) {
          form.setFieldsValue({
            enabled: true,
            skip_if_empty: false,
            schedule_enabled: false,
            render_spec_text: defaultRenderSpec(),
            query_sql: 'SELECT 1 AS n',
            channel_ids: [],
          })
          return
        }
        const row = await getPushJob(id)
        setJob(row)
        form.setFieldsValue({
          name: row.name,
          enabled: row.enabled,
          skip_if_empty: row.skip_if_empty,
          data_source_id: row.data_source_id,
          query_sql: row.query_sql,
          render_spec_text: JSON.stringify(row.render_spec ?? {}, null, 2),
          channel_ids: row.channel_ids ?? [],
          schedule_cron: row.schedule_cron ?? undefined,
          schedule_enabled: row.schedule_enabled,
        })
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [form, id, isNew, loadMeta])

  /** 校验表单并组装创建/更新 payload；失败时切换到对应 Tab */
  const collectPayload = async () => {
    const values = await form.validateFields()
    let render_spec: Record<string, unknown> | unknown[]
    try {
      render_spec = parseRenderSpec(values.render_spec_text)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'render_spec JSON 无效')
      setActiveTab('render')
      throw e
    }
    if (!values.channel_ids?.length) {
      message.error('请至少选择一个通道')
      setActiveTab('channels')
      throw new Error('channel_ids empty')
    }
    return {
      name: values.name,
      enabled: values.enabled,
      skip_if_empty: values.skip_if_empty,
      data_source_id: values.data_source_id,
      query_sql: values.query_sql,
      render_spec,
      channel_ids: values.channel_ids,
      schedule_cron: values.schedule_cron || null,
      schedule_enabled: values.schedule_enabled,
    }
  }

  const onSave = async () => {
    try {
      const payload = await collectPayload()
      setSaving(true)
      if (isNew) {
        const created = await createPushJob(payload)
        message.success('创建成功')
        navigate(`/push-jobs/${created.id}`, { replace: true })
      } else {
        const updated = await updatePushJob(id, payload)
        setJob(updated)
        message.success('保存成功')
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        setActiveTab('basic')
        return
      }
      if (err instanceof Error && (err.message === 'channel_ids empty' || err.message.includes('JSON'))) {
        return
      }
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const onRun = () => {
    if (isNew) {
      message.info('请先保存任务')
      return
    }
    Modal.confirm({
      title: '立即执行',
      content: `确认立即执行任务「${job?.name || id}」？将使用当前已保存的配置。`,
      okText: '执行',
      cancelText: '取消',
      onOk: async () => {
        setRunning(true)
        try {
          const run = await runPushJob(id)
          message.success(`已触发运行（${run.status}）`)
          navigate(`/job-runs/${run.id}`)
        } catch (err) {
          message.error(getErrorMessage(err))
        } finally {
          setRunning(false)
        }
      },
    })
  }

  const tabItems = [
    {
      key: 'basic',
      label: '基本',
      children: (
        <>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：日报推送" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Form.Item
            name="skip_if_empty"
            label="结果为空时跳过"
            valuePropName="checked"
            extra="查询无数据时不渲染、不投递"
          >
            <Switch />
          </Form.Item>
        </>
      ),
    },
    {
      key: 'query',
      label: '取数',
      children: (
        <>
          <Form.Item
            name="data_source_id"
            label="数据源"
            rules={[{ required: true, message: '请选择数据源' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择数据源"
              options={sources.map((s) => ({ value: s.id, label: `${s.name} (${s.type})` }))}
            />
          </Form.Item>
          <Form.Item
            name="query_sql"
            label="查询 SQL"
            rules={[{ required: true, message: '请输入 SQL' }]}
            extra="支持 {{param_name}} 占位符，如 {{biz_date}}"
          >
            <Input.TextArea rows={10} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
        </>
      ),
    },
    {
      key: 'render',
      label: '渲染',
      children: (
        <Form.Item
          name="render_spec_text"
          label="渲染规格 (JSON)"
          rules={[{ required: true, message: '请填写 render_spec' }]}
          extra='例如：{"type":"text_md","title":"日报"} 或数组多段渲染'
        >
          <Input.TextArea rows={12} style={{ fontFamily: 'monospace' }} />
        </Form.Item>
      ),
    },
    {
      key: 'channels',
      label: '通道',
      children: (
        <Form.Item
          name="channel_ids"
          label="投递通道"
          rules={[{ required: true, message: '请至少选择一个通道' }]}
        >
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            placeholder="选择一个或多个通道"
            options={channels.map((c) => ({ value: c.id, label: `${c.name} (${c.type})` }))}
          />
        </Form.Item>
      ),
    },
    {
      key: 'schedule',
      label: '调度',
      children: (
        <>
          <Form.Item name="schedule_enabled" label="启用调度" valuePropName="checked">
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Form.Item
            name="schedule_cron"
            label="Cron 表达式"
            extra="例如：0 9 * * *（每天 9:00）"
          >
            <Input placeholder="0 9 * * *" />
          </Form.Item>
        </>
      ),
    },
    {
      key: 'run',
      label: '运行',
      children: (
        <div>
          <Typography.Paragraph type="secondary">
            立即执行将创建新的 JobRun，使用<strong>已保存</strong>的任务配置（未保存的表单修改不会生效）。
          </Typography.Paragraph>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={running}
            disabled={isNew}
            onClick={onRun}
          >
            立即执行
          </Button>
          {isNew ? (
            <Typography.Paragraph type="warning" style={{ marginTop: 12 }}>
              请先保存任务后再执行。
            </Typography.Paragraph>
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/push-jobs')}>
            返回
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {isNew ? '新建推送任务' : `编辑：${job?.name || ''}`}
          </Typography.Title>
        </Space>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void onSave()}>
          保存
        </Button>
      </Space>

      <Form form={form} layout="vertical" disabled={loading}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Form>
    </div>
  )
}
