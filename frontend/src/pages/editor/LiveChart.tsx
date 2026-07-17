import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import { buildEchartsOption, type ChartStyle, type SeriesInput } from './chartOption'

type Props = {
  labels: string[]
  series: SeriesInput[]
  style?: ChartStyle
  height?: number
  width?: string | number
}

/** Instant client-side ECharts preview (no server round-trip). */
export function LiveChart({ labels, series, style, height = 360, width = '100%' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    if (!chartRef.current) {
      chartRef.current = echarts.init(ref.current, undefined, { renderer: 'canvas' })
    }
    const chart = chartRef.current
    const option: EChartsOption = buildEchartsOption(labels, series, style || {})
    chart.setOption(option, true)
    requestAnimationFrame(() => chart.resize())
  }, [labels, series, style, height])

  // Reflow when parent box is resized (compose canvas drag-resize)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      chartRef.current?.resize()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  if (!labels.length || !series.length) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          background: '#fafafa',
          borderRadius: 8,
        }}
      >
        请选择分类字段与数值字段
      </div>
    )
  }

  return (
    <div
      ref={ref}
      style={{
        width,
        height,
        minHeight: typeof height === 'number' ? height : undefined,
      }}
    />
  )
}
