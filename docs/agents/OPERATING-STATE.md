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

## Güncel doğrulama tabanı (2026-11-21)

- `main` üzerinde son kod entegrasyonu TB-020–TB-055 aralığında odaklı Conventional Commit'ler halinde yapıldı ve `origin/main`e gönderildi; her dilim kendi `docs(tasks)` kaydıyla eşlendi.
- 2026-11-21 snapshot’ında migration başı 33’tü; güncel schema head 46’dır. Migration 18 ve Migration 46 mevcut yerel PGlite DB’de uygulanmıştır.
- Tam süit kanıtı (2026-11-21): 88 dosya geçti, 1 governance dosyası atlandı; 793 test geçti, 9 atlandı. Tam ESLint 0 hata/0 uyarı ve `npx tsc --noEmit` temiz.
- Üretim derlemesi (2026-11-20): Next.js 16.2.11, 94 route/sayfa ile başarılı.
- Çalışan önizleme smoke testi (2026-11-21): 41/41 başarılı; oturum, audit zinciri, CSV dışa aktarımları (karar defteri, tahmin, denetim), 403 sınırı, tahmin kalibrasyonu/saklama planı ve temel ekranlar HTTP üzerinden doğrulandı.
- Agent Command Center canlı state: 31 tanımlı rol (5 direktör + 25 uzman), 18 Codex oturumu, 1 gerçek aktif oturum, yapılandırılmış eşzamanlılık 8. Dört aktif süreç iddiası yoktur; iki-kurucu modunda ikinci oturum ayrı Codex süreci olarak doğrulanır.
- Canlı tarayıcı görsel doğrulaması bu oturumda yapılamadı; kod/API testi ile tarayıcı kanıtı ayrı tutulur.

## Öncelikli kuyruklar

| Departman | Hazır iş | Kabul kanıtı | Durum |
|---|---|---|---|
| Platform & Architecture | Aksiyon yürütme olayları ve karar-yürütme bağlantısı | Tip kontrolü + hedefli testler | Test edildi |
| Enterprise Connectivity | Eşleme sürümleme ve zamanlayıcı akışının tarayıcı doğrulaması | Gerçek Chromium: mapping v2 approval/readback, schedule save/disable ve ayrı scheduled trigger run (10 read/10 write); sentetik JSONPlaceholder fixture | Test edildi |
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
- Yerel gerçek Chromium/Playwright doğrulaması kullanılabilir ve seçili akışlarda çalıştırıldı; ayrı masaüstü CUA/görsel operatör oturumu bu doğrulamada kullanılmadı. Tam ekran görsel kabulü gerektiren ürün işleri yine ayrıca doğrulanmalı.
- Codex `approvals_reviewer = "auto_review"` ayarı için EVREN uyumluluğu doğrulanmadı; sağlayıcı değiştirilmedi.

## Sonraki hazır işler

1. Karar/aksiyon ve yeni yönetici ekranlarını kullanılabilir bir browser host üzerinde uçtan uca doğrula.
2. Onaylı execution intent → allowlist/idempotency/timeout/audit kontrollü dış adaptör sözleşmesini gerçek kimlik olmadan canlı aktarım yapmadan tamamla.
3. Güvenlik incelemesindeki kalan Low bulguları değerlendir; riskli migration'ları onaysız uygulama.
4. Tahmin modeli kalibrasyonunu gerçek sonuçlarla besleyen kontrollü geri bildirim hattını tasarla.
5. DNS düzeldiğinde `origin/main` atasını doğrula ve yerel doğrulanmış commit'leri force push olmadan gönder.


## 2026-11-28 doğrulama devamı

