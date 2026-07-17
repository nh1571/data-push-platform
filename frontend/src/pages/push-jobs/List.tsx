/**
 * 推送任务列表（任务管理）。
 *
 * - 新建：弹窗填名称+数据源 → createDraft → 跳转内容工作台 `/editor/:id`
 * - 编辑内容：进 Studio 编辑器；立即执行：runPushJob 后跳转运行详情
 * 日常取数与版式请用「内容工作台」，本页侧重调度/启用/最近运行。
 */
import { DeleteOutlined, EditOutlined, PlusOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { Button, Form, Input, message, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createDraftPushJob, deletePushJob, listDataSources, listPushJobs, runPushJob } from '../../api'
import { getErrorMessage } from '../../api/client'
import type { DataSource, PushJob } from '../../api/types'
import { formatDateTime } from '../../utils/status'

/** 任务管理列表页 */
export function PushJobListPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<PushJob[]>([])
  const [loading, setLoading] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [sources, setSources] = useState<DataSource[]>([])
  const [form] = Form.useForm<{ name: string; data_source_id: string }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await listPushJobs())
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** 打开新建弹窗并加载数据源选项；仅一个数据源时自动选中 */
  const openCreate = async () => {
    setCreateOpen(true)
    try {
      const ds = await listDataSources()
      setSources(ds)
      if (ds.length === 1) {
        form.setFieldsValue({ data_source_id: ds[0].id })
      }
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  /** 创建草稿任务并进入内容编辑器 */
  const onCreateOk = async () => {
    try {
      const values = await form.validateFields()
      setCreating(true)
      const job = await createDraftPushJob({
        name: values.name.trim(),
        data_source_id: values.data_source_id,
        enabled: true,
      })
      message.success('任务已创建，进入内容编辑')
      setCreateOpen(false)
      form.resetFields()
      navigate(`/editor/${job.id}`)
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  /** 确认后立即执行任务，成功则跳转 JobRun 详情 */
  const onRun = (row: PushJob) => {
    Modal.confirm({
      title: '立即执行',
      content: `确认立即执行任务「${row.name}」？`,
      okText: '执行',
      cancelText: '取消',
      onOk: async () => {
        setRunningId(row.id)
        try {
          const run = await runPushJob(row.id)
          message.success(`已触发运行：${run.id.slice(0, 8)}…（${run.status}）`)
          navigate(`/job-runs/${run.id}`)
        } catch (err) {
          message.error(getErrorMessage(err))
        } finally {
          setRunningId(null)
        }
      },
    })
  }

  const onDelete = async (id: string) => {
    try {
      await deletePushJob(id)
      message.success('已删除')
      await load()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: ColumnsType<PushJob> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (name: string, row) => <Link to={`/editor/${row.id}`}>{name}</Link>,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 80,
      render: (v: boolean) => (v ? <Tag color="success">是</Tag> : <Tag>否</Tag>),
    },
    {
      title: '调度',
      key: 'schedule',
      width: 160,
      render: (_, row) =>
        row.schedule_enabled ? (
          <Tag color="blue">{row.schedule_cron || '已启用'}</Tag>
        ) : (
          <Tag>未调度</Tag>
        ),
    },
    {
      title: '通道数',
      dataIndex: 'channel_ids',
      width: 80,
      render: (ids: string[]) => ids?.length ?? 0,
    },
    {
      title: '最近运行',
      key: 'last_run',
      width: 160,
      render: (_, row) => {
        if (!row.last_run_status) return <Tag>未运行</Tag>
        const color =
          row.last_run_status === 'succeeded'
            ? 'success'
            : row.last_run_status === 'failed'
              ? 'error'
              : row.last_run_status === 'partial'
                ? 'warning'
                : row.last_run_status === 'running'
                  ? 'processing'
                  : 'default'
        return (
          <Space size={4} direction="vertical">
            <Tag color={color}>{row.last_run_status}</Tag>
            {row.last_run_id ? (
              <Link to={`/job-runs/${row.last_run_id}`} style={{ fontSize: 12 }}>
                查看
              </Link>
            ) : null}
          </Space>
        )
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 180,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 300,
      render: (_, row) => (
        <Space>
          <Button
            size="small"
            type="primary"
            ghost
            icon={<PlayCircleOutlined />}
            loading={runningId === row.id}
            onClick={() => onRun(row)}
          >
            执行
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/editor/${row.id}`)}
          >
            编辑内容
          </Button>
          <Popconfirm title="确认删除该推送任务？" onConfirm={() => void onDelete(row.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }} align="start">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            任务管理
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            调度、启用、最近运行。日常取数与样式请用「内容工作台」；也可在此新建任务后进入编辑。
          </Typography.Text>
        </div>
        <Space>
          <Button onClick={() => navigate('/editor')}>打开内容工作台</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void openCreate()}>
            新建任务
          </Button>
        </Space>
      </Space>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={data} />

      <Modal
        title="新建推送任务"
        open={createOpen}
        onOk={() => void onCreateOk()}
        onCancel={() => {
          setCreateOpen(false)
          form.resetFields()
        }}
        confirmLoading={creating}
        okText="创建并编辑内容"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="例如：每日经营日报" maxLength={128} />
          </Form.Item>
          <Form.Item
            name="data_source_id"
            label="数据源"
            rules={[{ required: true, message: '请选择数据源' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={sources.length ? '选择数据源' : '暂无数据源，请先创建'}
              options={sources.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.type})`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
