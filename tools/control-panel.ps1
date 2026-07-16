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

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$script:serverProc = $null
$script:toolProc = $null
$script:toolLogPath = Join-Path $env:TEMP 'choretracker-panel-tool.log'
$script:toolLogPos = 0
$serverLog = Join-Path $root 'data\server.log'

# ── form ─────────────────────────────────────────────────────────────────────

$form = New-Object System.Windows.Forms.Form
$form.Text = "ChoreTracker Control Panel  -  $root"
$form.Size = New-Object System.Drawing.Size(900, 700)
$form.MinimumSize = New-Object System.Drawing.Size(760, 560)
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)

function New-Label($text, $x, $y, $w, $bold) {
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $text; $l.Location = New-Object System.Drawing.Point($x, $y)
    $l.Size = New-Object System.Drawing.Size($w, 20)
    if ($bold) { $l.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold) }
    $form.Controls.Add($l); $l
}

function New-Button($text, $x, $y, $w, $onClick) {
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $text; $b.Location = New-Object System.Drawing.Point($x, $y)
    $b.Size = New-Object System.Drawing.Size($w, 28)
    $b.Add_Click($onClick)
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

# Server row
New-Label 'SERVER' 12 44 200 $true | Out-Null
$btnStart   = New-Button 'Start server'   12  66 110 { Start-Server }
$btnStop    = New-Button 'Stop server'    128 66 110 { Stop-Server }
$btnOpen    = New-Button 'Open app'       244 66 100 { Start-Process "http://localhost:$($portBox.Text)/" }
$btnLog     = New-Button 'View server log' 350 66 110 { if (Test-Path $serverLog) { Start-Process notepad $serverLog } else { Write-Output-Box "No server log yet at $serverLog" } }
$btnDev     = New-Button 'Dev server (new window)' 466 66 160 {
    Start-Process cmd "/k cd /d `"$root`" && npm run dev"
    Write-Output-Box "Dev server launched in its own window (http://localhost:5173). Close that window or Ctrl+C to stop it."
}

# Tools row
New-Label 'TOOLS (safe while the server runs)' 12 104 400 $true | Out-Null
$btnStatus  = New-Button 'Status'        12  126 100 { Run-Admin 'status' }
$btnDoctor  = New-Button 'Doctor'        118 126 100 { Run-Admin 'doctor' }
$btnBackup  = New-Button 'Backup now'    224 126 100 { Run-Admin 'backup' }
$btnUsers   = New-Button 'List users'    330 126 100 { Run-Admin 'list-users' }
$btnPrune   = New-Button 'Prune backups' 436 126 110 { Run-Admin 'prune-backups' }
$btnChkpt   = New-Button 'Checkpoint'    552 126 100 { Run-Admin 'checkpoint' }

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
}

# Dev row
New-Label 'DEV (this checkout)' 12 216 300 $true | Out-Null
$btnBuild = New-Button 'Build'      12  238 100 { Run-Npm 'run build' }
$btnCheck = New-Button 'Type check' 118 238 100 { Run-Npm 'run check' }
$btnTest  = New-Button 'Run tests'  224 238 100 { Run-Npm 'test' }
$btnSeed  = New-Button 'Seed demo data' 330 238 120 {
    $answer = [System.Windows.Forms.MessageBox]::Show(
        "Seeds a FAKE demo family (Alex/Sam/Riley). Refuses to run if any users already exist. Continue?",
        'Seed demo data', 'YesNo', 'Question')
    if ($answer -eq 'Yes') { Run-Npm 'run seed' }
}
$btnSmoke = New-Button 'Smoke test' 456 238 100 {
    $answer = [System.Windows.Forms.MessageBox]::Show(
        "The smoke test MUTATES the database (marks chores done, pays out, restores a backup). Only run it against a fresh demo seed - NEVER real family data. The server must be running on port 3010 (ORIGIN=http://localhost:3010). Continue?",
        'Smoke test', 'YesNo', 'Warning')
    if ($answer -eq 'Yes') { Run-Npm 'run smoke' }
}
$btnDeploy = New-Button 'Deploy / update production' 562 238 170 { Start-Deploy }

# Output box
New-Label 'OUTPUT' 12 278 200 $true | Out-Null
$out = New-Object System.Windows.Forms.TextBox
$out.Multiline = $true; $out.ReadOnly = $true; $out.ScrollBars = 'Vertical'; $out.WordWrap = $false
$out.Font = New-Object System.Drawing.Font('Consolas', 9)
$out.Location = New-Object System.Drawing.Point(12, 300)
$out.Size = New-Object System.Drawing.Size(858, 348)
$out.Anchor = 'Top,Bottom,Left,Right'
$out.BackColor = [System.Drawing.Color]::FromArgb(20, 24, 32)
$out.ForeColor = [System.Drawing.Color]::FromArgb(220, 228, 238)
$form.Controls.Add($out)

$allButtons = @($btnStart, $btnStop, $btnOpen, $btnLog, $btnDev, $btnStatus, $btnDoctor, $btnBackup,
                $btnUsers, $btnPrune, $btnChkpt, $btnPin, $btnBuild, $btnCheck, $btnTest, $btnSeed, $btnSmoke, $btnDeploy)

# ── helpers ──────────────────────────────────────────────────────────────────

function Write-Output-Box($text) {
    $out.AppendText(($text -replace "(?<!`r)`n", "`r`n") + "`r`n")
}

function Set-Busy($busy) {
    foreach ($b in $allButtons) { $b.Enabled = -not $busy }
    # Stop stays available while a server we own is running.
    if (-not $busy) { Update-Health }
}

# Runs a command via cmd.exe with output streamed into the box; UI stays alive.
function Run-Command($commandLine) {
    if ($script:toolProc -and -not $script:toolProc.HasExited) { Write-Output-Box '(a task is already running)'; return }
    $out.Clear()
    Write-Output-Box "> $commandLine"
    Remove-Item $script:toolLogPath -ErrorAction SilentlyContinue
    $script:toolLogPos = 0
    Set-Busy $true
    $script:toolProc = Start-Process cmd -ArgumentList "/c $commandLine > `"$($script:toolLogPath)`" 2>&1" `
        -WorkingDirectory $root -WindowStyle Hidden -PassThru
}

