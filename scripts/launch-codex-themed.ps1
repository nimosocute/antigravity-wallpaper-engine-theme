$ErrorActionPreference = 'SilentlyContinue'
$codexAlias = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\chatgpt-desktop.exe'
$daemonJs = Join-Path $PSScriptRoot '..\daemon\theme_daemon.js'

$running = Get-CimInstance Win32_Process -Filter "Name = 'ChatGPT.exe'" | Where-Object { $_.CommandLine -notmatch '--type=' } | Select-Object -First 1
if ($running -and $running.CommandLine -notmatch 'remote-debugging-port') {
    Stop-Process -Name 'ChatGPT' -Force
    Start-Sleep -Milliseconds 500
    $running = $null
}

if (-not $running -and (Test-Path $codexAlias)) {
    Start-Process -FilePath $codexAlias -ArgumentList '--remote-debugging-port=0'
}

# Start shared theme_daemon.js only if not already running (PID lock prevents duplicates)
if (Test-Path $daemonJs) {
    Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList "`"$daemonJs`""
}
