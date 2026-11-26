param(
    [switch]$NoStartup,
    [ValidateSet('', 'antigravity', 'codex', 'both')]
    [string]$Target = ''
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$DaemonJs = Join-Path $RepoRoot 'daemon\theme_daemon.js'
$PayloadJs = Join-Path $RepoRoot 'dist\theme_payload.js'
$BuildPy = Join-Path $RepoRoot 'scripts\build_payload.py'
$PidFile = Join-Path $RepoRoot 'daemon.pid'
$VbsPath = Join-Path $RepoRoot 'silent-start.vbs'
$TargetsFile = Join-Path $RepoRoot '.install-targets.json'

if ([string]::IsNullOrWhiteSpace($Target)) {
    if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        Write-Host ""
        Write-Host "Select target app(s) for Custom Theme:" -ForegroundColor Cyan
        Write-Host "  [1] Antigravity only"
        Write-Host "  [2] Codex App only (auto-starts shared daemon & enables direct launch)"
        Write-Host "  [3] Both Antigravity & Codex App (shared daemon, minimal RAM/CPU) [default]"
        $choice = Read-Host "Enter choice (1/2/3)"
        switch ($choice.Trim()) {
            '1' { $Target = 'antigravity' }
            '2' { $Target = 'codex' }
            default { $Target = 'both' }
        }
    } else {
        $Target = 'both'
    }
}

$SelectedTargets = switch ($Target.ToLower()) {
    'antigravity' { @('antigravity') }
    'codex'       { @('codex') }
    default       { @('antigravity', 'codex') }
}
$TargetsJson = @{ targets = $SelectedTargets } | ConvertTo-Json -Depth 3
[System.IO.File]::WriteAllText($TargetsFile, $TargetsJson, [System.Text.UTF8Encoding]::new($false))
Write-Host "[install-win] Configured target(s): $($SelectedTargets -join ', ')"

$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
    Write-Error "Node.js not found in PATH. Install Node.js >= 22 first."
}
$NodeExe = $NodeCmd.Source
$NodeMajor = [int]((& $NodeExe -p "process.versions.node.split('.')[0]").Trim())
if ($NodeMajor -lt 22) {
    Write-Error "Node.js >= 22 is required (found v$NodeMajor at $NodeExe)."
}

if (-not (Test-Path $PayloadJs)) {
    $PyCmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $PyCmd) {
        $PyCmd = Get-Command python3 -ErrorAction SilentlyContinue
    }
    if (-not $PyCmd) {
        Write-Error "dist/theme_payload.js is missing and Python was not found to build it."
    }
    Write-Host "[install-win] Building dist/theme_payload.js..."
    & $PyCmd.Source $BuildPy
    if ($LASTEXITCODE -ne 0) {
        Write-Error "build_payload.py failed with exit code $LASTEXITCODE."
    }
}

