import { DeleteOutlined, EditOutlined, PlusOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { Button, message, Modal, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { deletePushJob, listPushJobs, runPushJob } from '../../api'
import { getErrorMessage } from '../../api/client'
import type { PushJob } from '../../api/types'
import { formatDateTime } from '../../utils/status'

export function PushJobListPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<PushJob[]>([])
  const [loading, setLoading] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)

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
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 180,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 280,
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
            编辑
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
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          推送任务
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/editor')}>
          新建推送
        </Button>
      </Space>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={data} />
    </div>
  )
}
