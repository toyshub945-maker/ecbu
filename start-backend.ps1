# Run this in PowerShell window 1
Set-Location "$PSScriptRoot\backend"

# Create venv if it doesn't exist
if (-not (Test-Path ".venv")) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Cyan
    python -m venv .venv
}

# Activate venv
& ".venv\Scripts\Activate.ps1"

# Install dependencies
Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
pip install -r requirements.txt --quiet

# Load .env from project root
$envFile = "$PSScriptRoot\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim()
            if ($key -and $val) {
                [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
            }
        }
    }
}

# Dynamically detect local IP for network access (prefer 192.168.x.x)
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "192.168.*" } | Select-Object -First 1).IPAddress
if (-not $localIP) { 
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.InterfaceAlias -notlike "Loopback*" } | Select-Object -First 1).IPAddress
}
if (-not $localIP) { 
    $localIP = "192.168.13.2" # Fallback to last known good IP
}

Write-Host ""
Write-Host "Starting backend on http://${localIP}:8000" -ForegroundColor Green
Write-Host "Local network access: http://${localIP}:8000" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload


