/**
 * ECharts 配置构建工具。
 *
 * 将「绑定后的表格数据 + ChartStyle 样式」转换为 Apache ECharts option。
 * 心智模型对齐 DataEase / Superset 一类 BI 图表配置（底层同为 ECharts）。
 *
 * 主要导出：
 * - `ChartStyle` / `SeriesInput`：样式与序列类型
 * - `prepareAxisData`：排序 / TopN 预处理
 * - `buildEchartsOption`：按 chart_type 生成柱/折/面积/饼/条形 option
 * - `seriesFromTable`：从 queryPreview 行列矩阵抽取 labels + series
 *
 * 被 LiveChart、LiveComponent、EditorPage「做组件」本地预览共用。
 */
import type { EChartsOption } from 'echarts'

/**
 * 图表样式/行为配置（存在节点 props 中，与后端渲染约定一致）。
 * theme 字段仅客户端背景参考；真正配色用 color_palette。
 */
export type ChartStyle = {
  chart_type?: string
  title?: string
  subtitle?: string
  /** 客户端主题背景参考；option 颜色见 color_palette */
  theme?: string
  color_palette?: string[]
  show_label?: boolean
  show_legend?: boolean
  show_grid?: boolean
  smooth?: boolean
  stack?: boolean
  donut?: boolean
  rose?: boolean
  horizontal?: boolean
  bar_border_radius?: number
  line_width?: number
  area_opacity?: number
  label_position?: string
  legend_position?: 'top' | 'bottom' | 'left' | 'right'
  x_label_rotate?: number
  sort?: 'none' | 'asc' | 'desc'
  top_n?: number | null
  series_name?: string
  /** 图表标题字号（组装画布可调） */
  title_font_size?: number
  /** 数据标签字号 */
  label_font_size?: number
  /** 坐标轴字号 */
  axis_font_size?: number
  x_axis_name?: string
  y_axis_name?: string
}

/** 单条数据序列：名称 + 与 labels 等长的数值数组（缺失为 null） */
export type SeriesInput = {
  name: string
  values: (number | null)[]
}

/** ECharts 默认色板 */
const DEFAULT_PALETTE = [
  '#5470c6',
  '#91cc75',
  '#fac858',
  '#ee6666',
  '#73c0de',
  '#3ba272',
  '#fc8452',
  '#9a60b4',
  '#ea7ccc',
]

/**
 * 按 style.sort / style.top_n 对分类轴数据做预处理。
 * 排序以第一条 series 的值为键；TopN 在排序后截断。
 */
export function prepareAxisData(
  labels: string[],
  seriesList: SeriesInput[],
  style: ChartStyle,
): { labels: string[]; seriesList: SeriesInput[] } {
  let pairs = labels.map((lab, i) => ({
    lab,
    vals: seriesList.map((s) => s.values[i] ?? null),
  }))

  const sort = style.sort || 'none'
  if (sort !== 'none' && seriesList[0]) {
    pairs = [...pairs].sort((a, b) => {
      const av = Number(a.vals[0] ?? 0)
      const bv = Number(b.vals[0] ?? 0)
      return sort === 'asc' ? av - bv : bv - av
    })
  }
  const topN = style.top_n
  if (topN && topN > 0) {
    pairs = pairs.slice(0, topN)
  }
  return {
    labels: pairs.map((p) => p.lab),
    seriesList: seriesList.map((s, si) => ({
      name: s.name,
      values: pairs.map((p) => p.vals[si] ?? null),
    })),
  }
}

/**
 * 根据 chart_type 构建完整 ECharts option。
 * - pie：单序列 → 饼/环/玫瑰
 * - bar / hbar / line / area：笛卡尔坐标系；hbar 或 horizontal 时交换轴
 */
