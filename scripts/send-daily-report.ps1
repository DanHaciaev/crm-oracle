# Ежедневный отчёт CRM — вызывается Планировщиком задач Windows в 9:00
$url = "http://localhost:3003/api/cron/report"

try {
    $response = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing -TimeoutSec 30
    Write-Host "OK: $($response.StatusCode) — $(Get-Date)"
} catch {
    Write-Host "ERROR: $($_.Exception.Message) — $(Get-Date)"
}
