# ABYS Ürün Yol Haritası

Bu dosya yaşayan kayıttır. Bir yetenek yalnızca kodu yazıldığı için "tamam"
sayılmaz; durum sütunu kanıt düzeyini gösterir.

Durum ölçeği:

- **E2E (test)**: API + UI yolu otomatik testlerle doğrulandı.
- **Tarayıcı bekliyor**: kod tamam, Live Preview'da uçtan uca doğrulanmadı.
- **Dış kimlik gerekir**: adaptör hazır; canlı sistem erişimi/anahtarı yok.
- **Planlı**: henüz uygulanmadı.

## Veri bağlantısı

| Yetenek | Durum | Kanıt / kalan iş |
|---|---|---|
| Genel REST/OData adaptörü (sayfalama, alan eşlemesi, artımlı checkpoint, retry, SSRF) | E2E (test) | `src/lib/connectors/rest-adapter.ts`, `tests/connectors.test.ts` |
| Konnektör konfigürasyon deposu + senkron geçmişi + idempotent kanonik kayıtlar | E2E (test) | migration 20–24, `/api/connectors(+/[id]/sync,/[id]/runs,/[id])` |
| Kanonik veri sözleşmeleri (alan tipi, tarih ve referans doğrulaması) | E2E (test) | `src/lib/connectors/contracts.ts`, `GET /api/canonical-contracts`, `tests/canonical-contracts.test.ts` |
| Kaynak şema gözlemi ve eşleme önerileri | E2E (test) | `src/lib/connectors/schema-discovery.ts`; yalnızca alan yolu/tipi saklanır, değer veya sır saklanmaz |
| Eşleme onayı + sürümlü konfigürasyon | E2E (test) | migration 28 append-only `connector_config_versions`; `GET/POST /api/connectors/[id]/mapping`; iyimser sürüm kilidi, insan onayı, eski sürüm korunumu ve tenant izolasyonu `tests/connectors.test.ts` |
| Sözleşme reddi → veri kalitesi karantinası → çalıştırma bağlantısı | E2E (test) | migration 22; `data_quality_issues.code/connector_run_id`; `tests/connectors.test.ts` |
| Kanonik kayıt → KPI gözlemi + süreç olayı aktarımı | E2E (test) | `src/lib/db/repos/connector-promotion.ts`; tekrar senkron idempotent; KPI tahmin/anomali ve olay süreç madenciliği testte doğrulanır |
| Bağlantı yönetimi ekranı (`/dashboard/connectors`) | Tarayıcı bekliyor | Oluştur/senkron/geçmiş akışı; Auto Mode nedeniyle tarayıcı doğrulaması yapılamadı |
| SAP / Oracle / Dynamics / Salesforce / HubSpot / NetSuite / Odoo | Dış kimlik gerekir | Aynı REST adaptörü; müşteri uç noktası ve kimliği olmadan canlı doğrulanmadı |
| Infor / IFS / Sage | Dış kimlik gerekir | REST/OData uçları genel adaptöre bağlandı (Infor OAuth2, IFS basic, Sage OAuth2 client-credentials); canlı kiracı/kimlik olmadan doğrulanmadı |
| OAuth2 client-credentials token akışı | E2E (test) | `src/lib/connectors/rest-adapter.ts`; yalnızca HTTPS token endpoint'i, SSRF doğrulaması, redirect izlemeyen dar POST istemcisi, ortam değişkeninden istemci kimliği/sırrı ve scope; `tests/connectors.test.ts`, `tests/source-readonly.test.ts` |
| SOAP, JDBC/ODBC | Planlı | Ayrı adaptör gerekir |
| CSV/XLSX dosya içe alma | E2E (test) | Mevcut `POST /api/ingest` + `parseTable` |
| Zamanlanmış senkron | E2E (test) | migration 24; `PATCH /api/connectors/[id]`, `POST /api/connectors/scheduler/run`, `src/lib/connectors/scheduler.ts`; due claim, manuel run kilidi, stale kurtarma, hata izolasyonu ve `trigger=scheduled` testte doğrulanır |
| Zamanlayıcı operasyon sağlığı | E2E (test) | `GET /api/connectors/scheduler/health`; gecikme, takılı çalıştırma, ardışık hata ve tenant izolasyonu gerçek run kayıtlarından türetilir; `/dashboard/connectors` üzerinde görünür |

## Birleşik iş bağlamı ve kimlik çözümleme

