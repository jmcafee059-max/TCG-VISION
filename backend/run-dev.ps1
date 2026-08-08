$ErrorActionPreference = 'Stop'

# Start the FastAPI backend for local development.
# - Binds to 0.0.0.0 so your phone on the same Wi‑Fi can reach it.
# - Uses --reload for code changes.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

py -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
