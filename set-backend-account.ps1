<#
.SYNOPSIS
  Make the Dashboard-Backend service log on as your Windows user account instead of
  LocalSystem, so it can reach your network video share (\\192.168.1.20\D\Videos)
  using your saved credentials - the way it worked under PM2.

.USAGE
  Run in an ELEVATED PowerShell:
    .\set-backend-account.ps1
  You'll be prompted for your Windows password. It is used only to configure the
  service on this machine and is not stored or transmitted anywhere else.
#>
$ErrorActionPreference = "Stop"

$nssm    = "C:\ProgramData\nssm\nssm.exe"
$service = "Dashboard-Backend"
$account = ".\$env:USERNAME"   # local account running this elevated shell (james)

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Please run this from an elevated (Administrator) PowerShell."; exit 1
}
if (-not (Test-Path $nssm)) { Write-Error "nssm not found at $nssm"; exit 1 }

Write-Host "Configuring service '$service' to log on as: $account" -ForegroundColor Cyan
$secure = Read-Host "Enter the Windows password for $account" -AsSecureString
$plain  = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

try {
    # nssm grants the 'Log on as a service' right and sets the account+password.
    & $nssm set $service ObjectName $account $plain
    if ($LASTEXITCODE -ne 0) { throw "nssm failed to set the service account (check the password)." }

    Write-Host "Restarting $service ..."
    Restart-Service $service -ErrorAction Stop
    Start-Sleep -Seconds 6

    $svc = Get-Service $service
    $acct = (sc.exe qc $service | Select-String "SERVICE_START_NAME").ToString().Split(":")[1].Trim()
    Write-Host "`nStatus: $($svc.Status)  |  Runs as: $acct" -ForegroundColor Green
    Write-Host "Backend listening on 8132: " -NoNewline
    Write-Host ((Get-NetTCPConnection -State Listen -LocalPort 8132 -ErrorAction SilentlyContinue | Measure-Object).Count -ge 1)

    Write-Host "`nDone. Reload the Videos page in the dashboard - your library should now load." -ForegroundColor Cyan
}
finally {
    # scrub the plaintext password from memory
    $plain = $null
    [GC]::Collect()
}
