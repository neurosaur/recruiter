$appRoot = Split-Path $PSScriptRoot -Parent
$stateRoot = Join-Path $appRoot '.cache\autosync'
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
New-Item -ItemType File -Path (Join-Path $stateRoot 'stop') -Force | Out-Null
Disable-ScheduledTask -TaskName 'NeurosaurGitAutoSync' -ErrorAction SilentlyContinue | Out-Null
Write-Host 'Auto-sync will stop within 10 seconds. The login task is disabled.'
