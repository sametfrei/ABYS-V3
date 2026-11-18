# ABYS-V3 — Mimari Haritası

Bu doküman, agent'ların kod yazmadan önce okuyacağı doğrulanmış mimari özettir. Kaynak kod esastır;
çelişki bulunursa kod ve `docs/agents/README.md` (sahiplik) geçerlidir.

## Ürün ilkesi

ABYS bir Executive Decision Intelligence katmanıdır: **DATA → UNDERSTANDING → RISK → PREDICTION → DECISION → ACTION**.
"30 Seconds to Clarity": yönetici ilk 30 saniyede harekete geçmesi gereken 3–5 maddeyi, her biri kanıtlı olarak görür.
ABYS mevcut ERP/CRM/muhasebe sistemlerinin yerine geçmez; üzerlerine zekâ katmanı ekler.

## Çalışma zamanı

- Next.js 16.2.11 + React 19.2.4 + TypeScript (strict), App Router (`package.json`, `tsconfig.json`).
- **Next.js sürümü eğitim verisinden farklı olabilir.** Next.js kodu yazmadan önce `node_modules/next/dist/docs/`
  altındaki ilgili rehber okunur (`AGENTS.md`). Bu dizin `npm ci` sonrası oluşur.
- Gömülü Postgres: PGlite, `src/lib/db/client.ts`. `DATABASE_URL` verilirse `pg` adaptörüne geçer.
- Test: Vitest (`tests/`, 50 dosya), `fileParallelism: false` (PGlite bellek ağırlığı nedeniyle sıralı).
- Masaüstü: Electron paketleme (`desktop/main.cjs`, `scripts/build-desktop.mjs`), Lead sorumluluğunda.

## Katmanlar

```
UI (src/app/dashboard, src/components)
  │  fetch / NDJSON stream
  ▼
Route handlers (src/app/api/**)  ← ince adaptör; oturum + izin + zod doğrulama
  │
  ├─► Deterministik motor (src/lib/{scenario-engine,scenarios,calculators,kpi,signals,domain-knowledge}.ts,
  │                          src/lib/demo/tais/**)
  ├─► AI katmanı (src/lib/ai/*)  ← model açıklar, sayıyı kod hesaplar
  └─► Repository'ler (src/lib/db/repos/**)  ← org_id kapsamlı SQL, audit tek yazma yolu
        │
        ▼
      PGlite / PostgreSQL
```

## Kimlik, oturum ve güvenlik

- Parola: scrypt; ortak politika min 12 karakter, trim yok; self-service değişimde diğer oturumlar iptal edilir
  (`src/app/api/auth/password`, `src/lib/password-policy.ts`).
- Oturum: sunucu taraflı; kullanıcı kendi aktif oturumlarını listeleyip kapatabilir
  (`src/app/api/auth/sessions`).
- OIDC: Authorization Code + PKCE + nonce; id_token RS256/JWKS ile doğrulanır, issuer/azp/email_verified kontrol edilir.
- RBAC: `src/lib/auth/permissions.ts`; izinler sunucuda uygulanır, butonu gizlemek güvenlik sayılmaz.
- Tenant izolasyonu: her iş tablosunda `org_id`; `org_id` oturumdan gelir, istek gövdesinden asla.
- Denetim: `src/lib/db/repos/audit.ts` tek yazma yolu; sha256 hash zinciri `GET /api/audit?verify=1`;
  zincir sonrası NULL hash kurcalama sayılır.
- Sağlık: `GET /api/health` veritabanı erişimini kontrol eder (Docker healthcheck).
- Oturumsuz demo uçları varsayılan kapalıdır; `ABYS_PUBLIC_DEMO=1` ile IP hız sınırlı mod açılır
  (`src/lib/public-demo.ts`, `src/lib/rate-limit.ts`).

## AI politikası

- `AI_POLICY`: `LOCAL_ONLY` | `CLOUD_ALLOWED` | `CLOUD_ONLY` | `DEMO_DETERMINISTIC` (`.env.example:9`).
- Sağlayıcı yönlendirmesi `src/lib/ai/provider.ts`; Ollama/Gemini/deterministik sağlayıcılar `src/lib/ai/providers/`.
- **Modeller sayı üretmez.** Sayısal iddialar kodda hesaplanır ve `src/lib/ai/verify-cases.ts` ile doğrulanır.
- Sağlayıcı katmanı, dış çağrı ve secret sınırı nedeniyle Lead sahipliğindedir (`docs/agents/README.md`).

## Veri ve entegrasyon

- Şema: `src/lib/db/migrations.ts` — 19 sıralı, append-only migration; 34 tablo (`docs/DATA_MODEL.md`).
- Organizasyon hiyerarşisi: `organizations.parent_id/kind/country/currency` (holding → şirket → şube);
  alt ağaç sorgusu `src/lib/db/repos/organizations.ts`, kapsam `GET /api/organizations` ile oturumdan gelir.
- Repository'ler: `src/lib/db/repos/*` — org-farkındalıklı sorgular.
- Entegrasyon referansı: Bitrix24 (`src/lib/integrations/bitrix24/*`); genel konnektörler ve webhook/API key
  uçları `src/app/api/connectors/*`, `src/app/api/integration/*`, `src/app/api/integrations/*`.
- Kaynak sistemler **salt-okunur**; yeni konnektörler mevcut şekle takılır, paralel framework kurulmaz.

## Test ve değerlendirme

- Birim/entegrasyon: `tests/*.test.ts` (50 dosya). Sahiplik ve çalıştırma: `docs/agents/README.md`.
- Kanonik doğrulama: `bash scripts/agent-verify.sh <değişen dosyalar...> <test dosyaları...>`.
- Değerlendirme süiti: `evals/` (`npm run eval`).

## Agent organizasyonu

Lead Architect + 4 uzman yazar + 2 read-only rol; dosya sahipliği, test sahipliği ve paralel çalışma protokolü
`docs/agents/README.md` içindedir. Subagent'lar commit/push yapamaz; bu, `.claude/settings.json` PreToolUse Bash
guard'ı ile zorlanır.

## Bilinen sorunlar

- Denetim zinciri sıralama yarışı düzeltildi: `recordAuditEvent` yazımları süreç içi kilitle
  sıralanır ve `created_at` kesin artan üretilir (`src/lib/db/repos/audit.ts`). Regresyon testleri
  aynı milisaniye ve eşzamanlı yazım senaryolarını kapsar; tam süit kararlıdır.
- Kilit yalnızca süreç içidir. Çok süreçli/çok örnekli PostgreSQL dağıtımında DB seviyesinde
  ek kilit veya tekil kısıt gerekir (PGlite tek süreç olduğu için mevcut dağıtımda yeterli).
