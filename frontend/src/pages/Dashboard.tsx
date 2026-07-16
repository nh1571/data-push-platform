import { ReloadOutlined } from '@ant-design/icons'
import { Button, Space, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listJobRuns } from '../api'
import { getErrorMessage } from '../api/client'
import type { JobRun } from '../api/types'
import { formatDateTime, RunStatusTag } from '../utils/status'

export function DashboardPage() {
  const [failed, setFailed] = useState<JobRun[]>([])
  const [recent, setRecent] = useState<JobRun[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [failedRuns, recentRuns] = await Promise.all([
        listJobRuns({ status: 'failed', limit: 10 }),
        listJobRuns({ limit: 10 }),
      ])
      setFailed(failedRuns)
      setRecent(recentRuns)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const columns: ColumnsType<JobRun> = [
    {
      title: '运行 ID',
      dataIndex: 'id',
      ellipsis: true,
      render: (id: string) => <Link to={`/job-runs/${id}`}>{id.slice(0, 8)}…</Link>,
    },
    {
      title: '任务 ID',
      dataIndex: 'push_job_id',
      ellipsis: true,
      render: (id: string) => <Link to={`/push-jobs/${id}`}>{id.slice(0, 8)}…</Link>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (s: string) => <RunStatusTag status={s} />,
    },
    {
      title: '触发方式',
      dataIndex: 'trigger_type',
      width: 100,
    },
    {
      title: '开始时间',
      dataIndex: 'started_at',
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
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          工作台
        </Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          刷新
        </Button>
      </Space>

      {error ? (
        <Typography.Text type="danger" style={{ display: 'block', marginBottom: 12 }}>
          {error}
        </Typography.Text>
      ) : null}

      <Typography.Title level={5}>失败运行（最近 10 条）</Typography.Title>
      <Typography.Paragraph type="secondary">
        查看 <Link to="/job-runs?status=failed">全部失败记录</Link>
      </Typography.Paragraph>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={failed}
        pagination={false}
        style={{ marginBottom: 32 }}
      />

      <Typography.Title level={5}>最近运行</Typography.Title>
      <Typography.Paragraph type="secondary">
        查看 <Link to="/job-runs">全部执行记录</Link>
      </Typography.Paragraph>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={recent}
        pagination={false}
      />
    </div>
  )
}
