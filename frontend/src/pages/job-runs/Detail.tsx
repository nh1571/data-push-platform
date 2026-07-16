import { ArrowLeftOutlined, RedoOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Descriptions,
  message,
  Modal,
  Space,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getJobRun, rerunJobRun } from '../../api'
import { getErrorMessage } from '../../api/client'
import type { Delivery, JobRunDetail, JobRunLog } from '../../api/types'
import { DeliveryStatusTag, formatDateTime, RunStatusTag } from '../../utils/status'

export function JobRunDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<JobRunDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [rerunning, setRerunning] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      setData(await getJobRun(id))
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const onRerun = () => {
    if (!id) return
    Modal.confirm({
      title: '重跑',
      content: '将基于最新任务配置创建新的运行记录，并复制当前参数。确认重跑？',
      okText: '重跑',
      cancelText: '取消',
      onOk: async () => {
        setRerunning(true)
        try {
          const run = await rerunJobRun(id)
          message.success('已创建重跑')
          navigate(`/job-runs/${run.id}`)
        } catch (err) {
          message.error(getErrorMessage(err))
        } finally {
          setRerunning(false)
        }
      },
    })
  }

  const deliveryColumns: ColumnsType<Delivery> = [
    {
      title: '通道 ID',
      dataIndex: 'channel_id',
      render: (cid?: string | null) =>
        cid ? <Link to={`/channels/${cid}`}>{cid.slice(0, 8)}…</Link> : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (s: string) => <DeliveryStatusTag status={s} />,
    },
    {
      title: 'Provider Msg',
      dataIndex: 'provider_msg_id',
      ellipsis: true,
      render: (v?: string | null) => v || '-',
    },
    {
      title: '开始',
      dataIndex: 'started_at',
      width: 170,
      render: formatDateTime,
    },
    {
      title: '结束',
      dataIndex: 'finished_at',
      width: 170,
      render: formatDateTime,
    },
    {
      title: '错误',
      dataIndex: 'error_message',
      ellipsis: true,
      render: (v?: string | null) => v || '-',
    },
  ]

  const logColumns: ColumnsType<JobRunLog> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 170,
      render: formatDateTime,
    },
    { title: '步骤', dataIndex: 'step', width: 120 },
    { title: '级别', dataIndex: 'level', width: 90 },
    { title: '消息', dataIndex: 'message' },
  ]

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/job-runs')}>
            返回
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            运行详情
          </Typography.Title>
        </Space>
        <Space>
          <Button onClick={() => void load()} loading={loading}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<RedoOutlined />}
            loading={rerunning}
            onClick={onRerun}
          >
            重跑
          </Button>
        </Space>
      </Space>

      <Card loading={loading} size="small" style={{ marginBottom: 16 }}>
        {data ? (
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="运行 ID">{data.id}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <RunStatusTag status={data.status} />
            </Descriptions.Item>
            <Descriptions.Item label="任务">
              <Link to={`/push-jobs/${data.push_job_id}`}>{data.push_job_id}</Link>
            </Descriptions.Item>
            <Descriptions.Item label="触发方式">{data.trigger_type}</Descriptions.Item>
            <Descriptions.Item label="开始时间">{formatDateTime(data.started_at)}</Descriptions.Item>
            <Descriptions.Item label="结束时间">{formatDateTime(data.finished_at)}</Descriptions.Item>
            <Descriptions.Item label="父运行">
              {data.parent_run_id ? (
                <Link to={`/job-runs/${data.parent_run_id}`}>{data.parent_run_id}</Link>
              ) : (
                '-'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="错误信息" span={2}>
              {data.error_message || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="参数" span={2}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>
                {data.params ? JSON.stringify(data.params, null, 2) : '-'}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Card>

      <Typography.Title level={5}>投递记录</Typography.Title>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={deliveryColumns}
        dataSource={data?.deliveries ?? []}
        pagination={false}
        style={{ marginBottom: 24 }}
      />

      <Typography.Title level={5}>执行日志</Typography.Title>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={logColumns}
        dataSource={data?.logs ?? []}
        pagination={{ pageSize: 20 }}
      />
    </div>
  )
}
