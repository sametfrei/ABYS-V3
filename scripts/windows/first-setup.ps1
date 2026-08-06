. (Join-Path $PSScriptRoot "_common.ps1")

try {
  $root = Get-AbysRoot
  Assert-AbysNode
  Write-Host "ABYS proje klasoru: $root"

  $envFile = Join-Path $root ".env.local"
  if (-not (Test-Path -LiteralPath $envFile)) {
    if (-not (Test-Path -LiteralPath (Join-Path $root ".env.example"))) { throw ".env.example bulunamadi." }
    Copy-Item -LiteralPath (Join-Path $root ".env.example") -Destination $envFile
    Write-Host ".env.local .env.example uzerinden olusturuldu. Gercek secret eklenmedi."
  }

  $passwordValue = Read-AbysEnvValue -Root $root -Name "TAIS_DEMO_ADMIN_PASSWORD"
  if ($passwordValue -ne "abys-demo-2026") {
    throw "TAIS_DEMO_ADMIN_PASSWORD .env.example ile uyusmuyor."
  }

  $lines = @(Get-Content -LiteralPath $envFile)
  foreach ($flag in @("ALLOW_TAIS_DEMO_BOOTSTRAP", "ALLOW_TAIS_DEMO_RESET")) {
    if (-not ($lines -match "^\s*$flag\s*=")) { $lines += "$flag=true" }
    else { $lines = $lines | ForEach-Object { if ($_ -match "^\s*$flag\s*=") { "$flag=true" } else { $_ } } }
  }
  Set-Content -LiteralPath $envFile -Value $lines -Encoding UTF8

  Push-Location $root
  try {
    Write-Host "[1/4] npm ci"
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci basarisiz oldu." }
    Write-Host "[2/4] TAIS migration + bootstrap"
    & npm.cmd run demo:tais:bootstrap
    if ($LASTEXITCODE -ne 0) { throw "TAIS bootstrap basarisiz oldu." }
    Write-Host "[3/4] production build"
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "production build basarisiz oldu." }
  } finally { Pop-Location }

  try {
    $desktop = [Environment]::GetFolderPath("Desktop")
    if (Test-Path -LiteralPath $desktop) {
      $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop "TAIS ABYS Demo.lnk"))
      $shortcut.TargetPath = Join-Path $root "TAIS-ABYS-BASLAT.cmd"
      $shortcut.WorkingDirectory = $root
      $shortcut.Description = "TAIS ABYS demo baslat"
      $shortcut.Save()
      Write-Host "Masaustu kisayolu olusturuldu."
    }
  } catch { Write-Host "Masaustu kisayolu olusturulamadi; bu zorunlu degil." }

  Write-Host "[4/4] Kurulum tamamlandi. Giris: ceo@tais.demo; parola: abys-demo-2026."
  exit 0
} catch {
  Write-Host "KURULUM BASARISIZ: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
