<#
.SYNOPSIS
  Point the production host at a different branch (production main, or a
  fork / experiment branch) on demand, then redeploy.

.USAGE
  .\switch-branch.ps1 main                          # back to production main
  .\switch-branch.ps1 experiment/left-nav-refactor  # serve an experiment branch
  .\switch-branch.ps1 -Status                        # show the current pin + live commit

  Writes the chosen branch to deploy-target.local (host-only, gitignored) so the
  pin survives future auto-deploys, then runs deploy.ps1 to fetch, hard-reset,
  rebuild what changed, and restart the services.

  NOTE: while pinned to a branch other than main, pushes to main will NOT go live
  until you switch back with `.\switch-branch.ps1 main`.
#>
[CmdletBinding(DefaultParameterSetName = "Switch")]
param(
    [Parameter(Position = 0, Mandatory = $true, ParameterSetName = "Switch")]
    [string]$Branch,

    [Parameter(Mandatory = $true, ParameterSetName = "Status")]
    [switch]$Status,

    [string]$Repo = $PSScriptRoot
)

$GIT = "C:\Program Files\Git\cmd\git.exe"
$TargetFile = Join-Path $Repo "deploy-target.local"

function Get-Pin {
    if (Test-Path $TargetFile) {
        $p = (Get-Content $TargetFile -Raw -ErrorAction SilentlyContinue).Trim()
        if ($p) { return $p }
    }
    return "main (default)"
}

if ($Status) {
    $head = (& $GIT -C $Repo rev-parse --short HEAD 2>$null)
    $subject = (& $GIT -C $Repo log -1 --format=%s 2>$null)
    Write-Host "Pinned branch : $(Get-Pin)"
    Write-Host "Live commit   : $head  $subject"
    return
}

$Branch = $Branch.Trim()

# Confirm the branch exists on origin before pinning, so the host is never left
# pointed at a branch that can't be fetched.
& $GIT -C $Repo fetch origin --quiet 2>$null
$exists = (& $GIT -C $Repo ls-remote --heads origin $Branch)
if (-not $exists) {
    Write-Host "Branch '$Branch' was not found on origin. Available branches:" -ForegroundColor Red
    & $GIT -C $Repo ls-remote --heads origin |
        ForEach-Object { ($_ -split "refs/heads/")[-1] } |
        Sort-Object |
        ForEach-Object { Write-Host "  $_" }
    exit 1
}

Write-Host "Pinning host to branch: $Branch"
Set-Content -Path $TargetFile -Value $Branch -Encoding ascii -NoNewline

# Redeploy from the newly pinned branch. deploy.ps1 reads DEPLOY_TOKEN from the
# environment when present (CI); by hand it uses the machine's git credentials.
& (Join-Path $Repo "deploy.ps1") -Branch $Branch
exit $LASTEXITCODE
