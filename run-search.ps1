# Runs the job search and opens the report. Double-click-friendly via:
#   powershell -ExecutionPolicy Bypass -File .\run-search.ps1
Set-Location -Path $PSScriptRoot
node search.js --open *>&1 | Tee-Object -FilePath "data\last-run.log"
