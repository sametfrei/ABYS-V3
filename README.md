# ABYS — Enterprise Decision Intelligence & Orchestration Platform

Kurumsal karar zekâsı ve iş yürütme katmanı.
İlke: **30 Seconds to Clarity** — yöneticinin önündeki 3–5 kritik gelişmeyi
kanıtı, nedeni, olası sonucu ve karar seçenekleriyle 30 saniyede anlaması.

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

İlk çalıştırmada normal migration'lar uygulanır; açık onay gerektiren
migration'lar bekletilir. Giriş veya OIDC akışı demo veri oluşturmaz. TAIS
demo kurumu yalnızca açık `demo:tais:bootstrap` komutu ve üretim dışı ortam
koşuluyla kurulur. Yerel demo hesabı:

| E-posta | Rol |
|---|---|
| `ceo@tais.demo` | TAIS Genel Müdür (ceo) |

Demo parolası `.env.example` ve `KURULUM-VE-GIRIS-BILGILERI.txt` içinde
`abys-demo-2026` olarak belgelenmiştir; gerçek üretim hesabı değildir.

Migration 18 yalnızca yetkili bir operatör `ABYS_MIGRATION_18_APPROVED=true`
ayarladığında uygulanır.

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

## Canlı geliştirme ortamı (yalnızca localhost)

İki ekran birbirinden bağımsızdır ve yalnızca `127.0.0.1` üzerinde dinler:

| Ekran | Komut | Adres |
|---|---|---|
| Canlı frontend önizleme (HMR) | `npm run dev:preview` | http://127.0.0.1:3100 |
| Agent Command Center (salt okunur) | `npm run agent:center` | http://127.0.0.1:3200 |

- Önizleme, üretim verisinden ayrı bir PGlite dizini (`.data/dev-preview`) ve
  deterministik demo AI politikası kullanır; mevcut `.data`/kullanıcı verisine dokunmaz.
- Command Center, Claude Code alt-agent transkriptlerini ve `~/.codex/sessions/**/*.jsonl`
  Codex rollout kayıtlarını salt okunur izler; yalnızca GET kabul eder, localhost dışı
  Host başlığını reddeder, hiçbir dosya yazmaz ve sır göstermez. Codex köprüsünde
  sahte agent aktivitesi üretilmez; görünmeyen görevler "kayıt yok" olarak gösterilir.

## Komutlar

