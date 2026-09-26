$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:PIP_CACHE_DIR = Join-Path $PSScriptRoot '.cache\pip'
$env:HF_HOME = Join-Path $PSScriptRoot '.cache\huggingface'
$installTemp = Join-Path $PSScriptRoot '.cache\tmp'
New-Item -ItemType Directory -Force -Path $installTemp | Out-Null
$env:TEMP = $installTemp
$env:TMP = $installTemp
if (-not (Test-Path '.venv\Scripts\python.exe')) {
    py -3.14 -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.14 is required for the pinned Windows environment.' }
}
& .\.venv\Scripts\python.exe -m pip install -r requirements-local.txt
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
Write-Host 'Setup complete. See README.md for demo and resume matching commands.'
