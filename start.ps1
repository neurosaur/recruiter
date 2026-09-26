$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:HF_HOME = Join-Path $PSScriptRoot '.cache\huggingface'
$env:PIP_CACHE_DIR = Join-Path $PSScriptRoot '.cache\pip'
$appTemp = Join-Path $PSScriptRoot '.cache\tmp'
New-Item -ItemType Directory -Force -Path $appTemp | Out-Null
$env:TEMP = $appTemp
$env:TMP = $appTemp
$env:PYTHONPYCACHEPREFIX = Join-Path $PSScriptRoot '.cache\pycache'
$env:STREAMLIT_BROWSER_GATHER_USAGE_STATS = 'false'
& .\.venv\Scripts\python.exe -m streamlit run app.py
