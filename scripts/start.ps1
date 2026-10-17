# Resonix - Production Start Script
# Runs single-origin Fastify server (API + built React frontend) on 127.0.0.1:3000
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

Set-Location $projectRoot

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  STARTING RESONIX AUDIOPHILE STREAMING SERVER" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

if (-not (Test-Path "$projectRoot\server\dist\index.js")) {
    Write-Host "[INFO] Server build not found. Running build..." -ForegroundColor Yellow
    npm run build
}

Write-Host "[OK] Listening on http://127.0.0.1:3000" -ForegroundColor Green
Write-Host "[INFO] To stream to other devices via Tailscale:" -ForegroundColor DarkGray
Write-Host "       tailscale serve --bg http://127.0.0.1:3000" -ForegroundColor DarkGray
Write-Host "======================================================`n" -ForegroundColor Cyan

node server/dist/index.js
