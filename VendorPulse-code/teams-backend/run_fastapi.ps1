param(
  [int]$Port = 3001
)

$ErrorActionPreference = 'Stop'

# Use the workspace venv that was already configured (avoids launcher issues with nested .venv folders)
$Py = "c:/Users/AK115384/Desktop/New repo VenderPulse/VendorPulse/.venv/Scripts/python.exe"

if (-not (Test-Path $Py)) {
  Write-Error "Python venv not found at: $Py`nOpen the workspace and re-create the .venv (Python: Create Environment) or update `$Py in run_fastapi.ps1"
  exit 1
}

Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)

& $Py -m pip install -r .\requirements.txt
& $Py -m uvicorn app:app --reload --port $Port