| Yetenek | Durum | Kanıt / kalan iş |
|---|---|---|
| Kanonik varlık modeli (customer, order, invoice, ...) | E2E (test) | `src/lib/connectors/types.ts`, `src/lib/connectors/contracts.ts` |
| Çoklu kaynak kimlik eşlemesi | E2E (test) | `canonical_entity_links` (migration 23), `src/lib/connectors/entity-resolution.ts`; yalnızca normalize e-posta/SKU güçlü eşleşmeleri kaynaklar arası birleşir, diğerleri kaynak-kapsamlıdır |
| Veri soyu (`datasets`, `raw_content`) | E2E (test) | Mevcut |
| Veri kalitesi karantinası | E2E (test) | `/api/data-quality`; Bitrix24 hataları ve konnektör sözleşme ihlalleri bağlı; `GET /api/data-quality/export` 500 satıra kadar kurum kapsamlı, payload'sız CSV üretir ve denetim kaydı yazar; liste `limit` (1–500) doğrular ve kırpılmayı `truncated` ile bildirir |
| Onaylı, sürümlü iş profili | E2E (test) | `business_profiles` (migration 21), `POST /api/discovery`; kaynak değişince sessiz güncelleme yok |
| Sektör paketi KPI aktivasyonu | E2E (test) | `activateIndustryPack`; elle yazılmış aynı adlı KPI korunur, kaynak izlenir |
| Semantik grafik projeksiyonu + çok-hop komşuluk | E2E (test) | `src/lib/db/repos/semantic-graph.ts`, `src/lib/semantic-traversal.ts`, `GET /api/semantic-graph` ve `/neighborhood`; kaynaklar arası referans çözümü, yön/derinlik/limit testleri var |
| Kimlik çakışması inceleme kuyruğu | E2E (test) | `/api/data-quality` `accept_proposed` / `keep_existing`; atomik bağlantı güncellemesi, tekrar kapatma engeli ve tenant izolasyonu `tests/identity-review.test.ts` |
| Altın kayıt alan yaşamı + açık kaynak güven sırası | E2E (test) | Migration 26; `src/lib/canonical-survivorship.ts`, `/api/canonical-entities`, `/api/survivorship-policies`; alan bazında kaynak/çelişki izlenir, kaynak kayıtları değişmez |
| Altın kayıt güven sırası yönetimi | Tarayıcı bekliyor | Keşif ekranında varlık seçimi, kaynak önceliği düzenleme ve onaylı kaydetme; API testleri `tests/canonical-survivorship.test.ts` |

## Zekâ

