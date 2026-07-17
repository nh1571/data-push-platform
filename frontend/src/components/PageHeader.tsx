import { Space, Typography } from 'antd'
import type { CSSProperties, ReactNode } from 'react'

export interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  extra?: ReactNode
  style?: CSSProperties
}

/** 列表/运营页统一页头：标题 + 副文案 + 右侧操作 */
export function PageHeader({ title, description, extra, style }: PageHeaderProps) {
  return (
    <div className="page-header" style={style}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
        <div style={{ minWidth: 0, flex: 1 }}>
          <Typography.Title level={4} className="page-header-title">
            {title}
          </Typography.Title>
          {description ? (
            <Typography.Text type="secondary" className="page-header-desc">
              {description}
            </Typography.Text>
          ) : null}
        </div>
        {extra ? <Space wrap>{extra}</Space> : null}
      </Space>
    </div>
  )
}
