# ABYS — Awareness & Business Yield System

AI destekli kurumsal farkındalık ve karar-destek platformu.
İlke: **Awareness Before Action** — organizasyonunu 30 saniyede anla.

Karar motoru; kanıt zinciri, güven skoru, karşı senaryo ve kısıt-farkındalıklı
seçenekler üretir. Sayısal iddialar deterministik olarak doğrulanır
(`src/lib/ai/verify-cases.ts`), sektör bilgi paketlerindeki hesaplar kodda
yapılır, model yalnızca alıntılar. Kararlar ve sonuçları kurumsal hafızaya
kaydedilir ve sonraki analizlere beslenir.

## Kurulum

```bash
npm install
# Yerel AI (varsayılan ve önerilen):
ollama pull qwen3:4b-instruct
ollama pull nomic-embed-text   # hibrit belge erişimi için
npm run dev            # http://localhost:3000
```

İlk çalıştırmada veritabanı otomatik migrate edilir ve deterministik TAIS
organizasyonu + tek demo hesabı tohumlanır (`src/lib/db/seed.ts`). `/login`
sayfasından aşağıdaki hesapla giriş yapılabilir:

| E-posta | Rol |
|---|---|
| `ceo@tais.demo` | TAIS Genel Müdür (ceo) |

Demo parolası `.env.example` ve `KURULUM-VE-GIRIS-BILGILERI.txt` içinde
`abys-demo-2026` olarak belgelenmiştir; gerçek üretim hesabı değildir.

### Windows masaüstü paketi

`npm run desktop:package`, mevcut Next.js uygulamasının standalone çıktısını
Electron içine alır ve Windows x64 NSIS kurulum dosyası üretir. Kurulan
uygulama kendi yerel hizmetini çakışmayan bir portta başlatır, tarayıcı veya
terminal açmaz ve pencere kapanınca hizmeti durdurur.

### Giriş akışı

`/login` → `POST /api/auth/login` (e-posta + parola, scrypt doğrulama) →
başarılıysa sunucu tarafında oturum çerezi kurulur → `/dashboard`'a
yönlendirilir. Yetkiler role göre sunucuda uygulanır (`src/lib/auth/`);
`org_id` her zaman oturumdan okunur, istekten asla kabul edilmez.

### Ortam değişkenleri (.env.local)

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `AI_POLICY` | `LOCAL_ONLY` | `LOCAL_ONLY`: sadece Ollama, buluta sessiz geçiş YOK. `CLOUD_ALLOWED`: yerel kapalıysa Gemini'ye açık geçiş (loglanır). `CLOUD_ONLY`: sadece Gemini. `DEMO_DETERMINISTIC`: model çağrılmaz, kurallarla yapısal çıktı — kimlik bilgisi/Ollama olmadan gösterim için. |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama adresi |
| `OLLAMA_MODEL` | `qwen3:4b-instruct` | Yerel karar/sohbet modeli |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Yerel embedding modeli (hibrit belge erişimi) |
| `GEMINI_API_KEY` | — | Sadece CLOUD_* politikalarında gerekli |

## Docker ile çalıştırma

```bash
docker compose up --build
# ilk açılışta Ollama modellerini indir (konteyner içine):
docker compose exec ollama ollama pull qwen3:4b-instruct
docker compose exec ollama ollama pull nomic-embed-text
```

