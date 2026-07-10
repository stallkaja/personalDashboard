<#
.SYNOPSIS
  Installs the personal dashboard backend and frontend as Windows services (via NSSM)
  so they start automatically at machine boot and restart on crash.

.DESCRIPTION
  Creates two auto-start services:
    Dashboard-Backend   -> python listener.py        (Flask/SocketIO on 0.0.0.0:8132)
    Dashboard-Frontend  -> node serve build/         (static site on 0.0.0.0:3000)

  The backend is configured to start after MySQL97. The Cloudflared tunnel is left to
  its own existing 'Cloudflared' service (set to Automatic and started here).

  Re-running this script is safe: existing services are removed and recreated.

.USAGE
  Run from an elevated (Administrator) PowerShell:
    .\install-services.ps1
  (When launched via the helper, you'll get a single UAC prompt.)
#>

[CmdletBinding()]
param(
    [string]$RepoRoot   = $PSScriptRoot,
    [string]$Nssm       = "C:\ProgramData\nssm\nssm.exe",
    [string]$Python     = "C:\Users\james\AppData\Local\Python\pythoncore-3.14-64\python.exe",
    [string]$Node       = "C:\Program Files\nodejs\node.exe",
    [string]$ServeMain  = (Join-Path $PSScriptRoot "node_modules\serve\build\main.js"),
    [string]$MySqlSvc   = "MySQL97"
)

$ErrorActionPreference = "Stop"

# --- must be elevated ---
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator."
    exit 1
}

$LogDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
try { Start-Transcript -Path (Join-Path $LogDir "service-setup.log") -Force | Out-Null } catch { Write-Host "(transcript unavailable: $($_.Exception.Message))" }

function Write-Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }

