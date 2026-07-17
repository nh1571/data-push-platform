# 数据推送中台 · 开发进度与交接手册

> **给下一个 Agent / 下一次会话的第一份必读文档。**  
> 读完本文即可在不依赖原对话上下文的情况下继续开发。  
> 最后更新：2026-07-16

---

## 0. 协作约定（用户授权 · 2026-07-16）

| 角色 | 职责 |
|------|------|
| **架构/路径把控（Agent）** | 按整体架构路径推进开发；对用户中途建议**可采纳或否定**；否定时说明理由；**必须更新**本文件 §6/§7 与相关 Obsidian 笔记 |
| **用户** | 提业务建议、验收体验、提供真环境凭证；不要求每次亲自拆任务 |

**默认开发主线（不可因旁支冲掉）：**

```text
内容生产核心：组件画板（数据集 + 组件库 + 固定宽画板 + 编译成图/文案）
  → 预览闭环（与 compile 同一路径）
  → 搭配通道试推（OpenAPI 单/群等）
  → 数据源补齐 / 模板库 / 组件扩展
  → 调度与运维闭环
```

> 画布 = **推送宽度报表画板**（帆软决策报表简化版），**不是** Figma 无限画布。见 Obsidian `17`。

用户建议若与主线冲突：记入「已否定/延后」清单，不阻塞主线。

---

## 0.1 30 秒速览

| 项 | 内容 |
|----|------|
| **产品** | 数据中心推送中台：SQL 取数 → 渲染消息 → 钉钉等多通道投递 |
| **仓库** | `/Users/hello/grok/data-push-platform` |
| **分支** | `feature/m0-scaffold`（尚未合并 main） |
| **最新提交** | 见 git log（含内容管线里程碑 + 内容优先 IA） |
| **当前阶段** | **可用骨架 + 内容工作台（内容优先）**；**非**生产完美版 |
| **元数据库** | **MySQL 8**（不是 PostgreSQL） |
| **业务取数** | 插件：Doris、MySQL |
| **设计记忆** | Obsidian：`/Users/hello/Documents/obsidian/notes/20_项目/企业数据推送中台/` |
| **测试** | 后端约 **125** 个 pytest 通过（以本机最近一次为准） |

**用户原话级目标（必须记住）：**

1. 消息与通道分离；通道是插件；数据源也是插件。  
2. 主路径是 **编辑数据效果再推送**，不是只填配置表单。  
3. 钉钉 **不止 Webhook**；要支持多种发送方式；要 **模板渲成好看图片再发**。  
4. 「推送任务」与「推送编辑」职责要分清（任务=管理，编辑=创作）。  
5. **旧思路终点是 Markdown 富文本再统一推送**；过程中用高自由度生图/排版，但旧系统设计导致流程很麻烦。  
6. **「数据获取 → 最终消息载体」是系统日常开发主战场**——必须 **简化操作 + 丰富样式**（见 Obsidian `13-内容生产管线-核心关注`）。内容生产 > 通道堆砌 > 调度花活。

---

## 1. 下次会话怎么无缝衔接

### 1.0 推荐：触发技能（任意 Agent）

仓库技能：**`continue-data-push-dev`**

| 位置 | 路径 |
|------|------|
| 项目内 | `.grok/skills/continue-data-push-dev/SKILL.md` |
| 用户级（Grok） | `~/.grok/skills/continue-data-push-dev/SKILL.md` |
| 用户级（agents） | `~/.agents/skills/continue-data-push-dev/SKILL.md` |

**触发方式：**

- 说：`继续开发推送中台` / `启动继续开发` / `接着做 data-push`
- 斜杠：`/continue-data-push-dev`（若环境支持）
- 或贴下面开场白（技能会强制先读本文件）

技能职责：

| 模式 | 触发 | 做什么 |
|------|------|--------|
| **START** | 继续/启动开发 | 读交接 → 查 git/环境 → 起 docker/API/前端 → 按 §6/§7 开发 |
| **STOP** | 停止开发/收工/下班 | 汇总今日 → **提交或 stash 代码** → **更新 §7** → `docker compose down`（不删卷）→ 停 8000/5173 → 报告明日入口 |

STOP **默认不用** `docker compose down -v`（避免清空 MySQL 数据）。