| Yetenek | Durum | Kanıt / kalan iş |
|---|---|---|
| Deterministik KPI zaman serisi girişi | E2E (test) | `/api/kpi-values`, `/dashboard/kpi` |
| Sektör paketi formüllerinin çalıştırılabilir hesaplayıcıları | E2E (test) | `src/lib/industry/kpi-calculators.ts`; eksik alan/sıfır paydada değer üretilmez |
| Tahmin (naive/SES/trend, geriye dönük test, P10–P90) | E2E (test) | `src/lib/forecasting.ts`, `tests/forecasting.test.ts` |
| Tahmin kalibrasyonu · kaydedilen tahmin vs gerçekleşen | E2E (test) | migration 35 `forecast_snapshots`; `POST/GET /api/forecast/snapshots`; üretilen ilk adım (P10/P50/P90) saklanır, sonraki sayısal KPI gözlemiyle karşılaştırılır; aralık isabeti, ıska ve ortalama mutlak hata kayıtlı değerlerden türetilir; `src/lib/forecast-calibration.ts`, `/dashboard/forecast` paneli; `tests/forecast-snapshots.test.ts` |
| Tahmin aralığı kalibrasyonu · kapsamaya göre ölçekleme | E2E (test) | `computeIntervalAdjustment`: en az 5 ölçülmüş tahminde gözlenen P10–P90 kapsaması %80 hedefe göre 0,5–3× aralığında ölçeklenir; ham çıktı `forecast.points` korunur, kalibre aralıklar `adjustedPoints` olarak döner ve ekranda gerekçesi gösterilir; `tests/forecasting.test.ts` |
| Zamanlanmış tahmin yakalama | E2E (test) | `POST /api/forecast/snapshots/capture`; tahmin edilebilir tüm KPI etiketleri için anlık görüntü alır, etiket başına 20 saatte bir tekrar kayıt oluşturmaz; yetersiz veri ve tahmin edilemeyen etiketler ayrı raporlanır; cron/zamanlayıcıdan güvenle çağrılabilir; `tests/forecast-snapshots.test.ts` |
| Erken uyarı (median/MAD) | E2E (test) | `src/lib/anomaly.ts`, `tests/anomaly.test.ts` |
| Monte Carlo (tohumlu, üçgensel, P10/P50/P90) | E2E (test) | `src/lib/scenario-simulation.ts`, `tests/scenario-simulation.test.ts` |
| Çok kriterli seçenek değerlendirme + Pareto | E2E (test) | `src/lib/decision-options.ts`, `/dashboard/options` |
| Süreç madenciliği (geçiş, medyan/P90, darboğaz) | E2E (test) | `src/lib/process-mining.ts`; gerçek olay günlüğü verisi gerekir |
| Nedensel kanıt durumu (observed/inferred/confirmed) | E2E (test) | `causal_links` + `/api/causal`; yöntem, örneklem, veri kalitesi ve belirsizlik üst verisi (migration 34) kaydedilir; `src/lib/causal-evidence.ts` bunlardan kanıt seviyesi türetir ve `observed_correlation` hiçbir koşulda yeterli sayılmaz; otomatik nedensel sonuç iddiası yok; `tests/causal-links-api.test.ts`, `tests/causal-evidence.test.ts` |
| Karar brifingi: çok kaynaklı kanıt + öneri + belirsizlik | E2E (test) | `src/lib/decision-brief.ts`, `GET /api/decision-cases/[id]/intelligence`, karar detayında "Karar Zekâsı" paneli; sonuçlar `decision_records.case_id` ile vakaya bağlanır. Sinyaller yalnızca migration 33 `decision_case_signals` üzerindeki açık bağla vaka kanıtı olur; bağsız kurum sinyalleri ayrı bağlam olarak etiketlenir ve güven hesabına katılmaz. Bağlama API'si ve panel kontrolü `tests/decision-signals.test.ts` ile doğrulanır |
| Optimizasyon · çok kaynaklı tam sayılı tahsis | E2E (test) | `src/lib/optimization.ts`, `POST /api/optimization`; kapasite, minimum taahhüt, Pareto dışı toplam değer, düğüm sınırı ve determinizm `tests/optimization.test.ts`; seçenek ekranında düzenlenebilir model |
| Dijital ikiz · mevcut durum projeksiyonu | E2E (test) | `/api/digital-twin`; kanonik varlıklar, para birimi ayrımlı finansal durum, operasyon hacimleri, bağımlılıklar, KPI son durumu, veri tazeliği ve açık riskler gerçek kayıtlardan türetilir |
| Dijital ikiz · tarihsel yeniden kurulum | E2E (test) | migration 27 append-only `connector_record_history`; `GET /api/digital-twin?asOf=...` ve keşif ekranındaki geçmiş an seçimi; kaynak kaydı değişmediyse geçmiş şişmez |
| Dijital ikiz · senaryo sonrası karşılaştırma | E2E (test) | `src/lib/digital-twin-comparison.ts`, `POST /api/digital-twin/compare`; para birimi ayrımı korunur, yalnızca açık deltalar uygulanır, KPI eşiği senaryo sonrası yeniden hesaplanmış sayılmaz; `tests/digital-twin-comparison.test.ts` |

## Karar yaşam döngüsü

