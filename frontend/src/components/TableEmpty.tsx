import { Empty } from 'antd'
import type { ReactNode } from 'react'

export interface TableEmptyProps {
  description?: ReactNode
  action?: ReactNode
}

/** 表格空态：短文案 + 可选主操作 */
export function TableEmpty({ description = '暂无数据', action }: TableEmptyProps) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={description}
      style={{ padding: '32px 0' }}
    >
      {action}
    </Empty>
  )
}
