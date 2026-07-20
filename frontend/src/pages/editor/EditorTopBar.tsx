/**
 * V2 编辑器顶栏：作业名 + 保存 + 推送。
 */
import { ArrowLeftOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons'
import { Button, Input, Space, Tag, Tooltip, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'

interface Props {
  name: string
  onNameChange: (v: string) => void
  jobId: string | null
  saving: boolean
  pushing: boolean
  onSave: () => void
  onTestPush: () => void
}

const MODE_LABELS: Record<string, string> = {
  image_primary: '以图为主', markdown_primary: '以文为主', mixed: '图文混排',
}

export function EditorTopBar({ name, onNameChange, jobId, saving, pushing, onSave, onTestPush }: Props) {
  const navigate = useNavigate()
  return (
    <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', background: '#fff', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
      <Space size={8}>
        <Tooltip title="返回任务列表"><Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate('/push-jobs')} /></Tooltip>
        <Typography.Text style={{ fontSize: 13, fontWeight: 500 }}>内容工作台</Typography.Text>
        <Input variant="borderless" size="small" style={{ width: 180, fontWeight: 600 }} placeholder="未命名" value={name} onChange={(e) => onNameChange(e.target.value)} />
        {jobId && <Tag style={{ fontSize: 10 }}>#{jobId.slice(0, 8)}</Tag>}
      </Space>
      <Space size={8}>
        <Button icon={<SaveOutlined />} size="small" loading={saving} onClick={onSave}>保存</Button>
        <Button type="primary" icon={<SendOutlined />} size="small" loading={pushing} onClick={onTestPush}>推送</Button>
      </Space>
    </div>
  )
}
