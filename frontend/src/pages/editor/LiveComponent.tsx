/**
 * 画布内「活」组件预览。
 *
 * 根据 StudioNode.type 用本地数据集行（DatasetMaps）即时渲染：
 * Chart → LiveChart；Kpi/Table/Text/Alert/Divider 各自布局。
 * 与「做组件」预览同一数据通路，**不是**服务端截图。
 *
 * 文案/告警通过 substituteRow 将 `{{列名}}` 替换为数据集第一行实值。
 * 供 ComposeCanvas 在自由布局壳内嵌入使用。
 */
import { Table, Typography } from 'antd'
import type { StudioNode } from '../../api/types'
import { seriesFromTable, type ChartStyle } from './chartOption'
import { LiveChart } from './LiveChart'
import { firstRowMap, substituteRow, type DataPreviewCtx } from './studioUtils'

/** 按 dataset_id 索引的列名与行矩阵（来自 queryPreview 缓存） */
export type DatasetMaps = {
  fieldsByDataset: Record<string, string[]>
  rowsByDataset: Record<string, unknown[][]>
}

type Props = {
  node: StudioNode
  data: DatasetMaps
  /** 壳内可用像素高度（不含编辑把手） */
  height: number
  themeColor?: string
}

/** 从节点 props 提取 ChartStyle，供 LiveChart 使用 */
function chartStyleFromNode(props: Record<string, unknown>, vcols: string[]): ChartStyle {
  return {
    chart_type: String(props.chart_type || 'bar'),
    title: props.title ? String(props.title) : undefined,
    subtitle: props.subtitle ? String(props.subtitle) : undefined,
    show_label: props.show_label !== false,
    show_legend: Boolean(props.show_legend || props.legend) || vcols.length > 1,
    show_grid: props.show_grid !== false,
    smooth: props.smooth !== false,
    stack: Boolean(props.stack),
    donut: Boolean(props.donut),
    rose: Boolean(props.rose),
    sort: (props.sort as ChartStyle['sort']) || 'none',
    top_n: (props.top_n as number) ?? null,
    x_label_rotate: Number(props.x_label_rotate || 0),
    bar_border_radius: Number(props.bar_border_radius ?? 4),
    line_width: Number(props.line_width ?? 2.5),
    area_opacity: Number(props.area_opacity ?? 0.28),
  }
}

/**
 * 按节点类型渲染实时预览。
 * 未绑定数据时显示 EmptyHint 引导用户回「做组件」。
 */
