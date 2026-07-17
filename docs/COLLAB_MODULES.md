# 功能拆分与协同开发边界

> 目标：多人并行开发时，**按模块认领**，尽量少改同一文件。  
> 原则：**插件可加新文件；业务模块认领目录；「总线」文件需预约。**

---

## 0. 系统一张图（业务流水线）

```text
┌─────────────┐   ┌──────────────┐   ┌────────────────┐   ┌─────────────┐
│ ① 数据源     │ → │ ② 内容工作台  │ → │ ③ 推送任务/执行 │ → │ ④ 通道投递   │
│ 连库/SQL插件 │   │ 模板/画布/文案 │   │ JobRun 管线     │   │ 钉钉等插件   │
└─────────────┘   └──────────────┘   └────────────────┘   └─────────────┘
        ↑                  ↑                  ↑                   ↑
   配置管理 UI        编辑器 UI           任务/运行 UI         通道配置 UI
```

另有横切能力：**⑤ 身份权限**、**⑥ 调度触发**、**⑦ 平台基建**（配置档、本地启动、存储）。

---

## 1. 推荐协作模块（可直接认领）

| 模块 ID | 名称 | 一句话职责 | 适合人数 | 干扰度 |
|---------|------|------------|----------|--------|
| **M1** | 数据源 | 接业务库、测连、执行 SQL | 1 | 低（加插件几乎不撞车） |
| **M2** | 内容工作台（Studio） | 模板：数据/组件/画布/推送壳/预览 | 1～2 | 中高（前端有大文件） |
| **M3** | 渲染与成图 | 模板→HTML/图/Message | 1 | 中 |
| **M4** | 通道投递 | 钉钉等把 Message 发出去 | 1 | 低（加插件） |
| **M5** | 推送任务与执行 | PushJob、JobRun、pipeline | 1 | 中 |
| **M6** | 调度与外部触发 | Cron、HTTP/API Token 触发 | 1 | 低～中 |
| **M7** | 配置管理台 UI | 数据源/通道/任务/运行列表页 | 1 | 低（按 pages 分） |
| **M8** | 身份与安全 | 登录 JWT、API Token、加密 | 0.5～1 | 低（少动） |
| **M9** | 平台与部署 | local/prod、脚本、compose、文档 | 0.5～1 | 低 |

**3 人示例分工**

| 人 | 主责 | 可兼 |
|----|------|------|
| A | M2 内容工作台 | M3 成图联调 |
| B | M4 通道 + M1 数据源插件 | M7 通道/数据源页面 |
| C | M5 执行 + M6 调度 | M9 部署 |

**5 人示例**：M1 / M2 / M3+M5 / M4 / M6+M7+M9 各一；M8 谁改谁顺手维护。

---

## 2. 各模块「拥有」的目录（改这里一般不吵）

### M1 数据源

| 层 | 路径 |
|----|------|
| 插件 | `backend/app/plugins/datasource/*` |
| API | `backend/app/api/v1/data_sources.py` |
| 模型 | `backend/app/db/models/data_source.py` |
| 前端 | `frontend/src/pages/data-sources/*` |
| 测试 | `backend/tests/plugins/test_datasource_*.py`、`tests/api/test_data_sources.py` |

**加新库类型**：新建 `plugins/datasource/xxx.py` + 在 `__init__.py` 注册 + 前端 Form 类型选项。  
**少动**：`pipeline.py`、`EditorPage.tsx`。

---

### M2 内容工作台（产品主战场）

| 层 | 路径 |
|----|------|
| 前端核心 | `frontend/src/pages/editor/*` |
| 后端 Studio | `backend/app/modules/studio/*` |
| API | `backend/app/api/v1/editor.py`（studio compile/save/test-push） |
| 兼容旧设计 | `backend/app/modules/editor/*`（旧 design，尽量只修不扩） |

**内部再拆（2 人时强烈建议）**

