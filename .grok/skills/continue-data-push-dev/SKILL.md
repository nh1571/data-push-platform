---
name: continue-data-push-dev
description: >
  Use when starting, resuming, or stopping work on the data-push-platform / 数据推送中台 project:
  continue development, 继续开发, 接着做, 恢复开发, 启动开发, handoff resume,
  stop development, 停止开发, 收工, 下班, 结束开发, pause work, 保存进度,
  /continue-data-push-dev, or any agent opens this repo without prior chat context.
---

# Continue / Stop Data Push Platform Development

## Overview

Long-running **数据推送中台**. Progress lives in **git + docs**, not chat history.

**Two modes** (detect from user message):

| Mode | Triggers | Goal |
|------|----------|------|
| **START** | 继续开发、启动开发、接着做、resume、start | Read handoff → env up → work |
| **STOP** | 停止开发、收工、下班、结束开发、pause、保存进度 | Save code/progress → stop helpers → handoff note |

If both mentioned, do **STOP** first only if they said they're leaving; else ask once.

**Core rule:** Never invent product goals from scratch. Read handoff. On STOP, leave the next agent a clean slate.

---

## Paths (absolute)

| Item | Path |
|------|------|
| Repo | `/Users/hello/grok/data-push-platform` |
| Branch | `feature/m0-scaffold` (verify with `git branch`) |
| **Handoff** | `/Users/hello/grok/data-push-platform/docs/DEVELOPMENT_HANDOFF.md` |
| Checklist | `/Users/hello/grok/data-push-platform/docs/CONTINUE_CHECKLIST.md` |
| Obsidian | `/Users/hello/Documents/obsidian/notes/20_项目/企业数据推送中台/` |
| Session log (optional) | `.../20_项目/企业数据推送中台/10-开发进度与交接.md` |

---

## Mode detection

```text
用户说 停止/收工/下班/结束开发/pause  →  STOP sequence only (do not start coding)
用户说 继续/启动/接着/resume        →  START sequence
用户说 继续做完再收工               →  implement then STOP
```

---

# MODE: STOP（停止开发 / 收工）

Run **in order**. Do not skip. Goal: machine quiet, git clean or intentionally saved, next session can START smoothly.

## S1. Summarize today's work

From this session (or git log since last handoff):

- What was implemented / fixed / decided  
- What is unfinished  
- One concrete **next action** for tomorrow  

## S2. Save code (git)

```bash
cd /Users/hello/grok/data-push-platform
git status
git branch --show-current
git diff --stat
```

| Working tree | Action |
|--------------|--------|
| **Clean** | Note "nothing to commit" |
| **Has changes user intends to keep** | Stage + commit with clear message (`feat:`/`fix:`/`docs:`). Prefer complete sentences. |
| **Dirty but incomplete / risky** | Prefer `git stash push -u -m "wip: pause YYYY-MM-DD"` **after asking once** if intent unclear; or commit WIP with `wip:` if user said 保存进度 |
| **Secrets in diff** (.env with real keys) | **Never commit** secrets; restore or gitignore |

Do **not** `git push` unless user explicitly asks.

If commit succeeds, record SHA for handoff §7.

## S3. Persist progress in docs (mandatory)

### 3a. Update `docs/DEVELOPMENT_HANDOFF.md` §7

Replace **§7 当前阻塞 / 进行中** block with:

```text
进行中：无（已收工 YYYY-MM-DD）
阻塞：<无 / 具体阻塞>
上次完成：<今日 commits 与摘要>
建议下一动作：<一条可执行的下一步>
停工环境：docker 已 down；API/前端已停（或注明仍在跑）
```

### 3b. Optional Obsidian line

Append to `10-开发进度与交接.md` 变更:

```text
- YYYY-MM-DD：收工 — <一句话>；下一动作 <…>
```

### 3c. Commit doc updates if §7 changed

```bash
git add docs/DEVELOPMENT_HANDOFF.md
git commit -m "docs: session pause handoff YYYY-MM-DD"
```

(Include Obsidian only if that vault is not the git repo — Obsidian path is outside repo; only update file on disk.)

## S4. Stop helper processes

### 4a. Docker (meta MySQL + Redis + any compose services)

```bash
cd /Users/hello/grok/data-push-platform
docker compose ps
docker compose down
# Do NOT use docker compose down -v unless user explicitly wants to wipe DB volumes
```

