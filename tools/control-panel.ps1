# ChoreTracker Control Panel - double-click ChoreTracker.cmd in the repo root.
#
# Attaches to a running server (health-checked) or starts/stops one, and puts
# the admin CLI + common dev tasks behind buttons. Works from any checkout:
# everything is relative to the repo root this script lives under.
#
# NOTE: keep this file pure ASCII - Windows PowerShell 5.1 reads BOM-less
# .ps1 files as ANSI and mangles anything else. Unicode glyphs are built via
# [char]0xNNNN where needed.
#
# Layout is container-based (TableLayoutPanel + FlowLayoutPanel), not pixel
# coordinates: groups wrap on narrow windows and adding a button is one line.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Net.Http

# EM_SETCUEBANNER: grey hint text inside empty textboxes (no extra labels).
Add-Type -Namespace CTNative -Name User32 -MemberDefinition @'
[DllImport("user32.dll", CharSet = CharSet.Unicode)]
public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, string lParam);
'@

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# ---- state -----------------------------------------------------------------

$script:serverProc = $null       # server process this panel started (cmd wrapper)
$script:serverStarted = $null    # when we started it (uptime display)
$script:toolProc = $null         # currently running task
$script:toolStart = $null
$script:toolLogPath = Join-Path $env:TEMP 'choretracker-panel-tool.log'
$script:toolLogPos = 0
$script:busy = $false
$script:lastHealthy = $false
$script:healthFails = 0          # damping: one blip must not flip a green light
$script:spinner = @('|', '/', '-', '\')
$script:spinIdx = 0
$serverLog = Join-Path $root 'data\server.log'
$portFile = Join-Path $root '.panel-port'

# Health checks run as async HttpClient tasks polled from a timer, so the UI
# thread never blocks waiting on a socket.
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

# ---- palette ---------------------------------------------------------------

$colBg      = [System.Drawing.Color]::FromArgb(246, 248, 250)
$colHeader  = [System.Drawing.Color]::FromArgb(255, 255, 255)
$colInk     = [System.Drawing.Color]::FromArgb(28, 36, 46)
$colInkSoft = [System.Drawing.Color]::FromArgb(105, 117, 130)
$colBorder  = [System.Drawing.Color]::FromArgb(208, 215, 222)
$colGreen   = [System.Drawing.Color]::FromArgb(22, 163, 74)
$colAmber   = [System.Drawing.Color]::FromArgb(217, 119, 6)
$colRed     = [System.Drawing.Color]::FromArgb(220, 38, 38)
$colAccent  = [System.Drawing.Color]::FromArgb(15, 118, 110)
$colConsole = [System.Drawing.Color]::FromArgb(18, 22, 30)
$colConsoleText = [System.Drawing.Color]::FromArgb(214, 222, 232)
$colCmd     = [System.Drawing.Color]::FromArgb(125, 211, 252)

# ---- form + root layout ----------------------------------------------------

$form = New-Object System.Windows.Forms.Form
$form.Text = "ChoreTracker Control Panel  -  $root"
$form.Size = New-Object System.Drawing.Size(940, 720)
$form.MinimumSize = New-Object System.Drawing.Size(720, 540)
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$form.BackColor = $colBg

$tips = New-Object System.Windows.Forms.ToolTip

$rootLayout = New-Object System.Windows.Forms.TableLayoutPanel
$rootLayout.Dock = 'Fill'
$rootLayout.ColumnCount = 1
$rootLayout.RowCount = 5
[void]$rootLayout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('AutoSize')))  # header
[void]$rootLayout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('AutoSize')))  # household
[void]$rootLayout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('AutoSize')))  # dev
[void]$rootLayout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('AutoSize')))  # task strip
[void]$rootLayout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Percent', 100)))  # console
$rootLayout.Padding = New-Object System.Windows.Forms.Padding(10, 8, 10, 10)
$form.Controls.Add($rootLayout)