### 1.1 给任意 Agent 的开场白（复制即用）

```text
继续开发「数据推送中台」项目。请使用技能 continue-data-push-dev。
仓库：/Users/hello/grok/data-push-platform
分支：feature/m0-scaffold
请先完整阅读：
1) docs/DEVELOPMENT_HANDOFF.md（本文件）
2) docs/CONTINUE_CHECKLIST.md
3) Obsidian 笔记目录 20_项目/企业数据推送中台/ 中的 00 索引与 07/08/09/10
不要推翻已确认的架构原则；优先做「下一优先级」清单中的项。
```

### 1.2 启动顺序（本机体验）

```bash
cd /Users/hello/grok/data-push-platform

# 1) 元库 + Redis
docker compose up -d mysql redis

# 2) 后端
cd backend
export DATABASE_URL=mysql+pymysql://push:push@localhost:3306/push
export REDIS_URL=redis://localhost:6379/0
export SECRET_KEY=dev-secret-key
export TOKEN_FERNET_KEY="b2oli7D5BQ8tJcl6Rs4DmSAbdPxyIrMZ-NMGNHP0np0="
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=admin123
export EXECUTION_SYNC=true
export CORS_ORIGINS='["http://localhost:5173","http://127.0.0.1:5173"]'
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 3) 前端（另开终端）
cd frontend && npm run dev -- --host 0.0.0.0 --port 5173
```

| 入口 | URL / 账号 |
|------|------------|
| 管理台 | http://localhost:5173 |
| API | http://localhost:8000/docs |
| 账号 | `admin` / `admin123` |

### 1.3 验证是否正常

```bash
curl -s http://localhost:8000/health
# → {"status":"ok"}

cd backend && pytest -q
# → 应全部 passed
```

---

## 2. 产品要做成什么样（北极星）

```text
写 SQL → 看见数据表 → 用模板/画布编效果（含图标图片）
  → 预览成图或卡片 → 选钉钉「具体发送方式」→ 试推 / 定时 / DS 触发
  → 执行日志与重跑
```

**不是：** 只有配置 CRUD + 勾几个渲染类型的运维小工具。

### 2.1 已确认原则（勿随意推翻）

| 原则 | 说明 |
|------|------|
| Message ⊥ Channel | 内容生成与投递解耦 |
| 双插件化 | DataSource 插件 + Channel 插件（Renderer 也是插件） |
| 统一执行引擎 | 定时 / 手工 / DS HTTP / 编辑器试推 同一套 JobRun 流水线 |
| 调度混合 C | 自建 Cron + 提供 Run API 给 DolphinScheduler |
| 元库 MySQL | 系统配置与日志；业务数在 Doris/业务 MySQL |
| 一期权限 | 全管理员；RBAC 后置 |
| 重跑 | 新 JobRun；用**最新**任务配置 |
| skip_if_empty | PushJob 字段；无数据则 succeeded + 无投递 |

### 2.2 用户已指出的严重缺口（部分已改，部分未完）

详见 Obsidian `07`、`09`：

| 缺口 | 状态 |
|------|------|
| 通道只有钉钉大类 / 只有 Webhook | **部分改善**：已有 webhook / work_notice / openapi_group；UI 列出更多「即将支持」 |
| 无真正推送编辑 | **部分改善**：有 `/editor` 工作台、取数预览、设计字段、图片模板 API |
| 只要 markdown、不能成图 | **部分改善**：`templates.py` + image-preview；体验与模板精美度仍不够 |
| 任务新建直接跳编辑不合理 | **部分改善**：`ba8d336` 含 draft 任务弹窗 + 编辑要求 jobId；需人工再验 UI |

---

## 3. 开发进度总表

### 3.1 阶段划分

| 阶段 | 含义 | 状态 |
|------|------|------|
| **S0 需求与设计** | 调研、领域、架构、UI IA/视觉 | ✅ 文档在 Obsidian |
| **S0.5 工程骨架** | 仓库、MySQL、插件框架、CRUD、执行、调度、管理台 | ✅ 代码已落地 |
| **S1 编辑工作台 + 通道 Mode** | 编辑主路径、钉钉多 mode 初版 | ✅ 初版代码 |
| **S2 产品修正** | 任务/编辑拆分、成图模板、OpenAPI 发群 | ✅ 有提交；需验收与打磨 |
| **S3 真环境可用** | 公司 Doris/钉钉联调、稳定性、选人、限流 | ⬜ 未做 |
| **S4 增强** | 画布拖拽、企微、互动卡片、RBAC、审批 | ⬜ 未做 |

