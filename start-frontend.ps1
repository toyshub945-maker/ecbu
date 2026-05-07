# Run this in PowerShell window 2 (after backend is running)
Set-Location "$PSScriptRoot\frontend"

# Install npm packages if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies (first time, ~1 min)..." -ForegroundColor Cyan
    npm install
}

# Detect LAN IP for display purposes only
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" } | Select-Object -First 1).IPAddress
if (-not $localIP) { $localIP = "localhost" }

# Proxy always uses localhost — the Next.js server runs on the same machine as the backend
$env:NEXT_PUBLIC_BACKEND_URL = "http://localhost:8000"
"NEXT_PUBLIC_BACKEND_URL=http://localhost:8000" | Out-File -FilePath "$PSScriptRoot\frontend\.env.local" -Encoding utf8NoBOM

Write-Host ""
Write-Host "Starting frontend on http://localhost:3002" -ForegroundColor Green
Write-Host "Network access: http://${localIP}:3002" -ForegroundColor Cyan
Write-Host "Backend proxy: http://localhost:8000" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

# Run Next.js and bind to 0.0.0.0 so it's accessible on the network
npm run dev -- -H 0.0.0.0


