# ABYS-V3 — Veri Modeli

Tek doğruluk kaynağı `src/lib/db/migrations.ts` dosyasıdır. Bu doküman ondan türetilmiştir
(19 sıralı, append-only migration; **34 iş tablosu**; ayrıca istemcinin oluşturduğu `_migrations` defteri).

## Kurallar

- Migration'lar **append-only**: yayınlanmış bir migration değiştirilmez; değişiklik yeni migration olarak eklenir.
- `organizations` dışındaki **tüm tablolar `org_id` taşır** (doğrulandı: `migrations.ts` içindeki 34 `CREATE TABLE`
  bloğunun 33'ünde `org_id` var; tek istisna `organizations`).
- `org_id` oturumdan (veya doğrulanmış webhook secret/API key'den) gelir; istek gövdesinden asla.
- Denetim yazımı yalnızca `src/lib/db/repos/audit.ts` üzerinden yapılır (hash zinciri tek yazma yolu).
- İstemci: `src/lib/db/client.ts` (PGlite; `DATABASE_URL` varsa `pg` adaptörü).

## Tablolar

| Tablo | Alan | `org_id` |
| --- | --- | --- |
| `organizations` | Çekirdek: kurum; hiyerarşi (`parent_id`, `kind` = group/company/branch) + `country`, `currency` (migration 18) | — (kök tablo) |
| `users` | Çekirdek: kullanıcı, rol, parola hash'i | Var |
| `sessions` | Çekirdek: sunucu taraflı oturum | Var |
| `audit_events` | Denetim: hash zincirli olay günlüğü | Var |
| `decision_cases` | Karar: vaka | Var |
| `decision_records` | Karar: insan kararı + durum (migration 12) | Var |
| `datasets` | Veri: içe alınan veri seti | Var |
| `kpi_values` | Veri: KPI gözlem değerleri | Var |
| `signals` | Veri: risk sinyalleri (veri soyu referanslı) | Var |
| `actions` | Yürütme: aksiyonlar (migration 17: risk referansı) | Var |
| `outcomes` | Yürütme: sonuçlar ve dersler | Var |
| `model_runs` | AI: her koşunun izi (girdi hash'i, parametre, seed) | Var |
| `documents` | Kurumsal hafıza: belgeler | Var |
| `document_chunks` | Kurumsal hafıza: RAG parçaları | Var |
| `scenarios` | Senaryo laboratuvarı: kaydedilen senaryolar | Var |
| `webhook_secrets` | Entegrasyon: webhook sırları | Var |
| `webhook_deliveries` | Entegrasyon: teslimat kayıtları | Var |
| `api_keys` | Entegrasyon gateway: API anahtarları | Var |
| `data_quality_issues` | Entegrasyon veri kalitesi karantinası (migration 19) | Var |
| `integration_events` | Entegrasyon gateway: olay akışı (migration 14-15) | Var |
| `causal_links` | Kök neden: neden-sonuç bağlantıları | Var |
| `kpi_definitions` | KPI kayıt defteri: tanım ve eşikler | Var |
| `tais_activities` | TAIS demo: aktiviteler | Var |
| `tais_complaints` | TAIS demo: şikâyetler | Var |
| `tais_contracts` | TAIS demo: sözleşmeler | Var |
| `tais_customers` | TAIS demo: müşteriler | Var |
| `tais_deals` | TAIS demo: fırsatlar | Var |
| `tais_employees` | TAIS demo: çalışanlar | Var |
| `tais_leads` | TAIS demo: adaylar | Var |
| `tais_locations` | TAIS demo: lokasyonlar | Var |
| `tais_quality_issues` | TAIS demo: kalite sorunları | Var |
| `tais_service_requests` | TAIS demo: servis talepleri | Var |
| `tais_tasks` | TAIS demo: görevler | Var |
| `tais_teams` | TAIS demo: ekipler | Var |

## İlişki özeti (migration'lardaki gerçek FK'ler)

- `organizations` ← 33 iş tablosu (`org_id`).
- `users` ← `sessions`.
- `decision_cases` ← `decision_records`, `actions`, `scenarios`, `causal_links`.
- `decision_records` ← `actions`, `outcomes`.
- `datasets` ← `kpi_values`, `signals`, `webhook_deliveries`.
- `documents` ← `document_chunks`.
- `tais_customers` ← `tais_locations`, `tais_contracts`, `tais_leads`, `tais_deals`, `tais_activities`, `tais_service_requests`, `tais_complaints`, `tais_tasks`.
- `tais_teams` ← `tais_employees`, `tais_tasks`.
- `tais_locations` ← `tais_tasks`, `tais_service_requests`, `tais_complaints`, `tais_quality_issues`.

`kpi_definitions` ile `kpi_values` arasında FK yoktur (tanım/eşik ile gözlem ayrımı kavramsaldır).
`integration_events` ve `api_keys` yalnızca `organizations`'a bağlıdır; olay–anahtar ilişkisi uygulama katmanındadır.
`tais_*` tabloları yalnızca deterministik demo verisi içindir; `/api/tais/*` uçları bu veriyi istek anında hesaplar.

## Değişiklik yaparken

- Yeni tablo/varlık: yeni migration + `org_id` + ilgili repository + test (tenant izolasyonu ve idempotency).
- Başka alanın okuduğu tabloyu değiştirmeden önce Lead'e haber ver (`docs/agents/README.md`).
- Yeni migration'ı geriye uyumlu yaz; mevcut testleri bozma.