### 3.2 已实现能力清单（代码层）

#### 后端 `backend/app/`

| 模块 | 路径 | 能力 |
|------|------|------|
| API 入口 | `main.py`, `api/v1/*` | FastAPI、CORS、插件注册、路由 |
| 配置 | `config.py` | DB/Redis/密钥/同步执行开关 |
| 元库模型 | `db/models/*` | operators, api_tokens, data_sources, channels, push_jobs, job_runs, deliveries, job_run_logs |
| 鉴权 | `modules/identity/*`, `deps.py` | 登录 JWT、机器 Token、bootstrap admin |
| 配置服务 | `modules/config_svc/*` | 数据源/通道/任务 CRUD 与脱敏 |
| 执行引擎 | `modules/execution/pipeline.py` | 取数→渲染→投递；design 分支；状态机 |
| 调度 | `modules/scheduler/*` | Cron tick + last_schedule_slot |
| 编辑器 | `modules/editor/*` | design、templates 成图、query/message/image preview、test-push、save-job |
| 数据源插件 | `plugins/datasource/` | `mysql`, `doris`（`{{biz_date}}` 占位） |
| 渲染插件 | `plugins/renderer/` | text_md, image_table, card, file_export |
| 通道插件 | `plugins/channel/` | `dingtalk`/`dingtalk.webhook_robot`, `dingtalk.work_notice`, `dingtalk.openapi_group_robot` |
| 存储 | `storage/local.py` | 本地文件/图片 |
| Worker | `worker/*` | Celery（默认 EXECUTION_SYNC=true 可不启） |

