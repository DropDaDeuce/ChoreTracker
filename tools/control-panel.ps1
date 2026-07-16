# ChoreTracker Control Panel — double-click ChoreTracker.cmd in the repo root.
#
# Attaches to a running server (health-checked) or starts/stops one, and puts
# the admin CLI + common dev tasks behind buttons. Works from any checkout:
# everything is relative to the repo root this script lives under.
#
# NOTE: keep this file pure ASCII — Windows PowerShell 5.1 reads BOM-less
# .ps1 files as ANSI and mangles anything else.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Net.Http

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$script:serverProc = $null
$script:toolProc = $null
$script:toolStart = $null
$script:toolLogPath = Join-Path $env:TEMP 'choretracker-panel-tool.log'
$script:toolLogPos = 0
$script:busy = $false
$script:lastHealthy = $false
$serverLog = Join-Path $root 'data\server.log'

# Health checks run as async HttpClient tasks polled from a timer, so the UI
# thread never blocks waiting on a socket (the old sync check froze the whole
# window for up to 2s per poll when the server was unreachable).
$script:http = New-Object System.Net.Http.HttpClient
$script:http.Timeout = [TimeSpan]::FromMilliseconds(1500)
$script:healthTask = $null

# Best-guess LAN address for phones (DHCP addresses first, skip loopback/APIPA).
$script:lanIp = $null
try {
    $script:lanIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
        Sort-Object { if ($_.PrefixOrigin -eq 'Dhcp') { 0 } else { 1 } } |
        Select-Object -First 1 -ExpandProperty IPAddress
} catch { }

# ── form ─────────────────────────────────────────────────────────────────────

$form = New-Object System.Windows.Forms.Form
$form.Text = "ChoreTracker Control Panel  -  $root"
$form.Size = New-Object System.Drawing.Size(900, 700)
$form.MinimumSize = New-Object System.Drawing.Size(760, 560)
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)

$tips = New-Object System.Windows.Forms.ToolTip

function New-Label($text, $x, $y, $w, $bold) {
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $text; $l.Location = New-Object System.Drawing.Point($x, $y)
    $l.Size = New-Object System.Drawing.Size($w, 20)
    if ($bold) { $l.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold) }
    $form.Controls.Add($l); $l
}

function New-Button($text, $x, $y, $w, $onClick, $tip) {
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $text; $b.Location = New-Object System.Drawing.Point($x, $y)
    $b.Size = New-Object System.Drawing.Size($w, 28)
    $b.Add_Click($onClick)
    if ($tip) { $tips.SetToolTip($b, $tip) }
    $form.Controls.Add($b); $b
}

# Status row
$statusDot = New-Label ([char]0x25CF) 12 12 20 $true
$statusLabel = New-Label 'Checking...' 34 12 320 $true
New-Label 'Port:' 370 14 34 $false | Out-Null
$portBox = New-Object System.Windows.Forms.TextBox
$portBox.Text = '3000'
$portBox.Location = New-Object System.Drawing.Point(404, 10)
$portBox.Size = New-Object System.Drawing.Size(52, 24)
$form.Controls.Add($portBox)
$portBox.Add_TextChanged({
    # Re-check the new port right away instead of waiting out the old poll.
    $script:healthTask = $null
    $statusLabel.Text = 'Checking...'
})