`docker-compose.yml` iki servis kurar: `abys` (uygulama, standalone Next.js
çıktısı ile çalışır, `.data` klasörü `abys-data` volume'unda kalıcıdır) ve
`ollama` (yerel model sunucusu, modeller `ollama-data` volume'unda kalıcıdır).
`abys` servisi `OLLAMA_URL`'i otomatik olarak `http://ollama:11434` konteyner
adresine ayarlar.

Sadece imajı build edip tek başına (harici bir Ollama'ya bağlanarak)
çalıştırmak için:

```bash
docker build -t abys-app .
docker run -p 3000:3000 \
  -e AI_POLICY=LOCAL_ONLY \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  -e OLLAMA_MODEL=qwen3:4b-instruct \
  -e OLLAMA_EMBED_MODEL=nomic-embed-text \
  -v abys-data:/app/.data \
  abys-app
```

`host.docker.internal`, konteynerden host makinede çalışan Ollama'ya
ulaşmak için kullanılır (Docker Desktop/Windows/Mac'te varsayılan olarak
çalışır; Linux'ta `--add-host=host.docker.internal:host-gateway` eklenmeli).
Ortam değişkenleri yukarıdaki [Ortam değişkenleri](#ortam-değişkenleri-envlocal)
tablosuyla aynıdır.

## Komutlar

```bash
npm run dev      # geliştirme sunucusu
npm run build    # üretim derlemesi (internet gerektirmez)
npm run lint     # 0 hata / 0 uyarı beklenir
npx tsc --noEmit # tip kontrolü
npm run eval     # AI değerlendirme süiti (CPU'da senaryo başına ~5-6 dk)
```

Eval taban çizgisi: **128/143 (%90)** — ayrıntı: `evals/BASELINE.md`.
Tam süit gece koşusu: `evals/run-overnight.ps1`.

## Sayfalar

| Yol | Açıklama |
|---|---|
| `/login` | Kurumsal giriş |
| `/onboarding` | Prototip profil akışı (Faz 2 öncesi kalıntı) |
| `/dashboard` | Yönetim Merkezi |
| `/dashboard/ask` | Ask ABYS |
| `/dashboard/decisions` | Karar Merkezi |
| `/dashboard/actions` | Aksiyonlar |
| `/dashboard/scenarios` | Senaryo Laboratuvarı |
| `/dashboard/memory` | Kurumsal Hafıza |
| `/dashboard/analysis` | Analiz |
| `/dashboard/reports` | Raporlar |
| `/dashboard/alerts` | Riskler ve Sinyaller |
| `/dashboard/integrations` | Veri Kaynakları |
| `/dashboard/settings` | Ayarlar |

## API uçları

| Uç | Not |
|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Oturum yönetimi |
| `POST /api/analyze` | AI analiz — oturum gerekli (yalnızca `ABYS_PUBLIC_DEMO=1` iken oturumsuz) |
| `POST /api/briefing` | AI brifing — oturum gerekli (aynı istisna) |
| `POST /api/ingest` | Veri içe alma — oturum gerekli (aynı istisna) |
| `POST /api/ask` | Ask ABYS sohbet ucu |
| `GET/POST /api/actions` | Aksiyon listesi/oluşturma |
| `POST /api/assess-risk` | Risk değerlendirme |
| `GET /api/audit` | Denetim günlüğü |
| `GET/POST /api/decision-cases` | Karar vakaları |
| `GET/POST /api/decisions` | Karar kayıtları |
| `GET/POST /api/documents` | Kurumsal hafıza belgeleri |
| `GET /api/integration/advisors` | Danışman analitiği verisi |
| `POST /api/integration/events` | Portal olay alımı (API anahtarı ile) |
| `GET/POST/DELETE /api/integration/keys` | API anahtarı yönetimi |
| `GET /api/market-pulse` | Piyasa nabzı verisi |
| `POST /api/migrate-local` | Yerel (localStorage) veriyi sunucuya taşıma |
| `GET/POST /api/outcomes` | Karar sonuç takibi |
| `POST /api/scenarios` | Senaryo karşılaştırma motoru |
| `GET/POST /api/signals` | Riskler ve sinyaller |
| `GET /api/trace` | Karar kanıt izi |
| `GET/POST /api/webhook-config` | Webhook yapılandırması |
| `POST /api/webhook/[orgId]` | İmzalı webhook alım ucu |

## Proje düzeni (çekirdek)

- `src/lib/ai/` — sağlayıcı soyutlaması, politika, Ollama/Gemini, karar prompt'u, doğrulayıcı
- `src/lib/domain-knowledge.ts` — sektör eşikleri/katsayıları (hesap kodda)
- `src/lib/decisions.ts` — karar modeli + kurumsal hafıza
- `src/lib/constraints.ts` — canlı operasyonel kısıtlar
- `src/lib/auth/` — scrypt parola hash, sunucu oturumu, rol × izin matrisi
- `src/lib/db/` — PGlite bağlantısı, migration'lar, repository'ler, seed
- `evals/` — 13 kriterlik değerlendirme süiti
- `docs/` — mimari, güvenlik modeli, AI mimarisi, test stratejisi, plan, karar günlüğü

Daha ayrıntılı mimari ve güvenlik dokümantasyonu için: `docs/ARCHITECTURE.md`,
`docs/SECURITY_MODEL.md`, `docs/AI_ARCHITECTURE.md`, `docs/TEST_STRATEGY.md`.

## Durum

Prototip → üretim geçişi fazlar halinde ilerliyor: `docs/IMPLEMENTATION_PLAN.md`.

## Bilinen sınırlar

- `/api/analyze`, `/api/briefing`, `/api/ingest`, `/api/assess-risk`,
  `/api/decision-cases` (POST) varsayılan olarak oturum ister; yalnızca
  `ABYS_PUBLIC_DEMO=1` açıkça ayarlandığında IP hız sınırlı, org'a
  kalıcılaşmayan bir demo modu geri açılır (gerekçe: `docs/DECISION_LOG.md`).
- Merkezi girdi şeması doğrulama (zod, `src/lib/validation.ts`) 8 route'a
  bağlı; `decision-cases`, `analyze`, `ingest`, `audit`, `documents/upload`
  henüz elle doğrulama yapıyor.
- Genel amaçlı rate limiting yok; AI uçları ve API anahtarları için var.
- Login için hız sınırı yok (kaba kuvvet parola denemesi engellenmiyor).
- SSO var (OIDC Authorization Code + PKCE) ama id_token JWKS ile
  doğrulanmıyor ve gerçek bir sağlayıcıya karşı canlı test edilmedi.
- Denetim günlüğü sha256 hash zinciriyle bağlı (`GET /api/audit?verify=1`
  ile doğrulanabilir) ama DB dosyasına doğrudan erişimi olan biri zinciri
  baştan üretebilir — dış saldırgana değil, kazara satır değişikliğine
  karşı bir kanıt.
- Otomatik test süiti VAR: 16 dosya, 201 test (`npm test`, vitest) +
  `evals/` süiti (bkz. `docs/TEST_STRATEGY.md`, `docs/CURRENT_STATE_AUDIT.md`).
- `manage_users` izni tanımlı ama onu kullanan bir kullanıcı yönetimi
  arayüzü yok.
