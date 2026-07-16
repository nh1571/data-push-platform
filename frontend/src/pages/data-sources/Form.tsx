import { ArrowLeftOutlined, ApiOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, message, Select, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  createDataSource,
  getDataSource,
  testDataSource,
  updateDataSource,
} from '../../api'
import { getErrorMessage } from '../../api/client'

const SOURCE_TYPES = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'doris', label: 'Doris' },
  { value: 'sqlserver', label: 'SQL Server（院区 HIS）' },
]

interface FormValues {
  name: string
  type: string
  host: string
  port: number
  user: string
  password: string
  database: string
  charset?: string
}

const MASK = '******'

export function DataSourceFormPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (isNew) {
      form.setFieldsValue({
        type: 'mysql',
        port: 3306,
        charset: 'utf8mb4',
      })
      return
    }
    setLoading(true)
    getDataSource(id)
      .then((row) => {
        const cfg = row.config || {}
        form.setFieldsValue({
          name: row.name,
          type: row.type,
          host: String(cfg.host ?? ''),
          port: Number(cfg.port ?? 3306),
          user: String(cfg.user ?? ''),
          password: String(cfg.password ?? ''),
          database: String(cfg.database ?? ''),
          charset: cfg.charset ? String(cfg.charset) : 'utf8mb4',
        })
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [form, id, isNew])

  const buildConfig = (values: FormValues): Record<string, unknown> | null => {
    // On update, skip re-sending masked password so user can leave it blank/masked
    const password =
      !isNew && (!values.password || values.password === MASK) ? undefined : values.password

    if (isNew && !password) {
      message.error('请填写密码')
      return null
    }

    const config: Record<string, unknown> = {
      host: values.host,
      port: values.port,
      user: values.user,
      database: values.database,
    }
    if (password) config.password = password
    if (values.charset) config.charset = values.charset

    // Edit without password change: must include full config with password from form
    // Backend replaces entire config_enc when config is provided. If password is masked,
    // require user to re-enter password when updating config fields.
    if (!isNew && !password) {
      // Only name/type update — omit config entirely
      return null
    }
    return config
  }

  const onSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (isNew) {
        const config = buildConfig(values)
        if (!config) return
        const created = await createDataSource({
          name: values.name,
          type: values.type,
          config,
        })
        message.success('创建成功')
        navigate(`/data-sources/${created.id}`, { replace: true })
      } else {
        const config = buildConfig(values)
        const body: {
          name: string
          type: string
          config?: Record<string, unknown>
        } = {
          name: values.name,
          type: values.type,
        }
        if (config) {
          body.config = config
        } else if (values.password && values.password !== MASK) {
          body.config = {
            host: values.host,
            port: values.port,
            user: values.user,
            password: values.password,
            database: values.database,
            charset: values.charset,
          }
        } else {
          // When updating connection fields without new password, still need full config
          // If password is still mask, require re-entry for config update
          const dirty = form.isFieldsTouched([
            'host',
            'port',
            'user',
            'password',
            'database',
            'charset',
          ])
          if (dirty && (!values.password || values.password === MASK)) {
            message.warning('修改连接配置时请重新输入密码')
            return
          }
          if (dirty) {
            body.config = {
              host: values.host,
              port: values.port,
              user: values.user,
              password: values.password,
              database: values.database,
              charset: values.charset,
            }
          }
        }
        await updateDataSource(id, body)
        message.success('保存成功')
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const onTest = async () => {
    if (isNew) {
      message.info('请先保存后再测试连接')
      return
    }
    setTesting(true)
    try {
      const res = await testDataSource(id)
      if (res.ok) message.success(res.message || '连接成功')
      else message.error(res.message || '连接失败')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/data-sources')}>
          返回
        </Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {isNew ? '新建数据源' : '编辑数据源'}
        </Typography.Title>
      </Space>

      <Form
        form={form}
        layout="vertical"
        style={{ maxWidth: 560 }}
        disabled={loading}
        onFinish={() => void onSave()}
      >
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="例如：生产订单库" />
        </Form.Item>
        <Form.Item name="type" label="类型" rules={[{ required: true }]}>
          <Select options={SOURCE_TYPES} />
        </Form.Item>
        <Form.Item name="host" label="主机" rules={[{ required: true, message: '请输入主机' }]}>
          <Input placeholder="localhost" />
        </Form.Item>
        <Form.Item name="port" label="端口" rules={[{ required: true, message: '请输入端口' }]}>
          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="user" label="用户" rules={[{ required: true, message: '请输入用户' }]}>
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="password"
          label="密码"
          rules={isNew ? [{ required: true, message: '请输入密码' }] : []}
          extra={!isNew ? '已脱敏显示；修改连接配置时请重新输入密码' : undefined}
        >
          <Input.Password autoComplete="new-password" placeholder={isNew ? '' : '******'} />
        </Form.Item>
        <Form.Item
          name="database"
          label="数据库"
          rules={[{ required: true, message: '请输入数据库名' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="charset" label="字符集">
          <Input placeholder="utf8mb4" />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={saving}>
            保存
          </Button>
          {!isNew ? (
            <Button icon={<ApiOutlined />} loading={testing} onClick={() => void onTest()}>
              测试连接
            </Button>
          ) : null}
        </Space>
      </Form>
    </div>
  )
}
