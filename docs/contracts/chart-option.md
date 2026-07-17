# 图表 Option 契约（前后端对齐）

> **P0**：前端 `chartOption.ts` 与后端 `charts.py` 必须遵守同一 props → option 语义。  
> 改任一侧字号/排序/图例时，请同步另一侧，并跑 `pytest tests/modules/test_studio_charts.py`。

## 组件 props 键（存 StudioNode.props）

| 键 | 含义 | 默认 |
|----|------|------|
| `chart_type` | bar / line / area / hbar / pie | bar |
| `title` / `subtitle` | 标题 | — |
| `title_font_size` | 标题字号 | 15 |
| `chart_label_size` / `label_font_size` | 数据标签字号 | 10 |
| `axis_font_size` | 坐标轴字号 | 11 |
| `legend_font_size` | 图例字号 | ≈axis |
| `show_label` / `show_legend` / `show_grid` | 显示开关 | true/false/true |
| `smooth` / `stack` / `donut` / `rose` | 图型细节 | — |
| `sort` / `top_n` | 排序截断 | none |
| `x_label_rotate` | 类目轴旋转 | 0 或自动 30 |
| `bar_border_radius` / `bar_max_width` | 柱样式 | 4 / 48 |
| `line_width` / `area_opacity` | 线/面积 | 2.5 / 0.28 |
| `color_palette` | 色板数组 | DEFAULT_PALETTE |
| `x_axis_name` / `y_axis_name` | 轴名称 | — |
| `compose_w` / `compose_h` | 成图像素宽高（组装画布） | 680×360 |
| `value_series` | 后端多系列 `[{name,values}]` | — |

## 数据绑定（StudioNode.binding）

| 键 | 含义 |
|----|------|
| `dataset_id` | 数据集 id |
| `category_column` | 类目列 |
| `value_column` / `value_columns` | 数值列 |

## 默认色板（前后端一致）

```
#5470c6 #91cc75 #fac858 #ee6666 #73c0de #3ba272 #fc8452 #9a60b4 #ea7ccc
```

## 成图资源

- 优先：`backend/app/static/echarts.min.js`（离线）
- 其次：仓库 `frontend/node_modules/echarts/dist/echarts.min.js`
- 最后：CDN（仅兜底，错误信息会提示）
