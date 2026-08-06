# Gece eval koşusu: production sunucuyu 3001 portunda açar, tüm senaryoları
# koşar, sonucu evals\overnight-results.log dosyasına yazar ve sunucuyu kapatır.
# Bağımsız çalışır — Claude oturumu veya başka pencere kapansa da sürer.
# Önkoşul: npm run build alınmış olmalı (dev sunucu kilidi nedeniyle ikinci
# "next dev" açılamıyor; next start bu kilide takılmaz).
# Başlatma: Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File evals\run-overnight.ps1" -WindowStyle Hidden

Set-Location (Split-Path $PSScriptRoot -Parent)

$log = "evals\overnight-results.log"
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Gece eval koşusu başlıyor..." | Out-File $log -Encoding utf8

# PGlite TEK SÜREÇLİDİR: geliştirme sunucusu (3000) .data\abys-db dizinini
# kilitler. Eval sunucusu aynı dizini açmaya çalışırsa çakışır. Bu yüzden eval
# kendi ayrı veritabanı dizininde koşar — böylece 3000'de kalıcı bir sunucu
# açıkken de eval güvenle çalışabilir ve gerçek veriye dokunmaz.
$env:ABYS_DB_DIR = ".data\eval-db"

$server = Start-Process -FilePath "cmd" -ArgumentList "/c npx next start -p 3001 > evals\overnight-server.log 2>&1" -WindowStyle Hidden -PassThru

# Sunucunun açılmasını bekle (max 2 dk)
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest "http://localhost:3001" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}

if (-not $ready) {
    "[$(Get-Date -Format 'HH:mm:ss')] HATA: sunucu 3001 portunda açılamadı." | Out-File $log -Append -Encoding utf8
} else {
    "[$(Get-Date -Format 'HH:mm:ss')] Sunucu hazır, senaryolar koşuluyor (CPU'da ~1,5 saat sürebilir)..." | Out-File $log -Append -Encoding utf8
    $env:EVAL_BASE_URL = "http://localhost:3001"
    npm run eval 2>&1 | Out-File $log -Append -Encoding utf8
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Koşu tamamlandı." | Out-File $log -Append -Encoding utf8
}

# Sunucu ağacını kapat (cmd + node çocukları)
taskkill /PID $server.Id /T /F 2>$null | Out-Null
