# ABYS Mühendislik İşletim Durumu

Bu dosya oturumlar arasında kurtarılabilir mühendislik durumudur. Kod ve test kanıtı
otoritedir; buradaki bir yetenek yalnızca kod bulunduğu için tamamlanmış sayılmaz.

## Organizasyon

- Kanonik rol manifesti: `docs/agents/organization.json` (1 CEO + 5 direktör + 25 uzman = 31 rol).
- Hiyerarşi: `Codex → Departman Direktörü → Uzman`.
- Uzmanlar alt ajan doğuramaz. Bir dosyada aynı anda yalnızca bir yazar bulunur.
- Başlangıç eşzamanlılığı: küresel 8 alt ajan. Genişleme sırası: 12, 16, 20, 24, 30.
- Genişleme yalnızca gerçek tamamlanma, gecikme ve 429 verisiyle yapılır. Sahte kapasite veya ilerleme üretilmez.
- Kök Codex, doğrulanmış bağımsız dilimleri Conventional Commit ile otomatik commit eder; sağlıklı ağda
  `origin/main` uzak durumu kontrol edilerek force push olmadan push edilir.

## Değiştirilemez sınırlar

- Migration 18, yıkıcı veritabanı işlemleri, üretim altyapısı/dağıtımı ve canlı müşteri verisi değişiklikleri açık insan onayı ister.
- Commit kapsamı katıdır: yalnızca tamamlanmış dosya sahipliği ve doğrulanmış test/build kanıtı. Devam eden ajan
  dosyaları, doğrulanmamış değişiklikler ve ilgisiz kullanıcı çalışmaları commit edilmez. Force push, rebase ve history rewrite yasaktır.
- Kaynak sistemler varsayılan olarak salt okunurdur.
- EVREN sağlayıcısı, model uç noktası ve kimlik bilgileri değiştirilmez.
- Canlı SAP, Oracle, Dynamics, Salesforce, HubSpot, NetSuite veya Odoo entegrasyonu; gerçek kimlik ve satıcı API kanıtı olmadan doğrulanmış sayılmaz.

## Güncel doğrulama tabanı (2026-11-20)

- HEAD `87c3a88`; çalışma ağacında Sprint 1 ve sonraki yeteneklerin commit edilmemiş değişiklikleri korunuyor.
- Migration başı 33. Migration 18 onay kapısı açık ve uygulanmadı.
- Tam süit kanıtı (2026-11-20): 75 dosya geçti, 1 atlandı; 707 test geçti, 9 atlandı.
- Üretim derlemesi (2026-11-20): Next.js 16.2.11, 94 sayfa ile başarılı. İlk sandbox build'i port bağlama izni nedeniyle düştü; sandbox dışı yeniden çalıştırma geçti.
- Canlı tarayıcı görsel doğrulaması bu oturumda yapılamadı; kod/API testi ile tarayıcı kanıtı ayrı tutulur.

## Öncelikli kuyruklar

| Departman | Hazır iş | Kabul kanıtı | Durum |
|---|---|---|---|
| Platform & Architecture | Aksiyon yürütme olayları ve karar-yürütme bağlantısı | Tip kontrolü + hedefli testler | Test edildi |
| Enterprise Connectivity | Eşleme sürümleme ve zamanlayıcı akışının tarayıcı doğrulaması | Live Preview uçtan uca kanıt | Tarayıcı bekliyor |
| Intelligence & Digital Twin | Aralık isabeti, güven kovası kalibrasyonu ve kabul oranı | Deterministik birim + DB entegrasyon testi | Test edildi |
| Product Experience | Karar defteri ve aksiyon ekranlarının mevcut ABYS diliyle gösterimi | Tip/lint + tarayıcı | Tarayıcı bekliyor |
| Security, Quality & Reliability | Aksiyon geçişleri, audit rollback ve append-only olay incelemesi | `tests/action-governance.test.ts` | Test edildi |

## Son doğrulanmış yetenekler

- Eşleme onayı ve append-only sürüm geçmişi; iyimser kilit ve tenant izolasyonu.
- Altın kayıt güven sırası düzenleyicisi; tarayıcı doğrulaması bekliyor.
- Deterministik kaynak tahsisi; optimal/feasible/infeasible ayrımı ve node limitinde sahte optimal yok.
- Senaryo toplamının açık varsayımla dijital ikiz karşılaştırması; para birimleri toplanmıyor.
- Görev sınıflandırıcısı yalnızca gerçek doğrulama komutlarını test olarak sayıyor.
- Aksiyon durum makinesi: açık aksiyon doğrudan tamamlanamaz; `in_progress` karar durumunu `in_execution`, `done` ise `outcome_review` yapar.
- `action_events` append-only denetim izi; aksiyon, karar ve audit yazımı tek transaction'da geri alınabilir.
- Yürütme hazırlığı idempotenttir: aynı anahtar+yük aynı kaydı döndürür, farklı yük 409 ile reddedilir; onay insan tarafından verilir ve dış çağrı yapılmaz.
- Karar + aksiyon + audit tek transaction'dır; ikinci audit hatasında karar ve aksiyon birlikte geri alınır (`tests/decision-lifecycle.test.ts`).
- Karar defteri yürütme durumu, olay sayısı ve güven kovalarını salt okunur gösterir; tahmin modeli otomatik yeniden eğitilmez.
- Karar brifingi vaka sonuçlarını yalnızca aynı `case_id` üzerinden bağlar; kurum geneli sinyaller "kurum bağlamı" olarak ayrılır ve vaka güvenine katılmaz (`tests/decision-brief.test.ts`).
- Sinyal-vaka kanıtı yalnızca açık gerekçeli bağla kurulur; tenant, idempotency, yetki ve audit `tests/decision-signals.test.ts` ile doğrulanır.
- KPI tahmini son 120 gözlemi kronolojik sırada kullanır; eski pencereye kilitlenme `tests/forecasting.test.ts` ile engellenir.
- Yürütme adaptör sözleşmesi allowlist, onay, tek deneme, timeout ve audit uygular; gerçek dış aktarım/kimlik yoktur (`tests/execution-gateway.test.ts`).

## Engeller

- GitHub DNS erişimi bağımsız teknik engel olarak izlenir. DNS kapalıyken push tekrarlanmaz; doğrulanmış commit'ler
  yerelde korunur. DNS düzeldiğinde yalnızca bir uzak durum kontrolü ve çakışma yoksa normal push denenir.
- EVREN üzerinde eşzamanlı ajan kapasitesi 429 üretiyor; yeni ajanların çoğu yerel oturumda sürdürülüyor.
- Tarayıcı/CUA görsel doğrulaması kullanılamıyor; tarayıcı bekleyen maddeler açıkça işaretli.
- Codex `approvals_reviewer = "auto_review"` ayarı için EVREN uyumluluğu doğrulanmadı; sağlayıcı değiştirilmedi.

## Sonraki hazır işler

1. Karar/aksiyon ekranlarını Live Preview'da uçtan uca doğrula.
2. Komuta Merkezi'ni 31 rol manifestine bağla; tanımlı/örneklenmiş/aktif ayrımını gerçek transkriptlerden üret.
3. Güvenlik incelemesindeki kalan Low bulguları değerlendir; riskli migration'ları onaysız uygulama.
4. Sonraki dikey dilim: onaylı execution intent → allowlist/idempotency/timeout/audit kontrollü dış adaptör sözleşmesi (gerçek kimlik olmadan canlı doğrulama yok).
5. Tahmin modeli kalibrasyonunu gerçek sonuçlarla besleyen kontrollü geri bildirim hattını tasarla.