# Server row
New-Label 'SERVER' 12 44 200 $true | Out-Null
$btnStart   = New-Button 'Start server'   12  66 110 { Start-Server } 'node build on the port above (production build, LAN-reachable)'
$btnStop    = New-Button 'Stop server'    128 66 110 { Stop-Server } 'Stops the server this panel started, or any node server on the port'
$btnOpen    = New-Button 'Open app'       244 66 100 { Start-Process "http://127.0.0.1:$($portBox.Text)/" } 'Open the app in your browser'
$btnLan     = New-Button 'Copy LAN link'  350 66 110 {
    if (-not $script:lanIp) { Write-Output-Box 'No LAN address found on this machine.'; return }
    $url = "http://$($script:lanIp):$($portBox.Text)/"
    [System.Windows.Forms.Clipboard]::SetText($url)
    Write-Output-Box "Copied $url - open it on any phone/tablet on your wifi."
} 'Copy the address phones on your wifi can open'
$btnLog     = New-Button 'View server log' 466 66 110 { if (Test-Path $serverLog) { Start-Process notepad $serverLog } else { Write-Output-Box "No server log yet at $serverLog" } } 'Open data\server.log in Notepad'
$btnDev     = New-Button 'Dev server (new window)' 582 66 160 {
    Start-Process cmd "/k cd /d `"$root`" && npm run dev"
    Write-Output-Box "Dev server launched in its own window (http://localhost:5173). Close that window or Ctrl+C to stop it."
} 'Hot-reload dev server in its own console window'

# Tools row
New-Label 'TOOLS (safe while the server runs)' 12 104 400 $true | Out-Null
$btnStatus  = New-Button 'Status'        12  126 100 { Run-Admin 'status' } 'Household + database overview'
$btnDoctor  = New-Button 'Doctor'        118 126 100 { Run-Admin 'doctor' } 'Health diagnostics (integrity, disk, migrations)'
$btnBackup  = New-Button 'Backup now'    224 126 100 { Run-Admin 'backup' } 'Write a backup zip to data\backups'
$btnUsers   = New-Button 'List users'    330 126 100 { Run-Admin 'list-users' } 'Everyone, with role/active/balance'
$btnPrune   = New-Button 'Prune backups' 436 126 110 { Run-Admin 'prune-backups' } 'Keep only the newest backups (default 14)'
$btnChkpt   = New-Button 'Checkpoint'    552 126 100 { Run-Admin 'checkpoint' } 'Shrink the SQLite WAL file'

# Reset PIN row
New-Label 'Reset PIN:' 12 166 70 $false | Out-Null
$pinName = New-Object System.Windows.Forms.TextBox
$pinName.Location = New-Object System.Drawing.Point(84, 163); $pinName.Size = New-Object System.Drawing.Size(140, 24)
$form.Controls.Add($pinName)
New-Label 'name' 84 188 60 $false | Out-Null
$pinValue = New-Object System.Windows.Forms.TextBox
$pinValue.Location = New-Object System.Drawing.Point(232, 163); $pinValue.Size = New-Object System.Drawing.Size(90, 24)
$form.Controls.Add($pinValue)
New-Label 'new PIN (blank = random)' 232 188 160 $false | Out-Null
$btnPin = New-Button 'Reset' 330 161 70 {
    if (-not $pinName.Text.Trim()) { Write-Output-Box 'Enter a name first.'; return }
    $cmdArgs = 'reset-pin "' + $pinName.Text.Trim() + '"'
    if ($pinValue.Text.Trim()) { $cmdArgs += ' ' + $pinValue.Text.Trim() }
    Run-Admin $cmdArgs
} 'Rescue a forgotten PIN'

# Dev row
New-Label 'DEV (this checkout)' 12 216 300 $true | Out-Null
$btnBuild = New-Button 'Build'      12  238 100 { Run-Command 'node node_modules\vite\bin\vite.js build' } 'vite build -> build/'
$btnCheck = New-Button 'Type check' 118 238 100 { Run-Npm 'run check' } 'svelte-kit sync + svelte-check'
$btnTest  = New-Button 'Run tests'  224 238 100 { Run-Command 'node node_modules\vitest\vitest.mjs run' } 'vitest (86 unit tests, in-memory DB)'
$btnSeed  = New-Button 'Seed demo data' 330 238 120 {
    $answer = [System.Windows.Forms.MessageBox]::Show(
        "Seeds a FAKE demo family (Alex/Sam/Riley). Refuses to run if any users already exist. Continue?",
        'Seed demo data', 'YesNo', 'Question')
    if ($answer -eq 'Yes') { Run-Command 'node node_modules\tsx\dist\cli.mjs scripts\seed.ts' }
} 'Demo family for eyeballing the app - never for a real household'
$btnSmoke = New-Button 'Smoke test' 456 238 100 {
    $answer = [System.Windows.Forms.MessageBox]::Show(
        "The smoke test MUTATES the database (marks chores done, pays out, restores a backup). Only run it against a fresh demo seed - NEVER real family data. The server must be running on port 3010 (ORIGIN=http://localhost:3010). Continue?",
        'Smoke test', 'YesNo', 'Warning')
    if ($answer -eq 'Yes') { Run-Command 'node scripts\smoke.mjs' }
} '67-check HTTP smoke - demo data only'
$btnDeploy = New-Button 'Deploy / update production' 562 238 170 { Start-Deploy } 'Build + copy to the production folder (.deploy-target)'

# Output box + running-task strip
New-Label 'OUTPUT' 12 278 60 $true | Out-Null
$runLabel = New-Label '' 80 278 560 $false
$runLabel.ForeColor = [System.Drawing.Color]::FromArgb(180, 120, 0)
$btnCancel = New-Button 'Cancel task' 760 272 110 {
    if ($script:toolProc -and -not $script:toolProc.HasExited) {
        & taskkill /PID $script:toolProc.Id /T /F | Out-Null
        Write-Output-Box '(cancelled)'
    }
} 'Kill the running task'
$btnCancel.Anchor = 'Top,Right'
$btnCancel.Enabled = $false

$out = New-Object System.Windows.Forms.TextBox
$out.Multiline = $true; $out.ReadOnly = $true; $out.ScrollBars = 'Vertical'; $out.WordWrap = $false
$out.Font = New-Object System.Drawing.Font('Consolas', 9)
$out.Location = New-Object System.Drawing.Point(12, 304)
$out.Size = New-Object System.Drawing.Size(858, 344)
$out.Anchor = 'Top,Bottom,Left,Right'
$out.BackColor = [System.Drawing.Color]::FromArgb(20, 24, 32)
$out.ForeColor = [System.Drawing.Color]::FromArgb(220, 228, 238)
$form.Controls.Add($out)

$allButtons = @($btnStart, $btnStop, $btnOpen, $btnLan, $btnLog, $btnDev, $btnStatus, $btnDoctor, $btnBackup,
                $btnUsers, $btnPrune, $btnChkpt, $btnPin, $btnBuild, $btnCheck, $btnTest, $btnSeed, $btnSmoke, $btnDeploy)

# ── helpers ──────────────────────────────────────────────────────────────────

function Write-Output-Box($text) {
    $out.AppendText(($text -replace "(?<!`r)`n", "`r`n") + "`r`n")
}

function Update-Buttons {
    if ($script:busy) { return }
    $mine = ($script:serverProc -and -not $script:serverProc.HasExited)
    $btnStart.Enabled = -not ($script:lastHealthy -or $mine)
    $btnStop.Enabled = ($script:lastHealthy -or $mine)
}

function Set-Busy($busy) {
    $script:busy = $busy
    foreach ($b in $allButtons) { $b.Enabled = -not $busy }
    $btnCancel.Enabled = $busy
    if (-not $busy) {
        Update-Buttons
        $runLabel.Text = ''
        # Fresh health check right away rather than waiting out the poll cycle.
        $script:healthTask = $null
    }
}

# Runs a command via cmd.exe with output streamed into the box; UI stays alive.
function Run-Command($commandLine) {
    if ($script:toolProc -and -not $script:toolProc.HasExited) { Write-Output-Box '(a task is already running)'; return }
    $out.Clear()
    Write-Output-Box "> $commandLine"
    Remove-Item $script:toolLogPath -ErrorAction SilentlyContinue
    $script:toolLogPos = 0
    $script:toolStart = Get-Date
    Set-Busy $true
    $runLabel.Text = 'running...'
    $script:toolProc = Start-Process cmd -ArgumentList "/c $commandLine > `"$($script:toolLogPath)`" 2>&1" `
        -WorkingDirectory $root -WindowStyle Hidden -PassThru
}

