# Ежедневный отчёт CRM — вызывается Планировщиком задач Windows в 9:00
$url = "http://localhost:3003/api/cron/report"

# Cron endpoints require the x-cron-secret header (CRON_SECRET from the
# project's .env, next to this scripts/ folder).
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
$secret = $null
if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^\s*CRON_SECRET\s*=' } | Select-Object -First 1
    if ($line) { $secret = ($line -split '=', 2)[1].Trim().Trim('"', "'") }
}
if (-not $secret) {
    Write-Host "ERROR: CRON_SECRET not found in $envFile — $(Get-Date)"
    exit 1
}

try {
    $response = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing -TimeoutSec 30 -Headers @{ "x-cron-secret" = $secret }
    Write-Host "OK: $($response.StatusCode) — $(Get-Date)"
} catch {
    Write-Host "ERROR: $($_.Exception.Message) — $(Get-Date)"
}
