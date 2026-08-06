$ErrorActionPreference = "Stop"

function Get-AbysRoot {
  $root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
  if (-not (Test-Path -LiteralPath $root.Path)) { throw "ABYS proje klasoru bulunamadi: $($root.Path)" }
  return $root.Path
}

function Read-AbysEnvValue([string]$Root, [string]$Name, [string]$Default = "") {
  $file = Join-Path $Root ".env.local"
  if (-not (Test-Path -LiteralPath $file)) { return $Default }
  $line = Get-Content -LiteralPath $file | Where-Object { $_ -match "^\s*$([Regex]::Escape($Name))\s*=" } | Select-Object -Last 1
  if (-not $line) { return $Default }
  return (($line -split "=", 2)[1]).Trim().Trim('"').Trim("'")
}

function Stop-AbysProcessTree([int]$ProcessId) {
  $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue)
  foreach ($child in $children) { Stop-AbysProcessTree -ProcessId ([int]$child.ProcessId) }
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($process) { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue }
}

function Test-AbysHealth([int]$Port) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch { return $false }
}

function Assert-AbysNode {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $node -or -not $npm) {
    throw "Node.js ve npm bulunamadi. Node.js LTS kurup bu kurulum dosyasini yeniden calistirin."
  }
}