try {
    # --- sanity checks ---
    Write-Step "Validating prerequisites"
    foreach ($p in @($Nssm, $Python, $Node, $ServeMain, (Join-Path $RepoRoot "listener.py"))) {
        if (-not (Test-Path $p)) { throw "Required path not found: $p" }
        Write-Host "ok: $p"
    }
    $BuildDir = Join-Path $RepoRoot "FE\personal_dashboard\build"
    if (-not (Test-Path $BuildDir)) { throw "Frontend build not found: $BuildDir (run a build first)" }
    Write-Host "ok: $BuildDir"

    # --- clear any stale PM2 daemons so they don't fight over ports/pipes ---
    Write-Step "Clearing stale PM2 daemons (if any)"
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -match 'pm2' -or $_.CommandLine -match '\.pm2' } |
        ForEach-Object {
            Write-Host "killing stale pm2 node pid=$($_.ProcessId)"
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }

    # --- (re)create a service ---
    function New-NssmService {
        param(
            [string]$Name, [string]$Program, [string]$Arguments,
            [string]$DisplayName, [string]$Description, [string]$DependsOn
        )
        Write-Step "Installing service: $Name"

        if (Get-Service -Name $Name -ErrorAction SilentlyContinue) {
            Write-Host "existing service found - removing first"
            # nssm writes to stderr when the service is already stopped; under
            # ErrorActionPreference=Stop that would terminate us, so suppress it.
            $eap = $ErrorActionPreference; $ErrorActionPreference = 'SilentlyContinue'
            & $Nssm stop   $Name 2>$null | Out-Null
            Start-Sleep -Milliseconds 800
            & $Nssm remove $Name confirm 2>$null | Out-Null
            Start-Sleep -Milliseconds 1200
            $ErrorActionPreference = $eap
        }

        & $Nssm install $Name $Program $Arguments
        & $Nssm set $Name AppDirectory   $RepoRoot
        & $Nssm set $Name DisplayName     $DisplayName
        & $Nssm set $Name Description      $Description
        & $Nssm set $Name Start           SERVICE_AUTO_START
        # restart on exit, but throttle so a crash-loop backs off
        & $Nssm set $Name AppExit Default Restart
        & $Nssm set $Name AppThrottle     5000
        & $Nssm set $Name AppRestartDelay 3000
        # rotating stdout/stderr logs
        & $Nssm set $Name AppStdout       (Join-Path $LogDir "svc-$Name-out.log")
        & $Nssm set $Name AppStderr       (Join-Path $LogDir "svc-$Name-error.log")
        & $Nssm set $Name AppRotateFiles  1
        & $Nssm set $Name AppRotateOnline 1
        & $Nssm set $Name AppRotateBytes  10485760

        if ($DependsOn) {
            # native, reliable dependency wiring (start after $DependsOn)
            & sc.exe config $Name depend= $DependsOn | Out-Null
            Write-Host "dependency set: $Name depends on $DependsOn"
        }
    }

    New-NssmService -Name "Dashboard-Backend" `
        -Program $Python -Arguments "listener.py" `
        -DisplayName "Personal Dashboard Backend" `
        -Description "Flask/SocketIO API for the personal dashboard (port 8132)." `
        -DependsOn $MySqlSvc

    New-NssmService -Name "Dashboard-Frontend" `
        -Program $Node -Arguments "`"$ServeMain`" -s -l tcp://0.0.0.0:3000 FE/personal_dashboard/build" `
        -DisplayName "Personal Dashboard Frontend" `
        -Description "Static file server for the personal dashboard build (port 3000)."

    # --- start the dashboard services now (don't abort if one fails) ---
    Write-Step "Starting services"
    foreach ($svc in 'Dashboard-Backend', 'Dashboard-Frontend') {
        try {
            Start-Service $svc -ErrorAction Stop
            Write-Host "started $svc"
        } catch {
            Write-Host "FAILED to start $svc : $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    # --- if backend didn't come up, prove whether SYSTEM can launch this Python at all ---
    if ((Get-Service Dashboard-Backend).Status -ne 'Running') {
        $ErrorActionPreference = 'SilentlyContinue'  # native diag tools write to stderr
        Write-Step "Diagnostic: can LocalSystem launch python.exe?"
        $probe = Join-Path $LogDir "system-python-probe.txt"
        Remove-Item $probe -ErrorAction SilentlyContinue
        schtasks /create /tn "DashPyProbe" /tr "`"$Python`" -c `"import sys;open(r'$probe','w').write('OK '+sys.version)`"" /sc once /st 00:00 /ru SYSTEM /rl HIGHEST /f | Out-Null
        schtasks /run /tn "DashPyProbe" | Out-Null
        Start-Sleep -Seconds 4
        schtasks /delete /tn "DashPyProbe" /f | Out-Null
        if (Test-Path $probe) {
            Write-Host "SYSTEM CAN run python: $(Get-Content $probe)"
        } else {
            Write-Host "SYSTEM CANNOT run this python.exe (no probe output) -> services must run as a user account."
        }
        Write-Step "Backend failure detail (sc + events)"
        sc.exe start Dashboard-Backend 2>&1 | Out-String | Write-Host
        Get-WinEvent -FilterHashtable @{LogName='System'; StartTime=(Get-Date).AddMinutes(-3)} -ErrorAction SilentlyContinue |
            Where-Object { $_.Message -match 'Dashboard-Backend' } |
            Select-Object -First 4 TimeCreated, Id, Message | Format-List | Out-String | Write-Host
    }

    # --- ensure the existing Cloudflared tunnel service is on and running ---
    Write-Step "Cloudflared tunnel service"
    $cf = Get-Service -Name "Cloudflared" -ErrorAction SilentlyContinue
    if ($cf) {
        Set-Service -Name "Cloudflared" -StartupType Automatic
        if ($cf.Status -ne 'Running') {
            try { Start-Service "Cloudflared" -ErrorAction Stop; Write-Host "Cloudflared started" }
            catch { Write-Host "WARNING: Cloudflared failed to start (it has been crash-looping; needs separate attention): $($_.Exception.Message)" -ForegroundColor Yellow }
        }
        Write-Host "Cloudflared: $((Get-Service Cloudflared).Status), StartType=$((Get-Service Cloudflared).StartType)"
    } else {
        Write-Host "No 'Cloudflared' service present - skipping (manage the tunnel yourself)."
    }

    # --- report ---
    Write-Step "Status"
    Start-Sleep -Seconds 6
    Get-Service Dashboard-Backend, Dashboard-Frontend, Cloudflared -ErrorAction SilentlyContinue |
        Format-Table Name, Status, StartType -Auto | Out-String | Write-Host

    Write-Step "Listening ports"
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -in 3000, 8132 } |
        Select-Object LocalAddress, LocalPort, OwningProcess |
        Format-Table -Auto | Out-String | Write-Host

    Write-Host "`nDONE: services installed and started." -ForegroundColor Green
}
catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    try { Stop-Transcript | Out-Null } catch {}
    exit 1
}
try { Stop-Transcript | Out-Null } catch {}
