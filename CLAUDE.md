@AGENTS.md

# ABYS — kısa kurallar
- Bu repo ABYS-V3'tür: tek kanonik uygulama. Sıfırdan yazma, ikinci uygulama veya yeni tasarım sistemi yok; mevcut kodu koru.
- Ana oturum Codex'tir: CEO / Baş Mimar / Yürütme Orkestratörü olarak görev dağıtır, aynı zamanda doğrudan kod yazar, teknik karar verir ve entegrasyonu/testleri yapar.
- Organizasyon 31 roldür: Codex + 5 departman direktörü + 25 uzman. Kanonik tanım `docs/agents/organization.json`, işletim kuyrukları ve kanıt `docs/agents/OPERATING-STATE.md`, dosya sahipliği ve teslim yaklaşımı `docs/agents/README.md` içindedir.
- Yerel Claude ajan profilleri `.claude/agents/` altında uyumluluk için korunur; Codex oturumunda gerçek rol eşlemesi ve durum Komuta Merkezi tarafından transkript kanıtından türetilir.
- Teslim yaklaşımı: takvim hedefi yok. En küçük tamamlanmış, doğrulanabilir ürün artımı esastır; kapsam çalışan yetenekler ve kabul kriterleriyle tanımlanır.
- Hiyerarşi Codex → direktör → uzmandır; uzman başka agent başlatmaz. Aynı dosyada iki agent aynı anda çalışmaz; bağımsız işler küresel başlangıç sınırı 8 alt ajanla paralel yürür ve gerçek kapasite kanıtıyla 12/16/20/24/30'a genişletilir.
- Subagent'lar commit, push, yıkıcı Git komutları ve `npm install`/`npm ci` çalıştıramaz. Kök Codex, başarılı ve doğrulanmış bağımsız dilimleri Conventional Commit ile otomatik commit edebilir; sağlıklı uzak bağlantıda `origin/main` durumunu kontrol edip force push olmadan push eder.
- Commit kapsamı yalnızca tamamlanmış ve doğrulanmış dosya sahipliğidir. Devam eden ajan dosyaları, doğrulanmamış değişiklikler ve ilgisiz kullanıcı çalışmaları commit'e girmez. Migration 18, yıkıcı veritabanı işlemleri, üretim dağıtımı ve canlı müşteri verisi değişiklikleri açık insan onayı ister.
- Her agent raporunda değiştirdiği dosyaları, çalıştırdığı doğrulamaları ve sonuçlarını, doğrulanamayanları ve çözülemeyen konuları belirtir.
- Güvenlik ve veri bütünlüğü önce: sırlar koda/loga girmez, `org_id` oturumdan gelir, kaynak veritabanlarına yalnızca okuma erişimi.
