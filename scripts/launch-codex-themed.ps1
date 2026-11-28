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
$visibleProc = Get-Process -Name 'ChatGPT' | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1

if ($hasFlag -and $visibleProc) {
    # Already running with CDP enabled and a visible window: restore and focus it directly
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class AgyWinFocus {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@ -ErrorAction SilentlyContinue
    [AgyWinFocus]::ShowWindow($visibleProc.MainWindowHandle, 9) | Out-Null
    [AgyWinFocus]::SetForegroundWindow($visibleProc.MainWindowHandle) | Out-Null
    exit 0
}

if ($procs) {
    # Clean up any non-CDP or ghost/headless ChatGPT processes before launching with CDP
    Get-Process -Name 'ChatGPT' | ForEach-Object { try { $_.CloseMainWindow() | Out-Null } catch {} }
    Start-Sleep -Milliseconds 350
    Stop-Process -Name 'ChatGPT' -Force
    for ($i = 0; $i -lt 10 -and (Get-Process -Name 'ChatGPT'); $i++) {
        Start-Sleep -Milliseconds 150
    }
}

if (Test-Path $codexAlias) {
    Start-Process -FilePath $codexAlias -ArgumentList '--remote-debugging-port=0' -WorkingDirectory $env:USERPROFILE
}
