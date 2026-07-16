# ChoreTracker production deploy — builds this checkout and syncs a runnable
# copy into a separate production folder, leaving the production data/ alone.
#
#   powershell -File tools\deploy.ps1 -Target D:\Apps\ChoreTracker [-Seed] [-SkipBuild]
#
# Or click "Deploy / update production" in the control panel, which remembers
# the target in .deploy-target (gitignored).
#
# What ships: build/ (the server), drizzle/ (migrations, applied on boot),
# src/ + scripts/ (the admin CLI + seed run from source via tsx), tools/ +
# ChoreTracker.cmd (the control panel works in the production folder too),
# package files (npm ci in the target). What never ships or gets touched:
# data/ (the household), .git, tests, docs, .svelte-kit, node_modules.

param(
    [string]$Target,
    [switch]$Seed,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent $PSScriptRoot

function Step($msg) { Write-Host "== $msg" -ForegroundColor Cyan }

if (-not $Target) {
    $saved = Join-Path $src '.deploy-target'
    if (Test-Path $saved) { $Target = (Get-Content $saved -First 1).Trim() }
}
if (-not $Target) {
    Write-Host 'No target. Pass -Target <folder> (it will be created), e.g.:'
    Write-Host '  powershell -File tools\deploy.ps1 -Target D:\Apps\ChoreTracker'
    exit 1
}
$Target = [System.IO.Path]::GetFullPath($Target)
if ($Target -eq $src) { Write-Host 'Target must not be the dev folder itself.'; exit 1 }

Step "Deploying $src -> $Target"

if (-not $SkipBuild) {
    Step 'Building (npm run build)'
    Push-Location $src
    try {
        cmd /c 'npm run build'
        if ($LASTEXITCODE -ne 0) { throw "Build failed (exit $LASTEXITCODE)" }
    } finally { Pop-Location }
}
if (-not (Test-Path (Join-Path $src 'build'))) { Write-Host 'No build/ output found.'; exit 1 }

New-Item -ItemType Directory -Force $Target | Out-Null

# Directories are mirrored (old files in the target get removed); data/ is
# never in this list and never touched.
$dirs = @('build', 'drizzle', 'src', 'scripts', 'tools', 'static')
foreach ($d in $dirs) {
    $from = Join-Path $src $d
    if (-not (Test-Path $from)) { continue }
    Step "Syncing $d\"
    & robocopy $from (Join-Path $Target $d) /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed on $d (code $LASTEXITCODE)" }
}

$files = @('package.json', 'package-lock.json', '.npmrc', 'ChoreTracker.cmd', 'README.md', 'LICENSE', '.env.example')
foreach ($f in $files) {
    $from = Join-Path $src $f
    if (Test-Path $from) { Copy-Item $from (Join-Path $Target $f) -Force }
}

# npm ci wipes node_modules; only run it when the lockfile actually changed,
# and never while a server in the target holds the native modules locked
# (a running node locks better_sqlite3.node -> half-deleted install).
$lockHash = (Get-FileHash (Join-Path $Target 'package-lock.json') -Algorithm SHA256).Hash
$stampFile = Join-Path $Target '.deploy-lock-hash'
$needCi = $true
if ((Test-Path $stampFile) -and (Get-Content $stampFile -First 1) -eq $lockHash -and
    (Test-Path (Join-Path $Target 'node_modules\better-sqlite3\lib\index.js'))) {
    $needCi = $false
    Step 'Dependencies unchanged - skipping npm ci'
}

if ($needCi) {
    $nativeLib = Join-Path $Target 'node_modules\better-sqlite3\build\Release\better_sqlite3.node'
    if (Test-Path $nativeLib) {
        try {
            $fs = [System.IO.File]::Open($nativeLib, 'Open', 'ReadWrite', 'None')
            $fs.Close()
        } catch {
            throw ("A server appears to be RUNNING from $Target (its native modules are locked). " +
                   'Stop it (control panel -> Stop server), then deploy again.')
        }
    }
}

Push-Location $Target
try {
    if ($needCi) {
        Step 'Installing dependencies (npm ci) - takes a minute'
        cmd /c 'npm ci --no-audit --no-fund'
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed (exit $LASTEXITCODE)" }
        $sentinels = @(
            'node_modules\better-sqlite3\lib\index.js',
            'node_modules\better-sqlite3\build\Release\better_sqlite3.node'
        )
        foreach ($sentinel in $sentinels) {
            if (-not (Test-Path (Join-Path $Target $sentinel))) {
                throw ("npm ci finished but node_modules looks broken ($sentinel missing). " +
                       'Make sure no server is running from the target, delete its node_modules folder, and deploy again.')
            }
        }
        Set-Content $stampFile $lockHash
    }

    $dbPath = Join-Path $Target 'data\chores.db'
    if ($Seed -and -not (Test-Path $dbPath)) {
        Step 'Seeding demo family (fresh install)'
        cmd /c 'npm run seed'
    } elseif ($Seed) {
        Write-Host 'Skipping seed: the production folder already has a database.'
    }
} finally { Pop-Location }

Step 'Done'
Write-Host ''
if (Test-Path (Join-Path $Target 'data\chores.db')) {
    Write-Host 'Updated. If the production server is running, restart it to pick up the new build.'
} else {
    Write-Host 'Fresh install. Start it via ChoreTracker.cmd in the target folder (Start server),'
    Write-Host 'then open the app - you will get the create-first-adult setup screen.'
}
Write-Host "Production folder: $Target"