if (Test-Path $PidFile) {
    $OldPidText = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    $OldPid = 0
    if ([int]::TryParse(($OldPidText -as [string]), [ref]$OldPid) -and $OldPid -gt 0) {
        $ExistingProc = Get-Process -Id $OldPid -ErrorAction SilentlyContinue
        if ($ExistingProc -and $ExistingProc.ProcessName -eq 'node') {
            Write-Host "[install-win] Stopping existing daemon (PID $OldPid)..."
            Stop-Process -Id $OldPid -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 350
        }
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

# Generate silent-start.vbs dynamically without hardcoding user or Node paths.
$EscapedNode = $NodeExe.Replace('"', '""')
$EscapedDaemon = $DaemonJs.Replace('"', '""')
$VbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "$($RepoRoot.Replace('"', '""'))"
WshShell.Run """$EscapedNode"" ""$EscapedDaemon""", 0, False
"@
Set-Content -Path $VbsPath -Value $VbsContent -Encoding ASCII

if (-not $NoStartup) {
    $StartupDir = [Environment]::GetFolderPath('Startup')
    $OldShortcutPath = Join-Path $StartupDir 'AntigravityCustomTheme.lnk'
    if (Test-Path $OldShortcutPath) {
        Remove-Item $OldShortcutPath -Force -ErrorAction SilentlyContinue
        Write-Host "[install-win] Removed legacy Windows Startup shortcut: $OldShortcutPath"
    }

    $WshShell = New-Object -ComObject WScript.Shell
    $CodexStartupLnk = Join-Path $StartupDir 'CodexCustomTheme.lnk'

    if ($SelectedTargets -contains 'antigravity') {
        # Register native Antigravity Plugin Sidecar so Antigravity auto-starts the daemon on launch and kills it on exit
        $PluginRoot = Join-Path $env:USERPROFILE '.gemini\config\plugins\antigravity-custom-theme-plugin'
        $SidecarDir = Join-Path $PluginRoot 'sidecars\theme-engine'
        New-Item -ItemType Directory -Path $SidecarDir -Force | Out-Null

        $PluginJson = @{
            name = 'antigravity-custom-theme-plugin'
            description = 'Auto-starts and auto-stops the Antigravity Custom Theme & Live Wallpaper Engine daemon alongside Antigravity.'
        } | ConvertTo-Json -Depth 4
        Set-Content -Path (Join-Path $PluginRoot 'plugin.json') -Value $PluginJson -Encoding UTF8

        $SidecarJson = @{
            command = 'node'
            args = @($DaemonJs)
            restart_policy = 'always'
            display_name = 'Custom Theme Engine'
            description = 'Background CDP theme injector and Wallpaper Engine local media server.'
            has_web_ui = $true
            ui_config = @{
                display_name = 'Custom Theme Engine'
                views = @()
            }
        } | ConvertTo-Json -Depth 5
        Set-Content -Path (Join-Path $SidecarDir 'sidecar.json') -Value $SidecarJson -Encoding UTF8
        Write-Host "[install-win] Registered native Antigravity sidecar: $(Join-Path $SidecarDir 'sidecar.json')"

        # Ensure Antigravity shortcuts include --remote-debugging-port=0 (required on Antigravity >= 2.33.0)
        $AgyShortcuts = @(
            (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Antigravity.lnk'),
            (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Antigravity.lnk'),
            (Join-Path $env:USERPROFILE 'Desktop\Antigravity.lnk')
        )
        foreach ($LnkPath in $AgyShortcuts) {
            if (Test-Path $LnkPath) {
                try {
                    $Sc = $WshShell.CreateShortcut($LnkPath)
                    if ($Sc.Arguments -notmatch 'remote-debugging-port') {
                        $Sc.Arguments = ("--remote-debugging-port=0 " + $Sc.Arguments).Trim()
                        $Sc.Save()
                        Write-Host "[install-win] Enabled --remote-debugging-port=0 on shortcut: $LnkPath"
                    }
                } catch {}
            }
        }
    }

    if ($SelectedTargets -contains 'codex') {
        # Register Windows Startup shortcut AND Scheduled Task so shared theme_daemon.js survives subshells & auto-starts at logon
        $StartupSc = $WshShell.CreateShortcut($CodexStartupLnk)
        $StartupSc.TargetPath = 'wscript.exe'
        $StartupSc.Arguments = "`"$VbsPath`""
        $StartupSc.WorkingDirectory = $RepoRoot
        $StartupSc.Save()
        Write-Host "[install-win] Registered Windows Startup for Codex auto-theming: $CodexStartupLnk"

        try {
            $TaskName = 'AntigravityCodexCustomTheme'
            $Action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$VbsPath`"" -WorkingDirectory $RepoRoot
            $Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
            $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
            Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Force | Out-Null
            Write-Host "[install-win] Registered Scheduled Task: $TaskName"
        } catch {
            Write-Warning "[install-win] Scheduled Task registration skipped: $($_.Exception.Message)"
        }

        # Create/update direct Codex shortcuts (Start Menu & Desktop) with --remote-debugging-port=0
        $CodexAlias = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\chatgpt-desktop.exe'
        if (Test-Path $CodexAlias) {
            $CodexShortcuts = @(
                (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Codex.lnk'),
                (Join-Path $env:USERPROFILE 'Desktop\Codex.lnk')
            )
            foreach ($CodexLnk in $CodexShortcuts) {
                try {
                    $Sc = $WshShell.CreateShortcut($CodexLnk)
                    $Sc.TargetPath = $CodexAlias
                    $Sc.Arguments = '--remote-debugging-port=0'
                    $Sc.WorkingDirectory = Split-Path -Parent $CodexAlias
                    $Sc.Save()
                    Write-Host "[install-win] Configured direct themed Codex shortcut: $CodexLnk"
                } catch {}
            }
        }
    } elseif (Test-Path $CodexStartupLnk) {
        Remove-Item $CodexStartupLnk -Force -ErrorAction SilentlyContinue
    }
}

if (Test-Path $PidFile) {
    $CurPid = 0
    $CurPidText = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ([int]::TryParse(($CurPidText -as [string]), [ref]$CurPid) -and $CurPid -gt 0) {
        if (Get-Process -Id $CurPid -ErrorAction SilentlyContinue) {
            Write-Host "[install-win] Daemon already running via native sidecar (PID $CurPid)."
            exit 0
        }
    }
}

Write-Host "[install-win] Launching daemon..."
$StartedViaTask = $false
if ($SelectedTargets -contains 'codex') {
    try {
        Start-ScheduledTask -TaskName 'AntigravityCodexCustomTheme' -ErrorAction Stop
        $StartedViaTask = $true
    } catch {}
}
if (-not $StartedViaTask) {
    Start-Process -FilePath 'wscript.exe' -ArgumentList """$VbsPath""" -WorkingDirectory $RepoRoot
}

for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-Path $PidFile) {
        $NewPidText = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
        $NewPid = 0
        if ([int]::TryParse(($NewPidText -as [string]), [ref]$NewPid) -and $NewPid -gt 0) {
            if (Get-Process -Id $NewPid -ErrorAction SilentlyContinue) {
                Write-Host "[install-win] Daemon running silently (PID $NewPid)."
                exit 0
            }
        }
    }
}

Write-Warning "[install-win] Daemon did not write daemon.pid in time. Check $RepoRoot\daemon.log."
exit 1
