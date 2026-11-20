# ABYS-V3 — Veri Modeli

Tek doğruluk kaynağı `src/lib/db/migrations.ts` dosyasıdır. Bu doküman ondan türetilmiştir
(33 sıralı, append-only migration; **46 iş tablosu**; ayrıca istemcinin oluşturduğu `_migrations` defteri).

## Kurallar

- Migration'lar **append-only**: yayınlanmış bir migration değiştirilmez; değişiklik yeni migration olarak eklenir.
- `organizations` dışındaki **tüm tablolar `org_id` taşır** (doğrulandı: `migrations.ts` içindeki 46 `CREATE TABLE`
  bloğunun 45'inde `org_id` var; tek istisna `organizations`).
- `org_id` oturumdan (veya doğrulanmış webhook secret/API key'den) gelir; istek gövdesinden asla.
- Denetim yazımı yalnızca `src/lib/db/repos/audit.ts` üzerinden yapılır (hash zinciri tek yazma yolu).
- İstemci: `src/lib/db/client.ts` (dosya tabanlı PGlite). `pg` bağımlılığı bulunsa da
  çalışma zamanında PostgreSQL bağlantı adaptörü henüz uygulanmadı.

## Tablolar

| Tablo | Alan | `org_id` |
| --- | --- | --- |
| `organizations` | Çekirdek: kurum; hiyerarşi (`parent_id`, `kind` = group/company/branch) + `country`, `currency` (migration 18, onay kapılı) | — (kök tablo) |
| `users` | Çekirdek: kullanıcı, rol, parola hash'i | Var |
| `sessions` | Çekirdek: sunucu taraflı oturum | Var |
| `audit_events` | Denetim: hash zincirli olay günlüğü | Var |
| `decision_cases` | Karar: vaka | Var |
| `decision_records` | Karar: insan kararı + durum (migration 12) | Var |
| `datasets` | Veri: içe alınan veri seti | Var |
| `kpi_values` | Veri: KPI gözlem değerleri | Var |
| `signals` | Veri: risk sinyalleri (veri soyu referanslı) | Var |
| `decision_case_signals` | Karar kanıtı: bir sinyalin vakaya açık gerekçe ve aktörle bağlanması; zayıf/otomatik başlık eşlemesi yok (migration 33) | Var |
| `actions` | Yürütme: karar kökenli aksiyonlar (migration 17: risk referansı); durum geçişleri yalnızca repository durum makinesinden | Var |
| `action_events` | Yürütme: aktör kimliği, önceki/yeni durum, ilerleme notu ve zaman damgası taşıyan append-only geçiş olayları (migration 30) | Var |
| `action_execution_intents` | Yürütme hazırlığı: dış çağrı öncesi idempotent niyet, hedef sistem, yük hash'i, hazırlayan/onaylayan insan ve durum (migration 31) | Var |
| `action_execution_attempts` | Yürütme: onaylı niyet başına en fazla bir adaptör denemesi, sağlayıcı yanıt/ref, hata kodu, başlangıç/bitiş ve aktör (migration 32) | Var |
| `outcomes` | Yürütme: sonuçlar ve dersler | Var |
| `model_runs` | AI: her koşunun izi (girdi hash'i, parametre, seed) | Var |
| `documents` | Kurumsal hafıza: belgeler | Var |
| `document_chunks` | Kurumsal hafıza: RAG parçaları | Var |
| `scenarios` | Senaryo laboratuvarı: kaydedilen senaryolar | Var |
| `webhook_secrets` | Entegrasyon: webhook sırları | Var |
| `webhook_deliveries` | Entegrasyon: teslimat kayıtları | Var |
| `api_keys` | Entegrasyon gateway: API anahtarları | Var |
| `data_quality_issues` | Entegrasyon veri kalitesi karantinası; sözleşme kodu ve senkron çalıştırma bağlantısı (migration 19, 22) | Var |
| `integration_events` | Entegrasyon gateway: olay akışı (migration 14-15) | Var |
| `causal_links` | Kök neden: neden-sonuç bağlantıları | Var |
| `kpi_definitions` | KPI kayıt defteri: tanım, eşik ve kaynak (`manual` / `industry-pack`, migration 21) | Var |
| `decision_records` | Karar seçimi; sayısal beklenen değer/aralık, para birimi, dayanak ve varsayımlar (migration 25) | Var |
| `outcomes` | Gerçekleşen sonuç ve ders; sayısal gerçekleşen değer, para birimi, ölçüm aralığı ve kanıt (migration 25) | Var |
| `connector_configs` | Konnektör konfigürasyonu; sır değeri değil ortam değişkeni adı; zamanlama aralığı, sonraki planlanan çalışma ve iyimser eşleme sürümü (migration 20, 24, 28) | Var |
| `connector_sync_runs` | Senkron çalıştırmaları; manuel/zamanlanmış tetikleyici, sayımlar, retry/checkpoint, reddedilen kayıtlar, kaynak şema ve eşleme önerileri (migration 20, 22, 24) | Var |
| `connector_config_versions` | Onaylı eşleme/konfigürasyon sürümleri; kaynak çalıştırma, onaylanan öneriler, değişiklik özeti ve aktör ile append-only iz (migration 28) | Var |
| `connector_records` | Sağlayıcıdan bağımsız idempotent kanonik kayıtlar (migration 20) | Var |
| `canonical_entity_links` | Kaynak kaydı → org-kapsamlı kanonik varlık kimliği; güçlü e-posta/SKU eşleşmeleri veya kaynak-kapsamlı kimlik (migration 23) | Var |
| `canonical_survivorship_policies` | Kanonik varlık alanında hangi kaynağın güvenilir olduğunu belirleyen açık sıra; düşük sayı yüksek güven (migration 26) | Var |
| `connector_record_history` | Kaynak kaydının değişen gözlemleri; `captured_at` ve o anki kanonik kimlik ile dijital ikiz as-of görünümünü besler (migration 27) | Var |
| `business_profiles` | Sürümlü, onaylı iş bağlamı ve keşif kanıtı anlık görüntüsü (migration 21) | Var |
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

- `organizations` ← 45 iş tablosu (`org_id`).
- `users` ← `sessions`.
- `decision_cases` ← `decision_records`, `actions`, `scenarios`, `causal_links`, `decision_case_signals`.
- `signals` ← `decision_case_signals`.
- `decision_records` ← `actions`, `outcomes`, `action_events`, `action_execution_intents`, `action_execution_attempts`.
- `actions` ← `action_events`, `action_execution_intents`, `action_execution_attempts`.
- `action_execution_intents` ← `action_execution_attempts`.
- `datasets` ← `kpi_values`, `signals`, `webhook_deliveries`.
- `connector_configs` ← `connector_sync_runs`, `connector_records`, `canonical_entity_links`, `canonical_survivorship_policies`, `connector_record_history`.
- `connector_sync_runs` ← `data_quality_issues.connector_run_id`.
- `documents` ← `document_chunks`.
- `tais_customers` ← `tais_locations`, `tais_contracts`, `tais_leads`, `tais_deals`, `tais_activities`, `tais_service_requests`, `tais_complaints`, `tais_tasks`.
- `tais_teams` ← `tais_employees`, `tais_tasks`.
- `tais_locations` ← `tais_tasks`, `tais_service_requests`, `tais_complaints`, `tais_quality_issues`.

`kpi_definitions` ile `kpi_values` arasında FK yoktur (tanım/eşik ile gözlem ayrımı kavramsaldır).
`integration_events` ve `api_keys` yalnızca `organizations`'a bağlıdır; olay–anahtar ilişkisi uygulama katmanındadır.
`action_events` değiştirilemez/silinemez; yalnızca demo sıfırlama transaction'ı kontrollü bakım için trigger'ı geçici kapatır.
`tais_*` tabloları yalnızca deterministik demo verisi içindir; `/api/tais/*` uçları bu veriyi istek anında hesaplar.
Altın kayıt fiziksel bir kopya tablosu değildir; `connector_records` + `canonical_entity_links` + güven sırası üzerinden her istekte deterministik olarak üretilir.

## Değişiklik yaparken

- Yeni tablo/varlık: yeni migration + `org_id` + ilgili repository + test (tenant izolasyonu ve idempotency).
- Başka alanın okuduğu tabloyu değiştirmeden önce Lead'e haber ver (`docs/agents/README.md`).
- Yeni migration'ı geriye uyumlu yaz; mevcut testleri bozma.
