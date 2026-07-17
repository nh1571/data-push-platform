/**
 * 状态展示工具：JobRun / Delivery 的 Tag 与时间格式化。
 *
 * 将后端英文状态码映射为中文文案 + Ant Design Tag 颜色，
 * 供工作台、执行记录列表与详情页复用。
 */
import { Tag } from 'antd'

/** JobRun.status 对应 Tag 颜色 */
const RUN_STATUS_COLOR: Record<string, string> = {
  pending: 'default',
  running: 'processing',
  succeeded: 'success',
  failed: 'error',
  partial: 'warning',
  cancelled: 'default',
  skipped: 'default',
}

/** Delivery.status 对应 Tag 颜色 */
const DELIVERY_STATUS_COLOR: Record<string, string> = {
  pending: 'default',
  running: 'processing',
  success: 'success',
  failed: 'error',
  skipped: 'default',
}

/** JobRun.status 对应中文标签文案 */
const RUN_STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  succeeded: '成功',
  failed: '失败',
  partial: '部分成功',
  cancelled: '已取消',
  skipped: '已跳过',
}

/** Delivery.status 对应中文标签文案 */
const DELIVERY_STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '投递中',
  success: '成功',
  failed: '失败',
  skipped: '已跳过',
}

/** 任务运行状态 Tag */
export function RunStatusTag({ status }: { status: string }) {
  return (
    <Tag color={RUN_STATUS_COLOR[status] ?? 'default'}>
      {RUN_STATUS_LABEL[status] ?? status}
    </Tag>
  )
}

/** 通道投递状态 Tag */
export function DeliveryStatusTag({ status }: { status: string }) {
  return (
    <Tag color={DELIVERY_STATUS_COLOR[status] ?? 'default'}>
      {DELIVERY_STATUS_LABEL[status] ?? status}
    </Tag>
  )
}

/**
 * 将 ISO 时间字符串格式化为中文本地时间；空值显示 `-`。
 */
export function formatDateTime(value?: string | null): string {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('zh-CN')
  } catch {
    return value
  }
}
