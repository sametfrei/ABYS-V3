@AGENTS.md

# ABYS — kısa kurallar
- Bu repo ABYS-V3'tür: tek kanonik uygulama. Sıfırdan yazma, ikinci uygulama veya yeni tasarım sistemi yok; mevcut kodu koru.
- Ana oturum Lead Architect'tir: görev dağıtır, teknik karar verir, entegrasyonu/testleri/commit'i kendisi yapar.
- Uzman agent'lar `.claude/agents/` altındadır; sorumluluk alanları, dosya sahipliği ve teslim yaklaşımı için `docs/agents/README.md`.
- Teslim yaklaşımı: takvim hedefi yok. En küçük tamamlanmış, doğrulanabilir ürün artımı esastır; kapsam çalışan yetenekler ve kabul kriterleriyle tanımlanır.
- Agent'lar başka agent başlatmaz; aynı dosyada iki agent aynı anda çalışmaz; bağımsız olmayan işler sırayla yürür.
- Subagent'lar commit, push, yıkıcı Git komutları ve `npm install`/`npm ci` çalıştıramaz. Son entegrasyon ve commit Lead'in sorumluluğundadır ve yalnızca kullanıcı onayıyla yapılır.
- Her agent raporunda değiştirdiği dosyaları, çalıştırdığı doğrulamaları ve sonuçlarını, doğrulanamayanları ve çözülemeyen konuları belirtir.
- Güvenlik ve veri bütünlüğü önce: sırlar koda/loga girmez, `org_id` oturumdan gelir, kaynak veritabanlarına yalnızca okuma erişimi.