export function LiveComponent({ node, data, height, themeColor = '#1677ff' }: Props) {
  const props = (node.props || {}) as Record<string, unknown>
  const binding = (node.binding || {}) as Record<string, unknown>
  const dsId = String(binding.dataset_id || 'main')
  const cols = data.fieldsByDataset[dsId] || []
  const rows = data.rowsByDataset[dsId] || []
  const ctx: DataPreviewCtx = { [dsId]: { columns: cols, rows } }
  const h = Math.max(40, height)

  // —— 图表 ——
  if (node.type === 'Chart') {
    // 兼容 value_columns 数组与单 value_column
    const vcols = Array.isArray(binding.value_columns)
      ? (binding.value_columns as unknown[]).map(String)
      : Array.isArray(props.value_columns)
        ? (props.value_columns as unknown[]).map(String)
        : binding.value_column
          ? [String(binding.value_column)]
          : []
    const cat = String(binding.category_column || '')
    if (!cat || !vcols.length || !cols.length || !rows.length) {
      return <EmptyHint text="图表未绑定数据，回「做组件」配置" h={h} />
    }
    const { labels, series } = seriesFromTable(cols, rows, cat, vcols)
    const style = chartStyleFromNode(props, vcols)
    return (
      <div style={{ width: '100%', height: h, overflow: 'hidden' }}>
        <LiveChart labels={labels} series={series} style={style} height={h} width="100%" />
      </div>
    )
  }

  // —— KPI：取绑定列第一行 ——
  if (node.type === 'Kpi') {
    const col = String(binding.value_column || '')
    const row = firstRowMap(ctx, dsId)
    const val = row && col ? row[col] : null
    const label = String(props.label || binding.label || col || '指标')
    const value = val === null || val === undefined ? '—' : String(val)
    // 字号随容器高度缩放
    const fontSize = Math.max(22, Math.min(42, Math.floor(h * 0.28)))
    return (
      <div
        style={{
          height: h,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ color: '#888', fontSize: Math.max(11, Math.floor(fontSize * 0.35)) }}>
          {label}
        </div>
        <div
          style={{
            fontSize,
            fontWeight: 700,
            color: themeColor,
            marginTop: 4,
            lineHeight: 1.15,
            wordBreak: 'break-all',
            textAlign: 'center',
          }}
        >
          {value}
        </div>
      </div>
    )
  }

  // —— 表格：最多预览 30 行 ——
  if (node.type === 'Table') {
    if (!cols.length) {
      return <EmptyHint text="表格未绑定数据" h={h} />
    }
    const showRows = rows.slice(0, 30)
    return (
      <div style={{ height: h, width: '100%', overflow: 'auto', padding: 4, boxSizing: 'border-box' }}>
        <Table
          size="small"
          pagination={false}
          scroll={{ x: true }}
          rowKey={(_, i) => String(i)}
          dataSource={showRows.map((row, i) => {
            const r: Record<string, unknown> = { key: i }
            cols.forEach((c, j) => {
              r[c] = row[j]
            })
            return r
          })}
          columns={cols.map((c) => ({
            title: c,
            dataIndex: c,
            ellipsis: true,
            width: 100,
          }))}
          style={{ margin: 0 }}
        />
      </div>
    )
  }

  // —— 文案：支持 HTML 或纯文本 + {{字段}} ——
  if (node.type === 'Text') {
    const row = firstRowMap(ctx, dsId)
    const raw = String(props.html || props.text || '')
    const text = substituteRow(raw, row)
    const isHtml = /<[a-z][\s\S]*>/i.test(text) || props.content_format === 'html' || props.variant === 'rich'
    if (isHtml) {
      return (
        <div
          className="comp-rich-preview"
          style={{
            height: h,
            overflow: 'auto',
            padding: 10,
            lineHeight: 1.55,
            fontSize: 13,
            color: '#222',
            boxSizing: 'border-box',
          }}
          dangerouslySetInnerHTML={{ __html: text || '<p>（空文案）</p>' }}
        />
      )
    }
    return (
      <div
        style={{
          height: h,
          overflow: 'auto',
          padding: 10,
          whiteSpace: 'pre-wrap',
          fontSize: 13,
          lineHeight: 1.55,
          boxSizing: 'border-box',
        }}
      >
        {text || '（空文案）'}
      </div>
    )
  }

  // —— 告警条：按 level 着色 ——
  if (node.type === 'Alert') {
    const row = firstRowMap(ctx, dsId)
    const text = substituteRow(String(props.text || ''), row)
    const level = String(props.level || 'error')
    const colors: Record<string, { fg: string; bg: string; bd: string }> = {
      error: { fg: '#a8071a', bg: '#fff2f0', bd: '#ffccc7' },
      warning: { fg: '#d48806', bg: '#fffbe6', bd: '#ffe58f' },
      info: { fg: '#0958d9', bg: '#e6f4ff', bd: '#91caff' },
      success: { fg: '#389e0d', bg: '#f6ffed', bd: '#b7eb8f' },
    }
    const c = colors[level] || colors.error
    return (
      <div
        style={{
          height: h,
          overflow: 'auto',
          padding: 12,
          fontSize: 13,
          lineHeight: 1.5,
          color: c.fg,
          background: c.bg,
          border: `1px solid ${c.bd}`,
          borderRadius: 6,
          boxSizing: 'border-box',
          whiteSpace: 'pre-wrap',
        }}
      >
        {text || '（空告警）'}
      </div>
    )
  }

  if (node.type === 'Divider') {
    return (
      <div
        style={{
          height: h,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ flex: 1, borderTop: '1px solid #e5e5e5' }} />
      </div>
    )
  }

  return <EmptyHint text={`暂不支持预览：${node.type}`} h={h} />
}

/** 未绑定/无数据时的居中提示 */
function EmptyHint({ text, h }: { text: string; h: number }) {
  return (
    <div
      style={{
        height: h,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#999',
        fontSize: 12,
        padding: 8,
        textAlign: 'center',
        background: '#fafafa',
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {text}
      </Typography.Text>
    </div>
  )
}