- KPI sinyalinden karar vakasına kanıt zinciri güçlendirildi: sinyal kaynak gözlem ID'sini taşır; vaka üretimi kaynak KPI kaydını, tenant/dataset/entity/period ve KPI tanım hash'ini, değer/zaman damgasını ve yeniden hesaplanan median/MAD anomalisini doğrular. Gözlem referansı, değer, skor, baseline, yöntem parametresi ve kategori manipülasyonu ile eşzamanlı vaka üretimi testleri eklendi. `tests/kpi-anomaly-signals.test.ts` + `tests/kpi-signal-cases.test.ts`: 2 dosya / 31 test geçti.
- Güvenli tam test süiti (`npx vitest run --exclude tests/evren-real.tmp.test.ts`): 129 dosya geçti, 1 dosya atlandı; 1126 test geçti, 9 test atlandı. Atlanan 9 test migration 18 onay kapısına bağlı; migration 18 uygulanmadı.
- `npm run lint` başarılı; hedefli doğrulama komutundaki `npx tsc --noEmit` ve `git diff --check` başarılı.
- Production build, çalışan 3100/3101 süreçlerinin `.next` dizinine dokunmamak için izole `/private/tmp/abys-build-validation` kopyasında standart `npm run build` ile başarılı: Next.js 16.2.11 Turbopack derlemesi, TypeScript ve 109 statik sayfa üretimi tamamlandı; exit code 0.
- Gerçek Chromium ile 3100 Live Preview kontrolü: `/login` HTTP 200 ve tarayıcı konsol hatası yok. `/dashboard/connectors` ve `/dashboard/decisions` kimlik doğrulaması nedeniyle `/login` sayfasına yönlendirildi; `GET /api/connectors` oturumsuz 401 döndürdü. Gerçek, TAIS dışı kurum oturumu bulunmadığı için bu iki ekranın oturumlu etkileşimi ve karar briefing paneli tarayıcıda doğrulanamadı. Kaynakta `DecisionIntelligencePanel`, genişletilen sunucu vaka kartına bağlı; briefing API'si için rol/tenant/çok kaynaklı kanıt testleri mevcut.
- 3100 sağlık yanıtındaki build commit'i `780b31ec7c18571d6599ecd22065da353bc45a1e`, mevcut worktree HEAD'i `f131b4f85e9862b2cc2eef987c1381147857c875`; dolayısıyla Live Preview mevcut worktree ile aynı sürüm değil. 3100/3101 yeniden başlatılmadı.
- Agent Command Center 3200 yeniden başlatıldı ve HTTP üzerinden yanıt verdi; 3100 ve 3101 açık kaldı.
- Tarayıcıda genel login ekranının her kullanıcıya `ceo@tais.demo` demo erişimini göstermesi gözlendi. Bu, TAIS'in ABYS genel ürün kimliği olmaması ilkesine aykırı bir UX bulgusudur; frontend-ux-engineer sahipliğinde düzeltme adayıdır.
- Bu doğrulama turunda commit, push, deploy, reset, veri silme veya migration uygulanmadı. EVREN ayarları değiştirilmedi.

## 2026-11-28 yürütme niyeti idempotency sağlamlaştırması

- `prepareExecutionIntent` aynı tenant idempotency anahtarı tekrar geldiğinde artık yalnızca aksiyon ve payload hash'ini değil; mod (`manual/system`), normalize edilmiş hedef sistem ve trim edilmiş işlem özetini de birebir karşılaştırır. Bu alanlardan biri değişmişse mevcut niyeti sessizce döndürmek yerine `409 conflict` üretir.
- `tests/execution-intents.test.ts` içine mod/hedef/özet değişikliği için regresyon kontrolleri eklendi; hedefli test 9/9 geçti.
- Aksiyon Merkezi'nde hazırlık kaydı başarılı olduktan sonra yeni idempotency anahtarı üretilir; kullanıcı aynı kartta ikinci bir hazırlık oluştururken önceki anahtarı tekrar kullanmaz.
- Güvenli tam test süiti (`npx vitest run --exclude tests/evren-real.tmp.test.ts`): 129 dosya geçti, 1 dosya atlandı; 1127 test geçti, 9 test atlandı. Atlanan testler migration 18 açık onay kapısına bağlıdır; migration 18 uygulanmadı.
- Etkilenen üç dosyada ESLint, `npx tsc --noEmit` ve `git diff --check` başarılı.
- Bu dilimde commit, push, deploy, reset, veri silme, migration veya canlı dış sistem çağrısı yapılmadı; EVREN ayarları değiştirilmedi.


