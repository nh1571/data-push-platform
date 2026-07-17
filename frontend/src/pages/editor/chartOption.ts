/**
 * Build Apache ECharts options from bound data + style.
 * Same mental model as DataEase / Superset chart config (ECharts-based).
 */
import type { EChartsOption } from 'echarts'

export type ChartStyle = {
  chart_type?: string
  title?: string
  subtitle?: string
  theme?: string // used client-side for bg only; option colors below
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
}

export type SeriesInput = {
  name: string
  values: (number | null)[]
}

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

  const base: EChartsOption = {
    color: palette,
    backgroundColor: 'transparent',
    title: title
      ? {
          text: title,
          subtext: subtitle || undefined,
          left: 'center',
          top: 6,
          textStyle: { fontSize: 15, fontWeight: 600 },
          subtextStyle: { fontSize: 12, color: '#888' },
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
            fontSize: 11,
          },
          emphasis: {
            label: { show: true, fontSize: 13, fontWeight: 'bold' },
            itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.15)' },
          },
          data,
        },
      ],
    }
  }

  const isH = ct === 'hbar' || style.horizontal
  const categoryAxis = {
    type: 'category' as const,
    data: labels,
    axisLabel: {
      rotate: isH ? 0 : style.x_label_rotate ?? (labels.length > 8 ? 30 : 0),
      fontSize: 11,
    },
    axisTick: { alignWithLabel: true },
  }
  const valueAxis = {
    type: 'value' as const,
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
          fontSize: 10,
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
        fontSize: 10,
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

/** Extract labels + series from tabular preview rows */
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
