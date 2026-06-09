#!/bin/bash
# ===========================================================
#  ReviewScope · Linux 一键启动脚本
#  在终端运行：./启动.sh
# ===========================================================

cd "$(dirname "$0")"

echo "=============================================="
echo "  ReviewScope 评测工作台 · Linux 启动器"
echo "=============================================="
echo ""

if command -v python3 >/dev/null 2>&1; then
    PY=python3
elif command -v python >/dev/null 2>&1; then
    PY=python
else
    echo "[X] 未检测到 Python 3。"
    echo "Debian/Ubuntu: sudo apt-get install python3"
    echo "RHEL/CentOS:   sudo yum install python3"
    echo "Arch:           sudo pacman -S python"
    echo ""
    read -n 1 -s -r -p "按任意键退出"
    exit 1
fi

echo "[i] 启动本地 HTTP 服务器：http://localhost:8000"
echo "[i] 按 Ctrl + C 可停止服务器。"
echo ""

# --- 尝试自动打开浏览器（如果系统里有 xdg-open）---
if command -v xdg-open >/dev/null 2>&1; then
    ( sleep 1 && xdg-open "http://localhost:8000" >/dev/null 2>&1 ) &
fi

$PY -m http.server 8000