| Yetenek | Durum | Kanıt / kalan iş |
|---|---|---|
| Karar kaydı, aksiyon, sonuç, ders | E2E (test) | Mevcut karar/aksiyon/outcome uçları; kabul/değiştir kararında karar + aksiyon + audit tek transaction, `tests/decision-lifecycle.test.ts` rollback kanıtı |
| Yönetilen aksiyon geçişleri | E2E (test) | `open → in_progress → done`, açık aksiyondan doğrudan tamamlama reddi, karar durumunun `in_execution` / `outcome_review` olarak ilerlemesi, tenant izolasyonu ve audit rollback `tests/action-governance.test.ts` |
| Geciken aksiyon görünürlüğü | E2E (test) | `src/lib/action-deadline.ts`; yalnızca açık/yürütülen aksiyonlar vade geçmişse geciken sayılır, geçen tam gün raporlanır; `/api/command-center` `overdueCount` ve aksiyon başına bayrak döner, aksiyon ekranı "Vadesi geçti · N gün" gösterir; `tests/action-deadline.test.ts`, `tests/decision-ledger.test.ts` |
| Değişmez yürütme olayları | E2E (test) | migration 30 append-only `action_events`; aktör kimliği, önceki/yeni durum ve ilerleme notu; `GET /api/actions?eventsFor=...`; UPDATE reddi testte doğrulanır |
| İdempotent yürütme hazırlığı | E2E (test) | migration 31 `action_execution_intents`; aynı anahtar+içerik aynı kaydı döndürür, farklı içerik 409 alır; insan onayı `approved` durumuna geçirir; dış sistem çağrısı yapılmaz; `tests/execution-intents.test.ts` |
| Sınırlı dış yürütme adaptörü sözleşmesi | Dış kimlik gerekir | `src/lib/execution/{contracts,gateway}.ts`, migration 32 `action_execution_attempts`; onaylı niyet, hedef allowlist, tek deneme, timeout, sağlayıcı sonucu ve audit testte doğrulanır. Canlı vendor adaptörü/aktarımı gerçek kimlik ve sözleşme olmadan bağlanmaz |
| Decision Value Ledger | E2E (test) | `/api/decision-ledger`, `/dashboard/decision-ledger` |
| Beklenen/gerçekleşen ekonomik etki (sayısal) | E2E (test) | migration 25; karar beklenen değer/aralık/para birimi/varsayım, sonuç gerçekleşen değer/ölçüm aralığı/kanıt; aynı para biriminde fark ve %; `/api/decision-ledger` para birimi bazlı özet |
| Kapalı döngü öğrenme | E2E (test) | Aralık isabeti, güven kovaları, kabul oranı ve gerçekleşen sonuç oranı `/api/decision-ledger` ve `/dashboard/decision-ledger` üzerinde; `tests/decision-economics.test.ts`, `tests/decision-ledger.test.ts`. Tahmin modeli otomatik yeniden eğitilmiyor; bu açıkça sınır olarak kalır |
| Karar güveni kalibrasyonu · gerçekleşen sonuç geri beslemesi | E2E (test) | `src/lib/decision-calibration.ts`; güven kovalarında gözlenen iyileşme oranı ilan edilen güvenle karşılaştırılır, kova başına en az 5 sonuç yoksa düzeltme üretilmez, sönümlemeli (n·gözlem + 5·ilan)/(n+5) düzeltilmiş güven sunulur; `/api/decision-ledger` `summary.calibration`, `/dashboard/decision-ledger` paneli, `/api/decision-cases` vaka güven paneli ve `/api/command-center` yönetici brifinginde geçmiş kalibrasyon notu; `tests/decision-calibration.test.ts`, `tests/decision-ledger.test.ts` |

## Platform

| Yetenek | Durum | Kanıt / kalan iş |
|---|---|---|
| Kimlik, RBAC, oturum, OIDC, parola politikası | E2E (test) | Geniş test kapsamı |
| Oturum cihazı ve son görülme | E2E (test) | Migration 36 `sessions.user_agent/last_seen_at`; cihaz bilgisi yalnızca oturum sahibine döner, son görülme en fazla 5 dakikada bir yenilenir; `tests/sessions-api.test.ts` |
| Tenant izolasyonu | E2E (test) | Tüm repository'ler org_id kapsamlı |
| Denetim hash zinciri | E2E (test) | Mevcut çözüm korunuyor; seq yaması uygulanmadı |
| Kontrollü migration yürütme | E2E (test) | Onay gerektiren migration 18 uygulanmadan bekletilir; sonraki migration'lar bağımsız uygulanır; `GET /api/health` bekleyen onayı raporlar |
| Çoklu şirket/şube hiyerarşisi + konsolidasyon | E2E (test) | `/api/organizations*` |
| TR/EN i18n | Kısmi | Dashboard ekranları, TAIS yönetici ekranı ve Yönetim Komuta Merkezi TR/EN; sunucu çerezden dili okur (`curl -H 'Cookie: abys_lang=en' /login` → EN); seçim çerez + localStorage ile kalıcı (`abys_lang`); `src/lib/i18n.ts`, `src/lib/navigation.ts`, `tests/i18n.test.ts`. Sunucu tarafı içerik/API yanıt metinleri ve Ask ABYS eşleştiricisi Türkçe kalır — kalan çeviri ayrı iş |
| Production build | E2E (test) | `npm run build` başarılı; üretim modu `next start` üzerinde smoke 71/71 ve `scripts/verify-deploy.mjs --expect=origin` commit eşleşmesiyle exit 0 |
| Tarayıcı E2E | Tarayıcı bekliyor | Otomatik browser doğrulaması bu oturumda yapılmadı |

## Dış engeller

- Canlı ERP/CRM kimlik bilgileri ve müşteri uç noktaları.
- Tarayıcı görsel/E2E doğrulaması için kullanılabilir browser host.

## Sıradaki mühendislik sırası

