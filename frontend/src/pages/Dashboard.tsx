/**
 * 工作台首页。
 *
 * 展示最近失败运行（status=failed，最多 10 条）与最近全部运行，
 * 便于运维快速发现异常并跳转到 JobRun / 任务详情。
 */
import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listJobRuns } from '../api'
import { getErrorMessage } from '../api/client'
import type { JobRun } from '../api/types'
import { PageHeader } from '../components/PageHeader'
import { TableEmpty } from '../components/TableEmpty'
import { formatDateTime, RunStatusTag } from '../utils/status'

/** 工作台页面：失败运行 + 最近运行两张表 */
export function DashboardPage() {
  const navigate = useNavigate()
  const [failed, setFailed] = useState<JobRun[]>([])
  const [recent, setRecent] = useState<JobRun[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 并行拉取失败列表与最近列表 */
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
      <PageHeader
        title="工作台"
        description="最近失败与运行概览，快速进入执行详情。"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        }
      />

      {error ? (
        <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />
      ) : null}

      <div className="surface-section">
        <Typography.Title level={5} className="surface-section-title">
          失败运行（最近 10 条）
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 13 }}>
          查看 <Link to="/job-runs?status=failed">全部失败记录</Link>
        </Typography.Paragraph>
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={failed}
          pagination={false}
          locale={{
            emptyText: (
              <TableEmpty description="暂无失败运行，运行状态良好。" />
            ),
          }}
        />
      </div>

      <div className="surface-section">
        <Typography.Title level={5} className="surface-section-title">
          最近运行
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 13 }}>
          查看 <Link to="/job-runs">全部执行记录</Link>
        </Typography.Paragraph>
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={recent}
          pagination={false}
          locale={{
            emptyText: (
              <TableEmpty
                description="暂无执行记录。"
                action={
                  <Button type="primary" onClick={() => navigate('/editor')}>
                    打开内容工作台
                  </Button>
                }
              />
            ),
          }}
        />
      </div>
    </div>
  )
}
