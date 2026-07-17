# Git 协同规范（人数可扩展）

> **结论：** 分工对应 **目录（Lane）**；分支是 **短任务沙箱**，从 `main` 自己创建，做完合回 `main`。  
> **Lane 列表不是写死 3 条**：见 [LANES.md](./LANES.md)（可加第 4、第 5…）。  
> Agent：`.grok/skills/data-push-collab/SKILL.md`。

**仓库：** https://github.com/nh1571/data-push-platform  

---

## 0. 远程只有 main（和 m0）正常吗？

**正常。** 不会预先建好「甲/乙/丙」三条永久分支。  
别人 clone 后：**自己** `git checkout -b feature/...`，push 后远程才会多出他的分支。

---

## 1. 别人第一次拉下来

### 有写权限（内部）

```bash
git clone https://github.com/nh1571/data-push-platform.git
cd data-push-platform
git checkout main
git pull origin main
./scripts/dev.sh
# http://localhost:5173  admin / admin123
```

### 无写权限（外部）

1. 网页 **Fork**  
2. `git clone https://github.com/<你>/data-push-platform.git`  
3. `git remote add upstream https://github.com/nh1571/data-push-platform.git`  
4. 开发后：push 到自己的 Fork → PR 到上游 `main`

---

## 2. 每天开发 + 推送（抄这套）

```bash
# 1) 更新主线
git checkout main
git pull origin main

# 2) 自己建任务分支（前缀 = 当前 laneId，见 docs/LANES.md）
git checkout -b feature/studio-我的任务
# feature/io-… / feature/runtime-… / 将来 feature/<新lane>-…

# 3) 开发
./scripts/dev.sh
# …改代码…

# 4) 提交
git add <相关文件>          # 不要 add data/、.env
git commit -m "feat(studio): 说明改了什么"

# 5) 推送（第一次 -u）
git push -u origin HEAD

# 6) 开 PR（base = main）
gh pr create --base main --title "feat(studio): …" --body "## 摘要\n## 如何验证"
# 或网页：Compare & pull request

# 7) 合并后
git checkout main && git pull origin main
git branch -d feature/studio-我的任务
```

### 开发中途同步别人已合并的代码

```bash
# 仍在你的 feature 分支上
git fetch origin
git merge origin/main
# 解决冲突 → commit → git push
```

---

## 3. 分支模型

```text
main                          ← 唯一集成线
  ├── feature/studio-xxx      ← 某人自己建，做完 PR 删
  ├── feature/io-xxx
  └── feature/runtime-xxx
```

| 分支 | 谁创建 | 寿命 |
|------|--------|------|
| `main` | 仓库默认 | 长期 |
| `feature/<lane>-<topic>` | **开发者自己** | 几天内 |
| `feature/m0-scaffold` | 历史 | 勿再当主开发线 |

**不是主流、也不要用：** 每人永久 `branch-甲` 长期不合并。

---

## 4. 命名

```text
feature/studio-<topic>    # 工作台+成图
feature/io-<topic>        # 数据源+通道
feature/runtime-<topic>   # 执行+调度+运营
fix/<topic>  docs/<topic>  chore/<topic>
```

提交：`feat(studio): …` / `fix(io): …` / `docs: …`

---

## 5. 分工（目录）见 COLLAB_MODULES.md

| 线 | 分支前缀 | 主要改 |
|----|----------|--------|
| 甲 studio | `feature/studio-*` | `pages/editor`、`modules/studio` |
| 乙 io | `feature/io-*` | `plugins/datasource|channel` |
| 丙 runtime | `feature/runtime-*` | `execution`、`scheduler`、任务/运行页 |

---

## 6. 禁止

- force-push `main`  
- 提交密钥 / `.env` / `backend/data/*`  
- 在 `main` 上堆大功能  
- 从 `feature/m0-scaffold` 开新功能（从 **main** 开）

---

## 7. 一句话

```text
clone → 只用 main → 自己建 feature/线-任务
→ 本地跑 → commit → push 自己的分支 → PR 合进 main
```
