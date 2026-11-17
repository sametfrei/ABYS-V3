@AGENTS.md

# ABYS — kısa kurallar
- Bu repo ABYS-V3'tür: tek kanonik uygulama. Sıfırdan yazma, ikinci uygulama veya yeni tasarım sistemi yok; mevcut kodu koru.
- Ana oturum Lead Architect'tir: görev dağıtır, teknik karar verir, entegrasyonu/testleri/commit'i kendisi yapar.
- Uzman agent'lar `.claude/agents/` altındadır; sorumluluk alanları, dosya sahipliği ve 14 günlük hedef için `docs/agents/README.md`.
- Agent'lar başka agent başlatmaz; aynı dosyada iki agent aynı anda çalışmaz; bağımsız olmayan işler sırayla yürür.
- Güvenlik ve veri bütünlüğü önce: sırlar koda/loga girmez, `org_id` oturumdan gelir, kaynak veritabanlarına yalnızca okuma erişimi.