| 子模块 | 人 | 文件偏好 |
|--------|----|----------|
| M2a 数据步 + 参数 | A | `EditorPage` 数据区、`sql_params.py`、dataset UI |
| M2b 做组件 + 图表 | B | `LiveChart.tsx`、`chartOption.ts`、`LiveComponent.tsx`、`charts.py` |
| M2c 组装画布 | A/B | `ComposeCanvas.tsx` |
| M2d 组装推送壳 | A/B | `RichTextEditor.tsx`、compose 字段、`html_md.py` |

⚠️ **冲突热点**：`EditorPage.tsx`、`studioUtils.ts`、`types.ts`、`compile.py`  
约定：大改前在群里说一声；能拆组件就新建文件，少堆进 `EditorPage`。

---

### M3 渲染与成图

| 层 | 路径 |
|----|------|
| 编译 | `backend/app/modules/studio/compile.py`、`charts.py`、`themes.py`、`html_md.py` |
| 旧渲染插件 | `backend/app/plugins/renderer/*` |
| 存储 | `backend/app/storage/*` |
| 依赖 | Playwright / 可选 wkhtmltoimage |

**接口契约（给别人用的）**：输入 artboard + QueryResult → 输出 `Message`（text/image parts）。  
M4 只消费 `Message`，不要在通道里拼业务 SQL。

---

### M4 通道投递

| 层 | 路径 |
|----|------|
| 插件 | `backend/app/plugins/channel/*` |
| API | `backend/app/api/v1/channels.py` |
| 模型 | `backend/app/db/models/channel.py` |
| 前端 | `frontend/src/pages/channels/*` |
| 测试 | `backend/tests/plugins/test_dingtalk*.py` |

**加新通道**：新文件 + `channel/__init__.py` 注册 + Form 类型。  
**契约**：实现 `send(config, message) -> DeliveryResult`，不要改 artboard 结构。

---

### M5 推送任务与执行

| 层 | 路径 |
|----|------|
| 管线 | `backend/app/modules/execution/pipeline.py` |
| API | `backend/app/api/v1/push_jobs.py`、`job_runs.py` |
| 模型 | `push_job.py`、`job_run.py`、`job_run_log.py`、`delivery.py` |
| Worker | `backend/app/worker/*` |
| 前端 | `frontend/src/pages/push-jobs/*`、`job-runs/*` |

**契约**：JobRun = 解析参数 → 取数 → `render_message` / artboard → 各 channel send。  
改 pipeline 时通知 M2/M4，因是「总线」。

---

### M6 调度与外部触发

| 层 | 路径 |
|----|------|
| Cron | `backend/app/modules/scheduler/*`、`scheduler_main.py` |
| 机器触发 | `api_tokens` + push_jobs 上 HTTP 触发逻辑 |
| API | `api_tokens.py` 部分、`push_jobs` 触发入口 |
| 前端 | `Settings.tsx`（Token）、任务上的 cron 字段 |

---

### M7 配置管理台 UI（偏运营页）

| 页面 | 路径 |
|------|------|
| 看板 | `pages/Dashboard.tsx` |
| 数据源 | `pages/data-sources/*` |
| 通道 | `pages/channels/*` |
| 任务 | `pages/push-jobs/*` |
| 运行 | `pages/job-runs/*` |
| 设置 | `pages/Settings.tsx` |
| 布局/登录 | `layouts/`、`Login.tsx`、`auth/` |

与 M1/M4/M5 **前后端可一人全栈一个资源**（例如「我包通道 FE+BE」）。

---

### M8 身份与安全

| 路径 |
|------|
| `modules/identity/*`、`api/v1/auth.py` |
| `common/crypto.py`、`deps.py` |
| `frontend/src/auth/*` |

改动面小；动 Fernet/JWT 要全员知会（影响已存加密配置）。

---

### M9 平台与部署

| 路径 |
|------|
| `app/config.py`、`local_bootstrap.py`、`db/session.py` |
| `scripts/dev.sh`、`docker-compose.yml`、`.env.example` |
| `docs/DEPLOYMENT.md`、`README.md`、`docs/DEVELOPMENT_HANDOFF.md` |

