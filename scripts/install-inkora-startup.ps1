$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$startupDirectory = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDirectory 'INKORA Services.lnk'
$powershellPath = (Get-Command 'powershell.exe' -ErrorAction Stop).Source
$scriptPath = Join-Path $PSScriptRoot 'start-inkora.ps1'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershellPath
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
$shortcut.WorkingDirectory = $root
$shortcut.WindowStyle = 7
$shortcut.Description = 'Start local INKORA, n8n, and integration services after sign-in.'
$shortcut.Save()

Write-Output "Installed INKORA startup shortcut: $shortcutPath"