function Run-Admin($cmdArgs) { Run-Command "npm run admin -- $cmdArgs" }
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
    if ($script:toolProc -and $script:toolProc.HasExited) {
        $code = $script:toolProc.ExitCode
        $script:toolProc = $null
        Write-Output-Box "`r`n(done, exit code $code)"
        Set-Busy $false
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
        Write-Output-Box "No build/ folder yet - click Build first (npm run build)."
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
}

function Stop-Server {
    if ($script:serverProc -and -not $script:serverProc.HasExited) {
        # Kill the cmd wrapper's whole tree so node goes with it.
        & taskkill /PID $script:serverProc.Id /T /F | Out-Null
        $script:serverProc = $null
        Write-Output-Box 'Server stopped.'
        Update-Health
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
        Update-Health
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
        }
    }
    Update-Health
}

function Update-Health {
    $port = $portBox.Text.Trim()
    $healthy = $false
    try {
        # 127.0.0.1, not localhost: adapter-node binds IPv4 0.0.0.0 while
        # 'localhost' resolves to ::1 here, which times out.
        $resp = Invoke-WebRequest "http://127.0.0.1:$port/healthz" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200 -and $resp.Content -match '"ok":true') { $healthy = $true }
    } catch { }

    $mine = ($script:serverProc -and -not $script:serverProc.HasExited)
    if ($healthy) {
        $statusDot.ForeColor = [System.Drawing.Color]::FromArgb(22, 163, 74)
        if ($mine) { $statusLabel.Text = "Running on port $port (started here)" }
        else       { $statusLabel.Text = "Running on port $port (attached to external server)" }
        $btnStart.Enabled = $false
        $btnStop.Enabled = $mine
        $btnOpen.Enabled = $true
    } elseif ($mine) {
        $statusDot.ForeColor = [System.Drawing.Color]::FromArgb(217, 119, 6)
        $statusLabel.Text = "Starting on port $port ..."
        $btnStart.Enabled = $false; $btnStop.Enabled = $true
    } else {
        $statusDot.ForeColor = [System.Drawing.Color]::FromArgb(220, 38, 38)
        $statusLabel.Text = "Not running on port $port"
        if ($script:toolProc -eq $null) { $btnStart.Enabled = $true }
        $btnStop.Enabled = $false
    }
}

# ── timers ───────────────────────────────────────────────────────────────────

$healthTimer = New-Object System.Windows.Forms.Timer
$healthTimer.Interval = 3000
$healthTimer.Add_Tick({ if ($script:toolProc -eq $null) { Update-Health } })
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
Write-Output-Box "Tip: Status / Doctor / Backup are safe any time. Seed and Smoke are for demo data only."
Update-Health

# Headless self-test: CT_PANEL_TEST=1 builds the whole form + runs one health
# poll, then exits instead of showing the window.
if ($env:CT_PANEL_TEST -eq '1') {
    Write-Host "PANEL-TEST OK  status='$($statusLabel.Text)'  buttons=$($allButtons.Count)"
    exit 0
}

[void]$form.ShowDialog()
