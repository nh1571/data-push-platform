import { Tag } from 'antd'

const RUN_STATUS_COLOR: Record<string, string> = {
  pending: 'default',
  running: 'processing',
  succeeded: 'success',
  failed: 'error',
  partial: 'warning',
  cancelled: 'default',
  skipped: 'default',
}

const DELIVERY_STATUS_COLOR: Record<string, string> = {
  pending: 'default',
  running: 'processing',
  success: 'success',
  failed: 'error',
  skipped: 'default',
}

const RUN_STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  succeeded: '成功',
  failed: '失败',
  partial: '部分成功',
  cancelled: '已取消',
  skipped: '已跳过',
}

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '投递中',
  success: '成功',
  failed: '失败',
  skipped: '已跳过',
}

export function RunStatusTag({ status }: { status: string }) {
  return (
    <Tag color={RUN_STATUS_COLOR[status] ?? 'default'}>
      {RUN_STATUS_LABEL[status] ?? status}
    </Tag>
  )
}

export function DeliveryStatusTag({ status }: { status: string }) {
  return (
    <Tag color={DELIVERY_STATUS_COLOR[status] ?? 'default'}>
      {DELIVERY_STATUS_LABEL[status] ?? status}
    </Tag>
  )
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('zh-CN')
  } catch {
    return value
  }
}
