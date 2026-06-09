@echo off
setlocal

REM ===== ReviewScope 一键启动（Windows）=====
REM  用法：双击本文件即可

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

REM --- 1. 定位 Python ---
set PYTHON_PATH=D:\Program Files\Anaconda\python.exe
echo ============================================================
echo   ReviewScope - Flask Backend
echo ============================================================
echo.
echo [1/3] 正在查找 Python ...

if exist "%PYTHON_PATH%" (
    echo       已找到: %PYTHON_PATH%
    set "PYTHON_CMD=%PYTHON_PATH%"
) else (
    echo       未找到 "%PYTHON_PATH%"，尝试系统 PATH ...
    where python >nul 2>&1
    if %errorlevel%==0 (
        echo       已找到（系统 PATH）
        set "PYTHON_CMD=python"
    ) else (
        echo.
        echo [错误] 找不到 Python。请确认已安装 Python 3。
        echo.
        pause
        exit /b 1
    )
)
echo.

REM --- 2. 检查依赖 ---
echo [2/3] 检查 Python 依赖 ...
"%PYTHON_CMD%" -c "import flask, requests" >nul 2>&1
if %errorlevel%==0 (
    echo       依赖已就绪
) else (
    echo       缺少依赖，正在安装 ...
    "%PYTHON_CMD%" -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo.
        echo [错误] 依赖安装失败
        echo.
        pause
        exit /b 1
    )
    echo       安装完成
)
echo.

REM --- 3. 打开浏览器并启动 Flask ---
echo [3/3] 启动服务器（端口 8000）...
echo       启动后请在浏览器打开: http://localhost:8000
echo       关闭本窗口或按 Ctrl+C 即可停止
echo.
echo ============================================================

REM 先启动 Flask（阻塞方式），同时 2 秒后用 start 打开浏览器
start "" cmd /c "timeout /t 2 >nul && start http://localhost:8000"

"%PYTHON_CMD%" app.py

if %errorlevel% neq 0 (
    echo.
    echo [错误] 服务器启动失败（退出码: %errorlevel%）
    echo.
    pause
)

endlocal