## 2026-11-28 üretim bağımlılık güvenliği ve sürüm doğrulaması

- npm audit üretim kapsamı başlangıçta 1 Critical + 6 High + 1 Moderate bulgu gösterdi. Next.js 16.2.11 ve Zod 4.4.3 doğrudan bağımlılıkları; eski PostCSS/Sharp ve diğer transitive sürümler güncellendi.
- `next` `^16.4.6`, `zod` `^4.6.7`; override'lar PostCSS `8.5.34`, Sharp `0.35.5`, brace-expansion 1.x `1.1.22`, 2.x `2.1.8` olarak düzeltildi. `npm audit --omit=dev`: 0 info/low/moderate/high/critical, yani üretim bağımlılıklarında bilinen açık kalmadı.
- Tam dependency ağacında 6 Moderate bulgu kaldı; tamamı Electron Builder / app-builder-lib / minimatch geliştirme-paketleme zincirinde. npm'in önerdiği düzeltme `electron-builder@25.1.0`'a major downgrade; mevcut 26.x + Electron 43 Windows paketleme zincirini bozma riski nedeniyle körlemesine uygulanmadı. Production bağımlılıkları temiz.
- `npm run lint` ve `npx tsc --noEmit` başarılı. Güvenli tam süit: 129 dosya geçti, 1 dosya atlandı; 1127 test geçti, 9 test atlandı (Migration 18 onay kapısı).
- İzole kopyada Next.js 16.4.6 / Turbopack production build başarılı; TypeScript ve 109 statik sayfa tamamlandı, exit 0. 3100/3101/3200 çalışan süreçleri yeniden başlatılmadı.
- `npm audit fix` paket ağacında semver uyumlu güncellemeler yaptı; package.json ve lockfile değişiklikleri mevcut kullanıcı çalışma ağacı değişiklikleriyle birlikte korunuyor. Commit/push/deploy veya migration yapılmadı.


## 2026-11-28 ABYS kimliğiyle izole tarayıcı E2E

- TAIS demo kimlikleri kullanılmadan ayrı `/private/tmp/abys-browser-test-db` PGlite veritabanı ve `ABYS Browser Test Organization` tenant'ı oluşturuldu. Geçici `admin@abys.test` (data_admin) ve `ceo@abys.test` (CEO) hesapları yalnızca bu test veritabanındadır; parola terminal çıktısına yazdırılmadı.
- Next.js 16.4.6 production build kopyası `127.0.0.1:3232` üzerinde ayrı test DB ile başlatıldı; 3100/3101/3200 süreçlerine dokunulmadı.
- `SMOKE_EMAIL=admin@abys.test`, `SMOKE_CEO_EMAIL=ceo@abys.test` ile `npm run smoke:connectors-browser` gerçek Chromium'da exit 0: connector UI create, public JSONPlaceholder 10 kayıt probe/sync, run history, schedule set/disable, mapping v2 approval/readback, golden-record policy save/readback, KPI definition structural validation, external context ingest/review/case link/DecisionBrief provenance, signal triage + note, saved report create/list/soft-delete, data_admin 403 approval gate, CEO approval, CEO connector-write 403, 8 workspace route navigations. Test zamanlaması kalmadığı kontrol edildi.
- CEO ile `/dashboard/decisions` gerçek Chromium GET 200; sentetik vaka başlığı render edildi ve uncaught page error yok. Açılmış detay kartındaki briefing panelini genişletme doğrulaması client safety kontrolü tarafından durduruldu; kullanıcı onay paneli bekleniyor. Bu nedenle panel browser E2E tamamlandı iddiası yok; API/ünite test kanıtı ayrı.
- Login ekranı gerçek tarayıcıda hâlâ `ceo@tais.demo` demo erişimini gösteriyor; genel ABYS kimliğine taşınması için frontend-ux-engineer dosya sahipliğinde UX düzeltmesi gerekiyor.


