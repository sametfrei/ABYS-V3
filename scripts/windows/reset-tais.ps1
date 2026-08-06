. (Join-Path $PSScriptRoot "_common.ps1")

try {
  $root = Get-AbysRoot
  if (-not (Test-Path -LiteralPath (Join-Path $root ".env.local"))) { throw ".env.local yok. Once kurulum yapin." }
  Push-Location $root
  try {
    & npm.cmd run demo:tais:reset
    if ($LASTEXITCODE -ne 0) { throw "TAIS reset basarisiz oldu." }
  } finally { Pop-Location }
  Write-Host "Sadece TAIS demo verisi baslangic senaryosuna dondu."
  exit 0
} catch {
  Write-Host "RESET BASARISIZ: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