# ---- control factories -----------------------------------------------------

function New-Flow {
    $f = New-Object System.Windows.Forms.FlowLayoutPanel
    $f.AutoSize = $true
    $f.AutoSizeMode = 'GrowAndShrink'
    $f.WrapContents = $true
    $f.Margin = New-Object System.Windows.Forms.Padding(0)
    $f
}

function New-Group($title) {
    $g = New-Object System.Windows.Forms.GroupBox
    $g.Text = $title
    $g.AutoSize = $true
    $g.AutoSizeMode = 'GrowAndShrink'
    $g.Dock = 'Fill'
    $g.ForeColor = $colInkSoft
    $g.Margin = New-Object System.Windows.Forms.Padding(0, 6, 0, 0)
    $g.Padding = New-Object System.Windows.Forms.Padding(8, 4, 8, 6)
    # Dock Top (not Fill): a Fill-docked child inside an AutoSize parent can
    # collapse the parent to nothing - Top + AutoSize grows it reliably.
    $flow = New-Flow
    $flow.Dock = 'Top'
    $g.Controls.Add($flow)
    @{ Group = $g; Flow = $flow }
}

function New-Btn($flow, $text, $onClick, $tip, $kind) {
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $text
    $b.AutoSize = $true
    $b.AutoSizeMode = 'GrowAndShrink'
    $b.Padding = New-Object System.Windows.Forms.Padding(8, 3, 8, 3)
    $b.Margin = New-Object System.Windows.Forms.Padding(0, 3, 6, 3)
    $b.FlatStyle = 'Flat'
    $b.FlatAppearance.BorderColor = $colBorder
    $b.FlatAppearance.BorderSize = 1
    $b.BackColor = [System.Drawing.Color]::White
    $b.ForeColor = $colInk
    $b.UseVisualStyleBackColor = $false
    if ($kind -eq 'primary') {
        $b.BackColor = $colAccent
        $b.ForeColor = [System.Drawing.Color]::White
        $b.FlatAppearance.BorderSize = 0
        $b.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
    } elseif ($kind -eq 'danger') {
        $b.ForeColor = $colRed
    }
    $b.Add_Click($onClick)
    if ($tip) { $tips.SetToolTip($b, $tip) }
    $flow.Controls.Add($b)
    $b
}

function New-Box($flow, $width, $hint, $tip) {
    $t = New-Object System.Windows.Forms.TextBox
    $t.Width = $width
    $t.Margin = New-Object System.Windows.Forms.Padding(0, 5, 6, 3)
    if ($tip) { $tips.SetToolTip($t, $tip) }
    $flow.Controls.Add($t)
    # Cue banner needs a created handle; defer until the handle exists.
    $t.Add_HandleCreated({
        param($sender, $e)
        [void][CTNative.User32]::SendMessage($sender.Handle, 0x1501, [IntPtr]1, $sender.Tag)
    })
    $t.Tag = $hint
    $t
}

# ---- header: status + server controls --------------------------------------

$header = New-Object System.Windows.Forms.Panel
$header.Dock = 'Fill'
$header.AutoSize = $true
$header.BackColor = $colHeader
$header.Padding = New-Object System.Windows.Forms.Padding(10, 8, 10, 8)
$header.Margin = New-Object System.Windows.Forms.Padding(0)

$headerLayout = New-Object System.Windows.Forms.TableLayoutPanel
$headerLayout.Dock = 'Top'
$headerLayout.AutoSize = $true
$headerLayout.ColumnCount = 2
[void]$headerLayout.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('Percent', 100)))
[void]$headerLayout.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('AutoSize')))
$header.Controls.Add($headerLayout)

$statusStack = New-Object System.Windows.Forms.FlowLayoutPanel
$statusStack.FlowDirection = 'TopDown'
$statusStack.AutoSize = $true
$statusStack.WrapContents = $false
$statusStack.Margin = New-Object System.Windows.Forms.Padding(0)

