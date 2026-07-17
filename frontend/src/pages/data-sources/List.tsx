import { DeleteOutlined, EditOutlined, PlusOutlined, ApiOutlined } from '@ant-design/icons'
import { Button, message, Popconfirm, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { deleteDataSource, listDataSources, testDataSource } from '../../api'
import { getErrorMessage } from '../../api/client'
import type { DataSource } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { TableEmpty } from '../../components/TableEmpty'
import { formatDateTime } from '../../utils/status'

export function DataSourceListPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<DataSource[]>([])
  const [loading, setLoading] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await listDataSources())
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
      const res = await testDataSource(id)
      if (res.ok) {
        message.success(res.message || '连接成功')
      } else {
        message.error(res.message || '连接失败')
      }
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setTestingId(null)
    }
  }

  const onDelete = async (id: string) => {
    try {
      await deleteDataSource(id)
      message.success('已删除')
      await load()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: ColumnsType<DataSource> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (name: string, row) => <Link to={`/data-sources/${row.id}`}>{name}</Link>,
    },
    { title: '类型', dataIndex: 'type', width: 120 },
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
            测试连接
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/data-sources/${row.id}`)}
          >
            编辑
          </Button>
          <Popconfirm title="确认删除该数据源？" onConfirm={() => void onDelete(row.id)}>
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
        title="数据源"
        description="配置 MySQL / Doris 等业务取数连接，供内容工作台与任务执行使用。"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/data-sources/new')}
          >
            新建数据源
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
              description="还没有数据源，请先创建连接。"
              action={
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/data-sources/new')}
                >
                  新建数据源
                </Button>
              }
            />
          ),
        }}
      />
    </div>
  )
}