## 2026-11-28 tüm dashboard tarayıcı matrisi (ABYS test tenant)

- `BASE_URL=http://127.0.0.1:3232 SMOKE_EMAIL=ceo@abys.test SMOKE_PASSWORD=<izole-test-parolası> npm run smoke:browser` gerçek Google Chrome üzerinde exit 0: **77 geçti, 0 başarısız**. 22 dashboard rotası HTTP 200 + içerik/başlık/çalışma hatası kontrolü, CEO veri kalitesi yetki ayrımı, geciken aksiyon filtresi, TR/EN geçişi, 6 mobil ekranda yatay taşma kontrolü ve mobil gezinme doğrulandı.
- Bu test de TAIS hesabı kullanmadı; ABYS Browser Test Organization içindeki geçici CEO hesabıyla, ayrı Next 16.4.6 üretim önizlemesi 3232'de çalıştı. Ekran görüntüleri `.data/browser-smoke/` git dışı dizinde.


## 2026-11-28 eski Live Preview süreçleri / yeni Next sürümü uyumsuzluğu

- Bağımlılık güncellemesinden sonra port 3100 ve 3101'de hâlâ `next-server (v16.2.11)` çalışan eski süreçler var. `GET /`, `/login`, `/api/health` 3100'de HTTP 500; 3101'de `/login` zaman aşımı ve `/api/health` 500 döndü.
- Güncel Next.js 16.4.6 üretim build'i ayrı 3232 portunda `/login` ve `/api/health` HTTP 200 ile çalışıyor. Agent Command Center 3200 root HTTP 200.
- 3100/3101 süreçleri önceki açık talimat gereği otomatik yeniden başlatılmadı. 3100/3101'i yeni build ile yeniden başlatmak için açık kullanıcı onayı bekleniyor; 3200'e dokunulmadı.

## 2026-11-28 Live Preview 3100/3101 yenileme (kullanıcı onayıyla)

- Kullanıcının açık onayı alındıktan sonra yalnızca 3100 ve 3101'deki eski Next.js 16.2.11 süreçleri durduruldu; doğrulanmış izole Next.js 16.4.6 production build'i ile yeniden başlatıldı. 3200 Agent Command Center sürecine dokunulmadı.
- 3100: `/login` HTTP 200, `/api/health` HTTP 200, DB `up`. `schemaReady=false` ve Migration 18 bekliyor; bu migration'ın açık onay kapısı korunmuştur, uygulanmadı. Süreç mevcut `.data/abys-db` dizinini kullanır.
- 3101: `/login` HTTP 200, `/api/health` HTTP 200, DB `up`, `schemaReady=true`; mevcut `.data/dev-preview` dizinini kullanır.
- 3200 root HTTP 200. Bu yenileme sırasında commit, push, deploy, reset, veri silme veya migration yapılmadı; EVREN ayarları değiştirilmedi.
- İki süreç aynı doğrulanmış Next.js 16.4.6 build'inden çalışır; ayrı mevcut PGlite dizinleri kullanılarak DB çakışması önlenmiştir.

## 2026-11-28 zamanlanmış connector gerçek tetikleme doğrulaması (izole ABYS test tenant)

- Kullanıcı onay kartında Run seçtikten sonra `/api/connectors/scheduler/run?limit=5` çağrısı ayrı ABYS test veritabanında bir kez çalıştırıldı.
- Sonuç: `dueCount=1`, `succeeded=1`, `failed=0`, `skipped=0`. `ABYS_BROWSER_SMOKE_1795814520350` isimli public JSONPlaceholder fixture connector'ı `scheduled` tetiklemesiyle başarıyla çalıştı; `readCount=10`, `writtenCount=10`, run ID `eb50dddc6d610733`.
- Run history endpoint'i aynı kaydı `status=success`, `trigger=scheduled`, 10 okunan ve 10 yazılan kayıt olarak doğruladı; önceki manuel smoke run da geçmişte ayrı kayıt olarak duruyor.
- Yalnızca sentetik fixture verisi kullanıldı; üretim connector'ı, gerçek müşteri sistemi veya gerçek ERP'ye bağlantı yapılmadı. Test tenant'ındaki schedule kapatma/önceki disable kontrolü korundu; migration/commit/push/deploy yapılmadı.
- Karar detay kartının açılmış Decision Intelligence / briefing paneli için ayrı browser assertion henüz çalıştırılmadı; ilgili kullanıcı onay kartı bekleniyor.