Son tamamlanan dilimler: karar güveni kalibrasyonu (TB-020), kök neden kanıt üst verisi (TB-022), tahmin–gerçekleşen kalibrasyonu (TB-024), aralık kapsama ölçeklemesi (TB-025), Infor/IFS/Sage adaptör bağlantısı (TB-026), kabuk i18n temeli (TB-028), giriş ekranı yerelleştirmesi (TB-029), zamanlanmış tahmin yakalama (TB-030), geciken aksiyon görünürlüğü (TB-031), tahmin anlık görüntüsü denetim kaydı (TB-032), konnektör senkron hatası/yeniden deneme görünürlüğü (TB-033), tahmin saklama planı (TB-034), saklama smoke kapsamı (TB-035), tahmin panelinde saklama durumu (TB-036), aksiyon ekranı TR/EN yerelleştirmesi (TB-037), konnektör hata sınıflandırması (TB-038), bağlantı ekranı TR/EN yerelleştirmesi (TB-039), çalıştırma sağlığının API'de açılması (TB-040), karar defteri CSV dışa aktarımı (TB-041), tahmin ekranı TR/EN yerelleştirmesi (TB-042), hata sınıfına göre retry rehberliği (TB-043), CSV dışa aktarım güvenlik testleri (TB-044), karar defteri TR/EN yerelleştirmesi (TB-045), dışa aktarım denetim kaydı (TB-046), denetim ekranı TR/EN yerelleştirmesi (TB-047), denetim API'sinde zincir hash'leri (TB-048), tahmin kalibrasyonu CSV dışa aktarımı (TB-049), karar defteri limit doğrulaması (TB-050) ayarlar ekranı TR/EN yerelleştirmesi (TB-051), ayarlar alt bileşenlerinin yerelleştirmesi (TB-052) tahmin listesi için doğrulanmış limit (TB-053), veri kalitesi ekranı TR/EN yerelleştirmesi (TB-054) denetim CSV dışa aktarımı + güvenlik testleri (TB-055) sinyaller ekranı TR/EN yerelleştirmesi (TB-056), süreç zekâsı ekranı TR/EN yerelleştirmesi (TB-057) liste limiti doğrulama temizliği (TB-058), veri kaynakları ekranı TR/EN (TB-059) veri kalitesi skor motoru (TB-060), örneklem şeffaflığı (TB-061) kalite skoru paneli (TB-062) `/api/health` üzerinden dağıtım sürüm parmak izi (TB-063) raporlar ekranı TR/EN (TB-064), CSV indirme bağlantıları (TB-065) Bitrix24 idempotency/kanıt/izolasyon testleri (TB-066), senaryo laboratuvarı TR/EN (TB-067) ve CSV dışa aktarım sözleşme smoke kontrolleri (TB-068) kurumsal hafıza ekranı TR/EN (TB-069) analiz ekranı TR/EN (TB-070) danışman analitiği TR/EN (TB-071) karar seçenekleri TR/EN (TB-072) çalışan örnek sürüm kapısı `scripts/verify-deploy.mjs` (TB-073) organizasyon ekranı TR/EN (TB-074) iş keşfi ekranı TR/EN (TB-075), karar merkezi kabuğu/analizörü TR/EN (TB-076), karar vaka kartları ve kanıt panelleri TR/EN (TB-077) karar nedensellik zinciri, izleme modalı ve seçenekler TR/EN (TB-078) KPI verisi ekranı TR/EN (TB-079) Ask ABYS ekranı TR/EN (TB-080) kalite skoru metrik filtresi (TB-081) Yönetim Komuta Merkezi TR/EN (TB-082) kalite skoru filtre izolasyon kanıtı (TB-083) TAIS yönetici ekranı TR/EN (TB-084) oturum cihazı/son görülme görünürlüğü (TB-085) tüm dashboard ekranlarını kapsayan smoke genişletmesi (TB-086) karantina CSV dışa aktarımı (TB-087) üretim modu çalışma/sürüm parmak izi doğrulaması (TB-088) karantina liste limiti/kesilme bildirimi (TB-089) aksiyon listesi CSV dışa aktarımı (TB-090) teslim kapısı/release notları (TB-091) ve aksiyon sonucunda doğrulanmış gerçekleşen finansal etki girişi (TB-092).

1. **Yürütme hazırlığı:** aksiyon planı, sahiplik/due-date, dış adaptör öncesi idempotent execution intent kaydı.
2. **Gerçek vendor doğrulaması:** müşteri uç noktası ve kimlik bilgisi sağlandığında SAP/Oracle/Dynamics/Salesforce/HubSpot adaptör sözleşme testleri.
