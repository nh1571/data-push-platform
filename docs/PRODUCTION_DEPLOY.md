
# 生产部署指南（CentOS · 零 Docker · 零容器）

适用于 CentOS 7/8/9，服务器仅需 **conda Python 3.11+ + Git**。

前端在本地 Mac 构建（`npm run build`），构建产物 `frontend/dist/` 随代码一同提交 Git。
服务器不安装 Node、MySQL、Redis、Docker、nginx。

---

## 1. 整体架构

```
本地 Mac（开发机，有 Node）
  ├── 写代码
  ├── npm run build       ← 构建前端，生成 frontend/dist/
  ├── git add . && git commit && git push origin main
  └── (dist/ 已从 .gitignore 移除，随代码提交)
                       │
                       ▼
          ┌────────────────────────┐
          │        GitHub           │
          │   代码 + dist/          │
          └────────────────────────┘
                       │
                       │  git pull（服务器无需 Node）
                       ▼
┌──────────────────────────────────────────────────────────┐
│ 服务器 CentOS /opt/data-push-platform                    │
│ 依赖：conda Python 3.11+ + Git（仅此两个）                 │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  uvicorn (1 个进程，systemd 管理)                 │   │
│  │                                                   │   │
│  │  /api/v1/*       → FastAPI 业务 API               │   │
│  │  /health          → 健康检查                        │   │
│  │  /                → 前端 SPA (npm build 产物)      │   │
│  │  /assets/*        → JS/CSS/图片                    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  数据：SQLite backend/data/meta.db（和本地一致）          │
│  存储：backend/storage/（成图落盘）                       │
└──────────────────────────────────────────────────────────┘
```

端口：**8000**（防火墙开放后浏览器直连 `http://<服务器IP>:8000`）

---

## 2. 前置依赖安装（root，一次性）

### 2.1 确认系统版本

```bash
cat /etc/os-release | head -3
```

### 2.2 Python 3.11+（conda）

```bash
# 服务器已有 anaconda3，直接创建环境
conda create -n dpush python=3.11 -y
conda activate dpush
python --version
```

### 2.3 Git

```bash
git --version
# 通常已装，没有: sudo yum install -y git
```

---

## 3. 创建部署账户（root，一次性）

```bash
# 3.1 创建用户，禁止直接 SSH 登录
sudo useradd -m -s /bin/bash dpush
sudo passwd dpush

# 3.2 创建项目目录
sudo mkdir -p /opt/data-push-platform
sudo chown -R dpush:dpush /opt/data-push-platform

# 3.3 确认无 sudo 权限
groups dpush          # 只有 dpush，没有 wheel
sudo -l -U dpush      # 应显示 User dpush is not allowed...

# 3.4 允许 systemctl 重启服务（仅此一条）
sudo visudo -f /etc/sudoers.d/dpush
# 添加一行：
#   dpush ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart data-push-api
```

---

## 4. 打通 SSH（本地 Mac → 服务器）

### 4.1 本地 Mac 操作

```bash
# 确认有 SSH key，没有就生成
ls ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519 -C "dpush@your-mac"

# 把公钥拷到服务器
ssh-copy-id dpush@<服务器IP>
# 输入 dpush 的密码

# 测试无密码登录
ssh dpush@<服务器IP> "whoami"    # 应输出 dpush
```

### 4.2 以后直接用当前对话的 SSH 连接

在 Claude Code 里：
```bash
ssh dpush@<服务器IP>
```

或把 IP 写到 `~/.ssh/config`：
```
Host dpush-server
    HostName <服务器IP>
    User dpush
    IdentityFile ~/.ssh/id_ed25519
```

然后直接 `ssh dpush-server`。

---

## 5. 首次部署（dpush 账户操作）

### 5.1 Clone 项目

```bash
ssh dpush@<服务器IP>
cd /opt/data-push-platform

# 如果没装 git：exit 回 root sudo dnf install -y git
git clone https://github.com/nh1571/data-push-platform.git .

# 确认
ls
# 应看到 backend/ frontend/ scripts/ README.md 等
```

### 5.2 后端

```bash
cd /opt/data-push-platform/backend

# 使用 conda 环境（不要创建 venv）
conda activate dpush

# 安装依赖
pip install -e .

# 创建工作目录
mkdir -p data storage

# 生成 Fernet 密钥
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# 复制输出，下面要用
```

### 5.3 创建环境变量文件

