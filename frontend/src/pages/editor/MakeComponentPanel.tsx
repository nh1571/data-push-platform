/**
 * 做组件属性面板 — 参考帆软 FineReport 图表属性结构。
 *
 * 帆软选中图表后，右侧「单元格元素」典型分区：
 *   类型 | 数据 | 样式（标题 / 图例 / 系列 / 坐标轴 / 背景）| 特效·显示
 *
 * 本面板按同一信息架构组织，字段写入 StudioNode.props，成图与预览共用。
 */
import {
  Collapse,
  ColorPicker,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd'
import type { Color } from 'antd/es/color-picker'
import type { CSSProperties, ReactNode } from 'react'

export type MakeDraft = {
  type: string
  dataset_id: string
  value_column?: string
  value_columns?: string[]
  category_column?: string
  label?: string
  text?: string
  chart_type?: string
  title?: string
  subtitle?: string
  variant?: string
  table_style?: string
  level?: string
  show_label?: boolean
  show_legend?: boolean
  show_grid?: boolean
  smooth?: boolean
  stack?: boolean
  donut?: boolean
  rose?: boolean
  sort?: 'none' | 'asc' | 'desc'
  top_n?: number | null
  x_label_rotate?: number
  bar_border_radius?: number
  line_width?: number
  area_opacity?: number
  bar_max_width?: number
  content_font_size?: number
  content_font_weight?: string
  content_color?: string
  content_align?: 'left' | 'center' | 'right'
  content_line_height?: number
  label_font_size?: number
  label_color?: string
  title_font_size?: number
  chart_label_size?: number
  axis_font_size?: number
  legend_font_size?: number
  color_palette?: string[]
  /** 坐标轴标题 */
  x_axis_name?: string
  y_axis_name?: string
}

type Props = {
  draft: MakeDraft
  onChange: (patch: Partial<MakeDraft>) => void
  datasetOptions: { value: string; label: string }[]
  fields: string[]
  chartTypes: { value: string; label: string }[]
  tableStyles: { id: string; label: string }[]
  /** 富文本编辑器插槽（文案组件） */
  richTextSlot?: ReactNode
  fieldInsertSlot?: ReactNode
}

const CHART_PALETTES = [
  { value: 'default', label: '默认', colors: [] as string[] },
  {
    value: 'business',
    label: '商务蓝',
    colors: ['#1677ff', '#69b1ff', '#91caff', '#bae0ff', '#003eb3'],
  },
  {
    value: 'classic',
    label: '经典多色',
    colors: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de'],
  },
  {
    value: 'alert',
    label: '警示红',
    colors: ['#cf1322', '#ff4d4f', '#ff7875', '#ffa39e', '#820014'],
  },
  {
    value: 'growth',
    label: '增长绿',
    colors: ['#389e0d', '#73d13d', '#95de64', '#b7eb8f', '#237804'],
  },
]

function colorToHex(color: Color | string): string {
  if (typeof color === 'string') return color
  return color.toHexString()
}

const labelCls: CSSProperties = { fontSize: 12, color: '#595959', display: 'block', marginBottom: 4 }
const grid2: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
}

function Field({
  label,
  children,
  full,
}: {
  label: string
  children: ReactNode
  full?: boolean
}) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <span style={labelCls}>{label}</span>
      {children}
    </div>
  )
}

/**
 * 帆软式属性折叠面板。
 * activeKey 默认展开「数据」+「样式」，贴近设计器常用路径。
 */
