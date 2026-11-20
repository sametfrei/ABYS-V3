# ABYS Mühendislik İşletim Durumu

Bu dosya oturumlar arasında kurtarılabilir mühendislik durumudur. Kod ve test kanıtı
otoritedir; buradaki bir yetenek yalnızca kod bulunduğu için tamamlanmış sayılmaz.

## Organizasyon

- Kanonik rol manifesti: `docs/agents/organization.json` (1 CEO + 5 direktör + 25 uzman = 31 rol).
- Hiyerarşi: `Codex → Departman Direktörü → Uzman`.
- Uzmanlar alt ajan doğuramaz. Bir dosyada aynı anda yalnızca bir yazar bulunur.
- Yapılandırılmış gelecek sınırı 8 alt ajan olsa da EVREN `deepseek-v4.1-flash` için gözlenen model eşzamanlılık sınırı 2'dir. Model istekleri sıraya alınır; süreçler yanıt beklerken bağımsız yerel analiz/test/entegrasyon işi yapar.
- Dört Codex süreci ancak ikiden fazla açık model isteği oluşturmadan çalıştırılabilir. Tanımlı rol, başlatılmamış veya aktif olmayan süreç “aktif ajan” sayılmaz.
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

- `main` üzerinde son kod entegrasyon commit'i `9877024`; TB-012–TB-017 doğrulanmış dilimleri odaklı commit'ler halinde yerelde entegre edildi.
- Migration başı 33. Migration 18 onay kapısı açık ve uygulanmadı.
- Tam süit kanıtı (2026-11-20): 76 dosya geçti, 1 governance dosyası atlandı; 708 test geçti, 9 atlandı. Tam ESLint 0 hata/0 uyarı ve `npx tsc --noEmit` temiz.
- Üretim derlemesi (2026-11-20): Next.js 16.2.11, 94 route/sayfa ile başarılı.
- Çalışan önizleme smoke testi (2026-11-20): 22/22 başarılı; oturum, audit zinciri, 403 sınırı ve temel ekranlar HTTP üzerinden doğrulandı.
- Agent Command Center canlı state: 31 tanımlı rol (5 direktör + 25 uzman), 18 Codex oturumu, 1 gerçek aktif oturum, yapılandırılmış eşzamanlılık 8. Dört aktif süreç iddiası yoktur.
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

- GitHub DNS erişimi bağımsız teknik engel olarak izlenir (`Could not resolve host: github.com`). DNS kapalıyken push tekrarlanmaz; doğrulanmış commit'ler yerelde korunur. DNS düzeldiğinde yalnızca bir uzak durum kontrolü ve çakışma yoksa normal push denenir.
- EVREN gateway loglarına erişim yoktur. Operatör tarafından bildirilen quota anlık görüntüsü: günlük kalan 10.908.363 token, 5 dakikalık 32.160/250.000 token, hesap eşzamanlılığı 8, model eşzamanlılığı 2, açık model isteği 2, `fair_share_active: true`. Günlük kotanın tükendiğine dair kanıt yoktur; model başına iki istek sınırı aşıldığında 429 oluşur. Yeni ajan başlatmadan yerel iş sürdürülür.
- Tarayıcı/CUA görsel doğrulaması kullanılamıyor; tarayıcı bekleyen maddeler açıkça işaretli.
- Codex `approvals_reviewer = "auto_review"` ayarı için EVREN uyumluluğu doğrulanmadı; sağlayıcı değiştirilmedi.

## Sonraki hazır işler

1. Karar/aksiyon ve yeni yönetici ekranlarını kullanılabilir bir browser host üzerinde uçtan uca doğrula.
2. Onaylı execution intent → allowlist/idempotency/timeout/audit kontrollü dış adaptör sözleşmesini gerçek kimlik olmadan canlı aktarım yapmadan tamamla.
3. Güvenlik incelemesindeki kalan Low bulguları değerlendir; riskli migration'ları onaysız uygulama.
4. Tahmin modeli kalibrasyonunu gerçek sonuçlarla besleyen kontrollü geri bildirim hattını tasarla.
5. DNS düzeldiğinde `origin/main` atasını doğrula ve yerel doğrulanmış commit'leri force push olmadan gönder.