$statusRow = New-Flow
$statusRow.WrapContents = $false
$statusDot = New-Object System.Windows.Forms.Label
$statusDot.Text = [string][char]0x25CF
$statusDot.AutoSize = $true
$statusDot.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
$statusDot.ForeColor = $colInkSoft
$statusDot.Margin = New-Object System.Windows.Forms.Padding(0, 0, 4, 0)
$statusRow.Controls.Add($statusDot)
$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = 'Checking...'
$statusLabel.AutoSize = $true
$statusLabel.Font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
$statusLabel.ForeColor = $colInk
$statusLabel.Margin = New-Object System.Windows.Forms.Padding(0, 4, 0, 0)
$statusRow.Controls.Add($statusLabel)
$statusStack.Controls.Add($statusRow)

$statusDetail = New-Object System.Windows.Forms.Label
$statusDetail.Text = ''
$statusDetail.AutoSize = $true
$statusDetail.ForeColor = $colInkSoft
$statusDetail.Margin = New-Object System.Windows.Forms.Padding(24, 0, 0, 0)
$statusStack.Controls.Add($statusDetail)
$headerLayout.Controls.Add($statusStack, 0, 0)

$serverFlow = New-Flow
$serverFlow.FlowDirection = 'LeftToRight'
$serverFlow.Anchor = 'Right'

$portLabel = New-Object System.Windows.Forms.Label
$portLabel.Text = 'Port'
$portLabel.AutoSize = $true
$portLabel.ForeColor = $colInkSoft
$portLabel.Margin = New-Object System.Windows.Forms.Padding(0, 8, 4, 0)
$serverFlow.Controls.Add($portLabel)
$portBox = New-Box $serverFlow 48 '3000' 'Port to run/health-check (remembered between sessions)'
$portBox.Text = '3000'
if (Test-Path $portFile) {
    $savedPort = (Get-Content $portFile -First 1).Trim()
    if ($savedPort -match '^\d+$') { $portBox.Text = $savedPort }
}
$portBox.Add_TextChanged({
    # Re-check the new port right away instead of waiting out the old poll.
    $script:healthTask = $null
    $script:healthFails = 0
    $statusLabel.Text = 'Checking...'
    if ($portBox.Text -match '^\d+$') { Set-Content $portFile $portBox.Text }
})

$btnStart = New-Btn $serverFlow 'Start server' { Start-Server } 'node build on the port above (production build, LAN-reachable)' 'primary'
$btnStop  = New-Btn $serverFlow 'Stop' { Stop-Server } 'Stops the server this panel started, or any node server on the port' 'danger'
$btnOpen  = New-Btn $serverFlow 'Open app' { Start-Process "http://127.0.0.1:$($portBox.Text)/" } 'Open the app in your browser'
$btnLan   = New-Btn $serverFlow 'Copy LAN link' {
    if (-not $script:lanIp) { Write-Line 'No LAN address found on this machine.'; return }
    $url = "http://$($script:lanIp):$($portBox.Text)/"
    [System.Windows.Forms.Clipboard]::SetText($url)
    Write-Line "Copied $url - open it on any phone/tablet on your wifi. Type http:// explicitly if the phone forces https."
} 'Copy the address phones on your wifi can open'
$headerLayout.Controls.Add($serverFlow, 1, 0)
$rootLayout.Controls.Add($header, 0, 0)

# ---- household group -------------------------------------------------------

$household = New-Group 'Household  (safe while the server runs)'
$btnStatus = New-Btn $household.Flow 'Status'        { Run-Admin 'status' } 'Household + database overview' $null
$btnDoctor = New-Btn $household.Flow 'Doctor'        { Run-Admin 'doctor' } 'Health diagnostics (integrity, disk, migrations)' $null
$btnBackup = New-Btn $household.Flow 'Backup now'    { Run-Admin 'backup' } 'Write a backup zip to data\backups' $null
$btnUsers  = New-Btn $household.Flow 'List users'    { Run-Admin 'list-users' } 'Everyone, with role/active/balance' $null
$btnPrune  = New-Btn $household.Flow 'Prune backups' { Run-Admin 'prune-backups' } 'Keep only the newest backups (default 14)' $null
$btnChkpt  = New-Btn $household.Flow 'Checkpoint'    { Run-Admin 'checkpoint' } 'Shrink the SQLite WAL file' $null

