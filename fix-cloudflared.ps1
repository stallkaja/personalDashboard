<#
.SYNOPSIS
  Repairs the existing 'Cloudflared' Windows service, which was registered with no
  arguments (just cloudflared.exe) and therefore exited immediately / crash-looped.

  Sets the service ImagePath to actually run the named tunnel using the config in
  C:\ProgramData\cloudflared, with an info-level logfile so the connection can be
  verified. Run elevated.
#>
$ErrorActionPreference = "Stop"

$exe     = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$config  = "C:\ProgramData\cloudflared\config.yml"
$logfile = "C:\ProgramData\cloudflared\cloudflared.log"
$svc     = "Cloudflared"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Must run as Administrator."; exit 1
}

foreach ($p in @($exe, $config)) {
    if (-not (Test-Path $p)) { Write-Error "Missing: $p"; exit 1 }
}

# Correct command line: global flags BEFORE the 'tunnel run' subcommand.
$imagePath = "`"$exe`" --config `"$config`" --logfile `"$logfile`" --loglevel info tunnel run"
Write-Host "Setting ImagePath to:`n  $imagePath"

$key = "HKLM:\SYSTEM\CurrentControlSet\Services\$svc"
Set-ItemProperty -Path $key -Name ImagePath -Value $imagePath

# Make sure NetworkService (the service account) can read the credentials + config.
& icacls "C:\ProgramData\cloudflared" /grant "NT AUTHORITY\NetworkService:(OI)(CI)(R)" /T | Out-Null

Set-Service -Name $svc -StartupType Automatic

Write-Host "Restarting $svc ..."
Stop-Service $svc -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Remove-Item $logfile -ErrorAction SilentlyContinue
Start-Service $svc
Start-Sleep -Seconds 10

Write-Host "`n=== Service status ==="
Get-Service $svc | Format-Table Name, Status, StartType -Auto | Out-String | Write-Host

Write-Host "=== cloudflared log tail ==="
if (Test-Path $logfile) {
    Get-Content $logfile -Tail 25 | Out-String | Write-Host
} else {
    Write-Host "(no logfile yet)"
}
