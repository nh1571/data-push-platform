/**
 * 编辑器顶栏：作业名、最近运行状态、保存/推送按钮。
 */
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { Button, Input, Space, Tag, Tooltip, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'

export interface TopBarProps {
  name: string
  onNameChange: (v: string) => void
  jobId: string | null
  lastRunStatus?: string | null
  lastRunAt?: string | null
  saving: boolean
  pushing: boolean
  onSave: () => void
  onTestPush: () => void
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  succeeded: { color: 'success', icon: <CheckCircleOutlined />, label: '成功' },
  failed: { color: 'error', icon: <CloseCircleOutlined />, label: '失败' },
  partial: { color: 'warning', icon: <ExclamationCircleOutlined />, label: '部分成功' },
}

export function EditorTopBar({
  name,
  onNameChange,
  jobId,
  lastRunStatus,
  lastRunAt,
  saving,
  pushing,
  onSave,
  onTestPush,
}: TopBarProps) {
  const navigate = useNavigate()
  const statusCfg = lastRunStatus ? STATUS_CONFIG[lastRunStatus] : undefined

  return (
    <div
      style={{
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
        flexShrink: 0,
        gap: 12,
      }}
    >
      {/* 左侧：返回 + 作业名 */}
      <Space size={8}>
        <Tooltip title="返回任务列表">
          <Button
            type="text"
            size="small"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/push-jobs')}
          />
        </Tooltip>
        <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          内容工作台
        </Typography.Text>
        <Input
          variant="borderless"
          size="small"
          style={{ width: 200, fontWeight: 600 }}
          placeholder="未命名作业"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
        {jobId ? (
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            #{String(jobId).slice(0, 8)}
          </Typography.Text>
        ) : null}
      </Space>

      {/* 中间：运行状态 */}
      <Space size={8}>
        {statusCfg ? (
          <Tag color={statusCfg.color} icon={statusCfg.icon}>
            上次推送 {statusCfg.label}
            {lastRunAt ? ` · ${new Date(lastRunAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
          </Tag>
        ) : jobId ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            尚无运行记录
          </Typography.Text>
        ) : null}
      </Space>

      {/* 右侧：操作按钮 */}
      <Space size={8}>
        <Button
          icon={<SaveOutlined />}
          loading={saving}
          onClick={onSave}
        >
          保存
        </Button>
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={pushing}
          onClick={onTestPush}
        >
          推送
        </Button>
      </Space>
    </div>
  )
}
