import { ApiOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, message, Popconfirm, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { deleteChannel, listChannels, testChannel } from '../../api'
import { getErrorMessage } from '../../api/client'
import type { Channel } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { TableEmpty } from '../../components/TableEmpty'
import { formatDateTime } from '../../utils/status'

export function ChannelListPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<Channel[]>([])
  const [loading, setLoading] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await listChannels())
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onTest = async (id: string) => {
    setTestingId(id)
    try {
      const res = await testChannel(id)
      if (res.ok) message.success(res.message || '校验通过')
      else message.error(res.message || '校验失败')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setTestingId(null)
    }
  }

  const onDelete = async (id: string) => {
    try {
      await deleteChannel(id)
      message.success('已删除')
      await load()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: ColumnsType<Channel> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (name: string, row) => <Link to={`/channels/${row.id}`}>{name}</Link>,
    },
    { title: '类型', dataIndex: 'type', width: 200 },
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
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button
            size="small"
            icon={<ApiOutlined />}
            loading={testingId === row.id}
            onClick={() => void onTest(row.id)}
          >
            测试
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/channels/${row.id}`)}
          >
            编辑
          </Button>
          <Popconfirm title="确认删除该通道？" onConfirm={() => void onDelete(row.id)}>
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
      <PageHeader
        title="通道"
        description="配置钉钉等投递方式（Webhook / 工作通知 / OpenAPI 等），与内容解耦。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/channels/new')}>
            新建通道
          </Button>
        }
      />
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        locale={{
          emptyText: (
            <TableEmpty
              description="还没有通道，请先创建投递配置。"
              action={
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/channels/new')}
                >
                  新建通道
                </Button>
              }
            />
          ),
        }}
      />
    </div>
  )
}
