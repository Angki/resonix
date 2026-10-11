# Black Library - Optional Windows Task Scheduler Startup Task
# Run with administrator privileges to register Black Library at system logon.
# Usage:
#   .\scripts\install-service.ps1           (to register startup task)
#   .\scripts\install-service.ps1 -Uninstall (to remove startup task)

param (
    [switch]$Uninstall
)

$TaskName = "BlackLibraryAudioServer"

if ($Uninstall) {
    Write-Host "Removing Scheduled Task: $TaskName..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "[OK] Task removed successfully." -ForegroundColor Green
    exit 0
}

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  BLACK LIBRARY - TASK SCHEDULER REGISTRATION" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$nodePath = (Get-Command node).Source

$Action = New-ScheduledTaskAction -Execute $nodePath -Argument "server/dist/index.js" -WorkingDirectory $projectRoot
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0

try {
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Runs Black Library Audio Streaming Server" -User $env:USERNAME
    Write-Host "`n[OK] Scheduled Task '$TaskName' registered successfully!" -ForegroundColor Green
    Write-Host "Black Library will automatically run when you log in to Windows." -ForegroundColor Green
    Write-Host "To remove: .\scripts\install-service.ps1 -Uninstall" -ForegroundColor DarkGray
} catch {
    Write-Host "[ERROR] Failed to register scheduled task: $_" -ForegroundColor Red
}