# The admin CLI runs through tsx directly - "npm run admin" pays npm's 1-3s
# startup tax on every click for nothing.
function Run-Admin($cmdArgs) { Run-Command "node node_modules\tsx\dist\cli.mjs scripts\admin.ts $cmdArgs" }
function Run-Npm($cmdArgs)   { Run-Command "npm $cmdArgs" }

function Pump-ToolOutput {
    if (Test-Path $script:toolLogPath) {
        try {
            $fs = [System.IO.File]::Open($script:toolLogPath, 'Open', 'Read', 'ReadWrite')
            try {
                if ($fs.Length -gt $script:toolLogPos) {
                    $fs.Seek($script:toolLogPos, 'Begin') | Out-Null
                    $buf = New-Object byte[] ($fs.Length - $script:toolLogPos)
                    $fs.Read($buf, 0, $buf.Length) | Out-Null
                    $script:toolLogPos = $fs.Length
                    $out.AppendText([System.Text.Encoding]::UTF8.GetString($buf) -replace "(?<!`r)`n", "`r`n")
                }
            } finally { $fs.Close() }
        } catch { }
    }
    $elapsed = [int]((Get-Date) - $script:toolStart).TotalSeconds
    if ($script:toolProc -and $script:toolProc.HasExited) {
        $code = $script:toolProc.ExitCode
        $script:toolProc = $null
        Write-Output-Box "`r`n(done, exit code $code, ${elapsed}s)"
        Set-Busy $false
    } elseif ($script:toolProc) {
        $runLabel.Text = "running... ${elapsed}s"
    }
}