```bash
npm run dev      # geliştirme sunucusu
npm run build    # üretim derlemesi (internet gerektirmez)
npm run lint     # 0 hata / 0 uyarı beklenir
npx tsc --noEmit # tip kontrolü
npm run connectors:scheduler # ABYS_SCHEDULER_TOKEN ile çalışan sunucunun due konnektörlerini tetikler
npm run smoke:e2e # çalışan sunucuya uçtan uca duman testi (BASE_URL ile adres)
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
| `/dashboard/organization` | Organizasyon hiyerarşisi — holding / şirket / şube + konsolide metrikler |
| `/dashboard/data-quality` | Veri kalitesi karantinası — `ingest_data` rolleri |
| `/dashboard/decision-ledger` | Karar Defteri — alınan kararlar, beklenen etki, gerçekleşen sonuç ve dersler |
| `/dashboard/forecast` | Tahmin — KPI serisinden geriye dönük test edilmiş model ve olasılık aralığı |
| `/dashboard/process` | Süreç Zekâsı — entegrasyon olay günlüğünden gözlenen akış, süreler ve darboğazlar |
| `/dashboard/options` | Karar Seçenekleri — çok kriterli puanlama, ağırlıklı sıralama ve Pareto sınırı |
| `/dashboard/kpi` | KPI Verisi — metrik tanımı, tek/toplu zaman serisi girişi ve düzeltme (`edit_kpi`) |
| `/dashboard/connectors` | Sistem Bağlantıları — REST/OData konnektör tanımı, senkron, zamanlama ve geçmiş (`ingest_data`) |
| `/dashboard/discovery` | İş Keşfi — bağlı veriden sektör/alt sektör çıkarımı, kanıtlar ve önerilen KPI çerçevesi |
| `/dashboard/ask` | Ask ABYS |
| `/dashboard/decisions` | Karar Merkezi |
| `/dashboard/actions` | Aksiyonlar |
| `/dashboard/scenarios` | Senaryo Laboratuvarı |
| `/dashboard/memory` | Kurumsal Hafıza |
| `/dashboard/analysis` | Analiz |
| `/dashboard/reports` | Raporlar |
| `/dashboard/alerts` | Riskler ve Sinyaller |
| `/dashboard/integrations` | Veri Kaynakları |
| `/dashboard/advisors` | Danışman Analitiği |
| `/dashboard/audit` | Denetim Günlüğü — `view_audit` rolleri; hash zinciri doğrulama |
| `/dashboard/settings` | Ayarlar — parola değiştirme, aktif oturum yönetimi; `sys_admin` için kullanıcı/rol yönetimi |

## API uçları

| Uç | Not |
|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Oturum yönetimi |
| `POST /api/auth/password` | Oturum sahibinin kendi parolasını değiştirmesi (mevcut parola doğrulaması; diğer oturumlar iptal edilir) |
| `GET/DELETE /api/auth/sessions` | Aktif oturumları listeleme ve iptal (yalnızca oturum sahibinin kendi oturumları) |
| `GET /api/health` | Sağlık kontrolü — veritabanı erişilemezse `503` |
| `POST /api/analyze` | AI analiz — oturum gerekli (yalnızca `ABYS_PUBLIC_DEMO=1` iken oturumsuz) |
| `POST /api/briefing` | AI brifing — oturum gerekli (aynı istisna) |
| `POST /api/ingest` | Veri içe alma — oturum gerekli (aynı istisna) |
| `POST /api/ask` | Ask ABYS sohbet ucu |
| `GET/PATCH /api/actions` | Karar kökenli aksiyonları listeler (`?eventsFor=<id>` ile değişmez geçiş geçmişi); PATCH yalnızca `open → in_progress → done` veya `cancelled` geçişlerine izin verir, karar onayını ve tenant sınırını denetler |
| `GET/POST/PATCH /api/actions/execution-intents` | Dış sistemde yan etki üretmeden idempotent yürütme hazırlığı oluşturur ve insan onayına sunar; aynı anahtar farklı içerikle gelirse 409 döner |
| `POST /api/decisions` | İnsan kararı; isteğe bağlı sayısal `expectedImpact` kaydeder. Kabul/değiştir kararında karar, aksiyon ve audit tek transaction'dadır |
| `GET/POST /api/outcomes` | Sonuç dersleri; isteğe bağlı sayısal `actualImpact` (değer/para birimi/ölçüm aralığı/kanıt) kaydeder |
| `POST /api/assess-risk` | Risk değerlendirme |
| `GET /api/audit` | Denetim günlüğü |
| `GET /api/organizations` | Oturum org'unun hiyerarşik alt ağacı (holding/şirket/şube) |
| `GET /api/organizations/consolidation` | Alt ağaç için konsolide risk/karar/aksiyon sayıları + bugünün öncelikli 3 kararı |
| `GET/POST/PATCH /api/data-quality` | Veri kalitesi karantinası: listele, kaydet, çöz/at (`ingest_data`); Bitrix24 senkron hataları buraya yazılır |
| `GET /api/decision-ledger` | Karar geçmişi + özet (iyileşti/değişmedi/kötüleşti) — `view_decisions`, org kapsamlı |
| `GET /api/forecast` | KPI serileri ve geriye dönük test edilmiş tahmin (naive/SES/trend + P10–P90) — `view_decisions` |
| `GET /api/anomalies` | KPI serilerinde median/MAD tabanlı erken uyarı taraması — `view_decisions` |
| `GET /api/process-mining` | `integration_events` olay günlüğünden geçişler, medyan/P90 süreler ve darboğazlar — `view_decisions` |
| `POST /api/decision-options/evaluate` | Çok kriterli seçenek değerlendirmesi: min-max normalizasyon, ağırlıklı skor, Pareto sınırı — `run_analysis` |
| `GET/POST/DELETE /api/kpi-values` | KPI zaman serisi: noktaları listele, toplu kaydet (≤500), düzelt/sil — yazma `edit_kpi`, okuma `view_decisions` |
| `GET/POST /api/connectors` | Konnektör kataloğu (SAP, Oracle, Dynamics, Salesforce, ...) + org konfigürasyonları; POST `ingest_data` |
| `PATCH /api/connectors/[id]` | Konnektör zamanlamasını 5–525600 dakika aralıkla ayarlar veya kapatır (`ingest_data`) |
| `POST /api/connectors/[id]/sync` | Konnektörü çalıştırır (REST/OData, sayfalama, checkpoint, retry); kanonik sözleşme ihlalleri karantinaya yazılır, geçerli kayıtlar idempotent aktarılır |
| `GET /api/connectors/[id]/runs` | Senkron geçmişi, reddedilen kayıt sayısı, gözlenen kaynak şema ve eşleme önerileri |
| `GET/POST /api/connectors/[id]/mapping` | Son şema önerilerini inceler; insan onayıyla yeni, append-only eşleme sürümü oluşturur (iyimser sürüm kilidi, `ingest_data`) |
| `GET /api/digital-twin` | Kanonik kayıtlardan mevcut veya `asOf` zamanlı kurumsal durum projeksiyonu |
| `POST /api/digital-twin/compare` | Mevcut/as-of dijital ikizi açık senaryo deltalarıyla karşılaştırır; para birimlerini toplamaz (`run_analysis`) |
| `POST /api/optimization` | Çok kaynaklı, minimum taahhütlü tam sayılı kaynak tahsisi için deterministik çözücü (`run_analysis`) |
| `POST /api/connectors/scheduler/run` | Zamanı gelen senkronları atomik sahiplenip çalıştırır; cron için Bearer `ABYS_SCHEDULER_TOKEN`, kullanıcı oturumunda org kapsamı |
| `GET /api/canonical-contracts` | Sürümlü kanonik varlık/alan/tip/referans sözleşmeleri — `view_decisions` |
| `GET /api/semantic-graph` | Kanonik kayıtlardan org-kapsamlı düğüm/ilişki projeksiyonu; e-posta/SKU kimlik bağlantıları, limit ve truncation bilgisi — `view_decisions` |
| `GET /api/semantic-graph/neighborhood` | `root`/`entity`, `depth` (0–8), `direction` ve `maxNodes` ile çok-hop grafik komşuluğu — `view_decisions` |
| `GET /api/decision-cases/[id]/intelligence` | Çok kaynaklı karar brifingi: kanıt, tahmin, anomali, nedensel bağ, geçmiş sonuç + güven gerekçesi — `view_decisions` |
| `GET/POST /api/discovery` | İşletme keşfi ve onaylı iş profili: sektör/alt sektör, kanıt, güven, KPI kullanılabilirliği, gözlenen şema, kimlik çözümleme ve grafik özeti (`GET`); sürümlü profil/KPI aktivasyonu (`POST`) — sırasıyla `view_decisions` / `confirm_business_profile` |
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
| `GET/POST /api/users`, `PATCH /api/users/[id]` | Kullanıcı yönetimi — `manage_users` (sys_admin) |

## Proje düzeni (çekirdek)

- `src/lib/ai/` — sağlayıcı soyutlaması, politika, Ollama/Gemini, karar prompt'u, doğrulayıcı
- `src/lib/domain-knowledge.ts` — sektör eşikleri/katsayıları (hesap kodda)
- `src/lib/decisions.ts` — karar modeli + kurumsal hafıza
- `src/lib/constraints.ts` — canlı operasyonel kısıtlar
- `src/lib/auth/` — scrypt parola hash, sunucu oturumu, rol × izin matrisi
- `src/lib/db/` — PGlite bağlantısı, migration'lar ve org-kapsamlı repository'ler
- `evals/` — 13 kriterlik değerlendirme süiti
- `docs/` — mimari haritası, veri modeli ve agent takımı sözleşmesi

Mimari, veri modeli ve agent sözleşmesi için: `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`,
`docs/agents/README.md`.

## Durum

Görev dağıtımı, dosya sahipliği ve teslim yaklaşımı Lead Architect tarafından yönetilir:
`docs/agents/README.md`.

## Bilinen sınırlar

- `/api/analyze`, `/api/briefing`, `/api/ingest`, `/api/assess-risk`,
  `/api/decision-cases` (POST) varsayılan olarak oturum ister; yalnızca
  `ABYS_PUBLIC_DEMO=1` açıkça ayarlandığında IP hız sınırlı, org'a
  kalıcılaşmayan bir demo modu geri açılır (gerekçe: `src/lib/public-demo.ts`, `src/lib/rate-limit.ts`).
- Merkezi girdi doğrulama: `parseBody` (`src/lib/validation.ts`) + zod şemaları.
  `analyze`, `decision-cases`, `audit`, `documents`, `ingest` ve auth uçları
  doğrulanır.
- Genel amaçlı rate limiting yok; AI uçları ve API anahtarları için var.
- Login kaba kuvvet koruması: e-posta başına 15 dakikada 5 başarısız deneme
  (IP'den bağımsız, XFF değiştirerek atlatılamaz); `ABYS_TRUST_PROXY=1` iken
  ek olarak güvenilen son hop IP başına 20; aşımda `429` + `Retry-After`
  (`src/lib/rate-limit.ts`, `src/app/api/auth/login/route.ts`).
- Giriş ve OIDC akışları demo veri oluşturmaz; TAIS demo verisi yalnızca açık
  `demo:tais:bootstrap` komutuyla, ayrı ve üretim dışı bir ortamda kurulur.
- SSO var (OIDC Authorization Code + PKCE). id_token imzası JWKS ile RS256
  üzerinden doğrulanır (`src/lib/auth/oidc.ts:verifyIdToken`; `alg: none`/HS*
  reddedilir), `nonce` ve çoklu `aud` için `azp`, `email_verified=true`
  doğrulanır; discovery belgesinin issuer'ı kontrol edilir ve uç noktalar
  HTTPS + 5 sn timeout ile çağrılır. Gerçek bir sağlayıcıya karşı canlı test
  edilmedi.
- Denetim günlüğü sha256 hash zinciriyle bağlı (`GET /api/audit?verify=1`
  ile doğrulanabilir) ama DB dosyasına doğrudan erişimi olan biri zinciri
  baştan üretebilir — dış saldırgana değil, kazara satır değişikliğine
  karşı bir kanıt.
- Ürün yol haritası ve yetenek durum matrisi: `docs/ROADMAP.md`.
- Otomatik test süiti VAR: 95 dosya geçti, 1 governance dosyası atlandı; 844 test geçti, 9 test atlandı (`npm test`, vitest) + `evals/` süiti
  (sahiplik ve doğrulama: `docs/agents/README.md`).
- Teslim kapısı: `BASE_URL=http://127.0.0.1:3100 npm run release:check` →
  tsc + eslint + tam test + üretim derlemesi + çalışan örneğe karşı smoke;
  sunucu için `DEPLOY_EXPECT=origin` da verilirse commit parmak izi de doğrulanır.
- Dağıtım sürüm parmak izi: `node scripts/verify-deploy.mjs --base=<URL> --expect=origin`
  (0 eşleşti, 1 uyuşmadı, 2 sağlıksız, 3 kullanım hatası). Teslim notları:
  `docs/RELEASE-NOTES-2026-11.md`.
- Kullanıcı yönetimi mevcut: `sys_admin` Ayarlar ekranından kullanıcı listeler,
  oluşturur, rol/durum günceller ve geçici parola sıfırlar
  (`/api/users`, `PATCH /api/users/[id]`, `src/components/UserManagement.tsx`).
