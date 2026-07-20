/**
 * 推送目标列表页 — 通道能力 + 目的身份的组合实体管理。
 */
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, message, Popconfirm, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { deletePushTarget, listPushTargets } from '../../api'
import { getErrorMessage } from '../../api/client'
import type { PushTarget } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { TableEmpty } from '../../components/TableEmpty'
import { formatDateTime } from '../../utils/status'

const KIND_LABELS: Record<string, { label: string; color: string }> = {
  oto: { label: '单发', color: 'blue' },
  group: { label: '群发', color: 'green' },
  webhook: { label: 'Webhook', color: 'purple' },
}

export function PushTargetListPage() {
  const [data, setData] = useState<PushTarget[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await listPushTargets())
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onDelete = async (id: string) => {
    try {
      await deletePushTarget(id)
      message.success('已删除')
      await load()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: ColumnsType<PushTarget> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (_: string, row: PushTarget) => <Link to={`/push-targets/${row.id}`}>{row.name}</Link>,
    },
    {
      title: '种类',
      dataIndex: 'kind',
      key: 'kind',
      width: 120,
      render: (kind: string) => {
        const k = KIND_LABELS[kind] || { label: kind, color: 'default' }
        return <Tag color={k.color}>{k.label}</Tag>
      },
    },
    {
      title: '收件人',
      key: 'identities',
      width: 260,
      render: (_: unknown, row: PushTarget) => (
        <Space size={4} wrap>
          {(row.identities || []).map((ident) => (
            <Tag key={ident.id} color="default" style={{ fontSize: 11 }}>
              {ident.name}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '人数',
      key: 'count',
      width: 80,
      render: (_: unknown, row: PushTarget) => `${(row.identities || []).length}人`,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: unknown, row: PushTarget) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/push-targets/${row.id}`)}
          />
          <Popconfirm title="确认删除此推送目标？" onConfirm={() => void onDelete(row.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="推送目标"
        description="通道能力 + 通讯录目的地的组合实体，推送内容直接选用"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/push-targets/new')}>
            新建推送目标
          </Button>
        }
      />
      <Table<PushTarget>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        locale={{ emptyText: <TableEmpty description="还没有推送目标，请先创建通道和通讯录，再组合为推送目标。" action={<Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/push-targets/new')}>新建推送目标</Button>} /> }}
      />
    </div>
  )
}
