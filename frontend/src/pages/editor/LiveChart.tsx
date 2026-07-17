/**
 * 客户端即时 ECharts 预览组件。
 *
 * 不走服务端截图：直接用 `buildEchartsOption` 在浏览器内 init/setOption。
 * 场景：
 * - 「做组件」步骤右侧大预览
 * - 组装画布内 LiveComponent 的 Chart 节点
 *
 * 特性：
 * - ResizeObserver：父容器拖拽改尺寸时自动 chart.resize()
 * - 卸载时 dispose，避免内存泄漏
 * - 未绑分类/数值字段时显示占位提示
 */
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import { buildEchartsOption, type ChartStyle, type SeriesInput } from './chartOption'

type Props = {
  /** 分类轴标签（与 series.values 等长） */
  labels: string[]
  /** 一个或多个数值序列 */
  series: SeriesInput[]
  /** 图表样式（类型、图例、排序等） */
  style?: ChartStyle
  height?: number
  width?: string | number
}

/**
 * 即时客户端 ECharts 预览（无服务端 round-trip）。
 * labels/series/style 变化时全量 setOption(true) 并 resize。
 */
export function LiveChart({ labels, series, style, height = 360, width = '100%' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  // 数据或样式变化：初始化实例并刷新 option
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

  // 父容器尺寸变化时重排（组装画布拖拽改高宽）
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      chartRef.current?.resize()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 卸载时销毁 ECharts 实例
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