$pinSep = New-Object System.Windows.Forms.Label
$pinSep.Text = '   Reset PIN:'
$pinSep.AutoSize = $true
$pinSep.ForeColor = $colInkSoft
$pinSep.Margin = New-Object System.Windows.Forms.Padding(8, 8, 4, 0)
$household.Flow.Controls.Add($pinSep)
$pinName  = New-Box $household.Flow 110 'name' 'Who forgot their PIN'
$pinValue = New-Box $household.Flow 90 'new PIN (blank = random)' 'Leave blank to get a random PIN printed below'
$btnPin = New-Btn $household.Flow 'Reset' {
    if (-not $pinName.Text.Trim()) { Write-Line 'Enter a name first.'; return }
    $cmdArgs = 'reset-pin "' + $pinName.Text.Trim() + '"'
    if ($pinValue.Text.Trim()) { $cmdArgs += ' ' + $pinValue.Text.Trim() }
    Run-Admin $cmdArgs
} 'Rescue a forgotten PIN' $null
$rootLayout.Controls.Add($household.Group, 0, 1)

# ---- dev group -------------------------------------------------------------

$dev = New-Group 'Developer  (this checkout)'
$btnBuild = New-Btn $dev.Flow 'Build'      { Run-Command 'node node_modules\vite\bin\vite.js build' } 'vite build -> build/' $null
$btnCheck = New-Btn $dev.Flow 'Type check' { Run-Npm 'run check' } 'svelte-kit sync + svelte-check' $null
$btnTest  = New-Btn $dev.Flow 'Run tests'  { Run-Command 'node node_modules\vitest\vitest.mjs run' } 'vitest unit suite (in-memory DB, safe any time)' $null
$btnSeed  = New-Btn $dev.Flow 'Seed demo data' {
    $answer = [System.Windows.Forms.MessageBox]::Show(
        "Seeds a FAKE demo family (Alex/Sam/Riley). Refuses to run if any users already exist. Continue?",
        'Seed demo data', 'YesNo', 'Question')
    if ($answer -eq 'Yes') { Run-Command 'node node_modules\tsx\dist\cli.mjs scripts\seed.ts' }
} 'Demo family for eyeballing the app - never for a real household' $null
$btnSmoke = New-Btn $dev.Flow 'Smoke test' { Start-Smoke } 'Full HTTP smoke suite - mutates the DB, demo data only' $null
$btnDev = New-Btn $dev.Flow 'Dev server' {
    Start-Process cmd "/k cd /d `"$root`" && npm run dev"
    Write-Line 'Dev server launched in its own window (http://localhost:5173). Close that window or Ctrl+C to stop it.'
} 'Hot-reload dev server in its own console window' $null
$btnLog = New-Btn $dev.Flow 'Server log' {
    if (Test-Path $serverLog) { Start-Process notepad $serverLog } else { Write-Line "No server log yet at $serverLog" }
} 'Open data\server.log in Notepad' $null
$btnDeploy = New-Btn $dev.Flow 'Deploy to production' { Start-Deploy } 'Build + copy to the production folder (.deploy-target)' 'primary'
$rootLayout.Controls.Add($dev.Group, 0, 2)

# ---- task strip + console --------------------------------------------------

$taskStrip = New-Object System.Windows.Forms.TableLayoutPanel
$taskStrip.Dock = 'Fill'
$taskStrip.AutoSize = $true
$taskStrip.ColumnCount = 3
[void]$taskStrip.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('Percent', 100)))
[void]$taskStrip.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('AutoSize')))
[void]$taskStrip.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('AutoSize')))
$taskStrip.Margin = New-Object System.Windows.Forms.Padding(0, 6, 0, 0)

$runLabel = New-Object System.Windows.Forms.Label
$runLabel.Text = ''
$runLabel.AutoSize = $true
$runLabel.ForeColor = $colAmber
$runLabel.Margin = New-Object System.Windows.Forms.Padding(2, 8, 0, 0)
$taskStrip.Controls.Add($runLabel, 0, 0)

$stripFlow = New-Flow
$stripFlow.WrapContents = $false
$btnCopyOut = New-Btn $stripFlow 'Copy output' {
    if ($out.Text.Trim()) { [System.Windows.Forms.Clipboard]::SetText($out.Text) ; Write-Line '(output copied)' }
} 'Copy the whole console to the clipboard' $null
$btnCancel = New-Btn $stripFlow 'Cancel task' {
    if ($script:toolProc -and -not $script:toolProc.HasExited) {
        & taskkill /PID $script:toolProc.Id /T /F | Out-Null
        Write-Colored "(cancelled)`r`n" $colAmber
    }
} 'Kill the running task' 'danger'
$btnCancel.Enabled = $false
$taskStrip.Controls.Add($stripFlow, 1, 0)
$rootLayout.Controls.Add($taskStrip, 0, 3)

$out = New-Object System.Windows.Forms.RichTextBox
$out.ReadOnly = $true
$out.DetectUrls = $false
$out.WordWrap = $false
$out.ScrollBars = 'Both'
$out.Font = New-Object System.Drawing.Font('Consolas', 9)
$out.Dock = 'Fill'
$out.BorderStyle = 'None'
$out.BackColor = $colConsole
$out.ForeColor = $colConsoleText
$out.Margin = New-Object System.Windows.Forms.Padding(0, 4, 0, 0)
$rootLayout.Controls.Add($out, 0, 4)

$allButtons = @($btnStart, $btnStop, $btnOpen, $btnLan, $btnLog, $btnDev, $btnStatus, $btnDoctor, $btnBackup,
                $btnUsers, $btnPrune, $btnChkpt, $btnPin, $btnBuild, $btnCheck, $btnTest, $btnSeed, $btnSmoke, $btnDeploy)

# ---- console helpers -------------------------------------------------------

function Write-Colored($text, $color) {
    $out.SelectionStart = $out.TextLength
    $out.SelectionLength = 0
    $out.SelectionColor = $color
    $out.AppendText(($text -replace "(?<!`r)`n", "`r`n"))
    $out.SelectionColor = $out.ForeColor
    $out.ScrollToCaret()
}

function Write-Line($text) { Write-Colored ($text + "`r`n") $colConsoleText }

# ---- task running ----------------------------------------------------------

# Runs a command via cmd.exe with output streamed into the console; the UI
# thread never blocks (output is pumped from a temp log by a timer).
function Run-Command($commandLine) {
    if ($script:toolProc -and -not $script:toolProc.HasExited) { Write-Line '(a task is already running)'; return }
    $out.Clear()
    Write-Colored "> $commandLine`r`n" $colCmd
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
                    Write-Colored ([System.Text.Encoding]::UTF8.GetString($buf)) $colConsoleText
                }
            } finally { $fs.Close() }
        } catch { }
    }
    $elapsed = [int]((Get-Date) - $script:toolStart).TotalSeconds
    if ($script:toolProc -and $script:toolProc.HasExited) {
        $code = $script:toolProc.ExitCode
        $script:toolProc = $null
        if ($code -eq 0) { Write-Colored "`r`n(done in ${elapsed}s)`r`n" $colGreen }
        else             { Write-Colored "`r`n(FAILED, exit code $code, ${elapsed}s)`r`n" $colRed }
        Set-Busy $false
    } elseif ($script:toolProc) {
        $script:spinIdx = ($script:spinIdx + 1) % 4
        $runLabel.Text = "$($script:spinner[$script:spinIdx]) running... ${elapsed}s"
    }
}

# ---- server + smoke + deploy -----------------------------------------------

function Start-Server {
    $port = $portBox.Text.Trim()
    if ($port -notmatch '^\d+$') { Write-Line 'Port must be a number.'; return }
    if (-not (Test-Path (Join-Path $root 'build'))) {
        Write-Line 'No build/ folder yet - click Build first.'
        return
    }
    if ($script:serverProc -and -not $script:serverProc.HasExited) { Write-Line 'Server already running from this panel.'; return }
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
    $script:serverStarted = Get-Date
    Write-Line "Server starting on http://localhost:$port (log: $serverLog)"
    $statusDot.ForeColor = $colAmber
    $statusLabel.Text = "Starting on port $port ..."
    $btnStart.Enabled = $false; $btnStop.Enabled = $true
    $script:healthTask = $null
    $script:healthFails = 0
}

function Stop-Server {
    if ($script:serverProc -and -not $script:serverProc.HasExited) {
        # Kill the cmd wrapper's whole tree so node goes with it.
        & taskkill /PID $script:serverProc.Id /T /F | Out-Null
        $script:serverProc = $null
        $script:serverStarted = $null
        Write-Line 'Server stopped.'
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
        Write-Line "Nothing is listening on port $port."
        Apply-Health $false
        return
    }

    foreach ($ownerPid in $owners) {
        $proc = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
        if (-not $proc) { continue }
        if ($proc.ProcessName -ne 'node') {
            Write-Line "Port $port is owned by '$($proc.ProcessName)' (PID $ownerPid) - not a node server, refusing to kill it."
            continue
        }
        $answer = [System.Windows.Forms.MessageBox]::Show(
            "Stop the node server (PID $ownerPid) listening on port $port? It was started outside this panel session.",
            'Stop server', 'YesNo', 'Question')
        if ($answer -eq 'Yes') {
            & taskkill /PID $ownerPid /T /F | Out-Null
            Write-Line "Stopped node PID $ownerPid."
            Apply-Health $false
        }
    }
    $script:healthTask = $null
}

# The smoke suite needs a server on port 3010 and DEMO data - check what we
# can up front instead of letting it fail 60 checks in.
function Start-Smoke {
    $up = $false
    try {
        $resp = Invoke-WebRequest 'http://127.0.0.1:3010/healthz' -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) { $up = $true }
    } catch { }
    if (-not $up) {
        Write-Line 'Smoke needs a server on port 3010 first. Set the port box to 3010, click Start server, then run Smoke again.'
        Write-Line '(It must be a FRESH demo seed: stop server, delete data\, Seed demo data, start on 3010.)'
        return
    }
    $answer = [System.Windows.Forms.MessageBox]::Show(
        "The smoke test MUTATES the database on port 3010 (marks chores done, pays out, restores a backup). Only run it against a fresh demo seed - NEVER real family data.`n`nContinue?",
        'Smoke test', 'YesNo', 'Warning')
    if ($answer -eq 'Yes') { Run-Command 'node scripts\smoke.mjs' }
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
        if ($target -eq $root) { Write-Line 'Target must not be the dev folder itself.'; return }
        Set-Content $targetFile $target
        Write-Line "Production target saved: $target (stored in .deploy-target)"
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

# ---- health polling --------------------------------------------------------

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

function Apply-Health($healthy) {
    $script:lastHealthy = $healthy
    $port = $portBox.Text.Trim()
    $mine = ($script:serverProc -and -not $script:serverProc.HasExited)
    if ($healthy) {
        $statusDot.ForeColor = $colGreen
        $detail = "http://localhost:$port"
        if ($script:lanIp) { $detail += "   -   phones: http://$($script:lanIp):$port" }
        if ($mine) {
            $up = ''
            if ($script:serverStarted) {
                $mins = [int]((Get-Date) - $script:serverStarted).TotalMinutes
                if ($mins -ge 60) { $up = " - up $([int]($mins / 60))h $($mins % 60)m" }
                else { $up = " - up ${mins}m" }
            }
            $statusLabel.Text = "Running (started here$up)"
        } else {
            $statusLabel.Text = 'Running (attached)'
        }
        $statusDetail.Text = $detail
    } elseif ($mine) {
        $statusDot.ForeColor = $colAmber
        $statusLabel.Text = "Starting on port $port ..."
        $statusDetail.Text = ''
    } else {
        $statusDot.ForeColor = $colRed
        $statusLabel.Text = "Not running on port $port"
        $statusDetail.Text = 'Start server runs the production build; Dev server gives hot reload.'
    }
    Update-Buttons
}

# Called from the poll timer: harvest a finished health probe or launch a new
# one. Never blocks - the request runs on the thread pool. A single failed
# probe never flips a green light (transient blips while the app does heavy
# work shouldn't flash the panel red); two misses in a row do.
function Poll-Health {
    if ($script:healthTask) {
        if (-not $script:healthTask.IsCompleted) { return }
        $task = $script:healthTask
        $script:healthTask = $null
        $healthy = $false
        if ($task.Status -eq 'RanToCompletion' -and $task.Result -match '"ok":true') { $healthy = $true }
        elseif ($task.IsFaulted) { [void]$task.Exception }  # observe, treat as down
        if ($healthy) {
            $script:healthFails = 0
            Apply-Health $true
        } else {
            $script:healthFails++
            if (-not $script:lastHealthy -or $script:healthFails -ge 2) { Apply-Health $false }
        }
    } else {
        $port = $portBox.Text.Trim()
        if ($port -match '^\d+$') {
            # 127.0.0.1, not localhost: adapter-node binds IPv4 0.0.0.0 while
            # 'localhost' resolves to ::1 here, which times out.
            $script:healthTask = $script:http.GetStringAsync("http://127.0.0.1:$port/healthz")
        }
    }
}

# ---- timers + shutdown -----------------------------------------------------

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

Write-Line "ChoreTracker Control Panel - repo: $root"
if ($script:lanIp) { Write-Line "LAN address for phones: http://$($script:lanIp):$($portBox.Text)/ (Copy LAN link button)" }
Write-Line 'Status / Doctor / Backup are safe any time. Seed and Smoke are for demo data only.'
Poll-Health

# Headless self-test: CT_PANEL_TEST=1 builds the whole form + resolves one
# health poll, then exits instead of showing the window.
if ($env:CT_PANEL_TEST -eq '1') {
    if ($script:healthTask) {
        try { [void]$script:healthTask.Wait(3000) } catch { }
        Poll-Health
    }
    # Force a real layout pass so collapsed-container bugs show up as height 0.
    $form.PerformLayout()
    [System.Windows.Forms.Application]::DoEvents()
    $hH = $header.Height; $hHouse = $household.Group.Height; $hDev = $dev.Group.Height; $hOut = $out.Height
    $groups = @($household.Group, $dev.Group).Count
    Write-Host "PANEL-TEST OK  status='$($statusLabel.Text)'  buttons=$($allButtons.Count)  groups=$groups  startEnabled=$($btnStart.Enabled)  stopEnabled=$($btnStop.Enabled)  port=$($portBox.Text)"
    Write-Host "PANEL-TEST LAYOUT  header=$hH  household=$hHouse  dev=$hDev  console=$hOut"
    if ($hH -lt 30 -or $hHouse -lt 30 -or $hDev -lt 30 -or $hOut -lt 50) {
        Write-Host 'PANEL-TEST FAIL  a container collapsed (height above too small)'
        exit 1
    }
    exit 0
}

[void]$form.ShowDialog()