## 2026-11-28 karar zekâsı detay paneli tarayıcı doğrulaması (kullanıcı onayıyla)

- Kullanıcı onayı sonrası gerçek Chromium, izole ABYS test tenant'ında CEO hesabıyla `/dashboard/decisions` sayfasını açtı ve ilk `İncele` kontrolüne tıkladı.
- Açılan detayda `KARAR ZEKÂSI — KANIT ÖZETİ`, güven yüzdesi, önerilen aksiyon, kanıt listesi, dış bağlam kaynak/lisans/zaman metaverisi, güven gerekçesi, sınırlar ve uygulanabilir seçenekler render edildi.
- Tarayıcı `pageErrors=[]`: yakalanan uncaught page error yok. İçerik yalnızca sentetik ABYS test vakası ve test fixture kanıtlarından oluştu.
- İlk otomasyonun iki boolean metin kontrolü, aranan ifade biçimi ekrandaki büyük harfli `KARAR ZEKÂSI — KANIT ÖZETİ` başlığıyla birebir uyuşmadığı için false raporladı; ham render edilmiş sayfa metni panelin ve kanıtların bulunduğunu doğruluyor. Bu bir uygulama hatası değil, assertion metni uyumsuzluğuydu.
- Bu doğrulamada karar kabulü, aksiyon yürütme veya gerçek dış sistem çağrısı yapılmadı.

## 2026-11-28 TB-132 genel giriş ekranından TAIS demo kimliğinin kaldırılması

- Frontend UX uzmanı yalnızca `src/app/login/LoginForm.tsx` içindeki TAIS demo kartını kaldırdı. Lead, `src/lib/i18n.ts` içindeki artık kullanılmayan `login.demoTitle` ve `login.demoHint` anahtarlarını/çevirilerini sildi; `tests/login-entry.test.ts` içine e-posta ve iki çeviri anahtarı için regresyon kontrolü ekledi.
- `bash scripts/agent-verify.sh src/app/login/LoginForm.tsx src/lib/i18n.ts tests/login-entry.test.ts` başarılı: TypeScript, ESLint ve login-entry testi 11/11. `git diff --check` başarılı.
- Bağımsız salt-okunur güvenlik incelemesinde somut bulgu yok. `src/lib/public-demo.ts:18` içindeki `ABYS_PUBLIC_DEMO === "1"` backend kapısı değişmedi; demo backend rotaları bu kapsamda değiştirilmedi.
- İzole Next.js 16.4.6 production build `/private/tmp/abys-login-preview-src` altında ayrı `.next-tb132` distDir ile başarılı oldu (109 statik sayfa). Ayrı test DB ile geçici `127.0.0.1:3234` preview açıldı; gerçek Google Chrome smoke testinde TR alan etiketleri ve TR/EN kontrolleri, EN diline geçiş ve çevrilmiş alan etiketleri, her iki dilde TAIS demo e-postası/kartı bulunmaması doğrulandı. 390 px mobil viewport: `scrollWidth=390`, form görünür, yatay taşma yok; `pageErrors=[]`. İlk geniş parola etiketi seçicisi göster/gizle butonunu da eşleştirdi; tam eşleşme seçicileriyle tekrar çalıştırılan test geçti. Geçici 3234 sunucusu durduruldu. Commit, push, deploy, mevcut servis yeniden başlatma, veri silme veya migration yapılmadı.


