# 下次开工检查清单（5 分钟）

给 **任意 Agent / 任意会话** 用。按顺序勾选。

## 1. 读文档（必做）

- [ ] 阅读 `docs/DEVELOPMENT_HANDOFF.md` 全文
- [ ] 扫一眼 Obsidian `20_项目/企业数据推送中台/00-项目索引.md` 与 `09-产品分析修正-*.md`
- [ ] 看 HANDOFF §7「当前阻塞 / 进行中」

## 2. 代码状态

```bash
cd /Users/hello/grok/data-push-platform
git status
git branch --show-current   # 应为 feature/m0-scaffold
git log -5 --oneline
```

- [ ] 工作区干净或已知改动
- [ ] 在正确分支

## 3. 本地环境

```bash
docker compose ps           # mysql + redis healthy
curl -s localhost:8000/health
curl -s -o /dev/null -w "%{http_code}\n" localhost:5173/
cd backend && pytest -q
```

- [ ] MySQL/Redis 起
- [ ] API / 前端按需启动（见 HANDOFF §1.2）
- [ ] 测试绿

## 4. 确认本次任务

- [ ] 任务来自 HANDOFF §6 优先级，或用户明确新需求
- [ ] 不推翻 Message⊥Channel、MySQL 元库、插件化等原则

## 5. 收工（必做）

- [ ] 提交代码，message 清晰
- [ ] 更新 `docs/DEVELOPMENT_HANDOFF.md` §7「当前阻塞 / 进行中」
- [ ] 若有架构/产品变化，更新 Obsidian 对应笔记 + `00` 变更日志
- [ ] 告诉用户：改了什么、怎么验收、下一步建议

## 开场白模板

```text
继续 data-push-platform。先读 docs/DEVELOPMENT_HANDOFF.md 与 docs/CONTINUE_CHECKLIST.md。
当前分支 feature/m0-scaffold。本次任务：<一句话>。
```
