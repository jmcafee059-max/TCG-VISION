$ErrorActionPreference = 'Stop'

# Starts backend + frontend together for local development.
# IMPORTANT:
# - Put your phone and this PC on the same Wi‑Fi.
# - This uses Expo LAN mode so the phone can reach the backend at http://<PC-IP>:8000

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'

function Get-PrivateIPv4 {
  $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.InterfaceOperationalStatus -eq 'Up' -and
      $_.IPAddress -notlike '169.254.*' -and
      (
        $_.IPAddress -like '192.168.*' -or
        $_.IPAddress -like '10.*' -or
        $_.IPAddress -match '^172\.(1[6-9]|2\d|3[0-1])\.'
      )
    }

  $ip = $candidates | Select-Object -First 1 -ExpandProperty IPAddress
  if (-not $ip) { $ip = '127.0.0.1' }
  return $ip
}

$ip = Get-PrivateIPv4
$backendUrl = "http://$ip`:8000"
Write-Host "Using backend URL: $backendUrl"

# Ensure Expo gets the backend URL (Expo reads EXPO_PUBLIC_* at bundling time)
$env:EXPO_PUBLIC_BACKEND_URL = $backendUrl

# Start backend as a background job
$backendJob = Start-Job -Name 'tcg-vision-backend' -ScriptBlock {
  param($dir)
  Set-Location $dir
  py -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
} -ArgumentList $backendDir

Start-Sleep -Seconds 2

try {
  Set-Location $frontendDir
  npx expo start --lan
} finally {
  # Cleanup backend job if Expo stops
  if ($backendJob -and (Get-Job -Id $backendJob.Id -ErrorAction SilentlyContinue)) {
    Stop-Job -Id $backendJob.Id -Force | Out-Null
    Remove-Job -Id $backendJob.Id -Force | Out-Null
  }
}
