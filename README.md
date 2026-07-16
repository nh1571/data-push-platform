# 数据推送中台 / data-push-platform

面向数据中心与业务运营的**数据推送中台**：配置数据源 → 写 SQL / 渲染模板 → 选择钉钉等渠道 → 手动 / 定时 / HTTP（数仓调度）触发推送，并完整记录运行与投递结果。

Data push middleware for configuring sources, SQL/templates, delivery channels (e.g. DingTalk), and triggers (manual / cron / HTTP for DS orchestrators), with full job-run observability.

> **多 Agent / 跨会话继续开发（必读）**  
> 1. [`docs/DEVELOPMENT_HANDOFF.md`](docs/DEVELOPMENT_HANDOFF.md) — 进度、架构、下一优先级、开场白  
> 2. [`docs/CONTINUE_CHECKLIST.md`](docs/CONTINUE_CHECKLIST.md) — 下次开工 5 分钟清单  
> 3. Obsidian：`20_项目/企业数据推送中台/`（尤其 `00` 索引与 `10-开发进度与交接`）

---

## 项目简介

| 能力 | 说明 |
|------|------|
| 数据源 | MySQL / Doris（MySQL 协议），配置加密存储 |
| 渲染 | 文本 Markdown、表格图片、卡片、文件导出（xlsx/csv） |
| 渠道 | 钉钉机器人 Webhook（text / markdown / actionCard） |
| 触发 | 控制台手动、Cron 调度、机器 API Token HTTP 触发（对接 DS） |
| 执行 | 默认同进程同步执行；可选 Celery + Redis 异步 Worker |
| 运维 | JobRun 状态、分步日志、按渠道 Delivery、支持 Rerun |

默认管理员：**`admin` / `admin123`**（仅首次启动且 `operators` 表为空时 bootstrap）。

---

## 架构要点

```
┌─────────────┐     JWT / API Token      ┌──────────────────┐
│  Frontend   │ ───────────────────────► │  FastAPI (api)   │
│  Vite+React │   (dev: proxy /api)      │  /api/v1/*       │
└─────────────┘                          └────────┬─────────┘
                                                  │
         ┌────────────────────────────────────────┼────────────────────┐
         │                                        │                    │
         ▼                                        ▼                    ▼
  ┌────────────┐                         ┌──────────────┐      ┌─────────────┐
  │  MySQL     │◄── config / runs ───────│  Scheduler   │      │ Redis       │
  │  (meta)    │                         │  cron tick   │      │ (Celery)    │
  └────────────┘                         └──────┬───────┘      └──────▲──────┘
                                                │                     │
                                                │   EXECUTION_SYNC    │
                                                │   false ───────────►│ Worker
                                                ▼                     │
                                         Execution pipeline           │
                                         query → render → send ◄──────┘
```

- **配置层**：DataSource / Channel / PushJob / ApiToken，密钥字段 Fernet 加密（`TOKEN_FERNET_KEY`）。
- **执行管线**：创建 JobRun → 快照任务定义 → 数据源执行 SQL（`{{biz_date}}` 等占位）→ Renderer → 各 Channel 投递 → 写 Delivery / Log。
- **`EXECUTION_SYNC=true`（默认）**：API / Scheduler 进程内直接跑管线，适合本地与小流量。
- **`EXECUTION_SYNC=false`**：投递 Celery 任务，需启动 `worker` 服务。

---

## 快速启动（Docker Compose）

### 前置

- Docker & Docker Compose
- （可选）Node 18+ 用于前端本地开发

### 生成 Fernet 密钥（生产必做）

`TOKEN_FERNET_KEY` 必须是 **Fernet** 密钥（url-safe base64 编码的 32 字节）：

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

将输出写入环境变量或 `docker-compose.yml` / `.env` 的 `TOKEN_FERNET_KEY`。  
**更换密钥后无法解密旧配置**，请妥善保管并与备份策略一致。

Compose 中已内置**仅供本地演示**的密钥；上线前务必替换 `SECRET_KEY` 与 `TOKEN_FERNET_KEY`，并修改 `ADMIN_PASSWORD`。

### 一键启动后端栈

默认服务：`mysql` + `redis` + `api` + `scheduler`（`EXECUTION_SYNC=true`，无需 worker）。

