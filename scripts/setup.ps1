# Resonix - Setup & Verification Script
# Run in PowerShell: .\scripts\setup.ps1

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  RESONIX - SETUP & DEPENDENCY VERIFICATION" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# Check Node.js
try {
    $nodeVersion = node -v
    Write-Host "[OK] Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js is not found on PATH. Please install Node.js 20+ LTS." -ForegroundColor Red
    exit 1
}

# Check FFmpeg
try {
    $ffmpegVersion = ffmpeg -version | Select-Object -First 1
    Write-Host "[OK] FFmpeg detected: $ffmpegVersion" -ForegroundColor Green
} catch {
    Write-Host "[WARN] FFmpeg was not detected on PATH. Direct streaming will work, but transcoding fallback will be unavailable until FFmpeg is installed." -ForegroundColor Yellow
}

# Check Tailscale
try {
    $tsVersion = tailscale version | Select-Object -First 1
    Write-Host "[OK] Tailscale detected: $tsVersion" -ForegroundColor Green
} catch {
    Write-Host "[INFO] Tailscale not detected on PATH. If you plan to stream across your tailnet, please install Tailscale." -ForegroundColor DarkGray
}

Write-Host "`n--> Installing NPM packages..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] npm install failed." -ForegroundColor Red
    exit 1
}

Write-Host "`n--> Initializing SQLite Database and Prisma Client..." -ForegroundColor Yellow
npm run db:generate
npm run db:migrate

Write-Host "`n--> Building Production Frontend & Backend..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed." -ForegroundColor Red
    exit 1
}

Write-Host "`n======================================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETE!" -ForegroundColor Green
Write-Host "  To run development server:  .\scripts\dev.ps1" -ForegroundColor Cyan
Write-Host "  To run production server:   .\scripts\start.ps1" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Green
