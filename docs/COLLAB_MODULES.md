# 三人协同：功能粗分

> 人少不拆太细。三条线并行，**按目录认领**，总线文件改前说一声。

---

## 流水线（心里有数即可）

```text
数据源/通道配置 → 内容工作台(模板) → 任务执行成图 → 投递钉钉
```

---

## 三人分工（推荐）

| 人 | 职责线 | 一句话 | 主要目录 |
|----|--------|--------|----------|
| **甲** | **内容工作台 + 成图** | 模板怎么配、预览/终片长什么样 | 见下「甲」 |
| **乙** | **通道 + 数据源** | 从哪取数、往哪发 | 见下「乙」 |
| **丙** | **任务执行 + 调度 + 运营页** | 何时跑、跑得怎样、配置管理 | 见下「丙」 |

平台/部署/登录（`config`、`scripts`、`auth`）谁顺手谁改，大改群里说一声。

---

### 甲 · 内容工作台 + 成图

**负责**：编辑器五步、画布、推送壳文案、本地预览、服务端 compile 成图。

| 区域 | 路径 |
|------|------|
| 前端工作台 | `frontend/src/pages/editor/*` |
| 后端 Studio | `backend/app/modules/studio/*` |
| 编辑 API | `backend/app/api/v1/editor.py` |
| 旧 design（少动） | `backend/app/modules/editor/*` |

**不做**（除非约定支援）：钉钉插件实现、Cron 调度内核。

**说明**：工作台和成图绑在同一人，避免「UI 一套字段、成图另一套」对不齐。

---

### 乙 · 通道 + 数据源

**负责**：连库插件、通道插件、对应配置页。

| 区域 | 路径 |
|------|------|
| 数据源插件 | `backend/app/plugins/datasource/*` |
| 通道插件 | `backend/app/plugins/channel/*` |
| API | `api/v1/data_sources.py`、`channels.py` |
| 前端 | `pages/data-sources/*`、`pages/channels/*` |
| 测试 | `tests/plugins/test_datasource_*`、`test_dingtalk*` |

**扩展方式**：新库/新通道 → **新文件 + 注册**，少改别人的 if-else。

**契约**：  
- 取数：`execute(config, sql, params) → 表数据`  
- 投递：`send(config, Message) → 结果`  
不解析 artboard 业务结构。

---

### 丙 · 任务执行 + 调度 + 运营

**负责**：推送任务、JobRun 管线、调度/触发、运行与任务列表 UI。

| 区域 | 路径 |
|------|------|
| 执行管线 | `backend/app/modules/execution/*` |
| 调度 | `backend/app/modules/scheduler/*`、`worker/*` |
| API | `push_jobs.py`、`job_runs.py`、`api_tokens.py` |
| 前端 | `pages/push-jobs/*`、`pages/job-runs/*`、`Dashboard.tsx`、`Settings.tsx`（Token 等） |

**契约**：串流程 = 参数 → 调数据源 → 调成图（甲的 compile）→ 调通道（乙的 send）。  
改管线时知会甲、乙。

---

## 三人之间怎么接

```text
乙 数据源 ──表数据──► 甲 成图 ──Message──► 乙 通道
                ▲                │
                │                │
            丙 执行管线 ◄────────┘
                │
            丙 调度/手动触发
```

| 接口 | 谁定义/维护 |
|------|-------------|
| artboard 模板 JSON | **甲**（乙丙只存/传，不拆内部） |
| QueryResult 表结构 | 插件 SPI，乙实现 |
| Message parts | **甲** 产出；**乙** 只发送 |
| JobRun 状态/日志 | **丙** |

---

## 改前要打招呼的文件（总线）

| 文件 | 原因 |
|------|------|
| `execution/pipeline.py` | 丙主责，甲乙会间接受影响 |
| `studio/compile.py` | 甲主责 |
| `plugins/base.py` | 插件接口 |
| `frontend/src/api/types.ts` | 类型共用 |
| DB models + alembic | 表结构 |

---

## 分支建议

```text
feature/studio-xxx     # 甲
feature/channel-xxx    # 乙
feature/runtime-xxx    # 丙
```

小步 PR，主线保持 `./scripts/dev.sh` 能跑。

---

## 认领（填名字）

| 线 | Owner |
|----|--------|
| 甲 工作台+成图 | |
| 乙 通道+数据源 | |
| 丙 执行+调度+运营页 | |

---

## 和「拆很细」的区别

- 不做 M1～M9 九宫格日常认领。  
- 工作台与成图 **不拆给两个人**（都归甲）。  
- 三人三条线，冲突面可控。  
