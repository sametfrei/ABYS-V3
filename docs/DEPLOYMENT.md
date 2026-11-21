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

## 2. Docker ile dağıtım (desteklenen yol)

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

## 3. Node ile dağıtım (Docker yoksa)

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

## 4. Dağıtım sonrası kabul testi

1. `curl -s .../api/health | jq '.build.commit'` == `git rev-parse origin/main`
2. `/api/health` → `ok:true`, `db:"up"`
3. Giriş yapılır, şu ekranlar açılır: Executive Command Center, dashboard +
   karar kanıtı, tahmin şeffaflığı, aksiyon yürütme durumu, Bitrix24 bağlayıcı
   senkron durumu, veri kalitesi paneli, TR/EN dil değiştirici.
4. Ters proxy doğru porta bakıyor mu: `curl -sI https://SUNUCU/ | head -1`.

## 5. Geri alma

```bash
git checkout <önceki-sha> && GIT_SHA=<önceki-sha> docker compose up -d --build
```

Veri volume'u (`abys-data`) dağıtımdan bağımsızdır; imaj değişimi veriyi silmez.
