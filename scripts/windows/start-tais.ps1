. (Join-Path $PSScriptRoot "_common.ps1")

try {
  $root = Get-AbysRoot
  Assert-AbysNode
  $envFile = Join-Path $root ".env.local"
  if (-not (Test-Path -LiteralPath $envFile)) { throw ".env.local yok. Once TAIS-ABYS-ILK-KURULUM.cmd calistirin." }
  if (-not (Test-Path -LiteralPath (Join-Path $root ".next"))) { throw ".next build yok. Once TAIS-ABYS-ILK-KURULUM.cmd calistirin." }
  $port = [int](Read-AbysEnvValue -Root $root -Name "PORT" -Default "3000")
  $pidFile = Join-Path $root ".tais-demo.pid"
  $logDir = Join-Path $root ".tais-logs"
  if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

  if (Test-Path -LiteralPath $pidFile) {
    $existingPid = 0
    [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$existingPid) | Out-Null
    if ($existingPid -gt 0 -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) -and (Test-AbysHealth -Port $port)) {
      Write-Host "TAIS ABYS zaten calisiyor. PID: $existingPid"
      Start-Process "http://127.0.0.1:$port/login"
      exit 0
    }
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  }

  $stdout = Join-Path $logDir "tais-abys.out.log"
  $stderr = Join-Path $logDir "tais-abys.err.log"
  Write-Host "TAIS ABYS production sunucusu baslatiliyor: http://127.0.0.1:$port"
  $process = Start-Process -FilePath "npm.cmd" -ArgumentList @("start", "--", "-p", "$port", "-H", "127.0.0.1") -WorkingDirectory $root -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ASCII

  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    if (Test-AbysHealth -Port $port) { $ready = $true; break }
    if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) { break }
  }
  if (-not $ready) {
    Stop-AbysProcessTree -ProcessId $process.Id
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    throw "Health endpoint 60 saniye icinde basarili olmadi. Loglar: $stdout ve $stderr"
  }
  Write-Host "Hazir. PID: $($process.Id) | Loglar: $stdout, $stderr"
  Start-Process "http://127.0.0.1:$port/login"
  exit 0
} catch {
  Write-Host "BASLATMA BASARISIZ: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
