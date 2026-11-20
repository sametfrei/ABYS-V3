# ABYS Baseline Matrix — 2026-11-20

Bu matris önceki tamamlanma iddialarını otomatik kabul etmez. `VERIFIED_INTEGRATED`, ilgili kodun yerel `main` dalında odaklı commit içinde bulunduğunu ve kanıt komutlarının güncel ağaçta geçtiğini gösterir; GitHub'a gönderildiğini göstermez. `EXTERNALLY_VALIDATED` hiçbir canlı vendor entegrasyonu için kullanılmamıştır.

| Yetenek | Önceki iddia | Gerçek durum | Kanıt | Kalan iş |
|---|---|---|---|---|
| Kimlik, RBAC, oturum ve parola politikası | Tamam | `VERIFIED_INTEGRATED` | `npm test`; login, session, permission ve API auth süitleri; smoke 22/22 | Gerçek kurumsal SSO sağlayıcısıyla canlı doğrulama |
| OIDC Authorization Code + PKCE | Tamam | `VERIFIED_INTEGRATED` | OIDC birim/entegrasyon testleri | Gerçek IdP keşif belgesi, anahtar rotasyonu ve hesap yaşam döngüsü |
| Tenant izolasyonu | Tamam | `VERIFIED_INTEGRATED` | tenant-isolation ve kapsamlı API testleri | Tüm yeni uçlar için sürekli regresyon |
| Hash zincirli audit | Tamam | `VERIFIED_INTEGRATED` | audit testleri; smoke `verify.valid=true` | Dışarıdan değiştirilemez WORM/WORM-benzeri saklama gerekirse ayrı tasarım |
| Migration governance | Tamam | `VERIFIED_INTEGRATED` | migration-governance testleri; migration head 33 | Migration 18 açık insan onayı olmadan uygulanmaz |
| REST/OData konnektör çekirdeği | Tamam | `VERIFIED_INTEGRATED` | connector/canonical/security süitleri; 22/22 smoke | Daha fazla protokol (SOAP/JDBC/ODBC/OAuth2 client) |
| Şema keşfi, eşleme sürümleme ve karantina | Tamam | `VERIFIED_INTEGRATED` | connectors/canonical-contracts/data-quality testleri | Tarayıcıda operatör akışı görsel doğrulaması |
| Zamanlanmış senkron ve sağlık telemetrisi | Tamam | `VERIFIED_INTEGRATED` | scheduler/connector testleri; Command Center gerçek run kayıtları | Uzun süreli üretim yükü ve dağıtık scheduler testi |
| Canlı SAP/Oracle/Dynamics/Salesforce/HubSpot/NetSuite/Odoo | Hazır | `BLOCKED` | Adapter kod yolu var; müşteri endpoint/kimlik kanıtı yok | Gerçek müşteri kimliği, allowlist ve sözleşme testleri |
| Kanonik veri, entity resolution ve survivorship | Tamam | `VERIFIED_INTEGRATED` | entity-resolution/canonical-survivorship/canonical-contracts testleri | Daha fazla güçlü kimlik türü ve düşük güven inceleme politikası |
| KPI kayıt defteri ve deterministik tahmin | Tamam | `VERIFIED_INTEGRATED` | forecasting/forecast-evidence/KPI testleri | Model kalibrasyonunun gerçek sonuçlarla geri beslenmesi |
| Anomali ve süreç madenciliği | Tamam | `VERIFIED_INTEGRATED` | anomaly/process-mining testleri | Gerçek olay hacmiyle performans doğrulaması |
| Nedensel/root-cause analiz | Tamam | `PARTIALLY_IMPLEMENTED` | causal-evidence/decision-brief testleri; korelasyon açıkça ayrıştırılır | Otomatik nedensel çıkarım yok; uzman onaylı kanıt modeli genişletilecek |
| Semantik grafik ve sınırlı çok-hop komşuluk | Tamam | `VERIFIED_INTEGRATED` | semantic-graph-neighborhood/semantic-traversal testleri | Formal ontology servisi ve büyük grafik performansı |
| Dijital ikiz: güncel, tarihsel ve senaryo karşılaştırması | Tamam | `VERIFIED_INTEGRATED` | digital-twin-comparison/enterprise-state testleri | Canlı müşteri verisiyle hacim ve tutarlılık doğrulaması |
| Kısıtlı deterministik optimizasyon | Tamam | `VERIFIED_INTEGRATED` | optimization testleri; infeasible durumda sahte optimal yok | Daha büyük problemler için çözücü ölçekleme |
| Karar brifingi ve çok kriterli seçenekler | Tamam | `VERIFIED_INTEGRATED` | decision-brief/decision-options/decision-prompt testleri | Tarayıcıda tam kullanıcı yolculuğu |
| Karar → aksiyon → sonuç Defteri | Tamam | `VERIFIED_INTEGRATED` | decision-lifecycle/action-governance/decision-economics/decision-ledger testleri | Otomatik model yeniden eğitimi değil; kontrollü kalibrasyon tasarımı |
| Onaylı dış yürütme adaptörü | Tamam | `BLOCKED` | execution-intents/execution-gateway testleri; gerçek vendor çağrısı yok | Müşteri kimliği, hedef allowlist ve insan onayıyla canlı adaptör |
| Yönetici karar zekâsı ekranları | Tamam | `IMPLEMENTED_UNVERIFIED` | production build 94 route; HTTP smoke temel ekranları 200 döndürdü | Gerçek browser ile görsel, responsive ve etkileşim doğrulaması |
| Browser E2E / görsel kabul | Tamam | `BLOCKED` | Computer-use browser host kullanılamadı | Erişilebilir browser host veya harici Playwright/Cypress ortamı |
| Production build | Tamam | `VERIFIED_LOCALLY` | Next.js 16.2.11 build, 94 route, TypeScript temiz | Üretim artifact dağıtımı ayrı onay gerektirir |
| Production deploy ve canlı veri değişikliği | Tamam | `BLOCKED` | Repo içi doğrulama var; deploy kanıtı yok | Açık insan onayı, hedef ortam ve geri alma planı |
| GitHub aktarımı | Tamam | `BLOCKED` | Yerel commit'ler mevcut; `github.com` DNS çözümlenemiyor | Ağ düzeldiğinde ata kontrolü ve normal push |

## Ortam notları

- EVREN `/v1/quota` anlık görüntüsü: hesap eşzamanlılığı 8, `deepseek-v4.1-flash` model eşzamanlılığı 2, açık model isteği 2, günlük kalan 10.908.363 token, beş dakikalık kullanım 32.160/250.000, `fair_share_active: true`.
- Gateway sunucu loglarına erişim yoktur; request ID `bafaa582-395b-4aa9-8868-cb695c82ffe1` için model/ajan/aşama eşlemesi yalnızca sağlayıcı loglarıyla kesinleştirilebilir.
- Aktif Codex süreç sayısı tanımlı rollerden türetilmez. Son doğrulanan Command Center kaydı 1 aktif Codex oturumu göstermiştir; dört süreç çalıştığı iddia edilmemektedir.
