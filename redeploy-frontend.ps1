Set-Location "$PSScriptRoot\FE\personal_dashboard"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed, not restarting dashboard-frontend."
    exit 1
}
pm2 restart dashboard-frontend
Write-Host "Frontend rebuilt and restarted."
