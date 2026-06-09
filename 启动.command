#!/bin/bash
# ===========================================================
#  ReviewScope · macOS 一键启动脚本
#  双击本文件（或在终端运行 ./启动.command ）即可。
# ===========================================================

cd "$(dirname "$0")"

echo "=============================================="
echo "  ReviewScope 评测工作台 · macOS 启动器"
echo "=============================================="
echo ""

# --- 优先尝试 python3，失败则 python ---
if command -v python3 >/dev/null 2>&1; then
    PY=python3
elif command -v python >/dev/null 2>&1; then
    PY=python
else
    echo "[X] 未检测到 Python 3。"
    echo "请先安装： https://www.python.org/downloads/"
    echo ""
    read -n 1 -s -r -p "按任意键退出"
    exit 1
fi

echo "[i] 启动本地 HTTP 服务器：http://localhost:8000"
echo "[i] 若浏览器未自动打开，请手动访问上方地址。"
echo "[i] 按 Ctrl + C 可停止服务器。"
echo ""

# --- 自动打开浏览器（延迟 1 秒，给 server 留点时间）---
( sleep 1 && open "http://localhost:8000" ) &

$PY -m http.server 8000