function Start-Deploy {
    $targetFile = Join-Path $root '.deploy-target'
    $target = $null
    if (Test-Path $targetFile) { $target = (Get-Content $targetFile -First 1).Trim() }

    if (-not $target) {
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = 'Pick (or create) the PRODUCTION folder - the family database will live there, separate from this dev checkout.'
        if ($dialog.ShowDialog() -ne 'OK') { return }
        $target = $dialog.SelectedPath
        if ($target -eq $root) { Write-Output-Box 'Target must not be the dev folder itself.'; return }
        Set-Content $targetFile $target
        Write-Output-Box "Production target saved: $target (stored in .deploy-target)"
    }

    # Deploying over a RUNNING server corrupts node_modules (locked native
    # modules) - offer to stop whatever is on the configured port first.
    $port = $portBox.Text.Trim()
    $running = $false
    try {
        $resp = Invoke-WebRequest "http://127.0.0.1:$port/healthz" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) { $running = $true }
    } catch { }
    if ($running) {
        $answer = [System.Windows.Forms.MessageBox]::Show(
            "A server is running on port $port. Deploying while it runs can corrupt the production install.`n`nStop it and continue?",
            'Deploy', 'YesNo', 'Warning')
        if ($answer -ne 'Yes') { return }
        Stop-Server
        Start-Sleep -Seconds 2
    }

    $seedFlag = ''
    if (-not (Test-Path (Join-Path $target 'data\chores.db'))) {
        $answer = [System.Windows.Forms.MessageBox]::Show(
            "Fresh production folder. Seed the FAKE demo family (Alex/Sam/Riley)?`n`nNo = start empty; the first visit shows the create-first-adult setup screen (recommended for your real household).",
            'First deploy', 'YesNoCancel', 'Question')
        if ($answer -eq 'Cancel') { return }
        if ($answer -eq 'Yes') { $seedFlag = ' -Seed' }
    }

    Run-Command ("powershell -NoProfile -ExecutionPolicy Bypass -File `"$root\tools\deploy.ps1`" -Target `"$target`"$seedFlag")
}