```bash
# 在仓库根目录
docker compose up -d --build

# 健康检查
curl http://localhost:8000/health
# {"status":"ok"}

# 查看日志
docker compose logs -f api scheduler
```

API 首次启动会执行 `alembic upgrade head` 并 bootstrap 管理员。

| 服务 | 端口 | 说明 |
|------|------|------|
| api | 8000 | FastAPI + OpenAPI `/docs` |
| mysql | 3306 | 用户/库/密码均为 `push`（元数据库） |
| redis | 6379 | Celery broker（同步模式可闲置） |
| scheduler | — | 约每 20s tick 一次 Cron 任务 |

### 可选：异步 Worker

```bash
# 启用 worker profile；生产环境请同时把 api/scheduler 的 EXECUTION_SYNC 设为 false
docker compose --profile worker up -d --build
```

### 前端（推荐本地 dev）

Compose **不默认构建前端**。本地：

```bash
cd frontend
npm install
npm run dev
# 浏览器打开 http://localhost:5173
# Vite 已将 /api 代理到 http://localhost:8000
```

登录：`admin` / `admin123`。

### 环境变量一览

| 变量 | 含义 | 默认（compose） |
|------|------|-----------------|
| `DATABASE_URL` | SQLAlchemy URL | `mysql+pymysql://push:push@mysql:3306/push` |
| `REDIS_URL` | Redis / Celery | `redis://redis:6379/0` |
| `SECRET_KEY` | JWT 签名 | `change-me-in-production` |
| `TOKEN_FERNET_KEY` | 配置加密 Fernet 密钥 | 见 compose 内演示值 |
| `ADMIN_USERNAME` | 初始管理员 | `admin` |
| `ADMIN_PASSWORD` | 初始密码 | `admin123` |
| `EXECUTION_SYNC` | `true` 同步执行 / `false` Celery | `true` |
| `STORAGE_ROOT` | 图片/文件导出目录 | `/app/storage` |
| `CORS_ORIGINS` | CORS 允许源 JSON 列表 | localhost 5173/3000 |

也可复制根目录 `.env.example` 为 `backend/.env` 做本地非 Docker 开发。

---

## 本地开发

### 仅基础设施

```bash
docker compose up -d mysql redis
```

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# 配置环境（可复制 ../.env.example → .env）
export DATABASE_URL=mysql+pymysql://push:push@localhost:3306/push
export REDIS_URL=redis://localhost:6379/0
export TOKEN_FERNET_KEY="$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
export SECRET_KEY=dev-secret
export EXECUTION_SYNC=true

alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 另开终端：定时调度（可选）
python -m app.modules.scheduler

# 测试
pytest -q
```

异步模式时另启：

```bash
export EXECUTION_SYNC=false
celery -A app.worker.celery_app.celery_app worker --loglevel=info
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## HTTP 触发示例（数仓 / DS 调度）

机器调用使用 **API Token**（控制台「设置 / API Tokens」创建，明文仅显示一次）。  
鉴权：`Authorization: Bearer <token>`（与操作员 JWT 相同 Header）。

```bash
# 1) 管理员登录拿 JWT（或使用已创建的 API Token）
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 2) 创建机器 Token（name 自定）
curl -s -X POST http://localhost:8000/api/v1/api-tokens \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"ds-scheduler"}'
# 响应中的 token 字段请保存为 DS_TOKEN（仅创建时返回一次）

# 3) DS / 调度系统触发推送任务（将 JOB_ID 换成实际 PushJob UUID）
curl -s -X POST "http://localhost:8000/api/v1/push-jobs/${JOB_ID}/run" \
  -H "Authorization: Bearer ${DS_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{
    "params": {"biz_date": "2026-07-15"},
    "trigger_type": "api"
  }'
```

响应为 `JobRun`（`EXECUTION_SYNC=true` 时通常已是终态 `success` / `failed` / `skipped`）。

查询运行：

```bash
curl -s "http://localhost:8000/api/v1/job-runs?push_job_id=${JOB_ID}" \
  -H "Authorization: Bearer ${DS_TOKEN}"
```

---

## SQL 参数 `{{biz_date}}`

