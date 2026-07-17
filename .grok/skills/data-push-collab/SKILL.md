---
name: data-push-collab
description: >
  Collaborative development for data-push-platform / 数据推送中台:
  how others clone, branch, develop, commit, push, open PRs; multi-agent git workflow;
  协同开发, 拉取, 建分支, 怎么提交, 怎么推送, 开 PR, fork,
  /data-push-collab, or any agent about to share work in this repo.
---

# Data Push Platform · 协同开发技能（强制）

任何 **人 / Agent** 在本仓库参与协作（拉代码、开分支、开发、提交、推送、PR）必须按本技能执行。

| 文档 | 用途 |
|------|------|
| `docs/COLLAB_GIT.md` | 分支模型说明（给人读） |
| `docs/COLLAB_MODULES.md` | 三人改哪些目录 |
| `docs/product/` | 产品与架构笔记 |
| `docs/DEVELOPMENT_HANDOFF.md` | 工程进度交接 |
| `docs/DEPLOYMENT.md` | 本地/生产环境 |
| `CONTRIBUTING.md` | 开源贡献入口 |

**仓库：** https://github.com/nh1571/data-push-platform（Public）  
**默认分支：`main`**（不要用 `feature/m0-scaffold` 开新功能）

---

## 0. 硬规则

1. 集成线只有 **`main`**。  
2. **分工 = 目录**；**分支 = 单次任务的短沙箱**（不是每人永久一条分支）。  
3. 禁止 force-push `main`。  
4. 禁止提交 `.env`、密钥、`backend/data/`、真实钉钉凭证。  
5. 大功能不在 `main` 上直接堆。  
6. 不读 HANDOFF §7 + 本技能，不发明架构。  
7. Agent：本地 commit 可做；**push / 合并 PR 需用户意图或用户说过「直接推/合」**。

---

# A. 别人第一次怎么拉下来（Day 0）

## A1. 已有仓库写权限（内部三人）

```bash
git clone https://github.com/nh1571/data-push-platform.git
cd data-push-platform
git checkout main
git pull origin main
```

此时远程可能只有 `main`（和历史 `feature/m0-scaffold`）——**正常**。  
**不要等**「甲分支/乙分支」出现；任务分支由你自己创建。

## A2. 外部贡献者（无写权限）

```bash
# 1) 浏览器 Fork 到自己账号
# 2) clone 自己的 Fork
git clone https://github.com/<你的用户名>/data-push-platform.git
cd data-push-platform
git remote add upstream https://github.com/nh1571/data-push-platform.git
git fetch upstream
git checkout main
git merge upstream/main
```

PR 时：从 **你的 Fork 的 feature 分支** → **nh1571/data-push-platform 的 main**。

## A3. 第一次跑起来

```bash
# 需要：Python 3.11+、Node 18+（不要 Docker）
./scripts/dev.sh
```

| 项 | 值 |
|----|-----|
| 管理台 | http://localhost:5173 |
| API | http://localhost:8000/docs |
| 账号 | `admin` / `admin123` |

详见 `docs/DEPLOYMENT.md`。可选成图：`cd backend && python -m playwright install chromium`。

## A4. 开工前读什么

```text
[ ] docs/DEVELOPMENT_HANDOFF.md §7（当前进度）
[ ] docs/COLLAB_MODULES.md（我改哪条线）
[ ] docs/product/README.md（产品背景，按需深入）
[ ] 本技能全文
```

---

# B. 每天怎么开发（Day N）

## B1. 同步最新 main

```bash
cd data-push-platform
git checkout main
git pull origin main
# Fork 用户：
# git fetch upstream && git merge upstream/main
```

## B2. 自己创建任务分支（必须）

远程**不会**预先建好分工分支。每人做事时：

```bash
git checkout main
git pull origin main
git checkout -b feature/studio-<topic>    # 甲
# git checkout -b feature/io-<topic>      # 乙
# git checkout -b feature/runtime-<topic> # 丙
# git checkout -b fix/<topic>
# git checkout -b docs/<topic>
```

| 前缀 | 对应分工 |
|------|----------|
| `feature/studio-*` | 工作台 + 成图 |
| `feature/io-*` | 数据源 + 通道 |
| `feature/runtime-*` | 执行 + 调度 + 运营页 |

**禁止**长期只推 `lane/studio` 永不合并。

## B3. 在分支上改代码

1. `./scripts/dev.sh`（或已有 API/前端进程）。  
2. **只改本 lane 目录**（见 §D）；跨 lane 先 Issue。  
3. 小步保存；随时可 `git status`。

## B4. 提交（本地）

```bash
git status
git diff
# 只 add 相关文件；不要把 backend/data、.env 加进去
git add path/to/file1 path/to/file2
git commit -m "feat(studio): 用完整句说明做了什么"
```

Commit 前缀：`feat|fix|docs|chore|refactor`  
可选 scope：`(studio|io|runtime|deploy)`

