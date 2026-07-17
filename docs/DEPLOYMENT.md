# 部署与依赖分层

目标：**从 Git 克隆后，默认本地零外部服务即可开发**；生产通过配置切换外置依赖。

---

## 1. 两套模式

| | **Local / 协作开发（默认）** | **Production** |
|--|------------------------------|----------------|
| 元库 | **SQLite** 文件 `backend/data/meta.db` | **MySQL 8** |
| 队列 | 不需要（`EXECUTION_SYNC=true`） | **Redis + Celery Worker** |
| 业务取数 | 内置 **SQLite 演示库** + 可接外库 | Doris / MySQL / SQLServer… |
| 成图 | Playwright 可选（无则 HTML 预览） | 建议安装 Chromium |
| 钉钉 | 可选真凭证 | 企业应用/机器人 |
| 启动 | `scripts/dev.sh` 或手动 uvicorn | Docker Compose / K8s |

环境变量总开关：`APP_ENV=local|production`（见根目录 `.env.example`）。

---

## 2. 本地 5 分钟（推荐）

前置：Python 3.11+、Node 18+（**不需要** Docker / MySQL / Redis）。

```bash
# 仓库根目录
./scripts/dev.sh
```

脚本会：创建 venv → `pip install -e backend` → 起 API（SQLite）→ 起前端。

| 入口 | |
|------|--|
| 管理台 | http://localhost:5173 |
| API / OpenAPI | http://localhost:8000/docs |
| 健康+依赖 | http://localhost:8000/health?detail=true |
| 账号 | `admin` / `admin123` |

首次启动会自动：

1. 创建 `backend/data/meta.db`（元数据）  
2. 生成 `backend/data/.fernet_key`（本地加密密钥）  
3. 创建 `backend/data/demo_biz.db`（演示业务表）  
4. 若无数据源，种子一条「本地演示库 (SQLite)」  
5. Bootstrap 管理员  

可选成图：

```bash
cd backend && . .venv/bin/activate
python -m playwright install chromium
```

---

## 3. 生产 / 类生产（外置依赖）

```bash
# 使用 Docker 一键起 MySQL + Redis + API + Scheduler
export APP_ENV=production   # 或 compose 内已写 DATABASE_URL
docker compose up -d --build
```

必改：

- `SECRET_KEY` / `TOKEN_FERNET_KEY` / `ADMIN_PASSWORD`  
- `DATABASE_URL` → 真实 MySQL  
- 异步时：`EXECUTION_SYNC=false` + `docker compose --profile worker up -d`

配置对照见 `.env.example`。

---

## 4. 依赖对照表

| 依赖 | Local | Production |
|------|-------|------------|
| MySQL 元库 | ❌ SQLite 代替 | ✅ |
| Redis | ❌ 默认同进程执行 | ✅（异步 Worker） |
| Playwright | 可选 | 建议 |
| 业务 Doris/MySQL | 可选；有演示 SQLite | 按任务配置 |
| 钉钉 | 可选 | 真推送必需 |
| DolphinScheduler HTTP | 可选 | 可选 |

---

## 5. 配置项说明

| 变量 | 含义 | Local 默认 |
|------|------|------------|
| `APP_ENV` | 配置档 | `local` |
| `DATABASE_URL` | 元库连接 | `sqlite:///…/data/meta.db` |
| `REDIS_URL` | Celery | 未使用（sync） |
| `EXECUTION_SYNC` | 是否进程内执行 | `true` |
| `AUTO_MIGRATE` | 启动建表 | `true` |
| `SEED_DEMO_DATA` | 演示库/数据源 | `true` |
| `TOKEN_FERNET_KEY` | 配置加密 | 自动生成文件 |
| `STORAGE_ROOT` | 成图落盘 | `backend/storage` |

---

## 6. 协作约定

- **不要**把 `backend/data/`、`backend/storage/`、`.env` 提交进 Git（已 gitignore）。  
- 生产密钥与本地 `.fernet_key` **不可混用**。  
- PR 默认按 local SQLite 路径自测；改 MySQL 专有 SQL 的同学用 compose 再验一版。  