PushJob 的 `query_sql` 支持 `{{param_name}}` 占位符，由运行时的 `params` 字典做字符串替换：

```sql
SELECT region, gmv
FROM ads_daily_gmv
WHERE dt = '{{biz_date}}'
  AND region = '{{region}}'
```

触发示例：

```json
{
  "params": {
    "biz_date": "2026-07-15",
    "region": "cn"
  },
  "trigger_type": "api"
}
```

说明：

- 仅替换 **params 中存在的键**；未提供的 `{{x}}` 保持原样。
- 值为简单 `str(...)` 拼接，**不是**预编译绑定；请只信任调度侧传入的受控参数，并在 SQL 侧做好规范。
- 常见键：`biz_date`（业务分区日）、自定义维度键等。

---

## 钉钉 Webhook 限制

钉钉**自定义机器人 Webhook** 主要支持 text / markdown / link / actionCard / feedCard 等 JSON 消息，**不能可靠地上传二进制附件或原图文件**。

本平台行为：

| 渲染产物 | 钉钉投递方式 |
|----------|----------------|
| text / markdown | markdown 或 text 消息体 |
| 单卡片 card | actionCard（否则退回 markdown） |
| **file / image** | 将**本地路径或 URL 以文本**追加到消息（如「下载路径: …」「图片路径: …」），**不上传文件本身** |

若需群内可点开的文件，请将 `STORAGE_ROOT` 暴露为可访问的 HTTP/OSS 地址，并在渲染结果中带上公网 URL；或改用支持媒体的渠道插件。

Webhook 配置字段：`webhook_url` **或** `access_token`（组装官方 robot URL）。

---

## A–F 验收清单

| # | 场景 | 验收标准 |
|---|------|----------|
| **A** | 登录与权限 | 使用 `admin`/`admin123` 登录控制台；未登录访问业务 API 返回 401；可创建/吊销 API Token |
| **B** | 数据源 | 新增 MySQL/Doris 数据源，密码不明文回显；「测试连接」可执行；错误配置有明确失败信息 |
| **C** | 渠道 | 配置钉钉 Webhook；校验通过；测试/真实推送能收到 text 或 markdown |
| **D** | 推送任务 | 创建 PushJob：选数据源、SQL（含 `{{biz_date}}`）、渲染类型、渠道；可启用/禁用、配置 Cron |
| **E** | 触发与运行 | 控制台手动运行成功；HTTP + API Token + `params.biz_date` 触发成功；JobRun 详情有日志与 Delivery；支持 Rerun |
| **F** | 调度与限制 | `schedule_enabled` + Cron 在 scheduler 进程下到点产生 `trigger_type=schedule` 的运行；文件/图片推送钉钉为路径文本而非二进制；`EXECUTION_SYNC` 开关行为符合预期 |

最小冒烟路径：**B → C → D → E（手动）**，再补 API 触发与调度（F）。

---

## API 速查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/api/v1/auth/login` | 管理员登录 |
| CRUD | `/api/v1/data-sources` | 数据源 |
| CRUD | `/api/v1/channels` | 渠道 |
| CRUD | `/api/v1/push-jobs` | 推送任务 |
| POST | `/api/v1/push-jobs/{id}/run` | 触发运行 |
| GET | `/api/v1/job-runs` | 运行列表 |
| GET | `/api/v1/job-runs/{id}` | 运行详情（含 logs/deliveries） |
| POST | `/api/v1/job-runs/{id}/rerun` | 重跑 |
| CRUD | `/api/v1/api-tokens` | 机器 Token |

交互文档：API 启动后打开 [http://localhost:8000/docs](http://localhost:8000/docs)。

---

## 仓库结构

```
data-push-platform/
├── docker-compose.yml      # mysql / redis / api / scheduler [/ worker]
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   ├── alembic/            # 迁移
│   ├── app/
│   │   ├── api/v1/         # HTTP API
│   │   ├── modules/        # identity / execution / scheduler / config
│   │   ├── plugins/        # datasource / renderer / channel
│   │   ├── worker/         # Celery
│   │   └── main.py
│   └── tests/
└── frontend/               # React + Ant Design 管理台
```

---

## License

Internal / project use unless otherwise specified.