export function buildEchartsOption(
  labelsIn: string[],
  seriesIn: SeriesInput[],
  style: ChartStyle = {},
): EChartsOption {
  const { labels, seriesList } = prepareAxisData(labelsIn, seriesIn, style)
  const ct = (style.chart_type || 'bar').toLowerCase()
  const palette = style.color_palette?.length ? style.color_palette : DEFAULT_PALETTE
  const showLabel = style.show_label !== false
  const showLegend = style.show_legend === true || seriesList.length > 1
  const showGrid = style.show_grid !== false
  const title = style.title || ''
  const subtitle = style.subtitle || ''
  const titleFs = Number(style.title_font_size)
  const labelFs = Number(style.label_font_size)
  const axisFs = Number(style.axis_font_size)
  const titleSize = Number.isFinite(titleFs) && titleFs > 0 ? titleFs : 15
  const labelSize = Number.isFinite(labelFs) && labelFs > 0 ? labelFs : 10
  const axisSize = Number.isFinite(axisFs) && axisFs > 0 ? axisFs : 11

  const base: EChartsOption = {
    color: palette,
    backgroundColor: 'transparent',
    title: title
      ? {
          text: title,
          subtext: subtitle || undefined,
          left: 'center',
          top: 6,
          textStyle: { fontSize: titleSize, fontWeight: 600 },
          subtextStyle: { fontSize: Math.max(10, Math.round(titleSize * 0.8)), color: '#888' },
        }
      : undefined,
    tooltip: {
      trigger: ct === 'pie' ? 'item' : 'axis',
      axisPointer: ct === 'pie' ? undefined : { type: 'shadow' },
    },
    legend: showLegend
      ? {
          bottom: style.legend_position === 'top' ? undefined : 4,
          top: style.legend_position === 'top' ? 28 : undefined,
          left: 'center',
          type: 'scroll',
        }
      : { show: false },
    grid:
      ct === 'pie'
        ? undefined
        : {
            left: 48,
            right: 24,
            top: title ? 56 : 32,
            bottom: showLegend ? 48 : 36,
            containLabel: true,
            show: showGrid,
          },
  }

  // —— 饼图分支 ——
  if (ct === 'pie') {
    const data = labels.map((name, i) => ({
      name,
      value: Number(seriesList[0]?.values[i] ?? 0),
    }))
    return {
      ...base,
      series: [
        {
          name: style.series_name || seriesList[0]?.name || '数值',
          type: 'pie',
          radius: style.donut ? ['42%', '68%'] : ['0%', '68%'],
          center: ['50%', '55%'],
          roseType: style.rose ? 'radius' : undefined,
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: {
            show: showLabel,
            formatter: '{b}\n{d}%',
            fontSize: labelSize + 1,
          },
          emphasis: {
            label: { show: true, fontSize: labelSize + 3, fontWeight: 'bold' },
            itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.15)' },
          },
          data,
        },
      ],
    }
  }

  // —— 笛卡尔：柱/折/面积/条形 ——
  const isH = ct === 'hbar' || style.horizontal
  const categoryAxis = {
    type: 'category' as const,
    data: labels,
    name: isH ? style.y_axis_name : style.x_axis_name,
    nameTextStyle: { fontSize: axisSize },
    axisLabel: {
      // 分类过多时自动倾斜，避免重叠
      rotate: isH ? 0 : style.x_label_rotate ?? (labels.length > 8 ? 30 : 0),
      fontSize: axisSize,
    },
    axisTick: { alignWithLabel: true },
  }
  const valueAxis = {
    type: 'value' as const,
    name: isH ? style.x_axis_name : style.y_axis_name,
    nameTextStyle: { fontSize: axisSize },
    axisLabel: { fontSize: axisSize },
    splitLine: {
      show: showGrid,
      lineStyle: { type: 'dashed' as const, opacity: 0.5 },
    },
  }

  const series: EChartsOption['series'] = seriesList.map((s, idx) => {
    const name = s.name || style.series_name || `系列${idx + 1}`
    if (ct === 'line' || ct === 'area') {
      return {
        name,
        type: 'line',
        data: s.values,
        smooth: style.smooth !== false,
        stack: style.stack ? 'total' : undefined,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: style.line_width ?? 2.5 },
        areaStyle:
          ct === 'area'
            ? { opacity: style.area_opacity ?? 0.28 }
            : undefined,
        label: {
          show: showLabel,
          position: (style.label_position as 'top') || 'top',
          fontSize: labelSize,
        },
        emphasis: { focus: 'series' },
      }
    }
    return {
      name,
      type: 'bar',
      data: s.values,
      stack: style.stack ? 'total' : undefined,
      barMaxWidth: 48,
      itemStyle: {
        borderRadius: isH
          ? [0, style.bar_border_radius ?? 4, style.bar_border_radius ?? 4, 0]
          : [style.bar_border_radius ?? 4, style.bar_border_radius ?? 4, 0, 0],
      },
      label: {
        show: showLabel,
        position: isH ? 'right' : (style.label_position as 'top') || 'top',
        fontSize: labelSize,
      },
      emphasis: { focus: 'series' },
    }
  })

  return {
    ...base,
    xAxis: isH ? valueAxis : categoryAxis,
    yAxis: isH ? categoryAxis : valueAxis,
    series,
  }
}

/**
 * 从表格预览（columns + rows）按分类列/数值列抽取 ECharts 输入。
 * 数值会去掉千分位逗号与百分号再 Number 化；无法解析则为 null。
 */
export function seriesFromTable(
  columns: string[],
  rows: unknown[][],
  categoryCol: string,
  valueCols: string[],
): { labels: string[]; series: SeriesInput[] } {
  const ci = columns.indexOf(categoryCol)
  const labels: string[] = []
  const series: SeriesInput[] = valueCols.map((name) => ({ name, values: [] as (number | null)[] }))
  const vis = valueCols.map((c) => columns.indexOf(c))

  for (const row of rows) {
    labels.push(ci >= 0 ? String(row[ci] ?? '') : '')
    vis.forEach((vi, si) => {
      const raw = vi >= 0 ? row[vi] : null
      if (raw === null || raw === undefined || raw === '') {
        series[si]!.values.push(null)
        return
      }
      const n = Number(String(raw).replace(/,/g, '').replace(/%/g, ''))
      series[si]!.values.push(Number.isFinite(n) ? n : null)
    })
  }
  return { labels, series }
}
