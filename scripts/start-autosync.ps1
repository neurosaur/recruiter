$appRoot = Split-Path $PSScriptRoot -Parent
$stopFile = Join-Path $appRoot '.cache\autosync\stop'
if (Test-Path -LiteralPath $stopFile) { Remove-Item -LiteralPath $stopFile }
Enable-ScheduledTask -TaskName 'NeurosaurGitAutoSync' | Out-Null
Start-ScheduledTask -TaskName 'NeurosaurGitAutoSync'
Write-Host 'Auto-sync enabled and started.'
