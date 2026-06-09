@echo off
setlocal

set PYTHON_PATH=D:\Program Files\Anaconda\python.exe
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo ========================================
echo   Starting Flask Server
echo ========================================
echo.

echo [Step 1] Checking Python ...
if exist "%PYTHON_PATH%" (
    echo   Python found at: "%PYTHON_PATH%"
    set PYTHON_CMD="%PYTHON_PATH%"
) else (
    echo   Python not found at "%PYTHON_PATH%"
    echo   Trying 'python' from system PATH ...
    where python >nul 2>&1
    if %errorlevel%==0 (
        set PYTHON_CMD=python
        echo   Python found in system PATH.
    ) else (
        echo.
        echo [ERROR] Python is not installed or not found.
        echo Please install Python or add it to the system PATH.
        echo.
        pause
        exit /b 1
    )
)
echo.

echo [Step 2] Checking Flask ...
%PYTHON_CMD% -c "import flask; print(flask.__version__)" >nul 2>&1
if %errorlevel%==0 (
    echo   Flask is already installed.
) else (
    echo   Flask is not installed. Installing dependencies ...
    %PYTHON_CMD% -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Failed to install requirements.
        echo.
        pause
        exit /b 1
    )
    echo   Dependencies installed successfully.
)
echo.

echo [Step 3] Opening browser to http://localhost:8000 ...
start http://localhost:8000
echo.

echo [Step 4] Starting Flask server on http://localhost:8000 ...
echo   Server command: %PYTHON_CMD% -m flask run --host=0.0.0.0 --port=8000
echo.
echo ========================================
echo   Press Ctrl+C to stop the server
echo ========================================
echo.

%PYTHON_CMD% -m flask run --host=0.0.0.0 --port=8000

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server failed to start (exit code: %errorlevel%).
    echo.
    pause
)

endlocal
