/**
 * 数据源新建 / 编辑表单。
 *
 * 类型：SQLite（本地 path）或 MySQL / Doris / SQL Server（主机连接信息）。
 * 密码编辑时脱敏；修改连接配置需重新输入密码。
 *
 * 路由：`/data-sources/new` | `/data-sources/:id`
 */
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

/** 支持的数据源类型（与后端驱动对齐） */
const SOURCE_TYPES = [
  { value: 'sqlite', label: 'SQLite（本地演示 / 文件）' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'doris', label: 'Doris' },
  { value: 'sqlserver', label: 'SQL Server（院区 HIS）' },
]

/** 表单字段：SQLite 用 path，其余用 host/port/user/password/database */
interface FormValues {
  name: string
  type: string
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  charset?: string
  path?: string
}

/** 编辑态密码占位，表示未修改 */
const MASK = '******'

/** 数据源表单页：按类型切换字段并保存/测试 */
export function DataSourceFormPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const dsType = Form.useWatch('type', form)
  const isSqlite = dsType === 'sqlite'

  useEffect(() => {
    if (isNew) {
      form.setFieldsValue({
        type: 'sqlite',
        path: 'data/demo_biz.db',
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
          path: String(cfg.path ?? cfg.database ?? ''),
        })
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [form, id, isNew])

  /**
   * 组装后端 config。
   * 返回 null 表示校验失败或编辑态未带密码（调用方需特殊处理）。
   */
  const buildConfig = (values: FormValues): Record<string, unknown> | null => {
    if (values.type === 'sqlite') {
      if (!values.path?.trim()) {
        message.error('请填写 SQLite 文件路径')
        return null
      }
      return { path: values.path.trim(), max_rows: 10000 }
    }

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

    if (!isNew && !password) {
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
        if (values.type === 'sqlite') {
          if (config) body.config = config
        } else if (config) {
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
          <Input placeholder="例如：生产订单库 / 本地演示" />
        </Form.Item>
        <Form.Item name="type" label="类型" rules={[{ required: true }]}>
          <Select options={SOURCE_TYPES} />
        </Form.Item>

        {isSqlite ? (
          <Form.Item
            name="path"
            label="SQLite 文件路径"
            rules={[{ required: true, message: '请输入路径' }]}
            extra="相对 backend 工作目录，如 data/demo_biz.db（本地启动会自动生成演示库）"
          >
            <Input placeholder="data/demo_biz.db" />
          </Form.Item>
        ) : (
          <>
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
          </>
        )}

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