## B5. 推送到远程（关键步骤）

**第一次推这条分支：**

```bash
git push -u origin HEAD
# 等价：git push -u origin feature/studio-xxx
```

**之后同一分支再推：**

```bash
git push
```

| 身份 | `origin` 是谁 | 说明 |
|------|----------------|------|
| 有写权限 | `nh1571/data-push-platform` | 直接 push 功能分支 |
| 仅 Fork | 自己的 Fork | push 到 Fork，再对上游开 PR |

推送后远程会**多出**你的 `feature/...`；合进 main 后可删。

## B6. 开 Pull Request

**有 `gh` 且已登录：**

```bash
gh pr create --repo nh1571/data-push-platform --base main \
  --title "feat(studio): …" \
  --body "$(cat <<'EOF'
## 摘要
- …

## 如何验证
- ./scripts/dev.sh
- …

## 关联
Fixes #N（可选）
EOF
)"
```

**网页：**  
GitHub 上 Compare & pull request → **base: `main`** ← compare: 你的 `feature/...`

PR 要求：

- base **必须是 `main`**  
- 标题风格同 commit  
- 建议 label：`lane:studio|io|runtime`，`type:feat|fix|docs`

## B7. 合并之后（保持本地干净）

```bash
git checkout main
git pull origin main
# 删除本地已合并分支
git branch -d feature/studio-xxx
# 可选删远程分支（若合并时未勾选 delete）
git push origin --delete feature/studio-xxx
```

Fork 用户：

```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main
```

## B8. 开发中途同步别人的 main（防冲突）

在自己的 **feature 分支**上：

```bash
git fetch origin
git merge origin/main
# 解决冲突后：
git add .
git commit -m "chore: merge main into feature/studio-xxx"
git push
```

（仅自己的未分享分支也可用 `git rebase origin/main`，已 push 的分支慎用 rebase。）

---

# C. 端到端抄作业（内部成员）

```bash
# —— 第一次 ——
git clone https://github.com/nh1571/data-push-platform.git
cd data-push-platform
./scripts/dev.sh
# 浏览器登录 admin / admin123，确认能进工作台

# —— 开始一个任务 ——
git checkout main && git pull origin main
git checkout -b feature/studio-demo-task

# 改代码… 验证…
git add <files>
git commit -m "feat(studio): demo task description"
git push -u origin HEAD
gh pr create --base main --fill   # 或网页开 PR

# —— 合并后 ——
git checkout main && git pull origin main
git branch -d feature/studio-demo-task
```

---

# D. 三人改哪里（目录）

| Lane | 主目录 |
|------|--------|
| **studio** | `frontend/src/pages/editor/*`、`backend/app/modules/studio/*`、`backend/app/api/v1/editor.py` |
| **io** | `backend/app/plugins/datasource/*`、`channel/*`、`pages/data-sources/*`、`pages/channels/*` |
| **runtime** | `backend/app/modules/execution/*`、`scheduler/*`、`worker/*`、`pages/push-jobs/*`、`job-runs/*` |

总线（改前打招呼）：`pipeline.py`、`compile.py`、`plugins/base.py`、`types.ts`、`EditorPage.tsx`。

**工作台 + 成图 = studio 一人主责。**

---

# E. Agent 额外义务

1. 会话开始执行 §A4 检查 + `git status` / `git branch`。  
2. 确认 lane → 从最新 `main` 建 `feature/<lane>-*` 再改代码。  
3. 指导用户时：**完整写出 clone → 分支 → commit → push → PR 命令**，不要假设对方会 Git。  
4. push / merge：默认先说明；用户说「推上去」「合了」再执行。  
5. 收工配合 `continue-data-push-dev` 更新 `docs/DEVELOPMENT_HANDOFF.md` §7。  
6. 产品决策优先 `docs/product/`，禁止空手套白狼重设计。

---

# F. 与 continue-data-push-dev

| 技能 | 何时用 |
|------|--------|
| **data-push-collab（本技能）** | 拉代码、分支、提交、推送、PR、协同规范 |
| **continue-data-push-dev** | 启停环境、HANDOFF 收工、会话交接 |

先 collab 定分支，再 continue 起环境，再写代码。

---

# G. Red flags

| 错误 | 正确 |
|------|------|
| 在 main 上直接大改 | 拉 `feature/<lane>-*` |
| 等远程出现「甲的分支」再开发 | 自己 `git checkout -b` |
| 从 `feature/m0-scaffold` 开新功能 | 从 `main` 开 |
| `git push --force` main | 禁止 |
| 提交 .env / data/*.db | 剔除并轮换密钥 |
| 只本地 commit 从不 push/PR | 做完应 push + PR 进 main |

---

# H. 一句话给协作者

```text
clone → 只用 main → 自己建 feature/某线-任务名
→ 本地 ./scripts/dev.sh 开发 → commit → push 自己的分支
→ 对 main 开 PR → 合并后拉 main、删旧分支
```
