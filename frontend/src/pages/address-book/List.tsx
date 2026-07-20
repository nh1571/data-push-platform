/**
 * 通讯录列表页。
 *
 * Tab 1: 个人与群聊 — 各通道上的用户/群身份
 * Tab 2: 收件人组 — 将多个用户打包为一个快捷组，供通道配置时一键选取
 */
import { DeleteOutlined, EditOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons'
import { Button, message, Popconfirm, Select, Space, Table, Tabs } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { deleteIdentity, deleteRecipientGroup, listIdentities, listRecipientGroups } from '../../api'
import { getErrorMessage } from '../../api/client'
import type { Identity, RecipientGroup } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { TableEmpty } from '../../components/TableEmpty'
import { formatDateTime } from '../../utils/status'

const KIND_LABELS: Record<string, string> = { person: '个人', group: '群聊', webhook: 'Webhook' }

/** 个人与群聊列表 */
function IdentityTab() {
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

  useEffect(() => { void load() }, [load])

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
      width: 70,
      render: (k: string) => KIND_LABELS[k] || k,
    },
    { title: '通道', dataIndex: 'channel_type', width: 80 },
    { title: '外部 ID', dataIndex: 'external_id', width: 180, ellipsis: true },
    {
      title: '通道侧名称',
      dataIndex: 'external_name',
      width: 130,
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    { title: '更新时间', dataIndex: 'updated_at', width: 160, render: formatDateTime },
    {
      title: '操作', key: 'actions', width: 140, fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/address-book/${row.id}`)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => void onDelete(row.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Select allowClear placeholder="类型筛选" style={{ width: 100 }} value={filterKind} onChange={setFilterKind}
          options={[{ value: 'person', label: '个人' }, { value: 'group', label: '群聊' }, { value: 'webhook', label: 'Webhook' }]} />
        <Select allowClear placeholder="通道筛选" style={{ width: 100 }} value={filterChannel} onChange={setFilterChannel}
          options={[{ value: 'dingtalk', label: '钉钉' }]} />
      </Space>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={data}
        locale={{ emptyText: <TableEmpty description="还没有身份，请先添加。" action={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/address-book/new')}>新建身份</Button>
        } /> }} />
    </div>
  )
}

/** 收件人组列表 */
function GroupTab() {
  const navigate = useNavigate()
  const [data, setData] = useState<RecipientGroup[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await listRecipientGroups()) } catch (err) {
      message.error(getErrorMessage(err))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const onDelete = async (id: string) => {
    try {
      await deleteRecipientGroup(id)
      message.success('已删除')
      await load()
    } catch (err) { message.error(getErrorMessage(err)) }
  }

  const columns: ColumnsType<RecipientGroup> = [
    {
      title: '组名', dataIndex: 'name',
      render: (name: string, row) => <Link to={`/address-book/group/${row.id}`}>{name}</Link>,
    },
    { title: '通道', dataIndex: 'channel_type', width: 80 },
    { title: '成员数', dataIndex: 'member_count', width: 80 },
    { title: '更新时间', dataIndex: 'updated_at', width: 160, render: formatDateTime },
    {
      title: '操作', key: 'actions', width: 140,
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/address-book/group/${row.id}`)}>编辑</Button>
          <Popconfirm title="确认删除该组？" onConfirm={() => void onDelete(row.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Table rowKey="id" loading={loading} columns={columns} dataSource={data}
      locale={{ emptyText: <TableEmpty description="还没有收件人组。" action={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/address-book/group/new')}>新建收件人组</Button>
      } /> }} />
  )
}

/** 通讯录主页：Tab 切换个人/群聊 与 收件人组 */
export function IdentityListPage() {
  const navigate = useNavigate()

  return (
    <div>
      <PageHeader
        title="通讯录"
        description="管理各通道上的用户、群身份及快捷收件人组，供通道配置时选用。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/address-book/new')}>
            新建身份
          </Button>
        }
      />
      <Tabs
        defaultActiveKey="identities"
        items={[
          {
            key: 'identities',
            label: '个人与群聊',
            children: <IdentityTab />,
          },
          {
            key: 'groups',
            label: '收件人组',
            children: <GroupTab />,
          },
        ]}
      />
    </div>
  )
}
