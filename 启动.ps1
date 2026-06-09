# ===========================================================
#  ReviewScope · PowerShell 一键启动脚本
#  用法：右键本文件 → "使用 PowerShell 运行"，
#       或在 PowerShell 里执行：.\启动.ps1
# ===========================================================

$ErrorActionPreference = "Stop"

# 切到脚本所在目录
Set-Location $PSScriptRoot

Write-Host "================================================"
Write-Host "  ReviewScope - starting local server"
Write-Host "================================================"
Write-Host ""
Write-Host "Target Python: D:\Program Files\Anaconda\python.exe"
Write-Host "Working dir  : $PWD"
Write-Host "URL          : http://localhost:8000"
Write-Host ""

# 自动打开浏览器（等 1 秒让 server 起来）
Start-Sleep -Seconds 1
Start-Process "http://localhost:8000"

# 调用 Anaconda Python 启动本地 HTTP server
# 注意：PowerShell 调用含空格的可执行文件必须加 & 前缀
& "D:\Program Files\Anaconda\python.exe" -m http.server 8000

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] Python 启动失败，请确认路径：D:\Program Files\Anaconda\python.exe"
    Write-Host ""
}

Write-Host ""
Write-Host "Server stopped. Press Enter to close."
$null = Read-Host
