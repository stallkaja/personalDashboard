<#
.SYNOPSIS
  Deploy the dashboard from GitHub onto this machine. Invoked by the GitHub
  Actions self-hosted runner on every push to main (see .github/workflows/deploy.yml),
  and safe to run by hand.

  Mirrors origin/main into the live repo, then rebuilds / restarts ONLY what changed:
    - requirements.txt changed -> pip install
    - frontend package.json changed -> npm install (root + FE)
    - any frontend source changed -> npm run build
    - any backend .py changed    -> restart Dashboard-Backend service

  Gitignored files (secrets.json, build/, node_modules/, uploads/, logs/) are
  preserved by the hard reset.
#>
[CmdletBinding()]
param(
    [string]$Repo = "C:\Users\james\Documents\projects\personalDashboard"
)

$ErrorActionPreference = "Continue"

$PY   = "C:\Users\james\AppData\Local\Programs\Python\Python314\python.exe"
$NODE = "C:\Program Files\nodejs"
$NPM  = "C:\Program Files\nodejs\npm.cmd"
$GIT  = "C:\Program Files\Git\cmd\git.exe"
$FE   = Join-Path $Repo "FE\personal_dashboard"

$env:Path = "$NODE;" + $env:Path
$env:CI = "false"

$LogDir = Join-Path $Repo "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir "deploy.log"
function Say($m) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m
    $line | Tee-Object -FilePath $Log -Append
}

Say "===== deploy start ====="

# Git may run under a different account (the runner service) than the dir owner.
& $GIT config --global --add safe.directory $Repo 2>$null

# Authenticate the fetch with the token the workflow passes (works for private
# repos and doesn't depend on any machine-stored credentials). Falls back to the
# machine's own git credentials when run by hand with no token.
$token = $env:DEPLOY_TOKEN
$fetchArgs = @("-C", $Repo)
if ($token) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x-access-token:$token"))
    $fetchArgs += @("-c", "http.https://github.com/.extraheader=AUTHORIZATION: basic $b64")
}

$old = (& $GIT -C $Repo rev-parse HEAD 2>$null)
& $GIT @fetchArgs fetch origin main --quiet 2>&1 | ForEach-Object { Say "git: $_" }
& $GIT -C $Repo reset --hard origin/main 2>&1 | ForEach-Object { Say "git: $_" }
$new = (& $GIT -C $Repo rev-parse HEAD 2>$null)
Say "old=$old new=$new"

if ($old -eq $new) {
    Say "no new commit; ensuring services are running"
    Start-Service Dashboard-Backend, Dashboard-Frontend -ErrorAction SilentlyContinue
    Say "===== deploy end (no-op) ====="
    return
}

$changed = (& $GIT -C $Repo diff --name-only $old $new) 2>$null
Say "changed files:`n$([string]::Join("`n", $changed))"

function Changed([string]$pattern) { return ($changed | Where-Object { $_ -like $pattern }).Count -gt 0 }

# --- backend python deps ---
if (Changed "requirements.txt") {
    Say "requirements.txt changed -> pip install"
    & $PY -m pip install -r (Join-Path $Repo "requirements.txt") 2>&1 | Select-Object -Last 3 | ForEach-Object { Say "pip: $_" }
}

# --- frontend deps ---
if (Changed "package.json" -or (Changed "FE/personal_dashboard/package.json")) {
    Say "package.json changed -> npm install"
    Push-Location $Repo;  & $NPM install --no-audit --no-fund 2>&1 | Select-Object -Last 2 | ForEach-Object { Say "npm(root): $_" }; Pop-Location
    Push-Location $FE;    & $NPM install --no-audit --no-fund 2>&1 | Select-Object -Last 2 | ForEach-Object { Say "npm(fe): $_" };   Pop-Location
}

# --- frontend build (any FE source/public/config change) ---
if (Changed "FE/personal_dashboard/src/*" -or (Changed "FE/personal_dashboard/public/*") -or (Changed "FE/personal_dashboard/package.json")) {
    Say "frontend changed -> npm run build"
    Push-Location $FE
    & $NPM run build 2>&1 | Select-Object -Last 4 | ForEach-Object { Say "build: $_" }
    Pop-Location
    Say "build exit=$LASTEXITCODE"
}

# --- backend restart (any python change) ---
if (Changed "*.py") {
    Say "backend changed -> restart Dashboard-Backend"
    Restart-Service Dashboard-Backend -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
    Say "Dashboard-Backend = $((Get-Service Dashboard-Backend).Status)"
}

# --- frontend service restart (serve reads serve.json only at startup) ---
if (Changed "FE/personal_dashboard/public/serve.json") {
    Say "serve.json changed -> restart Dashboard-Frontend"
    Restart-Service Dashboard-Frontend -Force -ErrorAction SilentlyContinue
}

# always make sure both are up
Start-Service Dashboard-Backend, Dashboard-Frontend -ErrorAction SilentlyContinue
Say "===== deploy end (backend=$((Get-Service Dashboard-Backend).Status) frontend=$((Get-Service Dashboard-Frontend).Status)) ====="
