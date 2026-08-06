. (Join-Path $PSScriptRoot "_common.ps1")

try {
  $root = Get-AbysRoot
  $pidFile = Join-Path $root ".tais-demo.pid"
  if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host "Launcher PID kaydi yok; kapatilacak launcher sureci bulunmadi."; exit 0 }
  $launcherPid = 0
  [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$launcherPid) | Out-Null
  if ($launcherPid -gt 0 -and (Get-Process -Id $launcherPid -ErrorAction SilentlyContinue)) {
    Stop-AbysProcessTree -ProcessId $launcherPid
    Write-Host "Yalnizca launcher'in baslattigi ABYS process agaci kapatildi: $launcherPid"
  } else { Write-Host "Launcher process'i zaten kapali: $launcherPid" }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  exit 0
} catch {
  Write-Host "DURDURMA BASARISIZ: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
