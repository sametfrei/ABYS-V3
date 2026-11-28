# ABYS Dağıtım Runbook'u

Amaç: "sunucuda yeni sürüm görünmüyor" tartışmasını bitirmek. Her dağıtımda
çalışan commit **kanıtlanır**, tahmin edilmez.

## 1. Sürüm parmak izi (tek doğruluk kaynağı)

Derleme sırasında commit SHA'sı gömülür ve `/api/health` üzerinden okunur:

```bash
curl -s https://SUNUCU/api/health | jq '.build'
# { "commit": "5f4757a…", "builtAt": "2026-11-21T…Z" }
```

- Yerel/`next build`: SHA `git rev-parse HEAD`'den okunur.
- Docker imajı: `.git` imaja kopyalanmaz, SHA `--build-arg GIT_SHA=` ile verilir.

`build.commit` beklenen commit değilse, sunucu o sürümü **çalıştırmıyor**.
Ekranlara bakıp tahmin yürütmeye gerek yok.

Önemli: SHA **derleme anında gömülür**. Çalışan `.next` dizinini `BUILD_SHA=...`
ortam değişkeniyle başlatmak eski SHA'yı değiştirmez; her commit için yeniden
`npm run build` (Docker'da `--build`) gerekir.

Hazır kapı:

```bash
node scripts/verify-deploy.mjs --base=https://SUNUCU --expect=origin
# 0 eşleşti · 1 commit uyuşmuyor · 2 sağlık hatası · 3 kullanım hatası
```

## 2. Veritabanı backend seçimi

Yerel/demo kurulumunda dosya tabanlı PGlite varsayılandır. Üretimde yönetilen PostgreSQL için:

```bash
ABYS_DB_BACKEND=postgres
ABYS_DATABASE_URL=postgresql://ABYS_USER:...@DB_HOST:5432/ABYS_DB
PGSSLMODE=require
ABYS_DB_POOL_MAX=10
ABYS_DB_CONNECT_TIMEOUT_MS=5000
ABYS_DB_IDLE_TIMEOUT_MS=30000
```

- `ABYS_DATABASE_URL` önceliklidir; yoksa `DATABASE_URL` okunur.
- `PGSSLMODE=require` TLS'i zorunlu kılar. Sertifika doğrulamasını kapatmak gerekiyorsa yalnızca sağlayıcının gereksinimi doğrulandıktan sonra `PGSSL_REJECT_UNAUTHORIZED=false` kullanın.
- Pool en az iki bağlantı tutar: migration advisory lock bağlantısı ile migration transaction bağlantısı birbirinden ayrıdır.
- Migration'lar transaction içinde uygulanır; PostgreSQL modunda uygulama örnekleri arası session advisory lock kullanılır.
- DB kullanıcısına migration DDL yetkisi ve çalışma zamanı DML yetkisi gerekir. Secret'ı repoya veya loglara koymayın.
- Migration 18 hâlâ ayrıca `ABYS_MIGRATION_18_APPROVED=true` açık onayını ister.

**Sınır:** Bu adaptör ve sözleşme testleri eklendi; bu repo çalışmasında canlı/managed PostgreSQL sunucusuna bağlantı yapılmadı. Üretime almadan önce staging PostgreSQL üzerinde migration, rollback, TLS, pool exhaustion ve restore kabul testlerini çalıştırın.

## 3. Docker ile dağıtım (desteklenen yol)

```bash
cd /srv/ABYS-V3            # sunucudaki gerçek checkout
git fetch origin
git checkout main
git reset --keep origin/main   # yerel değişiklik yoksa; YIKICI DEĞİL, önce git status
GIT_SHA=$(git rev-parse HEAD) BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  docker compose up -d --build --force-recreate
curl -s http://127.0.0.1:3000/api/health | jq '.build'
```

> **En sık hata:** `docker compose up -d` **imajı yeniden derlemez.**
> Kod güncellenir, eski imaj çalışmaya devam eder. `--build` zorunludur.
> `--force-recreate` olmadan da eski konteyner ayakta kalabilir.

## 4. Node ile dağıtım (Docker yoksa)

```bash
cd /srv/ABYS-V3
git fetch origin && git checkout main && git reset --keep origin/main
npm ci
npm run build
npm run start -- -p 3000     # pm2/systemd altında: pm2 restart abys
```

`next start` **yeni** `.next` dizinini okur; build sonrası süreç yeniden
başlatılmazsa eski build bellekte kalır. `pm2 restart abys` veya
`systemctl restart abys` şart.

Kontrol:

```bash
ps -Ao pid,etime,command | grep -i "[n]ext\|[s]erver.js"
ss -ltnp | grep -E ':3000|:3100'
```

## 5. Dağıtım sonrası kabul testi

1. `curl -s .../api/health | jq '.build.commit'` == `git rev-parse origin/main`
2. `/api/health` → `ok:true`, `db:"up"`
3. Giriş yapılır, şu ekranlar açılır: Executive Command Center, dashboard +
   karar kanıtı, tahmin şeffaflığı, aksiyon yürütme durumu, Bitrix24 bağlayıcı
   senkron durumu, veri kalitesi paneli, TR/EN dil değiştirici.
4. Ters proxy doğru porta bakıyor mu: `curl -sI https://SUNUCU/ | head -1`.

## 6. Geri alma

```bash
git checkout <önceki-sha> && GIT_SHA=<önceki-sha> docker compose up -d --build
```

Veri volume'u (`abys-data`) dağıtımdan bağımsızdır; imaj değişimi veriyi silmez.
