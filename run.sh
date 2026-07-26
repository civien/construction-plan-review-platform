#!/usr/bin/env bash
# 启动施工方案审查平台（后端 uvicorn，并同源托管已构建的前端 dist）
# 用法：
#   bash run.sh          # 后台启动（脱离终端，关闭终端仍运行），写入 .pid
#   bash run.sh stop     # 停止
#   bash run.sh fg       # 前台运行（Ctrl+C 退出）
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/backend"
PY="${HOME}/.workbuddy/binaries/python/envs/default/bin/python3"
PIDFILE="$HERE/.server.pid"
LOG="$HERE/server.log"

stop() {
  if [[ -f "$PIDFILE" ]]; then
    PID="$(cat "$PIDFILE")"
    kill "$PID" 2>/dev/null && echo "已停止进程 $PID" || echo "进程 $PID 不存在"
    rm -f "$PIDFILE"
  else
    echo "未找到 .pid，尝试按端口结束…"
    pkill -f "uvicorn app:app" 2>/dev/null && echo "已结束 uvicorn" || echo "无运行中的 uvicorn"
  fi
}

case "$1" in
  stop) stop; exit 0 ;;
  fg)
    echo "前台运行：http://127.0.0.1:8000  (Ctrl+C 退出)"
    exec "$PY" -m uvicorn app:app --host 127.0.0.1 --port 8000
    ;;
  *)
    # 端口占用检测：避免重复启动导致 bind 失败（address already in use）
    if "$PY" -c "import socket,sys; s=socket.socket(); s.settimeout(1); sys.exit(0 if s.connect_ex(('127.0.0.1',8000))==0 else 1)" 2>/dev/null; then
      if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "服务已在运行（本脚本 PID $(cat "$PIDFILE")）：http://127.0.0.1:8000"
      else
        OCC="$(lsof -nP -iTCP:8000 -sTCP:LISTEN -t 2>/dev/null | head -1)"
        echo "端口 8000 已被其他进程占用（PID ${OCC:-未知}），服务实际已在运行：http://127.0.0.1:8000"
        echo "若要用本脚本接管，请先结束该进程：bash run.sh stop   或   kill ${OCC}"
      fi
      exit 0
    fi
    if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "服务已在运行（PID $(cat "$PIDFILE")）：http://127.0.0.1:8000"
      exit 0
    fi
    echo "后台启动中：http://127.0.0.1:8000  (日志见 $LOG，bash run.sh stop 停止)"
    # macOS 无 setsid：用 nohup ... & + disown 脱离终端；重定向 stdin 避免挂起
    nohup "$PY" -m uvicorn app:app --host 127.0.0.1 --port 8000 > "$LOG" 2>&1 < /dev/null &
    PID=$!
    disown "$PID" 2>/dev/null || true
    echo "$PID" > "$PIDFILE"
    sleep 2
    curl -s -o /dev/null -w "健康检查 http=%{http_code}\n" --max-time 5 http://127.0.0.1:8000/api/health || echo "启动后健康检查失败，请查看 $LOG"
    ;;
esac