function Start-Server {
    $port = $portBox.Text.Trim()
    if (-not (Test-Path (Join-Path $root 'build'))) {
        Write-Output-Box "No build/ folder yet - click Build first."
        return
    }
    if ($script:serverProc -and -not $script:serverProc.HasExited) { Write-Output-Box 'Server already running from this panel.'; return }
    New-Item -ItemType Directory -Force (Join-Path $root 'data') | Out-Null
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'cmd.exe'
    $psi.Arguments = "/c node build >> `"$serverLog`" 2>&1"
    $psi.WorkingDirectory = $root
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    # No ORIGIN: the app does its own same-host CSRF check, so it works from
    # localhost, the LAN IP, and a hostname at the same time.
    $psi.EnvironmentVariables['PORT'] = $port
    $psi.EnvironmentVariables['BODY_SIZE_LIMIT'] = '10M'
    $script:serverProc = [System.Diagnostics.Process]::Start($psi)
    Write-Output-Box "Server starting on http://localhost:$port (log: $serverLog)"
    $statusDot.ForeColor = [System.Drawing.Color]::FromArgb(217, 119, 6)
    $statusLabel.Text = "Starting on port $port ..."
    $btnStart.Enabled = $false; $btnStop.Enabled = $true
    $script:healthTask = $null
}

function Stop-Server {
    if ($script:serverProc -and -not $script:serverProc.HasExited) {
        # Kill the cmd wrapper's whole tree so node goes with it.
        & taskkill /PID $script:serverProc.Id /T /F | Out-Null
        $script:serverProc = $null
        Write-Output-Box 'Server stopped.'
        Apply-Health $false
        return
    }

    # Not ours (e.g. the panel was reopened): find whoever owns the port.
    $port = [int]$portBox.Text.Trim()
    $owners = @()
    try {
        $owners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop |
            Select-Object -ExpandProperty OwningProcess -Unique
    } catch { }
    if ($owners.Count -eq 0) {
        Write-Output-Box "Nothing is listening on port $port."
        Apply-Health $false
        return
    }

    foreach ($ownerPid in $owners) {
        $proc = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
        if (-not $proc) { continue }
        if ($proc.ProcessName -ne 'node') {
            Write-Output-Box "Port $port is owned by '$($proc.ProcessName)' (PID $ownerPid) - not a node server, refusing to kill it."
            continue
        }
        $answer = [System.Windows.Forms.MessageBox]::Show(
            "Stop the node server (PID $ownerPid) listening on port $port? It was started outside this panel session.",
            'Stop server', 'YesNo', 'Question')
        if ($answer -eq 'Yes') {
            & taskkill /PID $ownerPid /T /F | Out-Null
            Write-Output-Box "Stopped node PID $ownerPid."
            Apply-Health $false
        }
    }
    $script:healthTask = $null
}

function Apply-Health($healthy) {
    $script:lastHealthy = $healthy
    $port = $portBox.Text.Trim()
    $mine = ($script:serverProc -and -not $script:serverProc.HasExited)
    if ($healthy) {
        $statusDot.ForeColor = [System.Drawing.Color]::FromArgb(22, 163, 74)
        if ($mine) { $statusLabel.Text = "Running on port $port (started here)" }
        else       { $statusLabel.Text = "Running on port $port (attached)" }
    } elseif ($mine) {
        $statusDot.ForeColor = [System.Drawing.Color]::FromArgb(217, 119, 6)
        $statusLabel.Text = "Starting on port $port ..."
    } else {
        $statusDot.ForeColor = [System.Drawing.Color]::FromArgb(220, 38, 38)
        $statusLabel.Text = "Not running on port $port"
    }
    Update-Buttons
}

# Called from the poll timer: harvest a finished health probe or launch a new
# one. Never blocks - the request runs on the thread pool.
function Poll-Health {
    if ($script:healthTask) {
        if (-not $script:healthTask.IsCompleted) { return }
        $task = $script:healthTask
        $script:healthTask = $null
        $healthy = $false
        if ($task.Status -eq 'RanToCompletion' -and $task.Result -match '"ok":true') { $healthy = $true }
        elseif ($task.IsFaulted) { [void]$task.Exception }  # observe, treat as down
        Apply-Health $healthy
    } else {
        $port = $portBox.Text.Trim()
        if ($port -match '^\d+$') {
            # 127.0.0.1, not localhost: adapter-node binds IPv4 0.0.0.0 while
            # 'localhost' resolves to ::1 here, which times out.
            $script:healthTask = $script:http.GetStringAsync("http://127.0.0.1:$port/healthz")
        }
    }
}

# ── timers ───────────────────────────────────────────────────────────────────

$healthTimer = New-Object System.Windows.Forms.Timer
$healthTimer.Interval = 1000
$healthTimer.Add_Tick({ Poll-Health })
$healthTimer.Start()

$pumpTimer = New-Object System.Windows.Forms.Timer
$pumpTimer.Interval = 250
$pumpTimer.Add_Tick({ if ($script:toolProc) { Pump-ToolOutput } })
$pumpTimer.Start()

$form.Add_FormClosing({
    if ($script:serverProc -and -not $script:serverProc.HasExited) {
        $answer = [System.Windows.Forms.MessageBox]::Show(
            'Stop the server this panel started?', 'ChoreTracker', 'YesNo', 'Question')
        if ($answer -eq 'Yes') { & taskkill /PID $script:serverProc.Id /T /F | Out-Null }
    }
})

Write-Output-Box "ChoreTracker Control Panel - repo: $root"
if ($script:lanIp) { Write-Output-Box "LAN address for phones: http://$($script:lanIp):$($portBox.Text)/ (Copy LAN link button)" }
Write-Output-Box "Tip: Status / Doctor / Backup are safe any time. Seed and Smoke are for demo data only."
Poll-Health

# Headless self-test: CT_PANEL_TEST=1 builds the whole form + resolves one
# health poll, then exits instead of showing the window.
if ($env:CT_PANEL_TEST -eq '1') {
    if ($script:healthTask) {
        try { [void]$script:healthTask.Wait(3000) } catch { }
        Poll-Health
    }
    Write-Host "PANEL-TEST OK  status='$($statusLabel.Text)'  buttons=$($allButtons.Count)  startEnabled=$($btnStart.Enabled)  stopEnabled=$($btnStop.Enabled)"
    exit 0
}

[void]$form.ShowDialog()
