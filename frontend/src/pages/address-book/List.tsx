/**
 * 通讯录列表页。
 *
 * 展示各通道上的用户与群身份，支持按类型筛选、编辑与删除。
 * 新建跳转 `/address-book/new`。
 */
import { DeleteOutlined, EditOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons'
import { Button, message, Popconfirm, Select, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { deleteIdentity, listIdentities } from '../../api'
import { getErrorMessage } from '../../api/client'
import type { Identity } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { TableEmpty } from '../../components/TableEmpty'
import { formatDateTime } from '../../utils/status'

/** 通讯录列表：筛选 / 编辑 / 删除 */
export function IdentityListPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<Identity[]>([])
  const [loading, setLoading] = useState(false)
  const [filterKind, setFilterKind] = useState<string | undefined>(undefined)
  const [filterChannel, setFilterChannel] = useState<string | undefined>(undefined)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filterKind) params.kind = filterKind
      if (filterChannel) params.channel_type = filterChannel
      setData(await listIdentities(params))
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [filterKind, filterChannel])

  useEffect(() => {
    void load()
  }, [load])

  const onDelete = async (id: string) => {
    try {
      await deleteIdentity(id)
      message.success('已删除')
      await load()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: ColumnsType<Identity> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (name: string, row) => <Link to={`/address-book/${row.id}`}>{name}</Link>,
    },
    {
      title: '类型',
      dataIndex: 'kind',
      width: 80,
      render: (k: string) => (k === 'person' ? '用户' : '群'),
    },
    {
      title: '通道',
      dataIndex: 'channel_type',
      width: 100,
    },
    {
      title: '外部 ID',
      dataIndex: 'external_id',
      width: 200,
      ellipsis: true,
    },
    {
      title: '通道侧名称',
      dataIndex: 'external_name',
      width: 160,
      ellipsis: true,
      render: (v: string | null) => v || '-',
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
      width: 160,
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/address-book/${row.id}`)}
          >
            编辑
          </Button>
          <Popconfirm title="确认删除该身份？" onConfirm={() => void onDelete(row.id)}>
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
        title="通讯录"
        description="管理各通道上的用户与群身份（如钉钉用户 ID、群 open_conversation_id），供通道配置时选用。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/address-book/new')}>
            新建身份
          </Button>
        }
      />
      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="类型筛选"
          style={{ width: 120 }}
          value={filterKind}
          onChange={setFilterKind}
          options={[
            { value: 'person', label: '用户' },
            { value: 'group', label: '群' },
          ]}
        />
        <Select
          allowClear
          placeholder="通道筛选"
          style={{ width: 120 }}
          value={filterChannel}
          onChange={setFilterChannel}
          options={[{ value: 'dingtalk', label: '钉钉' }]}
        />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        locale={{
          emptyText: (
            <TableEmpty
              description="通讯录为空，请先添加身份。"
              action={
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/address-book/new')}
                >
                  新建身份
                </Button>
              }
            />
          ),
        }}
      />
    </div>
  )
}
