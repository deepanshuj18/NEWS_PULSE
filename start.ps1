# News Pulse Start Script

Write-Host "Starting News Pulse..." -ForegroundColor Cyan

# Start Backend
Write-Host "Starting Backend on port 3001..." -ForegroundColor Yellow
Start-Process -NoNewWindow -FilePath "npm.cmd" -ArgumentList "run dev" -WorkingDirectory "backend"

# Start Frontend
Write-Host "Starting Frontend on port 3000..." -ForegroundColor Green
Start-Process -NoNewWindow -FilePath "npm.cmd" -ArgumentList "run dev" -WorkingDirectory "frontend"

Write-Host "Both services are starting up. Please wait a moment." -ForegroundColor Cyan
Write-Host "Backend API: http://localhost:3001"
Write-Host "Frontend App: http://localhost:3000"
Write-Host "To trigger ingestion, use the 'Refresh Data' button in the UI, or hit the API endpoint."