## 2026-11-28 TB-136 — dokuz rol / iki tenant RBAC ve izolasyon tarayıcı matrisi

- `scripts/role-tenant-browser-smoke.mjs` gerçek Google Chrome üzerinde iki ayrı sentetik ABYS kurumunda 9 rolü (board, CEO, C-level, departman yöneticisi, risk yöneticisi, analyst, auditor, data_admin, sys_admin) ayrı oturumlarla doğruladı: **188 kontrol geçti, 0 başarısız**. Her kurumda beş temsilî dashboard rotası (`/dashboard`, `/dashboard/connectors`, `/dashboard/reports`, `/dashboard/audit`, `/dashboard/analysis`) HTTP 200 döndü. Giriş ekranında TR → EN → TR geçişi de kontrol edildi.
- Bağımsız beklenen RBAC matrisi; connector/report/anomaly/audit/user GET/POST uçlarında beklenen 200/201/403 kodlarıyla eşleşti. Konnektör konfigürasyonu, kayıtlı rapor, kullanıcı ve audit marker okumalarında karşı kurumun verisi görünmedi; kullanıcı yanıtlarında parola hash alanı bulunmadı. Browser page error, beklenmeyen HTTP response ve haricî origin isteği yakalanmadı. Connector yalnızca kayıt olarak oluşturuldu; provider probe, sync veya schedule çağrısı yapılmadı.
- Smoke öncesi DB kimliği token’lı `/api/health` ile sunucu tarafından doğrulandı: gerçek PGlite yolu `/private/tmp/abys-role-tenant-matrix-20261128`, eksik normal migration `0`, bekleyen tek migration `18`, migration onay değişkeni kapalı. Smoke health yolu salt-okunurdur ve `migrate()` çağırmaz. `ABYS_MIGRATION_18_APPROVED=true` durumunda 409 döndüğü ve migration 18 satırının eklenmediği regresyon testi mevcut.
- Health güvenlik testleri (`tests/health.test.ts`) 4/4 geçti; yanlış token, dış/relative/symlink DB yolu, PostgreSQL backend ve migration 18 onayının açık olması reddedildi. `bash scripts/agent-verify.sh src/app/api/health/route.ts scripts/role-tenant-browser-smoke.mjs tests/health.test.ts` başarılı: TypeScript, ilgili ESLint ve health testleri. İzole Next.js 16.4.6 production build'i 109 statik sayfayla başarılı. `git diff --check` başarılı.
- Ayrı salt-okunur security-qa-reviewer incelemesinde son düzeltmelerden sonra incelenen kapsamda yeni bulgu bildirilmedi. Reviewer uygulama/test çalıştırmadı. Organization manifestinde Security, Quality & Reliability Director rolü tanımlı olsa da bu görev için kullanılabilir bir Director agent dosyası/aktif Director thread'i bulunmadığından doğrudan reviewer incelemesi yapıldı; Director incelemesi yapılmış gibi gösterilmedi.
- Sentetik kullanıcı, rapor, konnektör ve audit kayıtları yalnızca bu atılabilir `/private/tmp/abys-*` test veritabanında bırakılmıştır; script DB'yi silmez/sıfırlamaz. Canlı müşteri verisi, ERP/CRM, haricî sağlayıcı, zamanlama, production DB, Migration 18 veya production deploy kullanılmadı. Geçici 3235 önizlemesi testten sonra kapatıldı; 3100, 3101 ve 3200 korunmuştur. Commit/push/deploy yapılmadı.


## 2026-11-28 commit/push ve kontrollü yerel rollout