export function MakeComponentPanel({
  draft,
  onChange,
  datasetOptions,
  fields,
  chartTypes,
  tableStyles,
  richTextSlot,
  fieldInsertSlot,
}: Props) {
  const isChart = draft.type === 'Chart'
  const isKpi = draft.type === 'Kpi'
  const isText = draft.type === 'Text'
  const isAlert = draft.type === 'Alert'
  const isTable = draft.type === 'Table'
  const isDivider = draft.type === 'Divider'

  const fieldOpts = fields.map((c) => ({ value: c, label: c }))
  const set = (patch: Partial<MakeDraft>) => onChange(patch)

  const paletteKey =
    CHART_PALETTES.find(
      (p) =>
        p.colors.length &&
        draft.color_palette?.join(',') === p.colors.join(','),
    )?.value || 'default'

  const items = [
    // —— 类型（帆软：类型） ——
    isChart
      ? {
          key: 'type',
          label: '类型',
          children: (
            <div style={grid2}>
              <Field label="图表类型" full>
                <Select
                  value={draft.chart_type || 'bar'}
                  options={chartTypes}
                  onChange={(v) => set({ chart_type: v })}
                  style={{ width: '100%' }}
                />
              </Field>
            </div>
          ),
        }
      : null,

    // —— 数据（帆软：数据） ——
    !isDivider
      ? {
          key: 'data',
          label: '数据',
          children: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(isChart || isKpi || isTable || isText || isAlert) && (
                <Field label="数据集">
                  <Select
                    value={draft.dataset_id}
                    options={datasetOptions}
                    onChange={(v) =>
                      set({
                        dataset_id: v,
                        value_column: undefined,
                        category_column: undefined,
                        value_columns: [],
                      })
                    }
                    style={{ width: '100%' }}
                    placeholder="选择已取数的数据集"
                  />
                </Field>
              )}

              {isKpi && (
                <>
                  <Field label="数值字段 *">
                    <Select
                      allowClear
                      value={draft.value_column || undefined}
                      options={fieldOpts}
                      onChange={(v) =>
                        set({ value_column: v, label: draft.label || v })
                      }
                      style={{ width: '100%' }}
                      placeholder="必选"
                    />
                  </Field>
                  <Field label="显示名">
                    <Input
                      value={draft.label}
                      onChange={(e) => set({ label: e.target.value })}
                      placeholder="指标名称"
                    />
                  </Field>
                </>
              )}

              {isChart && (
                <>
                  <Field label="分类字段（类目轴）*">
                    <Select
                      allowClear
                      value={draft.category_column || undefined}
                      options={fieldOpts}
                      onChange={(v) => set({ category_column: v })}
                      style={{ width: '100%' }}
                    />
                  </Field>
                  <Field label="数值字段（系列，可多选）*">
                    <Select
                      mode="multiple"
                      allowClear
                      value={
                        draft.value_columns?.length
                          ? draft.value_columns
                          : draft.value_column
                            ? [draft.value_column]
                            : []
                      }
                      options={fieldOpts}
                      onChange={(v) =>
                        set({
                          value_columns: v,
                          value_column: v[0],
                          show_legend: v.length > 1 ? true : draft.show_legend,
                        })
                      }
                      style={{ width: '100%' }}
                      placeholder="选 1 个或多个数值列"
                    />
                  </Field>
                  <div style={grid2}>
                    <Field label="排序">
                      <Select
                        value={draft.sort || 'none'}
                        options={[
                          { value: 'none', label: '不排序' },
                          { value: 'desc', label: '数值降序' },
                          { value: 'asc', label: '数值升序' },
                        ]}
                        onChange={(v) => set({ sort: v })}
                        style={{ width: '100%' }}
                      />
                    </Field>
                    <Field label="Top N">
                      <InputNumber
                        min={0}
                        max={100}
                        style={{ width: '100%' }}
                        placeholder="全部"
                        value={draft.top_n ?? undefined}
                        onChange={(v) => set({ top_n: v })}
                      />
                    </Field>
                  </div>
                </>
              )}

              {isTable && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  表格使用当前数据集全部列；可在样式中调字号与表风格。
                </Typography.Text>
              )}

              {isText && (
                <>
                  {richTextSlot}
                  {fieldInsertSlot}
                </>
              )}

              {isAlert && (
                <>
                  <Field label="告警文案">
                    <Input.TextArea
                      rows={3}
                      value={draft.text}
                      onChange={(e) => set({ text: e.target.value })}
                      placeholder="可插入 {{列名}}"
                    />
                  </Field>
                  {fieldInsertSlot}
                  <Field label="级别">
                    <Select
                      value={draft.level || 'error'}
                      options={[
                        { value: 'error', label: '错误' },
                        { value: 'warning', label: '警告' },
                        { value: 'info', label: '信息' },
                        { value: 'success', label: '成功' },
                      ]}
                      onChange={(v) => set({ level: v })}
                      style={{ width: '100%' }}
                    />
                  </Field>
                </>
              )}

              {!fields.length && !isDivider ? (
                <Typography.Text type="warning" style={{ fontSize: 12 }}>
                  请先在「数据」步对数据集取数，再绑定字段。
                </Typography.Text>
              ) : null}
            </div>
          ),
        }
      : null,

    // —— 样式 · 标题（帆软：样式 > 标题） ——
    isChart || isKpi
      ? {
          key: 'style-title',
          label: '样式 · 标题',
          children: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {isChart && (
                <>
                  <Field label="标题">
                    <Input
                      value={draft.title}
                      onChange={(e) => set({ title: e.target.value })}
                      placeholder="图表标题"
                    />
                  </Field>
                  <Field label="副标题">
                    <Input
                      value={draft.subtitle}
                      onChange={(e) => set({ subtitle: e.target.value })}
                      placeholder="可选"
                    />
                  </Field>
                  <div style={grid2}>
                    <Field label="标题字号">
                      <InputNumber
                        min={10}
                        max={36}
                        style={{ width: '100%' }}
                        value={draft.title_font_size ?? 15}
                        onChange={(v) => set({ title_font_size: v ?? 15 })}
                      />
                    </Field>
                  </div>
                </>
              )}
              {isKpi && (
                <>
                  <Field label="指标显示名">
                    <Input
                      value={draft.label}
                      onChange={(e) => set({ label: e.target.value })}
                    />
                  </Field>
                  <div style={grid2}>
                    <Field label="数值字号">
                      <InputNumber
                        min={12}
                        max={72}
                        style={{ width: '100%' }}
                        value={draft.content_font_size ?? 28}
                        onChange={(v) => set({ content_font_size: v ?? 28 })}
                      />
                    </Field>
                    <Field label="标签字号">
                      <InputNumber
                        min={10}
                        max={28}
                        style={{ width: '100%' }}
                        value={draft.label_font_size ?? 12}
                        onChange={(v) => set({ label_font_size: v ?? 12 })}
                      />
                    </Field>
                    <Field label="数值字重">
                      <Select
                        style={{ width: '100%' }}
                        value={draft.content_font_weight || '700'}
                        options={[
                          { value: '400', label: '常规' },
                          { value: '500', label: '中等' },
                          { value: '600', label: '半粗' },
                          { value: '700', label: '加粗' },
                        ]}
                        onChange={(v) => set({ content_font_weight: v })}
                      />
                    </Field>
                    <Field label="对齐">
                      <Select
                        style={{ width: '100%' }}
                        value={draft.content_align || 'center'}
                        options={[
                          { value: 'left', label: '左' },
                          { value: 'center', label: '中' },
                          { value: 'right', label: '右' },
                        ]}
                        onChange={(v) => set({ content_align: v })}
                      />
                    </Field>
                    <Field label="数值颜色">
                      <ColorPicker
                        value={draft.content_color || undefined}
                        onChange={(c) =>
                          set({ content_color: c ? colorToHex(c) : undefined })
                        }
                        allowClear
                      />
                    </Field>
                    <Field label="标签颜色">
                      <ColorPicker
                        value={draft.label_color || undefined}
                        onChange={(c) =>
                          set({ label_color: c ? colorToHex(c) : undefined })
                        }
                        allowClear
                      />
                    </Field>
                  </div>
                </>
              )}
            </div>
          ),
        }
      : null,

    // —— 样式 · 图例 / 系列（帆软：样式 > 图例 / 系列） ——
    isChart
      ? {
          key: 'style-series',
          label: '样式 · 图例 / 系列',
          children: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="配色方案">
                <Select
                  style={{ width: '100%' }}
                  value={paletteKey}
                  options={CHART_PALETTES.map((p) => ({
                    value: p.value,
                    label: (
                      <Space size={6}>
                        <span>{p.label}</span>
                        {p.colors.slice(0, 4).map((c) => (
                          <span
                            key={c}
                            style={{
                              display: 'inline-block',
                              width: 12,
                              height: 12,
                              borderRadius: 2,
                              background: c,
                            }}
                          />
                        ))}
                      </Space>
                    ),
                  }))}
                  onChange={(v) => {
                    const p = CHART_PALETTES.find((x) => x.value === v)
                    set({
                      color_palette:
                        !p || p.value === 'default' ? undefined : p.colors,
                    })
                  }}
                />
              </Field>
              <div style={grid2}>
                <Field label="数据标签字号">
                  <InputNumber
                    min={8}
                    max={24}
                    style={{ width: '100%' }}
                    value={draft.chart_label_size ?? 10}
                    onChange={(v) => set({ chart_label_size: v ?? 10 })}
                  />
                </Field>
                <Field label="图例字号">
                  <InputNumber
                    min={8}
                    max={20}
                    style={{ width: '100%' }}
                    value={draft.legend_font_size ?? 11}
                    onChange={(v) => set({ legend_font_size: v ?? 11 })}
                  />
                </Field>
                {(draft.chart_type === 'bar' || draft.chart_type === 'hbar') && (
                  <>
                    <Field label="柱圆角">
                      <InputNumber
                        min={0}
                        max={20}
                        style={{ width: '100%' }}
                        value={draft.bar_border_radius ?? 4}
                        onChange={(v) => set({ bar_border_radius: v ?? 4 })}
                      />
                    </Field>
                    <Field label="柱宽上限">
                      <InputNumber
                        min={8}
                        max={120}
                        style={{ width: '100%' }}
                        value={draft.bar_max_width ?? 48}
                        onChange={(v) => set({ bar_max_width: v ?? 48 })}
                      />
                    </Field>
                  </>
                )}
                {(draft.chart_type === 'line' || draft.chart_type === 'area') && (
                  <>
                    <Field label="线宽">
                      <InputNumber
                        min={1}
                        max={8}
                        step={0.5}
                        style={{ width: '100%' }}
                        value={draft.line_width ?? 2.5}
                        onChange={(v) => set({ line_width: v ?? 2.5 })}
                      />
                    </Field>
                    {draft.chart_type === 'area' && (
                      <Field label="面积透明度">
                        <InputNumber
                          min={0}
                          max={1}
                          step={0.05}
                          style={{ width: '100%' }}
                          value={draft.area_opacity ?? 0.28}
                          onChange={(v) => set({ area_opacity: v ?? 0.28 })}
                        />
                      </Field>
                    )}
                  </>
                )}
              </div>
            </div>
          ),
        }
      : null,

    // —— 样式 · 坐标轴（帆软：样式 > 坐标轴） ——
    isChart && draft.chart_type !== 'pie'
      ? {
          key: 'style-axis',
          label: '样式 · 坐标轴',
          children: (
            <div style={grid2}>
              <Field label="轴文字字号">
                <InputNumber
                  min={8}
                  max={20}
                  style={{ width: '100%' }}
                  value={draft.axis_font_size ?? 11}
                  onChange={(v) => set({ axis_font_size: v ?? 11 })}
                />
              </Field>
              <Field label="类目轴标签旋转">
                <InputNumber
                  min={0}
                  max={90}
                  style={{ width: '100%' }}
                  value={draft.x_label_rotate ?? 0}
                  onChange={(v) => set({ x_label_rotate: v ?? 0 })}
                />
              </Field>
              <Field label="X 轴名称">
                <Input
                  value={draft.x_axis_name || ''}
                  onChange={(e) => set({ x_axis_name: e.target.value })}
                  placeholder="可选"
                />
              </Field>
              <Field label="Y 轴名称">
                <Input
                  value={draft.y_axis_name || ''}
                  onChange={(e) => set({ y_axis_name: e.target.value })}
                  placeholder="可选"
                />
              </Field>
            </div>
          ),
        }
      : null,

    // —— 样式 · 表格 / 文案 ——
    isTable || isText || isAlert
      ? {
          key: 'style-content',
          label: isTable ? '样式 · 表格' : '样式 · 文字',
          children: (
            <div style={grid2}>
              {isTable && (
                <Field label="表风格" full>
                  <Select
                    style={{ width: '100%' }}
                    value={draft.table_style || 'business'}
                    options={tableStyles.map((s) => ({
                      value: s.id,
                      label: s.label,
                    }))}
                    onChange={(v) => set({ table_style: v })}
                  />
                </Field>
              )}
              <Field label="正文字号">
                <InputNumber
                  min={10}
                  max={48}
                  style={{ width: '100%' }}
                  value={draft.content_font_size}
                  placeholder="默认"
                  onChange={(v) =>
                    set({ content_font_size: v == null ? undefined : Number(v) })
                  }
                />
              </Field>
              <Field label="字重">
                <Select
                  allowClear
                  style={{ width: '100%' }}
                  value={draft.content_font_weight}
                  options={[
                    { value: '400', label: '常规' },
                    { value: '500', label: '中等' },
                    { value: '600', label: '半粗' },
                    { value: '700', label: '加粗' },
                  ]}
                  onChange={(v) => set({ content_font_weight: v || undefined })}
                />
              </Field>
              <Field label="对齐">
                <Select
                  allowClear
                  style={{ width: '100%' }}
                  value={draft.content_align}
                  options={[
                    { value: 'left', label: '左' },
                    { value: 'center', label: '中' },
                    { value: 'right', label: '右' },
                  ]}
                  onChange={(v) => set({ content_align: v || undefined })}
                />
              </Field>
              <Field label="文字颜色">
                <ColorPicker
                  allowClear
                  value={draft.content_color || undefined}
                  onChange={(c) =>
                    set({ content_color: c ? colorToHex(c) : undefined })
                  }
                />
              </Field>
            </div>
          ),
        }
      : null,

    // —— 显示 / 特效（帆软：特效 + 显示开关） ——
    isChart
      ? {
          key: 'display',
          label: '显示',
          children: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>
                <Switch
                  size="small"
                  checked={draft.show_label !== false}
                  onChange={(v) => set({ show_label: v })}
                />{' '}
                <Typography.Text style={{ fontSize: 13 }}>数据标签</Typography.Text>
              </label>
              <label>
                <Switch
                  size="small"
                  checked={Boolean(draft.show_legend)}
                  onChange={(v) => set({ show_legend: v })}
                />{' '}
                <Typography.Text style={{ fontSize: 13 }}>图例</Typography.Text>
              </label>
              <label>
                <Switch
                  size="small"
                  checked={draft.show_grid !== false}
                  onChange={(v) => set({ show_grid: v })}
                />{' '}
                <Typography.Text style={{ fontSize: 13 }}>网格线</Typography.Text>
              </label>
              {(draft.chart_type === 'line' || draft.chart_type === 'area') && (
                <label>
                  <Switch
                    size="small"
                    checked={draft.smooth !== false}
                    onChange={(v) => set({ smooth: v })}
                  />{' '}
                  <Typography.Text style={{ fontSize: 13 }}>平滑曲线</Typography.Text>
                </label>
              )}
              {(draft.chart_type === 'bar' ||
                draft.chart_type === 'line' ||
                draft.chart_type === 'area' ||
                draft.chart_type === 'hbar') && (
                <label>
                  <Switch
                    size="small"
                    checked={Boolean(draft.stack)}
                    onChange={(v) => set({ stack: v })}
                  />{' '}
                  <Typography.Text style={{ fontSize: 13 }}>堆叠</Typography.Text>
                </label>
              )}
              {draft.chart_type === 'pie' && (
                <>
                  <label>
                    <Switch
                      size="small"
                      checked={Boolean(draft.donut)}
                      onChange={(v) => set({ donut: v })}
                    />{' '}
                    <Typography.Text style={{ fontSize: 13 }}>环形图</Typography.Text>
                  </label>
                  <label>
                    <Switch
                      size="small"
                      checked={Boolean(draft.rose)}
                      onChange={(v) => set({ rose: v })}
                    />{' '}
                    <Typography.Text style={{ fontSize: 13 }}>玫瑰图</Typography.Text>
                  </label>
                </>
              )}
            </div>
          ),
        }
      : null,
  ].filter(Boolean) as { key: string; label: string; children: ReactNode }[]

  if (isDivider) {
    return (
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        分隔线无数据绑定。可在「组装画布」调整长度与颜色。
      </Typography.Paragraph>
    )
  }

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: '#8c8c8c',
          marginBottom: 8,
          lineHeight: 1.45,
        }}
      >
        属性结构参考帆软：
        <Tag style={{ marginLeft: 4 }}>类型</Tag>
        <Tag>数据</Tag>
        <Tag>样式</Tag>
        <Tag>显示</Tag>
        — 配置写入组件，成图与预览一致。
      </div>
      <Collapse
        size="small"
        bordered={false}
        defaultActiveKey={['type', 'data', 'style-title', 'style-series', 'display']}
        style={{ background: 'transparent' }}
        items={items.map((it) => ({
          key: it.key,
          label: (
            <span style={{ fontWeight: 600, fontSize: 13 }}>{it.label}</span>
          ),
          children: it.children,
          style: {
            marginBottom: 8,
            background: '#fff',
            borderRadius: 8,
            border: '1px solid #f0f0f0',
          },
        }))}
      />
    </div>
  )
}
