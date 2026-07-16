---
name: continue-data-push-dev
description: >
  Use when resuming or starting work on the data-push-platform / 数据推送中台 project:
  continue development, 继续开发, 接着做, 恢复开发, 启动开发, handoff resume,
  /continue-data-push-dev, or any agent opens this repo without prior chat context.
---

# Continue Data Push Platform Development

## Overview

Long-running **数据推送中台** project. Progress lives in git + docs, not chat history.
**Core rule:** Read handoff docs and update them before/after work. Never invent product goals from scratch.

## Hard Rules

1. **First action:** Read these files (in order). Do not write feature code before step 1–3 of the Startup sequence.
2. **Do not** reverse confirmed principles (Message ⊥ Channel, MySQL meta DB, plugin SPI, hybrid schedule C) unless the user explicitly changes them.
3. **Do not** treat the current UI as “done product”; user wants template→image editing and full DingTalk modes (see handoff §2 / Obsidian 09).
4. **End of session:** Update handoff §7 “当前阻塞 / 进行中” and mention what changed to the user.

## Paths (absolute)

| Item | Path |
|------|------|
| Repo | `/Users/hello/grok/data-push-platform` |
| Branch | `feature/m0-scaffold` |
| **Handoff (authority)** | `/Users/hello/grok/data-push-platform/docs/DEVELOPMENT_HANDOFF.md` |
| Checklist | `/Users/hello/grok/data-push-platform/docs/CONTINUE_CHECKLIST.md` |
| README | `/Users/hello/grok/data-push-platform/README.md` |
| Obsidian design | `/Users/hello/Documents/obsidian/notes/20_项目/企业数据推送中台/` |
| Design index | `.../00-项目索引.md` |
| User feedback | `.../07-体验反馈与缺口.md`, `.../09-产品分析修正-钉钉能力与信息架构.md` |

## Startup Sequence (mandatory)

Execute in order every time this skill is used:

### 1. Read handoff

```bash
# Prefer Read tool on these files
```

- `docs/DEVELOPMENT_HANDOFF.md` — full progress, priorities, principles
- `docs/CONTINUE_CHECKLIST.md` — short checklist
- Handoff **§7 当前阻塞 / 进行中** — pick up exact next work
- If product questions: Obsidian `09` then `08` then `03`

### 2. Git state

```bash
cd /Users/hello/grok/data-push-platform
git status
git branch --show-current
git log -5 --oneline
```

Expect branch `feature/m0-scaffold`. If dirty, summarize uncommitted work before coding.

### 3. Environment pulse

```bash
cd /Users/hello/grok/data-push-platform
docker compose ps
curl -s -m 2 http://localhost:8000/health || true
curl -s -m 2 -o /dev/null -w "%{http_code}" http://localhost:5173/ || true
```

### 4. Start stack if user wants to run/UI (or if health fails)

**Meta DB + Redis:**

```bash
cd /Users/hello/grok/data-push-platform
docker compose up -d mysql redis
```

**API** (background if long-running):

```bash
cd /Users/hello/grok/data-push-platform/backend
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
```

**Frontend:**

```bash
cd /Users/hello/grok/data-push-platform/frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

| Login | Value |
|-------|--------|
| URL | http://localhost:5173 |
| User | `admin` |
| Pass | `admin123` |

**Note:** Meta DB is **MySQL**, not Postgres. Compose service name is `mysql`.

### 5. Report status to user (before coding)

Tell the user in plain language:

1. Branch + latest commit  
2. Services up/down  
3. Handoff §7 status  
4. **Proposed next task** from HANDOFF §6 (P0 list) unless user already specified a task  
5. Ask confirm only if task is ambiguous; if user said “继续开发” with no detail, start top P0

### 6. Implement

- Follow HANDOFF §6 priorities unless user overrides  
- Prefer TDD for backend (`cd backend && pytest`)  
- Frontend: `npm run build` when UI changes  
- Small commits: `feat:` / `fix:` / `docs:`

### 7. Shutdown / handoff update (end of work)

Edit `docs/DEVELOPMENT_HANDOFF.md` section **§7 当前阻塞 / 进行中**:

```text
进行中：<what you were doing>
阻塞：<or 无>
上次完成：<commits / summary>
建议下一动作：<one concrete next step>
```

Optionally append one line to Obsidian `10-开发进度与交接.md` 变更.

## What NOT to do

| Anti-pattern | Do instead |
|--------------|------------|
| Redesign product from zero | Read 09 + HANDOFF |
| Switch meta DB back to Postgres | Keep MySQL |
| Only improve CRUD forms | Editor + templates + channel modes are the product |
| Skip reading handoff “to save time” | Always read §7 + §6 |
| Leave session without updating §7 | Always update |

## Quick architecture reminder

```text
DataSource plugin (mysql|doris)
  → SQL → QueryResult
  → design/templates → Message (text|image|card|file)
  → Channel plugin (dingtalk.*) → DingTalk
JobRun unifies manual / cron / DS HTTP / editor test-push
```

Key packages: `backend/app/modules/editor/`, `backend/app/modules/execution/`, `backend/app/plugins/`, `frontend/src/pages/editor/`.

## Related skills (optional after handoff read)

- `fastapi-python`, `celery-expert` — backend  
- `dingtalk-message` — DingTalk API reference  
- `test-driven-development`, `verification-before-completion` — quality  
- `subagent-driven-development` — multi-task execution  

## Red Flags — STOP

- Coding before reading `DEVELOPMENT_HANDOFF.md`  
- “I’ll just improve the UI a bit” without checking §6  
- Inventing new product scope not in handoff/user message  
- Using PostgreSQL URLs from old docs  

**If any red flag:** Stop, read handoff, realign with user.