#### 主要 API（前缀 `/api/v1`，除 login/health 需 Bearer）

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/auth/login` | 登录 |
| CRUD | `/data-sources`, `/channels`, `/push-jobs` | 资源管理 |
| POST | `/push-jobs/draft` | 新建草稿任务（名称+数据源） |
| POST | `/push-jobs/{id}/run` | 触发执行 |
| GET | `/job-runs`, `/job-runs/{id}` | 执行列表/详情 |
| POST | `/job-runs/{id}/rerun` | 重跑 |
| POST | `/editor/query-preview` | SQL 取数预览 |
| POST | `/editor/message-preview` | 消息预览 |
| POST | `/editor/image-preview` | 模板成图预览 |
| POST | `/editor/test-push` | 试推 |
| POST | `/editor/save-job` | 从编辑器保存任务 |
| CRUD | `/api-tokens` | DS 用机器 Token |

#### 前端 `frontend/src/`

| 页面 | 路由 | 说明 |
|------|------|------|
| 登录 | `/login` | JWT |
| 工作台 | `/` | 最近失败等 |
| **推送编辑** | `/editor`, `/editor/:jobId` | 主创作路径 |
| 数据源 | `/data-sources/*` | CRUD + 测连 |
| 通道 | `/channels/*` | 钉钉多 mode 表单 |
| 推送任务 | `/push-jobs` | 列表、新建弹窗、进编辑 |
| 执行记录 | `/job-runs/*` | 列表/详情/重跑 |
| 系统 | `/settings` | API Token |

技术栈：React 18 + Vite + TS + Ant Design 5。代理：`/api` → `:8000`。

### 3.3 Git 关键提交（由旧到新）

```
d6d9bc7 chore: scaffold backend health and compose
a97a32f chore: add settings, sqlalchemy session, alembic
fd9cdff feat: add core ORM models and migration
3ba5baf feat: plugin registry and secret encryption
d8a8936 feat: mysql and doris datasource plugins
ac0e81a feat: config CRUD APIs for sources channels jobs
70e7946 feat: admin login and machine api tokens
6363147 feat: execution pipeline with text render and dingtalk
bc7c4e4 feat: image card file renderers and local storage
c870b5c feat: builtin cron scheduler
ede34ed feat: job run list detail and rerun
135992b feat: admin pages for full config and runs
46ca5df docs: compose and README for delivery
03af944 chore: use MySQL as system metadata database
98f024b feat: editor APIs and dingtalk channel modes
d5fdb00 feat: push editor workspace and channel modes UI
ba8d336 feat: stage2 product fixes IA channels image templates
```

---

## 4. 领域与架构摘要

### 4.1 核心对象

```text
DataSource（插件类型 mysql|doris）
PushJob（SQL + render_spec{design,parts} + channel_ids + schedule）
JobRun（一次执行，含 snapshot、状态）
Delivery（对某通道的一次投递）
Channel（type = provider.mode，config 加密）
Message / MessagePart（text|image|card|file）
```

### 4.2 执行流

```text
Trigger → JobRun(pending)
  → running + config_snapshot
  → DataSource.execute(sql)
  → skip_if_empty?
  → design? build_message_from_design : renderers
  → Channel.send per channel
  → succeeded | failed | partial
```

### 4.3 render_spec 约定

```json
{
  "design": {
    "output_mode": "image|markdown",
    "template_id": "report_v1|alert_v1|kpi_v1",
    "header_text": "支持 {{列名}}",
    "footer_text": "",
    "include_markdown_table": true,
    "extra_parts": ["image_table"],
    "theme_color": "#1677ff",
    "title": "..."
  },
  "parts": [ {"type": "text_md", "config": {}} ]
}
```

Pipeline 优先走 `design` 生成 Message。

### 4.4 钉钉 Channel type

| type | 状态 |
|------|------|
| `dingtalk.webhook_robot` / `dingtalk` | ✅ |
| `dingtalk.work_notice` | ✅ |
| `dingtalk.openapi_group_robot` | ✅ 代码有，真环境需联调 |
| `dingtalk.openapi_oto_robot` 等 | UI「即将支持」 |

发**真图**应优先 OpenAPI 机器人，不要指望 Webhook。

---

## 5. 目录地图

```text
data-push-platform/
├── README.md                 # 用户向启动说明
├── docs/
│   ├── DEVELOPMENT_HANDOFF.md  # 本交接文档（Agent 必读）
│   └── CONTINUE_CHECKLIST.md   # 下次开工检查清单
├── docker-compose.yml        # mysql + redis + 可选 api/scheduler
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/v1/
│   │   ├── modules/{config_svc,execution,editor,scheduler,identity}
│   │   ├── plugins/{datasource,renderer,channel}
│   │   ├── db/models/
│   │   └── worker/
│   ├── alembic/
│   └── tests/
└── frontend/
    └── src/{pages,api,layouts,auth}
```

**Obsidian 设计文档（人类+Agent 记忆）：**

```text
/Users/hello/Documents/obsidian/notes/20_项目/企业数据推送中台/
  00-项目索引.md
  01-需求调研.md
  02-领域模型.md
  03-架构设计.md
  04-UI信息架构.md
  05-UI视觉设计.md
  06-实现计划.md
  07-体验反馈与缺口.md
  08-阶段1-编辑工作台与通道Mode.md
  09-产品分析修正-钉钉能力与信息架构.md
  10-开发进度与交接.md          # 与本文同步的摘要版
```

---

## 6. 下一优先级（按序做，勿发散）

来自 `09` 与用户反馈，建议严格按序：

### P0（下一迭代必须）

> 已对照存量系统 pythonProject4（见 Obsidian `12-存量系统参考与通道对照`）：旧系统用 **single / orggroupsend / webhook** × **simple|image|file|care…** 满足业务；新系统对齐能力、避开脚本化。  
> **交互理念（2026-07-16）**：内容优先，见 Obsidian `15-交互理念重设计`。

1. **信息架构（内容优先）✅ 初版**  
   - `/editor` 可空白开工：取数 → 设计 → 预览 → 试推 →「保存为任务」  
   - 侧栏：内容工作台 / 任务管理（运营调度，非创作门禁）  
   - 任务列表「新建」仍可快捷建 draft，但**不再**要求先建任务才能进编辑  

2. **钉钉 Mode 与旧工厂对齐**  
   - ✅ webhook ≈ masstexting  
   - ✅ openapi_group ≈ orggroupsend（真机联调）  
   - ✅ openapi_oto ≈ single（BatchSendOTO）— 真机联调待验收  
   - ✅ work_notice（完善选人）  
   - 消息形态：simple/image/file 与 Mode 正交；单发 >20 人要拆批（旧 split_userid）

3. **成图管线向旧业务对齐**  
   - ✅ HTML+CSS 成图引擎（playwright / wkhtml / pillow 回退）  
   - 短期：打磨模板与预览体验  
   - 发图走 OpenAPI 单/群，**不**依赖 Webhook  

### P1

4. **数据源插件：SQL Server**（旧系统 20+ 院区主力）  
5. processQueryKey 类追踪钩子（为已读/撤回/退订留扩展）  
6. Token 共享缓存（对齐旧 refresh_token 逻辑，避免每实例乱刷）  
7. 大结果集限流、任务列表最近运行状态  

### P2

8. 互动卡片 care/un、已读、撤回、退订回调  
9. 场景群 / 内部中转 API  
10. 画布拖拽、企微、RBAC  

### 明确不要做（除非用户改口）

- 换回 PostgreSQL 元库  
- 把业务 SQL 执行逻辑塞进 DS 而绕过中台  
- 为「好看」重写无关模块  
- 把 150 个旧脚本平移成 150 个硬编码任务（用编辑器+配置覆盖）  
- 复制旧系统明文密码进仓库  

---

## 7. 开发约定（多 Agent 协作）

1. **先读交接文档，再改代码。**  
2. **小步提交**，message 用 `feat:` / `fix:` / `docs:`。  
3. **改行为必补 pytest**；前端至少 `npm run build`。  
4. **密钥**：`config_enc` 走 Fernet；API 回显脱敏 `******`。  
5. **插件扩展**：新库/新通道只加 plugin + register，不改 pipeline 主流程。  
6. **设计决策**写回 Obsidian `00` 变更日志 + 本文件「最后更新」。  
7. **会话结束时**更新本节「当前阻塞 / 进行中」：

### 当前阻塞 / 进行中（每次会话结束请改这里）

```text
进行中：组装推送步骤（图外文案壳）待用户验
阻塞：无
上次完成：
  - 工作流 5 步：数据→做组件→组装画布→组装推送→预览推送
  - compose.text_before / text_after / title + include_component_md
  - 后端 artboard_to_message：图前文 → 画布图 → 图后文
  - 画布实时组件渲染（非截图缩放）
建议下一动作：走一遍组装推送写文案 + 试推；看钉钉图文顺序是否符合预期

环境：mysql+redis；API :8000 / 前端 :5173 应在跑
参考：Obsidian 20–21
```



---

## 8. 环境与依赖备忘

| 项 | 值 |
|----|----|
| Python | 3.12+（本机曾用 conda 3.13） |
| 元库 | `mysql+pymysql://push:push@localhost:3306/push` |
| Fernet 示例 | 见 compose / 上文 export（生产务必更换） |
| 默认管理员 | admin / admin123 |
| 前端 | Node + npm；Vite 5173 |

`docker compose` 服务名：**mysql**（不是 postgres）。旧 postgres 容器勿再用。

---

## 9. 风险与已知限制

| 风险 | 说明 |
|------|------|
| Webhook 发图 | 钉钉 Webhook 对 Image 支持差；成图后应引导用 OpenAPI |
| OpenAPI 真机 | 权限、robotCode、openConversationId 需企业配置 |
| 模板美观度 | Pillow 模板是「能用」级别，非设计稿级 |
| 多 Agent 冲突 | 同一分支并行改易冲突；应用 worktree 或串行 |
| 未合 main | 长期在 feature 分支，注意备份 |

---

## 10. 文档维护规则

| 何时 | 做什么 |
|------|--------|
| 完成一个里程碑 | 更新 §3 进度表 + §7 进行中 |
| 改架构原则 | 更新 §2 + Obsidian 03/02 |
| 改启动方式 | 更新 §1.2 + 根 README |
| 用户新反馈 | 新建 `07` 类笔记或追加 `09`，并改下一优先级 |

**仓库内权威交接文件路径：**  
`docs/DEVELOPMENT_HANDOFF.md`  

**人类可读进度摘要：**  
Obsidian `10-开发进度与交接.md`（与本文同步）
