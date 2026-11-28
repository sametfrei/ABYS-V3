# ABYS-V3 — Veri Modeli

Tek doğruluk kaynağı `src/lib/db/migrations.ts` dosyasıdır. Bu doküman ondan türetilmiştir
(46 sıralı, append-only migration; **58 uygulama tablosu** (57 iş tablosu + ilk kurulum kilidi); ayrıca istemcinin oluşturduğu `_migrations` defteri).

## Kurallar

- Migration'lar **append-only**: yayınlanmış bir migration değiştirilmez; değişiklik yeni migration olarak eklenir.
- `organizations` dışındaki **54 iş tablosunun tamamı `org_id` taşır** (boş PGlite şemasında `information_schema` ile doğrulandı; `_migrations` uygulama dışı iç tablodur).
- `org_id` oturumdan (veya doğrulanmış webhook secret/API key'den) gelir; istek gövdesinden asla.
- Denetim yazımı yalnızca `src/lib/db/repos/audit.ts` üzerinden yapılır (hash zinciri tek yazma yolu).
- İstemci: `src/lib/db/client.ts`; varsayılan dosya tabanlı PGlite, `ABYS_DB_BACKEND=postgres` veya `ABYS_DATABASE_URL`/`DATABASE_URL` ile `pg` Pool adaptörü. Repository SQL yüzeyi korunur; transaction callback tek PoolClient üzerinde çalışır ve migration runner PostgreSQL advisory lock kullanır. Gerçek yönetilen PostgreSQL ortamında bağlantı kabul testi bu repoda henüz yapılmadı.

## Tablolar

| Tablo | Alan | `org_id` |
| --- | --- | --- |
| `organizations` | Çekirdek: kurum; hiyerarşi (`parent_id`, `kind` = group/company/branch) + `country`, `currency` (migration 18; mevcut yerel DB’de uygulandı) | — (kök tablo) |
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
| `forecast_snapshots` | Tahmin anındaki P10/P50/P90, model, kanıt ve ufuk snapshot'ı; sonradan gelen gerçek KPI gözlemiyle kıyaslama (migration 35) | Var |
| `documents` | Kurumsal hafıza: belgeler | Var |
| `document_chunks` | Kurumsal hafıza: RAG parçaları | Var |
| `scenarios` | Senaryo laboratuvarı: kaydedilen senaryolar | Var |
| `webhook_secrets` | Entegrasyon: webhook sırları | Var |
| `webhook_deliveries` | Entegrasyon: teslimat kayıtları | Var |
| `api_keys` | Entegrasyon gateway: API anahtarları | Var |
| `data_quality_issues` | Entegrasyon veri kalitesi karantinası; sözleşme kodu ve senkron çalıştırma bağlantısı (migration 19, 22) | Var |
| `integration_events` | Entegrasyon gateway: olay akışı (migration 14-15) | Var |
| `causal_links` | Kök neden: neden-sonuç bağlantıları | Var |
| `kpi_definitions` | KPI kayıt defteri: tanım, eşik/kaynak, `discovered` → `mapped` → `calculable` → `validated` → `approved` yönetişim durumu (migration 41–42) | Var |
| `kpi_definition_revisions` | Tanım ekleme/değişikliklerinin append-only JSON snapshot geçmişi (migration 41) | Var |
| `kpi_definition_approvals` | Revision/hash, insan aktör/rol/izin, zaman ve audit bağlantısı taşıyan değiştirilemez onay kaydı (migration 41–42) | Var |
| `kpi_definition_validations` | Yapısal kontrol sonuçları, revision/hash, doğrulayan aktör/rol/izin ve audit bağlantısı taşıyan değiştirilemez doğrulama kaydı (migration 42) | Var |
| `external_context_sources` | Dış sağlayıcı, kaynak URI, lisans, atıf ve erişim biçimi metadata'sı; değiştirilemez kaynak kaydı (migration 43) | Var |
| `external_context_observations` | Dış gözlem; yayın/gözlem/alınma zamanı, geçerlilik aralığı, coğrafya, ilgililik, güven, lisans ve payload (migration 43) | Var |
| `external_context_reviews` | Dış gözlemin kabul/red kararı, insan aktör/rol/izin ve audit bağlantısı; append-only (migration 43) | Var |
| `decision_case_external_context` | Kabul edilmiş dış gözlemin açık gerekçe ile karar vakasına bağlantısı; append-only (migration 43) | Var |
| `signal_notes` | Sinyal war-room notları; tenant/aktör bağlantılı ve append-only (migration 44) | Var |
| `saved_reports` | Tenant kapsamlı analiz raporları; auditli soft-delete ve yazar bilgisi (migration 45) | Var |
| `initial_admin_bootstrap` | İlk kurum + `sys_admin` kurulumunu tek seferlik claim/completion kilidiyle korur; tamamlandıktan sonra trigger ile silme/yeniden açma engellenir (migration 46) | Hayır (kurulum kontrolü) |
| `decision_records` | Karar seçimi; sayısal beklenen değer/aralık, para birimi, dayanak ve varsayımlar (migration 25) | Var |
| `decision_kpi_measurements` | Karar başına tekil, veri seti kaynaklı KPI öncesi/sonrası ölçümü ve sonuç sınıflandırması (migration 25) | Var |
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

- `organizations` ← 56 iş tablosu (`org_id`).
- `users` ← `sessions`.
- `decision_cases` ← `decision_records`, `actions`, `scenarios`, `causal_links`, `decision_case_signals`.
- `signals` ← `decision_case_signals`.
- `decision_records` ← `actions`, `outcomes`, `action_events`, `action_execution_intents`, `action_execution_attempts`, `decision_kpi_measurements`.
- `actions` ← `action_events`, `action_execution_intents`, `action_execution_attempts`.
- `action_execution_intents` ← `action_execution_attempts`.
- `datasets` ← `kpi_values`, `signals`, `webhook_deliveries`, `decision_kpi_measurements`.
- `external_context_sources` ← `external_context_observations` ← `external_context_reviews` ve `decision_case_external_context`.
- `signals` ← `signal_notes`; `organizations` ← `saved_reports`; `initial_admin_bootstrap` ilk kurulan `organizations` ve `users` kayıtlarına referans verir.
- `connector_configs` ← `connector_sync_runs`, `connector_records`, `canonical_entity_links`, `canonical_survivorship_policies`, `connector_record_history`.
- `connector_sync_runs` ← `data_quality_issues.connector_run_id`.
- `documents` ← `document_chunks`.
- `tais_customers` ← `tais_locations`, `tais_contracts`, `tais_leads`, `tais_deals`, `tais_activities`, `tais_service_requests`, `tais_complaints`, `tais_tasks`.
- `tais_teams` ← `tais_employees`, `tais_tasks`.
- `tais_locations` ← `tais_tasks`, `tais_service_requests`, `tais_complaints`, `tais_quality_issues`.

`kpi_definitions` ile `kpi_values` arasında FK yoktur (tanım/eşik ile gözlem ayrımı kavramsaldır).
Yalnızca `governance_state='approved'` tanımlar eşik sınıflandırması ve doğrulanmış KPI sonuç kanıtı için okunur. Migration 41 öncesi tanımlar revision 1 olarak arşivlenir ancak onaylanmış sayılmaz. Migration 42 ile formül/birim/eşik/hedef yapısal kontrolü ayrı bir doğrulama kaydı üretir; formülün gerçekten çalıştırıldığı anlamına gelmez. Onay yalnızca doğrulanmış revision üzerinde mümkündür. Onay sonrası tanım değişikliği durumu `calculable`'a döndürür; önceki onay ve revision kayıtları silinmez. Yetki `approve_kpi_definition` ile CEO, C-level, risk yöneticisi ve sistem yöneticisi rollerine verilmiştir.
`integration_events` ve `api_keys` yalnızca `organizations`'a bağlıdır; olay–anahtar ilişkisi uygulama katmanındadır.
`action_events` değiştirilemez/silinemez; yalnızca demo sıfırlama transaction'ı kontrollü bakım için trigger'ı geçici kapatır.
`tais_*` tabloları yalnızca deterministik demo verisi içindir; `/api/tais/*` uçları bu veriyi istek anında hesaplar.
Altın kayıt fiziksel bir kopya tablosu değildir; `connector_records` + `canonical_entity_links` + güven sırası üzerinden her istekte deterministik olarak üretilir.

## Değişiklik yaparken

- Yeni tablo/varlık: yeni migration + `org_id` + ilgili repository + test (tenant izolasyonu ve idempotency).
- Başka alanın okuduğu tabloyu değiştirmeden önce Lead'e haber ver (`docs/agents/README.md`).
- Yeni migration'ı geriye uyumlu yaz; mevcut testleri bozma.
