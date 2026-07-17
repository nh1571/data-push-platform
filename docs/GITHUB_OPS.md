# GitHub 项目管理（增强）

> 仓库：**https://github.com/nh1571/data-push-platform**（**Public** 公开）  
> 本机已用 `gh` 登录账号 `nh1571`。助手可通过 `gh` 代为：建 Issue、贴标签、开/看 PR、看 CI、列里程碑等。

---

## 1. 仓库现状

| 项 | 值 |
|----|-----|
| 远程 | `origin` → `https://github.com/nh1571/data-push-platform.git` |
| 默认分支 | `main` |
| 开发分支 | `feature/m0-scaffold`（历史工作线，已推送） |
| 可见性 | **Public**（欢迎 Fork / PR） |
| Issues | #1 甲 / #2 乙 / #3 丙 / #4 协作约定（已标 help wanted） |
| 贡献说明 | [CONTRIBUTING.md](../CONTRIBUTING.md) |

---

## 2. 邀请同事（你要在网页点一次）

1. 打开 https://github.com/nh1571/data-push-platform/settings/access  
2. **Add people** → 填同事 GitHub 用户名  
3. 权限建议：**Write**（可推分支、开 PR）

同事：

```bash
git clone https://github.com/nh1571/data-push-platform.git
cd data-push-platform
./scripts/dev.sh
# 登录 admin / admin123
```

---

## 3. 日常协作怎么管（你不会也可以让助手做）

对助手说类似：

| 你说 | 助手用 `gh` 做什么 |
|------|-------------------|
| 列一下未完成任务 | `gh issue list` |
| 给甲加一个画布 bug | `gh issue create` + label `lane:studio` |
| 看看有没有 PR | `gh pr list` |
| 帮我看这个 PR 能不能合 | `gh pr view` / diff / 检查 |
| 合并 PR #N | `gh pr merge`（会先确认） |
| 发一版说明 | 写 Release notes / 更新 HANDOFF |

**你本机保持 `gh auth status` 已登录即可**；Project 看板若要用，需补授权一次：

```bash
gh auth refresh -s project,read:project
```

（当前 token 缺 `project` scope，Issues/PR 已够用；看板可选。）

---

## 4. 推荐工作流（三人）

```text
1. 从 main 开分支
   git checkout main && git pull
   git checkout -b feature/studio-xxx   # 甲
   # feature/channel-xxx  乙
   # feature/runtime-xxx  丙

2. 本地开发 + commit

3. 推送并开 PR
   git push -u origin HEAD
   gh pr create --base main --fill
   # 或让助手：帮我从当前分支开 PR

4. 另一人看一眼 / 助手 review → 合入 main

5. 删除已合并分支（可选）
```

标签约定：

| Label | 含义 |
|-------|------|
| `lane:studio` | 甲 工作台+成图 |
| `lane:io` | 乙 数据源+通道 |
| `lane:runtime` | 丙 执行+调度+运营 |
| `type:feat` / `fix` / `docs` | 类型 |
| `priority:P0` / `P1` | 优先级 |

---

## 5. 助手「代管」范围（约定）

**默认可做（低风险）**

- 创建/更新 Issue、评论、贴标签  
- 查看 PR、代码 diff、跑本地测试并反馈  
- 更新 `docs/*`、HANDOFF  
- 小修复后本地 commit（**push 前会说明**）  

**需你明确同意**

- `git push` 到 main  
- 合并 PR、删分支  
- 改仓库可见性、删库、改权限  
- 发布正式 Release  

**永不做**

- 提交 `.env`、密钥、生产密码  
- 强推覆盖 main（`--force` 到共享默认分支）  

---

## 6. 你常用的最少命令

```bash
cd /Users/hello/grok/data-push-platform
gh auth status
gh issue list
gh pr list
git status
git pull origin main
```

网页入口：

- 代码：https://github.com/nh1571/data-push-platform  
- Issues：https://github.com/nh1571/data-push-platform/issues  
- PR：https://github.com/nh1571/data-push-platform/pulls  
- 邀请协作：https://github.com/nh1571/data-push-platform/settings/access  