**Never** `-v` by default (wipes MySQL data).

### 4b. Local API / frontend (if running outside compose)

```bash
# Free common ports if still listening (macOS)
lsof -tiTCP:8000 -sTCP:LISTEN | xargs kill 2>/dev/null || true
lsof -tiTCP:5173 -sTCP:LISTEN | xargs kill 2>/dev/null || true
```

Only kill processes clearly from this project (uvicorn on 8000, vite on 5173). Do not kill unrelated system services.

### 4c. Verify quiet

```bash
docker compose ps
curl -s -m 1 http://localhost:8000/health || echo "api:stopped"
curl -s -m 1 -o /dev/null -w "fe:%{http_code}\n" http://localhost:5173/ || echo "fe:stopped"
```

## S5. Final report to user (STOP)

Tell the user clearly:

1. **Git:** clean / committed SHA / stashed  
2. **Docs:** §7 updated  
3. **Docker:** down (data volumes kept)  
4. **Ports 8000/5173:** stopped or still up  
5. **Tomorrow:** open handoff §7 + say「继续开发推送中台」or `/continue-data-push-dev`  

---

# MODE: START（启动 / 继续开发）

## Hard Rules (START)

1. Do **not** write feature code before Startup steps 1–3.  
2. Do **not** reverse Message ⊥ Channel, MySQL meta DB, plugin SPI, hybrid schedule C unless user says so.  
3. Product is still incomplete: template→image + full DingTalk modes matter (Obsidian 09).  
4. End with STOP sequence if user is leaving; otherwise at least update §7 if substantial work done.

## Startup Sequence

### 1. Read handoff

- `docs/DEVELOPMENT_HANDOFF.md` (full, especially §6–§7)  
- `docs/CONTINUE_CHECKLIST.md`  
- Product gaps if needed: Obsidian `09`, `08`, `07`

### 2. Git state

```bash
cd /Users/hello/grok/data-push-platform
git status
git branch --show-current
git log -5 --oneline
# If stashed last time:
git stash list
```

If `stash` exists with `wip: pause`, ask whether to `git stash pop` before coding.

### 3. Environment pulse

```bash
docker compose ps
curl -s -m 2 http://localhost:8000/health || true
curl -s -m 2 -o /dev/null -w "%{http_code}" http://localhost:5173/ || true
```

### 4. Start stack (if UI/API needed or health down)

```bash
cd /Users/hello/grok/data-push-platform
docker compose up -d mysql redis
```

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

```bash
cd /Users/hello/grok/data-push-platform/frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

| Login | Value |
|-------|--------|
| URL | http://localhost:5173 |
| User | `admin` |
| Pass | `admin123` |

Meta DB = **MySQL** service `mysql`, not Postgres.

### 5. Report before coding

1. Branch + latest commit  
2. Services up/down  
3. §7 status + proposed next task from §6  
4. If user only said「继续开发」, start top P0 after brief status  

### 6. Implement

- HANDOFF §6 priorities unless user overrides  
- Backend: `cd backend && pytest`  
- Frontend: `npm run build` when UI changes  
- Small commits  

### 7. Mid-session pause vs full STOP

| User says | Action |
|-----------|--------|
| 先停一下 / 等等 | Light: update §7 only, leave docker running if useful |
| 收工 / 下班 / 停止开发 | **Full STOP sequence** (S1–S5) |

---

## What NOT to do

| Anti-pattern | Do instead |
|--------------|------------|
| Leave dirty git + stop docker with no handoff | STOP S2+S3 first |
| `docker compose down -v` on pause | `down` without `-v` |
| Redesign product from zero on resume | Read 09 + HANDOFF |
| Skip §7 on stop | Always write §7 |
| Commit `.env` secrets | Never |

---

## Quick architecture

```text
DataSource (mysql|doris) → SQL → design/templates → Message → Channel (dingtalk.*)
JobRun: manual | cron | DS HTTP | editor test-push
```

Key code: `backend/app/modules/editor/`, `execution/`, `plugins/`, `frontend/src/pages/editor/`.

---

## Red Flags

**START:** coding before reading HANDOFF; inventing scope; Postgres URLs.  
**STOP:** stopping docker without committing/stashing; wiping volumes; no §7 update.

**If red flag:** Stop, fix process, then continue.
