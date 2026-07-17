---
title: 阶段1 - 推送编辑工作台与钉钉多 Mode
date: 2026-07-16
tags:
  - 项目
  - 阶段1
  - 推送编辑
status: 初版已交付可体验
---

# 阶段 1：通往可用版的主路径

> 依据：[[07-体验反馈与缺口]]。执行决策由 AI 按推荐默认拍板（用户：按你的计划来）。

## 1. 本阶段目标

把产品从「配置管道」升级为：

1. **推送编辑工作台**（主路径）：SQL → 见数据 → 编效果 → 预览 → 试推/保存  
2. **钉钉多发送方式**：不只 Webhook  

**不做（阶段 2+）：** 完整可视化图表拖拽设计器、企微、细 RBAC、审批流。

## 2. 已拍板决策

| ID | 决策 |
|----|------|
| S1-1 | 编辑器一期 = **方案 A**：结果表预览 + Markdown 模板（可插入列）+ 消息预览；图/卡/附件仍可选但配置保持简单 |
| S1-2 | 钉钉 Mode：保留 **webhook_robot**；新增 **work_notice**（工作通知） |
| S1-3 | OpenAPI 机器人群发 = 阶段 1.5 / 2 |
| S1-4 | 导航一级增加 **推送编辑**；原「推送任务」改为已保存方案列表入口 |
| S1-5 | 元库继续 MySQL |

## 3. 通道模型

```text
type 存储格式: "{provider}.{mode}"
例: dingtalk.webhook_robot | dingtalk.work_notice
```

| Mode | 配置要点 | 发送 |
|------|----------|------|
| `dingtalk.webhook_robot` | webhook_url, secret? | POST webhook |
| `dingtalk.work_notice` | app_key, app_secret, agent_id, userid_list 或 dept_id_list | 获取 access_token + asyncsend 工作通知 |

## 4. 编辑工作台流程

```text
打开推送编辑（新建或从任务加载）
  ├─ 数据源 + SQL
  ├─ [运行取数] → DataPreview 表格
  ├─ 效果设计
  │    ├─ Markdown 模板（{{列名}} / {{row.列名}}）
  │    └─ 可选：附加 image_table / card / file_export（简单开关）
  ├─ [预览消息] → 渲染后的文本/部件列表
  ├─ 绑定通道（含 mode）
  ├─ [试推]
  └─ [保存为任务] → PushJob
```

## 5. API 增量

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/editor/query-preview` | body: data_source_id, sql, params → columns+rows（限行） |
| POST | `/api/v1/editor/message-preview` | body: data_source_id, sql, params, design → Message 预览 |
| POST | `/api/v1/editor/test-push` | 预览 + 指定 channel_ids 试推（可写 JobRun trigger=manual_test） |
| POST | `/api/v1/editor/save-job` | 保存/更新 PushJob |

`design` 结构示例：

```json
{
  "markdown_template": "## 日报\n{{#each rows}}...{{/each}}",
  "parts": [
    {"type": "text_md", "config": {"template": "..."}},
    {"type": "image_table", "config": {"title": "明细"}}
  ]
}
```

一期模板引擎：简单实现  
- `{{column}}` 取第一行该列  
- `{{rows}}` 渲染为 markdown 表（若模板含 `{{table}}`）  
- 或直接：用户写固定文案 + 自动附带 markdown 表开关 `include_table: true`

更稳妥一期：

```json
{
  "title": "可选标题",
  "header_text": "前面的说明，支持 {{col}} 取首行",
  "include_markdown_table": true,
  "footer_text": "结尾",
  "extra_parts": ["image_table"]
}
```

## 6. 前端页面

| 路由 | 说明 |
|------|------|
| `/editor` `/editor/:jobId` | 全屏工作台（主路径） |
| `/push-jobs` | 列表，点「编辑」进工作台 |
| `/channels` | type 改为 provider.mode 级联选择 |

工作台布局：左 SQL+运行；中 数据表；右 效果+预览；底 通道+试推+保存。

## 7. 完成标准（阶段 1 可体验）

- [x] 无已有任务也能从「推送编辑」新建完整方案  
- [x] 运行 SQL 看见表格  
- [x] 改 header/footer/是否附表，预览变化  
- [x] 通道可选 Webhook 或工作通知  
- [x] 试推 API + JobRun（editor_test）  
- [x] 保存后任务列表可见，可再打开编辑  

## 8. 代码交付

| 提交 | 说明 |
|------|------|
| `98f024b` | editor API + dingtalk.webhook_robot / work_notice |
| `d5fdb00` | 推送编辑工作台 UI + 通道 mode 表单 |

体验入口：侧栏 **推送编辑** → `http://localhost:5173/editor`

## 9. 修订

- 2026-07-16：立项并开始执行  
- 2026-07-16：阶段 1 初版代码交付，待用户再体验
