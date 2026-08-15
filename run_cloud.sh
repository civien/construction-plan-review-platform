#!/usr/bin/env bash
# Cloud Studio 部署启动脚本
# 适用：Cloud Studio 的 Linux 工作空间（从 Git 导入本仓库后，在终端执行 bash run_cloud.sh）
# 与本地 run.sh 的区别：使用系统 python3、监听 0.0.0.0（供 Cloud Studio 端口预览访问）
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/backend"

echo "== 安装 Python 依赖 =="
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt

# 前端 dist 已随仓库入库，后端会同源托管，无需构建即可使用。
# 如需重新构建前端（需 Node 环境）：
#   cd ../frontend && npm install && npm run build

echo "== 启动服务（0.0.0.0:8000，Cloud Studio 端口预览可访问）=="
exec python3 -m uvicorn app:app --host 0.0.0.0 --port 8000