- GitHub `origin/main` iki doğrulanmış commit ile güncellendi: `0b55c336a74e80b48aa4fd2f0006d67a42ba7b29` (91 dosyalık ürün/güvenlik/UX dilimi) ve `d1bd77a293d514f14e09b46ff982ca62552321dd` (TB-132/TB-136 görev kanıtı). Bu noktada yerel `main` ve `origin/main` aynı SHA'daydı.
- Release doğrulaması: ESLint ve TypeScript başarılı; Vitest 129 dosya geçti, 1 dosya atlandı; 1129 test geçti, 9 test Migration 18 onay kapısına bağlı olarak atlandı. `npm audit --omit=dev` sıfır bulgu. Next.js 16.4.6 standalone build 109 statik sayfayla başarılı.
- SentinelX agent Mac'e kuruldu ve bağlı host olarak doğrulandı (agent 0.23.60, operational). Host etiketi `abys-mac`; SentinelX varsayılan host olarak ayarlandı.
- Migration 18 kullanıcı tarafından açıkça onaylandı. Ana PGlite veritabanı `.data/abys-db` durdurulduktan sonra çevrimdışı yedeklendi: `/private/tmp/abys-db-backup-before-migration18-20261128.tar.gz`, SHA-256 `0f98e48369971a27b3fc778799dac00498c0a94ca186c3dbb7856f77651abd92`. Migration önce ayrı DB kopyasında prova edildi; 18 kaydı, `organizations.parent_id/kind/country/currency` kolonları ve varsayılanlar doğrulandı. Ardından aynı onaylı migration ana `.data/abys-db` üzerinde uygulandı; mevcut kayıtları silen veya tabloyu yeniden oluşturan SQL yoktur.
- Port 3100, son standalone build ile yeniden başlatıldı. `GET /api/health`: HTTP 200, DB `up`, `schemaReady=true`, `pendingMigrations=[]`, build SHA `d1bd77a293d514f14e09b46ff982ca62552321dd`. `/login` HTTP 200. 3101 `/login` HTTP 200, 3200 `/` HTTP 200, 3235 `/login` HTTP 200; bu üç süreç yeniden başlatılmadı.
- **Dağıtım sınırı:** Bu başarılı rollout Mac üzerinde loopback-only yerel üretim önizlemesidir; 3100 yalnızca `127.0.0.1`'e bağlıdır. Mac'te Docker/Podman veya bağlı bir bulut/compute entegrasyonu yoktur; SentinelX'te yalnızca bu Mac kayıtlıdır. Bu nedenle internete açık uzak production deploy yapılmış değildir. Uzak production için bir sunucu/hosting ve DNS/TLS hedefi hâlâ gereklidir.
- `tests/evren-real.tmp.test.ts` geçici gerçek-EVREN tanılama dosyası olarak bilerek stage/commit dışında bırakıldı. EVREN yapılandırması ve kimlik bilgileri değiştirilmedi.


## 2026-11-28 CI/CD ve Migration 18 kabul paketi

- `.github/workflows/ci-release.yml` eklendi. Pull request ve main push doğrulamasında Node 22 kilitli kurulum, ESLint, TypeScript, Migration 18 onay kapısı kapalı tam Vitest, ayrı izole PGlite üzerinde Migration 18 organizasyon hiyerarşisi testi, `npm audit --omit=dev` ve standalone production build çalışır.
- Ana dala push sonrası doğrulama başarılıysa GHCR'ye `ghcr.io/sametfrei/abys-v3:latest` ve tam commit SHA etiketi yayınlanır. Docker actions tam commit SHA'larına sabitlenmiştir; imajda build SHA/tarih, provenance ve SBOM etkin.
- Workflow YAML `js-yaml` ile parse edildi ve iki job/üç trigger doğrulandı. GitHub'a henüz bu yeni workflow commit'i push edilmediği için Actions run ve GHCR image publish sonucu henüz kanıtlanmış değildir.
- Migration 18 testleri: ana güvenli tam süitte 129 dosya geçti, 1 dosya atlandı; 1129 test geçti, 10 test onay kapısında atlandı. Ayrı ve geçici PGlite test DB'sinde `ABYS_MIGRATION_18_APPROVED=true npx vitest run tests/organizations.test.ts` 10/10 geçti. Yeni regresyon, eski şema biçiminde eklenen kurumun `kind=company`, `currency=TRY`, `parent_id=null`, `country=null` varsayılanlarını doğrular.
- `npm run lint`, `npx tsc --noEmit`, üretim bağımlılık denetimi (`npm audit --omit=dev`: 0 bulgu) ve `git diff --check` başarılı.
- Yerel ana DB'deki Migration 18 uygulaması 42 MB DB yedeği alınıp SHA-256 kaydedildikten ve 41 MB kopyada prova geçtikten sonra yapılmıştır. 3100 sağlık kontrolünde `schemaReady=true`, `pendingMigrations=[]`; build SHA bu aşamada `9c496b551dd46c90e1ef67361d88f7d10d85f4d0`.
- GHCR imaj yayını canlı deploy değildir. İnternete açık çalışma için Render/başka hosting bağlantısı, managed PostgreSQL, domain/TLS ve güvenli secret yapılandırması hâlâ gerekir.


