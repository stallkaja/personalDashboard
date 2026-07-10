<#
.SYNOPSIS
  Single entry point for managing the dashboard's backend and frontend processes via PM2.

.USAGE
  .\manage.ps1 start              # start both (or: start backend | start frontend)
  .\manage.ps1 stop                # stop both (or: stop backend | stop frontend)
  .\manage.ps1 restart             # restart both (or: restart backend | restart frontend)
  .\manage.ps1 status              # show pm2 process table
  .\manage.ps1 logs                # tail both logs live
  .\manage.ps1 logs backend        # tail backend log live
  .\manage.ps1 logs frontend       # tail frontend log live
  .\manage.ps1 rebuild-frontend    # npm run build + restart frontend
  .\manage.ps1 delete              # remove both from pm2 entirely
#>

param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet("start", "stop", "restart", "status", "logs", "rebuild-frontend", "delete")]
    [string]$Command,

    [Parameter(Position = 1)]
    [ValidateSet("backend", "frontend", "")]
    [string]$Target = ""
)

$RepoRoot = $PSScriptRoot
$BackendName = "weather-backend"
$FrontendName = "dashboard-frontend"

function Resolve-Target {
    param([string]$Target)
    switch ($Target) {
        "backend" { return $BackendName }
        "frontend" { return $FrontendName }
        default { return $null }
    }
}

switch ($Command) {
    "start" {
        $name = Resolve-Target $Target
        if ($name) {
            pm2 start "$RepoRoot\ecosystem.config.js" --only $name
        } else {
            pm2 start "$RepoRoot\ecosystem.config.js"
        }
    }
    "stop" {
        $name = Resolve-Target $Target
        if ($name) { pm2 stop $name } else { pm2 stop $BackendName, $FrontendName }
    }
    "restart" {
        $name = Resolve-Target $Target
        if ($name) { pm2 restart $name } else { pm2 restart $BackendName, $FrontendName }
    }
    "status" {
        pm2 list
    }
    "logs" {
        $name = Resolve-Target $Target
        if ($name) { pm2 logs $name } else { pm2 logs $BackendName, $FrontendName }
    }
    "rebuild-frontend" {
        & "$RepoRoot\redeploy-frontend.ps1"
    }
    "delete" {
        pm2 delete $BackendName, $FrontendName
    }
}
