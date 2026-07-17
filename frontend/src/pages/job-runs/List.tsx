/**
 * 执行记录列表页。
 *
 * 筛选条件（状态 / 任务 / 触发方式）同步到 URL searchParams，
 * 支持从工作台「失败记录」等入口带参跳入。
 */
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, Button, Form, Select, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listJobRuns, listPushJobs } from '../../api'
import { getErrorMessage } from '../../api/client'
import type { JobRun, PushJob } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { TableEmpty } from '../../components/TableEmpty'
import { formatDateTime, RunStatusTag } from '../../utils/status'

/** 运行状态筛选项 */
const STATUS_OPTIONS = [
  { value: 'pending', label: '等待中' },
  { value: 'running', label: '运行中' },
  { value: 'succeeded', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'partial', label: '部分成功' },
  { value: 'cancelled', label: '已取消' },
  { value: 'skipped', label: '已跳过' },
]

/** 触发方式筛选项 */
const TRIGGER_OPTIONS = [
  { value: 'manual', label: '手动' },
  { value: 'schedule', label: '调度' },
  { value: 'api', label: 'API' },
  { value: 'retry', label: '重试' },
  { value: 'rerun', label: '重跑' },
]

/** 筛选表单字段 */
interface FilterValues {
  status?: string
  push_job_id?: string
  trigger_type?: string
}

/** 执行记录列表：筛选 + 表格 */
export function JobRunListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [form] = Form.useForm<FilterValues>()
  const [data, setData] = useState<JobRun[]>([])
  const [jobs, setJobs] = useState<PushJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listPushJobs()
      .then(setJobs)
      .catch(() => setJobs([]))
  }, [])

  useEffect(() => {
    form.setFieldsValue({
      status: searchParams.get('status') || undefined,
      push_job_id: searchParams.get('push_job_id') || undefined,
      trigger_type: searchParams.get('trigger_type') || undefined,
    })
  }, [form, searchParams])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {
        status: searchParams.get('status') || undefined,
        push_job_id: searchParams.get('push_job_id') || undefined,
        trigger_type: searchParams.get('trigger_type') || undefined,
        limit: 100,
      }
      setData(await listJobRuns(params))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [searchParams])

  useEffect(() => {
    void load()
  }, [load])

  /** 写入 URL 参数，触发 load 依赖 searchParams 重新请求 */
  const onSearch = (values: FilterValues) => {
    const next = new URLSearchParams()
    if (values.status) next.set('status', values.status)
    if (values.push_job_id) next.set('push_job_id', values.push_job_id)
    if (values.trigger_type) next.set('trigger_type', values.trigger_type)
    setSearchParams(next)
  }

  /** 任务 id → 名称展示（列表未加载时回退截断 id） */
  const jobName = (id: string) => jobs.find((j) => j.id === id)?.name || id.slice(0, 8) + '…'

  const columns: ColumnsType<JobRun> = [
    {
      title: '运行 ID',
      dataIndex: 'id',
      width: 140,
      render: (id: string) => <Link to={`/job-runs/${id}`}>{id.slice(0, 8)}…</Link>,
    },
    {
      title: '任务',
      dataIndex: 'push_job_id',
      render: (id: string) => <Link to={`/push-jobs/${id}`}>{jobName(id)}</Link>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (s: string) => <RunStatusTag status={s} />,
    },
    { title: '触发', dataIndex: 'trigger_type', width: 90 },
    {
      title: '开始时间',
      dataIndex: 'started_at',
      width: 180,
      render: formatDateTime,
    },
    {
      title: '结束时间',
      dataIndex: 'finished_at',
      width: 180,
      render: formatDateTime,
    },
    {
      title: '错误',
      dataIndex: 'error_message',
      ellipsis: true,
      render: (v?: string | null) => v || '-',
    },
  ]

  return (
    <div>
      <PageHeader
        title="执行记录"
        description="查看任务运行历史、失败原因与重跑入口。"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        }
      />

      <Form
        form={form}
        layout="inline"
        onFinish={onSearch}
        style={{
          marginBottom: 16,
          rowGap: 12,
          padding: '12px 16px',
          background: '#fafafa',
          borderRadius: 8,
          border: '1px solid #f0f0f0',
        }}
      >
        <Form.Item name="status" label="状态">
          <Select allowClear placeholder="全部" style={{ width: 140 }} options={STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item name="push_job_id" label="任务">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部任务"
            style={{ width: 220 }}
            options={jobs.map((j) => ({ value: j.id, label: j.name }))}
          />
        </Form.Item>
        <Form.Item name="trigger_type" label="触发">
          <Select allowClear placeholder="全部" style={{ width: 120 }} options={TRIGGER_OPTIONS} />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              筛选
            </Button>
            <Button
              onClick={() => {
                form.resetFields()
                setSearchParams(new URLSearchParams())
              }}
            >
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>

      {error ? (
        <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />
      ) : null}

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        locale={{
          emptyText: (
            <TableEmpty description="暂无匹配的执行记录，可调整筛选条件或先执行一次任务。" />
          ),
        }}
      />
    </div>
  )
}
