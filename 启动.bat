@echo off
REM ===========================================================
REM  ReviewScope · Windows 一键启动脚本（极简版）
REM  适配：D:\Program Files\Anaconda\python.exe
REM ===========================================================

cd /d "%~dp0"

echo ================================================
echo   ReviewScope - starting local server
echo ================================================
echo.
echo Target Python: D:\Program Files\Anaconda\python.exe
echo Working dir  : %cd%
echo URL          : http://localhost:8000
echo.

REM --- 延迟 1 秒后自动打开浏览器 ---
ping 127.0.0.1 -n 2 > nul
start "" "http://localhost:8000"

REM --- 直接用完整路径启动 Python HTTP server（含空格必须加双引号）---
"D:\Program Files\Anaconda\python.exe" -m http.server 8000

if errorlevel 1 (
    echo.
    echo [ERROR] Python 启动失败。请确认路径正确：D:\Program Files\Anaconda\python.exe
    echo.
)

echo.
echo Server stopped. Press any key to close this window.
pause > nul
