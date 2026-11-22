# ABYS-V3 — Teslim Notları (23 Kasım 2026 hedefi)

Bu belge yalnızca **doğrulanmış** kapsamı listeler. Kod yazılmış olması tek
başına "tamam" sayılmaz; her satırın kanıtı test, build, smoke veya üretim
modu çalıştırmasıdır. Ayrıntılı görev geçmişi `docs/two-founder/task-board.json`
(TB-001…TB-110), ürün durumu `docs/ROADMAP.md` içindedir.

## Doğrulama kapıları

| Kapı | Komut | Son sonuç |
|---|---|---|
| Tip + lint | `npm run verify` | temiz |
| Testler | `npm test` | 100 dosya, 864 geçti / 9 atlandı |
| Üretim derlemesi | `npm run build` | başarılı |
| Çalışan örnek smoke | `BASE_URL=... npm run smoke:e2e` | 80 geçti / 0 başarısız |
| Tarayıcı smoke | `BASE_URL=... npm run smoke:browser` | 76 geçti / 0 başarısız (Chrome, 22 rota + mobil) |
| Sürüm parmak izi | `node scripts/verify-deploy.mjs --base=... --expect=origin` | commit EŞLEŞTİ, exit 0 |
| Hepsi bir arada | `BASE_URL=... DEPLOY_EXPECT=origin npm run release:check` | tsc + lint + test + build + smoke + commit parmak izi |
| Yerel demo | `npm run build && npm run start:preview` | http://127.0.0.1:3100 (demo hesabıyla) |

## Doğrulanmış ürün kapsamı

- **Karar merkezi:** vaka listesi, analizör, güven ve kalibrasyon, nedensellik
  zinciri, izleme modalı, seçenekler; tümü TR/EN. (`/dashboard/decisions`)
- **Yönetici deneyimi:** Yönetim Komuta Merkezi (30 saniyelik odak, brifing,
  kanıt, kalibrasyon notu), TAIS yönetici ekranı ve KPI verisi ekranı TR/EN.
- **Giriş deneyimi:** Giriş ekranı, API hata mesajları (eksik alan, hatalı
  kimlik, kaba kuvvet sınırı, ağ/sunucu hatası) ve SSO geri dönüş hataları
  `abys_lang` çerezine göre TR/EN döner; varsayılan Türkçedir.
- **Veri kalitesi:** dört boyutlu deterministik skor, metrik etiketine göre
  filtre, karantina listesi (`limit` doğrulaması + `truncated` bildirimi) ve
  yetki/kurum kapsamlı CSV dışa aktarımı (payload hariç, denetim kayıtlı).
- **Aksiyonlar:** durum geçişleri, gecikme görünürlüğü, yürütme niyeti ve
  deneme durumu; beklenen etki bağlamı, doğrulanmış gerçekleşen finansal etki
  (tutar/ISO para birimi/ölçüm aralığı/kanıt), son kaydedilen sonucun ders ve
  kanıtıyla geri görünürlüğü, kayıttan önce deterministik beklenen–gerçekleşen
  fark önizlemesi, sonuç + karar özeti + denetim kaydının tek transaction'da
  yazılması ve sahiplik/tarih/olay kanıtıyla CSV dışa aktarımı. CSV ayrıca
  beklenen etkiyi, son sonucu (ders/kaydeden) ve gerçekleşen etkiyi ölçüm
  aralığı/kanıtıyla birlikte taşır. Aksiyon kartı ve karar defteri, kararın tüm
  ölçüm geçmişini kurum kapsamlı API üzerinden istek üzerine yeniden eskiye gösterir;
  limit aşımı sessizce gizlenmez, `truncated` ve arayüz bildirimiyle açıklanır.
  Aksiyon merkezi durum ve gecikme filtreleriyle canlı sayımlar sunar.
- **Konnektörler:** REST/OData adaptörü, OAuth2 client-credentials, eşleme
  sürümleme, idempotent kanonik kayıt, karantina, zamanlayıcı sağlığı ve
  harici SQL sonuçlarında ortak CSV güvenliği.
- **Kimlik ve güvenlik:** RBAC, tenant izolasyonu, oturum cihazı ve son
  görülme (migration 36), parola değiştirme, oturum iptali, denetim hash zinciri
  ve tüm CSV dışa aktarımlarında formül enjeksiyonu koruması.
- **i18n:** dashboard ekranları ve komuta merkezi TR/EN; dil çerez + localStorage.
- **Mobil:** lg altında sabit kenar çubuğu yerine kompakt gezinme menüsü;
  altı kritik ekran 390px genişlikte yatay taşma olmadan açılır.
- **Dağıtım:** `/api/health` build parmak izi, `verify-deploy` kapısı,
  Docker build argümanları, `release:check`.

## Bilinen sınırlar (teslimde açıkça belirtilmeli)

- **Tarayıcı smoke:** Chrome/Playwright ile giriş, 22 dashboard rotası, geciken
  filtresi, TR/EN geçişi, 6 mobil ekranda taşma kontrolü ve mobil menü 76/76
  doğrulandı; ekran görüntüleri `.data/browser-smoke` altında. Piksel-diff
  tabanlı görsel regresyon testi yoktur.
- **Gerçek sunucu doğrulanmadı:** yeni sunucunun URL/SSH erişimi verilmedi.
  `verify-deploy` ve smoke hazır; adres verildiğinde tek komutla çalıştırılır.
- **Canlı ERP/CRM kimlikleri yok:** SAP/Oracle/Dynamics/Salesforce/HubSpot/
  NetSuite/Odoo/Infor/IFS/Sage adaptörleri sözleşme düzeyinde; müşteri uç
  noktası olmadan canlı doğrulanmadı.
- **Migration 18** (organizasyon hiyerarşisi + ülke/para birimi) açık insan
  onayı bekliyor; bu nedenle `schemaReady` üretimde onay sonrası kontrol edilmeli.
- **Sunucu tarafı serbest metinler Türkçe:** API hata/özet metinleri ve Ask ABYS
  eşleştiricisi Türkçe çalışır; arayüz kabuğu TR/EN'dir.
- **SOAP/JDBC** adaptörleri planlı; kapsam dışı.

## Dağıtım adımları (özet)

1. `GIT_SHA=$(git rev-parse HEAD)` ve `BUILD_TIME` ile imajı derle (Docker
   `--build` olmadan eski katman kalır).
2. `next start` sürecini yeniden başlat (build sonrası eski süreç eski kodu sunar).
3. `node scripts/verify-deploy.mjs --base=https://<sunucu> --expect=origin`.
4. `BASE_URL=https://<sunucu> npm run smoke:e2e`.
5. Tarayıcıda: Komuta Merkezi, karar kanıtı, tahmin şeffaflığı, aksiyon durumu,
   Bitrix24 senkronu, veri kalitesi paneli, TR/EN geçişi.

## İnsan onayı gerektiren işlemler

Migration 18, yıkıcı veritabanı işlemleri, üretim dağıtımı, canlı müşteri verisi
değişiklikleri ve gerçek vendor write-back işlemleri bu teslimle **yapılmadı**;
açık onay gerektirir.