## 2026-11-28 ilk kurum / sistem yöneticisi bootstrap ve 3100 rollout

- İlk gerçek kurulum yolu eksikti: /onboarding yalnızca localStorage profilini saklıyordu; giriş ekranında ilk kurum/kullanıcı oluşturma yoktu. ABYS_BOOTSTRAP_TOKEN (en az 32 bayt) ile korunan /setup ve /api/auth/bootstrap eklendi. Bu açık kayıt değildir: yalnızca boş DB, token varlığı ve bekleyen migration onayı olmaması halinde açılır.
- Migration 46, initial_admin_bootstrap tek satırlık kontrol tablosunu ve trigger korumasını ekler. Transaction önce claim alır, sonra ilk organization + sys_admin + audit event yazar ve guard'ı tamamlar. Aynı anda gelen isteklerden yalnızca biri başarılı; tamamlanan kilit silinemez/yeniden açılamaz.
- tests/initial-admin-bootstrap.test.ts: 5/5 (uygunluk, yanlış token'da yazım olmaması, paralel 201/409, tamamlandıktan sonra tekrarın reddi, trigger'ın kilidi koruması). Hiyerarşi Migration 18 testleri ayrı onaylı test DB'sinde 10/10 geçti.
- Güvenli tam süit: 130 dosya geçti, 1 dosya atlandı; 1134 test geçti, 10 test atlandı (Migration 18 onay kapısı). npm run lint, npx tsc --noEmit, npm audit --omit=dev (0 bulgu) ve git diff --check başarılı.
- Standalone Next.js 16.4.6 production build, yeni /setup ve /api/auth/bootstrap dahil 111 route ile başarılı. 3100 yeni standalone build SHA b987d311f3f8d0c7ff1d5cb46f12764d8e2fae50 ile çalışıyor; health ok=true, DB up, schemaReady=true, pendingMigrations=[]. /setup HTTP 200, /api/auth/bootstrap available=true; yanlış token POST 404 verdi ve endpoint hâlâ available=true kaldı. İlk gerçek kullanıcı/kurum oluşturulmadı; kullanıcı formda kendi bilgilerini belirler.
- 390 px Chrome viewport'ta setup formu görünür, yatay taşma yok (scrollWidth=390), uncaught page error yok. Tarayıcıdaki hata metni assertion'ı anlık React state render zamanlaması nedeniyle henüz doğrulanmadı; API düzeyindeki 404 negatif testi geçmiştir.
- Yerel kurulum token'ı /private/tmp/abys-bootstrap-token içinde 0600 izinle saklanır ve yalnızca 3100 sürecine aktarılır; repo/env örneğine gerçek token yazılmadı. Yerel sayfa loopback-only olduğu için yalnızca bu Mac'te açılır. İnternete açık üretim deployment hâlâ yok.
- GitHub workflow commit'i b987d311f3f8d0c7ff1d5cb46f12764d8e2fae50 yerelde hazır fakat origin'e gönderilemedi: GitHub PAT workflow scope içermiyor. Device-flow OAuth workflow izni de henüz onaylanmadı. origin/main bu sırada 9c496b551dd46c90e1ef67361d88f7d10d85f4d0; yerel branch bir commit ileride.