---

## 3. 「总线 / 共享」文件（改前要打招呼）

这些文件连接多模块，**禁止无人知晓的大改**：

| 文件 | 谁依赖 |
|------|--------|
| `backend/app/plugins/base.py` | 所有插件 SPI |
| `backend/app/modules/execution/pipeline.py` | 执行全流程 |
| `backend/app/modules/studio/compile.py` | 成图 + Message |
| `frontend/src/api/types.ts` | 几乎所有前端 |
| `frontend/src/api/index.ts` / `client.ts` | API 封装 |
| `frontend/src/pages/editor/EditorPage.tsx` | 工作台整页 |
| `backend/app/db/models/*` + alembic | 表结构 |
| `backend/app/config.py` | 全进程配置 |

**表结构变更**：只允许一人出 migration；合并前全员 pull。

---

## 4. 扩展方式（最利于不干扰）

| 需求 | 推荐做法 | 避免 |
|------|----------|------|
| 新数据源 | 新 `plugins/datasource/xxx.py` | 改 mysql.py 塞 if-else 大杂烩 |
| 新钉钉能力/新 IM | 新 `plugins/channel/xxx.py` | 在 pipeline 写死钉钉 |
| 新图表类型 | `chartOption.ts` + `charts.py` + 组件枚举 | 复制整页 Editor |
| 新工作台步骤 | 新组件文件 + EditorPage 薄接入 | 继续把 EditorPage 堆到 3k 行 |
| 新运行日志字段 | 先谈模型 owner，再 migration | 每人直接改 job_run 模型 |

---

## 5. 接口契约（模块之间只靠这些说话）

```text
DataSourcePlugin.execute(config, sql, params) → QueryResult

Studio artboard (JSON 模板)
  + data_ctx: dict[dataset_id, QueryResult]
  → compile / artboard_to_message
  → Message { parts: text | image | … }

ChannelPlugin.send(config, message) → DeliveryResult

JobRun 编排：params → query → message → send[]
```

前端工作台保存的是 **模板（artboard）**，不是某次 PNG；执行侧每次重算。  
（见 HANDOFF「模板 ≠ 静态成品」）

---

## 6. 分支命名建议

```text
feature/m1-postgres-datasource
feature/m2-compose-guides
feature/m4-dingtalk-oto-polish
feature/m5-run-params-ui
fix/m3-playwright-timeout
docs/m9-collab-guide
```

合并目标：稳定主线（`main` 或约定分支）；长功能分支尽量 ≤ 1～2 周。

---

## 7. 当前优先级与「可并行」示意（产品视角）

| 优先级 | 模块 | 说明 |
|--------|------|------|
| P0 | M2 | 工作台体验仍是主战场 |
| P0 | M3 | 成图稳定、与画布一致 |
| P1 | M4 | 钉钉真机模式打磨 |
| P1 | M5 | 运行日志、参数覆盖 |
| P2 | M1 | 更多数据源 |
| P2 | M6 | 调度与 DS HTTP |
| P2 | M9 | 协作文档/CI |

**天然并行对**：M1∥M4∥M6∥M7 页面；M2 与 M4 在「Message 契约稳定」前提下可并行。

---

## 8. 认领表（复制到群里填）

| 模块 | Owner | 备份 | 进行中任务 |
|------|-------|------|------------|
| M1 数据源 | | | |
| M2 工作台 | | | |
| M3 成图 | | | |
| M4 通道 | | | |
| M5 执行 | | | |
| M6 调度 | | | |
| M7 运营 UI | | | |
| M8 安全 | | | |
| M9 平台 | | | |

---

## 9. 一句话纪律

1. **认领模块目录**，扩展优先**新文件**。  
2. **总线文件**改前同步。  
3. **小 PR、短分支**，主线保持 `./scripts/dev.sh` 可跑。  
4. **密钥与 data/** 不进 Git。  
