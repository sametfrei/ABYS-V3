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
| Konnektör konfigürasyon deposu + senkron geçmişi + idempotent kanonik kayıtlar | E2E (test) | migration 20, `/api/connectors(+/[id]/sync,/[id]/runs)` |
| Bağlantı yönetimi ekranı (`/dashboard/connectors`) | Tarayıcı bekliyor | Oluştur/senkron/geçmiş akışı; Auto Mode nedeniyle tarayıcı doğrulaması yapılamadı |
| SAP / Oracle / Dynamics / Salesforce / HubSpot / NetSuite / Odoo | Dış kimlik gerekir | Aynı REST adaptörü; müşteri uç noktası ve kimliği olmadan canlı doğrulanmadı |
| Infor / IFS / Sage | Planlı | Adaptör yok; kayıt defterinde açıkça "planned" |
| SOAP, JDBC/ODBC, OAuth2 token akışı (istemci kimliği ile) | Planlı | Ayrı adaptör gerekir |
| CSV/XLSX dosya içe alma | E2E (test) | Mevcut `POST /api/ingest` + `parseTable` |
| Zamanlanmış senkron | Planlı | Şu an istek üzerine senkron; cron/worker yok |

## Birleşik iş bağlamı ve kimlik çözümleme

| Yetenek | Durum | Kanıt / kalan iş |
|---|---|---|
| Kanonik varlık modeli (customer, order, invoice, ...) | E2E (test) | `src/lib/connectors/types.ts` |
| Çoklu kaynak kimlik eşlemesi | Kısmi | `connector_records` kaynak bazlı external_id tutar; gerçek entity resolution/füzyon yok |
| Veri soyu (`datasets`, `raw_content`) | E2E (test) | Mevcut |
| Veri kalitesi karantinası | E2E (test) | `/api/data-quality`, Bitrix24 senkron hataları bağlı |

## Zekâ

| Yetenek | Durum | Kanıt / kalan iş |
|---|---|---|
| Deterministik KPI zaman serisi girişi | E2E (test) | `/api/kpi-values`, `/dashboard/kpi` |
| Tahmin (naive/SES/trend, geriye dönük test, P10–P90) | E2E (test) | `src/lib/forecasting.ts`, `tests/forecasting.test.ts` |
| Erken uyarı (median/MAD) | E2E (test) | `src/lib/anomaly.ts`, `tests/anomaly.test.ts` |
| Monte Carlo (tohumlu, üçgensel, P10/P50/P90) | E2E (test) | `src/lib/scenario-simulation.ts`, `tests/scenario-simulation.test.ts` |
| Çok kriterli seçenek değerlendirme + Pareto | E2E (test) | `src/lib/decision-options.ts`, `/dashboard/options` |
| Süreç madenciliği (geçiş, medyan/P90, darboğaz) | E2E (test) | `src/lib/process-mining.ts`; gerçek olay günlüğü verisi gerekir |
| Nedensel kanıt durumu (observed/inferred/confirmed) | Kısmi | `causal_links` + `/api/causal`; otomatik nedensel çıkarım yok |
| Karar brifingi: çok kaynaklı kanıt + öneri + belirsizlik | E2E (test) | `src/lib/decision-brief.ts`, `GET /api/decision-cases/[id]/intelligence`, karar detayında "Karar Zekâsı" paneli |
| Optimizasyon (LP/IP, kaynak tahsisi) | Planlı | Henüz deterministik optimizer yok |
| Dijital ikiz | Planlı | — |

## Karar yaşam döngüsü

| Yetenek | Durum | Kanıt / kalan iş |
|---|---|---|
| Karar kaydı, aksiyon, sonuç, ders | E2E (test) | Mevcut karar/aksiyon/outcome uçları |
| Decision Value Ledger | E2E (test) | `/api/decision-ledger`, `/dashboard/decision-ledger` |
| Beklenen/gerçekleşen ekonomik etki (sayısal) | Kısmi | `businessImpact` metin; sayısal etki alanı ve mutabakat yok |
| Kapalı döngü öğrenme | Planlı | Sonuçlar öneri kalitesini otomatik beslemiyor |

## Platform

| Yetenek | Durum | Kanıt / kalan iş |
|---|---|---|
| Kimlik, RBAC, oturum, OIDC, parola politikası | E2E (test) | Geniş test kapsamı |
| Tenant izolasyonu | E2E (test) | Tüm repository'ler org_id kapsamlı |
| Denetim hash zinciri | E2E (test) | Mevcut çözüm korunuyor; seq yaması uygulanmadı |
| Çoklu şirket/şube hiyerarşisi + konsolidasyon | E2E (test) | `/api/organizations*` |
| TR/EN i18n | Planlı | Arayüz şu an Türkçe |
| Production build + tarayıcı E2E | **Bloke** | EVRN Auto Mode güvenlik kontrolü çalışmadığı için `npm run build` ve canlı tarayıcı doğrulaması yapılamadı |

## Dış engeller

- Canlı ERP/CRM kimlik bilgileri ve müşteri uç noktaları.
- Production build ve tarayıcı doğrulaması için uygun izin modu.