```bash
cat > /opt/data-push-platform/backend/.env << 'EOF'
APP_ENV=production
DATABASE_URL=sqlite:///./data/meta.db
EXECUTION_SYNC=true
AUTO_MIGRATE=true
SEED_DEMO_DATA=false
SECRET_KEY=change-me-to-random-string
TOKEN_FERNET_KEY=<上面生成的Fernet密钥>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请改成你自己的密码
STORAGE_ROOT=./storage
EOF
```

### 5.4 验证前端构建产物

```bash
# dist/ 已随 git clone 下来，确认存在
ls /opt/data-push-platform/frontend/dist/
# 应看到 index.html assets/ 等
```

### 5.5 验证后端能起来

```bash
cd /opt/data-push-platform/backend
conda activate dpush

# 手动起一次看看有没有报错
uvicorn app.main:app --host 0.0.0.0 --port 8000 & sleep 5

# 测试
curl http://localhost:8000/health
# {"status":"ok"}

curl -s http://localhost:8000/ | head -20
# 应返回前端 HTML 页面

# 停掉（等会儿用 systemd 管）
kill %1
```

### 5.6 配置 systemd 服务（root 操作）

```bash
# 切回 root
exit
# 或 sudo su

sudo tee /etc/systemd/system/data-push-api.service << 'EOF'
[Unit]
Description=Data Push Platform API
After=network.target

[Service]
Type=simple
User=dpush
Group=dpush
WorkingDirectory=/opt/data-push-platform/backend
Environment=PATH=/opt/anaconda3/envs/dpush/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/opt/anaconda3/envs/dpush/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable data-push-api
sudo systemctl start data-push-api

# 确认状态
sudo systemctl status data-push-api
# Active: active (running)

# 日志
sudo journalctl -u data-push-api -f
```

### 5.7 开放防火墙端口（root）

```bash
# CentOS 7
sudo firewall-cmd --add-port=8000/tcp --permanent
sudo firewall-cmd --reload

# CentOS 8/9
sudo firewall-cmd --add-port=8000/tcp --permanent
sudo firewall-cmd --reload

# 确认
sudo firewall-cmd --list-ports
# 应看到 8000/tcp
```

### 5.8 验收

用浏览器打开 `http://<服务器IP>:8000`

- 应出现「数据推送中台」登录页
- 用 `.env` 里配的账号密码登录
- 能进入管理后台

---

## 6. 创建更新脚本

```bash
# 切回 dpush
ssh dpush@<服务器IP>

cat > /opt/data-push-platform/scripts/server-update.sh << 'SCRIPT'
#!/usr/bin/env bash
# 日常更新：拉代码 → 装后端依赖 → 重启服务
# 前端 dist/ 已在本地构建并随 git 提交，服务器无需 Node
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Git pull..."
git pull origin main

echo "==> Backend deps..."
cd "$ROOT/backend"
source /opt/anaconda3/etc/profile.d/conda.sh
conda activate dpush
pip install -e . -q

echo "==> Restart API..."
sudo systemctl restart data-push-api

echo "==> Done! http://$(hostname -I | awk '{print $1}'):8000"
SCRIPT

chmod +x /opt/data-push-platform/scripts/server-update.sh
```

---

## 7. 日常开发 → 部署 → 测试一回合（完整流程）

### 第一阶段：本地开发

```
本机 Mac → 你正常开发
├── cd /Volumes/Alter/ClaudeCode/claude/data-push-platform
├── 改后端代码（Python）
├── 改前端代码（React/TSX）
├── cd frontend && npm run build  ← 必须！构建 dist/
├── cd backend && pytest -q       ← 有测试就跑
└── git add . && git commit -m "feat: xxx" && git push origin main
```

### 第二阶段：服务器更新

```bash
# 本地终端
ssh dpush@<服务器IP>

cd /opt/data-push-platform
./scripts/server-update.sh

# 输出示例：
# ==> Git pull...
# Already up to date.
# ==> Backend deps...
# ==> Frontend build...
# ✓ built in 12.3s
# ==> Restart API...
# ==> Done! http://10.x.x.x:8000

exit
```

### 第三阶段：功能测试

