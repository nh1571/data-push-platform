/**
 * 收件人组表单页（新建 / 编辑）。
 *
 * - `/address-book/group/new` — 新建
 * - `/address-book/group/:id` — 编辑
 */
import { Button, Card, Form, Input, message, Select, Space, Spin } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createRecipientGroup, getRecipientGroup, listIdentities, updateRecipientGroup } from '../../api'
import { getErrorMessage } from '../../api/client'
import type { Identity, RecipientGroup, RecipientGroupCreate } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'

export function RecipientGroupFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isNew = !id
  const [form] = Form.useForm<RecipientGroupCreate>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [identities, setIdentities] = useState<Identity[]>([])

  // 只取 person 类型用于组
  const personOptions = identities
    .filter((i) => i.kind === 'person')
    .map((i) => ({ value: i.id, label: `${i.name} (${i.external_id})` }))

  useEffect(() => {
    listIdentities({ kind: 'person' })
      .then(setIdentities)
      .catch(() => {})
  }, [])

  const loadGroup = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const row: RecipientGroup = await getRecipientGroup(id)
      form.setFieldsValue({
        name: row.name,
        channel_type: row.channel_type,
        member_ids: row.member_ids,
      })
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [id, form])

  useEffect(() => { void loadGroup() }, [loadGroup])

  const onFinish = async (values: RecipientGroupCreate) => {
    setSaving(true)
    try {
      if (isNew) {
        await createRecipientGroup(values)
        message.success('创建成功')
      } else {
        await updateRecipientGroup(id!, values)
        message.success('已更新')
      }
      navigate('/address-book')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={isNew ? '新建收件人组' : '编辑收件人组'}
        description="将多个个人用户打包为一个快捷组，通道配置时一键选取。组成员在保存时展开为独立身份。"
      />
      <Card style={{ maxWidth: 520 }}>
        <Spin spinning={!isNew && loading}>
          <Form
            form={form}
            layout="vertical"
            onFinish={(v) => void onFinish(v)}
            requiredMark={false}
            initialValues={{ name: '', channel_type: 'dingtalk', member_ids: [] }}
          >
            <Form.Item name="name" label="组名" rules={[{ required: true, message: '请输入组名' }]}>
              <Input placeholder="如 市场部、P0值班组" maxLength={128} />
            </Form.Item>

            <Form.Item name="channel_type" label="通道" rules={[{ required: true }]}>
              <Select options={[{ value: 'dingtalk', label: '钉钉' }]} disabled />
            </Form.Item>

            <Form.Item
              name="member_ids"
              label="组成员"
              rules={[{ required: true, message: '请选择至少一个成员' }]}
              extra="仅显示通讯录中的个人用户（person）"
            >
              <Select
                mode="multiple"
                showSearch
                optionFilterProp="label"
                placeholder="搜索并选择用户"
                options={personOptions}
              />
            </Form.Item>

            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={saving}>
                  {isNew ? '创建' : '保存'}
                </Button>
                <Button onClick={() => navigate('/address-book')}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        </Spin>
      </Card>
    </div>
  )
}
