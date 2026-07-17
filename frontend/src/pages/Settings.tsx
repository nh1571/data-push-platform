/**
 * 系统设置页：机器 API Token 管理。
 *
 * 创建 Token 时明文只展示一次，关闭后无法再查看；
 * 列表可查看名称/时间/撤销状态，并对有效 Token 执行撤销。
 */
import { CopyOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { createApiToken, listApiTokens, revokeApiToken } from '../api'
import { getErrorMessage } from '../api/client'
import type { ApiToken } from '../api/types'
import { formatDateTime } from '../utils/status'

/** 系统设置：API Token 列表与创建弹窗 */
export function SettingsPage() {
  const [data, setData] = useState<ApiToken[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  /** 创建成功后的一次性明文 token；非空时弹窗切换为「复制」视图 */
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [form] = Form.useForm<{ name: string }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await listApiTokens())
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onCreate = async () => {
    try {
      const values = await form.validateFields()
      setCreating(true)
      const res = await createApiToken(values.name)
      setCreatedToken(res.token)
      form.resetFields()
      message.success('Token 已创建，请立即复制保存')
      await load()
    } catch (err) {
      // 表单校验失败不弹 toast
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  const onRevoke = async (id: string) => {
    try {
      await revokeApiToken(id)
      message.success('已撤销')
      await load()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: ColumnsType<ApiToken> = [
    { title: '名称', dataIndex: 'name' },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 180,
      render: formatDateTime,
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_, row) =>
        row.revoked_at ? (
          <Typography.Text type="secondary">已撤销</Typography.Text>
        ) : (
          <Typography.Text type="success">有效</Typography.Text>
        ),
    },
    {
      title: '撤销时间',
      dataIndex: 'revoked_at',
      width: 180,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, row) =>
        row.revoked_at ? (
          '-'
        ) : (
          <Popconfirm title="确认撤销该 Token？" onConfirm={() => void onRevoke(row.id)}>
            <Button size="small" danger>
              撤销
            </Button>
          </Popconfirm>
        ),
    },
  ]

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            系统设置
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            管理机器 API Token（Bearer），用于外部系统调用接口。
          </Typography.Paragraph>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setCreatedToken(null)
            setModalOpen(true)
          }}
        >
          创建 Token
        </Button>
      </Space>

      <Table rowKey="id" loading={loading} columns={columns} dataSource={data} />

      <Modal
        title="创建 API Token"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setCreatedToken(null)
          form.resetFields()
        }}
        footer={
          createdToken
            ? [
                <Button
                  key="close"
                  type="primary"
                  onClick={() => {
                    setModalOpen(false)
                    setCreatedToken(null)
                    form.resetFields()
                  }}
                >
                  关闭
                </Button>,
              ]
            : [
                <Button
                  key="cancel"
                  onClick={() => {
                    setModalOpen(false)
                    form.resetFields()
                  }}
                >
                  取消
                </Button>,
                <Button key="ok" type="primary" loading={creating} onClick={() => void onCreate()}>
                  创建
                </Button>,
              ]
        }
      >
        {createdToken ? (
          <>
            <Alert
              type="warning"
              showIcon
              message="请立即复制 Token，关闭后将无法再次查看完整内容。"
              style={{ marginBottom: 12 }}
            />
            <Input.TextArea value={createdToken} readOnly rows={3} />
            <Button
              style={{ marginTop: 12 }}
              icon={<CopyOutlined />}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(createdToken)
                  message.success('已复制到剪贴板')
                } catch {
                  message.error('复制失败，请手动选择复制')
                }
              }}
            >
              复制 Token
            </Button>
          </>
        ) : (
          <Form form={form} layout="vertical">
            <Form.Item
              name="name"
              label="名称"
              rules={[{ required: true, message: '请输入 Token 名称' }]}
            >
              <Input placeholder="例如：CI 流水线" />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  )
}