```
浏览器打开 http://<服务器IP>:8000
│
├── 登录（.env 里配的 admin 账号）
│
├── ① 配数据源
│   └── 新建 → 填 MySQL/Doris 连接 → 「测试连接」确认能通
│
├── ② 配通道（关键：服务器上配真实钉钉凭证）
│   └── 投递配置 → 通道 → 新建
│       ├── 类型：钉钉 Webhook
│       ├── 名称：生产告警群
│       ├── access_token：钉钉机器人 token
│       └── 测试通道 → 钉钉应收到测试消息  ← 第一个里程碑
│
├── ③ 配通讯录
│   └── 投递配置 → 通讯录 → 新建身份
│       ├── 个人 OTO：填钉钉 userid
│       ├── 群：填群 chatid
│       └── Webhook：填 webhook url
│
├── ④ 配推送目标
│   └── 投递配置 → 推送目标 → 新建
│       ├── 选通道 + 选收件人 → 名称自动生成
│       └── 保存
│
├── ⑤ 配推送任务
│   └── 任务管理 → 新建
│       ├── 选数据源
│       ├── 写 SQL（可含 {{biz_date}} 参数）
│       ├── 选推送目标
│       ├── 配渲染模板
│       └── 保存
│
├── ⑥ 手动推送测试 ← 第二个里程碑
│   └── 打开任务 → 「立即运行」
│       ├── 填运行参数（biz_date 等）
│       └── 钉钉收到消息！
│
├── ⑦ 调度测试
│   └── 编辑任务 → 开启定时调度 → 配 Cron
│       └── 等几分钟，看执行记录自动产生
│
└── ⑧ API 触发测试
    └── 创建 API Token（系统页）
        └── curl 触发验证
```

### 测试关键里程碑

| 里程碑 | 验证方法 | 通过标志 |
|--------|----------|----------|
| **M1** | 通道测试连接 | 钉钉收到测试消息 |
| **M2** | 推送任务手动运行 | 钉钉收到 SQL 查询结果渲染的推送消息 |
| **M3** | Cron 调度自动触发 | 执行记录出现 `trigger_type=schedule` 的 JobRun |
| **M4** | API Token HTTP 触发 | `curl POST /push-jobs/{id}/run` 返回 success |

---

## 8. 日常操作速查

```bash
# === 服务器上 ===

# 更新代码
/opt/data-push-platform/scripts/server-update.sh

# 看后端日志
sudo journalctl -u data-push-api -f

# 看最近 50 行
sudo journalctl -u data-push-api -n 50

# 重启
sudo systemctl restart data-push-api

# 查看状态
sudo systemctl status data-push-api

# === 本地 Mac ===

# SSH 到服务器
ssh dpush@<服务器IP>

# 一键更新+退出
ssh dpush@<服务器IP> "/opt/data-push-platform/scripts/server-update.sh"

# 服务器 API 快速验证
curl http://<服务器IP>:8000/health
```

---

## 9. 常见问题

### 9.1 push 到 GitHub 需要输入密码

本地没用 SSH key 或没配 GitHub 的 key。

```bash
# 本地 Mac
ssh -T git@github.com
# 应输出: Hi nh1571! You've successfully authenticated...

# 如果没有配
gh auth setup-git
```

### 9.2 服务器 git pull 需要密码

GitHub 公开仓库不需要密码。但如果是私有仓库：

```bash
# 用 gh CLI
gh auth login
```

或手动配 deploy key。

### 9.3 `npm run build` 失败

常见：新增包没 `npm install`。`server-update.sh` 里已经有 `npm install`。

### 9.4 服务起不来

```bash
# 看完整日志
sudo journalctl -u data-push-api -n 100 --no-pager

# 手动试
cd /opt/data-push-platform/backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
# 看报错信息
```

### 9.5 浏览器连不上

```bash
# 服务器上确认进程在
ps aux | grep uvicorn

# 确认端口在监听
ss -tlnp | grep 8000

# 确认防火墙开了
sudo firewall-cmd --list-ports

# 本地 Mac 测试
curl http://<服务器IP>:8000/health
```

### 9.6 打了端口 8000 还是不通

阿里云/腾讯云安全组没放行。去云控制台 → 安全组 → 入方向加一条 8000 TCP。

---

## 10. 后续（先不做、需要时加）

| 需求 | 方案 |
|------|------|
| 部署 https | 前面加 nginx + Let's Encrypt certbot |
| 自动部署（push 即部署） | GitHub Actions → SSH 到服务器触发 update |
| 数据库升级为 MySQL | 改 DATABASE_URL，alembic migrate |
| 异步 Worker | 加 Redis + Celery Worker，`EXECUTION_SYNC=false` |
| 多副本/高可用 | 前面加 nginx 负载均衡 |
