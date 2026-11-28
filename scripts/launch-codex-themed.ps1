$ErrorActionPreference = 'SilentlyContinue'
$codexAlias = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\chatgpt-desktop.exe'
$daemonJs = Join-Path $PSScriptRoot '..\daemon\theme_daemon.js'

# Ensure shared theme_daemon.js is running first
$daemonRunning = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like '*theme_daemon.js*' } | Select-Object -First 1
if (-not $daemonRunning) {
    $startedTask = $false
    try {
        Start-ScheduledTask -TaskName 'AntigravityCodexCustomTheme' -ErrorAction Stop
        $startedTask = $true
    } catch {}
    if (-not $startedTask -and (Test-Path $daemonJs)) {
        Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList "`"$daemonJs`""
    }
}

$procs = Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe' OR Name='chatgpt-desktop.exe'"
$hasFlag = $procs | Where-Object { $_.CommandLine -match 'remote-debugging-port' } | Select-Object -First 1
$mainProc = $procs | Where-Object { $_.Name -eq 'ChatGPT.exe' -and $_.CommandLine -notmatch '--type=' } | Select-Object -First 1
$uiRenderer = $procs | Where-Object { $_.CommandLine -match '--type=renderer' -and $_.CommandLine -notmatch '--extension-process' } | Select-Object -First 1

if ($hasFlag -and $uiRenderer) {
    # Already running with CDP enabled: bring existing themed window to foreground
    $pkg = Get-AppxPackage OpenAI.Codex | Select-Object -First 1
    if ($pkg -and $pkg.PackageFamilyName) {
        Start-Process 'explorer.exe' "shell:AppsFolder\$($pkg.PackageFamilyName)!App"
    }
    exit 0
}

if ($mainProc -or $procs) {
    # Running without CDP or stuck without renderer: cleanly restart with CDP
    Get-Process -Name 'ChatGPT' | ForEach-Object { try { $_.CloseMainWindow() | Out-Null } catch {} }
    Start-Sleep -Milliseconds 400
    Stop-Process -Name 'ChatGPT' -Force
    for ($i = 0; $i -lt 10 -and (Get-Process -Name 'ChatGPT'); $i++) {
        Start-Sleep -Milliseconds 150
    }
}

if (Test-Path $codexAlias) {
    Start-Process -FilePath $codexAlias -ArgumentList '--remote-debugging-port=0' -WorkingDirectory $env:USERPROFILE
}
