# Eval Taban Çizgisi

## 2026-07-17 — qwen3:4b-instruct, CPU (GPU'suz), tam süit

**TOPLAM: 128/143 (%90)** — 11 senaryo × 13 kriter, toplam süre ~72 dk

| Senaryo | Skor | Süre | Düşen kriterler |
|---|---|---|---|
| aviation / SAW pik saat turnaround | 12/13 | 587sn | sayı disiplini (8) |
| aviation / Ekip görev süresi | 12/13 | 371sn | sayı disiplini (2) |
| manufacturing / Hat darboğazı | 9/13 | 612sn | seçenek sayısı, uygulanabilir seçenek, öneri; sayı (2) |
| logistics / ETA sapması | 11/13 | 566sn | seçenek sayısı; sayı (2) |
| customerops / Kuyruk fırtınası | 12/13 | 311sn | sayı disiplini (6) |
| retail / Kampanya stok tükenmesi | **13/13** | 290sn | — |
| finance / Tahsilat kayması | 12/13 | 230sn | sayı disiplini (2) |
| health / Gece kapasite sıkışması | 12/13 | 255sn | sayı disiplini (1) |
| energy / Pik yük + trafo kısıtı | **13/13** | 315sn | — |
| agri / Hasat penceresi | 9/13 | 530sn | seçenek sayısı, uygulanabilir seçenek, öneri; sayı (3) |
| other / Teslimat sıkışması | **13/13** | 257sn | — |

### Zayıf noktalar (model yükseltmesinde buraya bak)

1. **Sayı disiplini** (8/11 senaryoda): model kaynaklarda olmayan ara değerler
   türetiyor. Doğrulayıcı yakalayıp güveni sınırlıyor ama ideal, hiç üretmemesi.
2. **Seçenek üretimi** (3/11: manufacturing, logistics, agri): uzun çıktılarda
   alfabetik JSON sırasında sona kalan `options` token limitine kurban gidiyor
   ya da model tek seçenekte kalıyor.

### Karşılaştırma protokolü

Yeni model/donanım denerken: `evals/run-overnight.ps1` ile aynı süiti koş,
skoru ve senaryo başına süreyi bu dosyaya yeni bölüm olarak ekle.

### 2026-07-19 — kriter genişletmesi (henüz yeniden ölçülmedi)

`evals/run-evals.mjs` içindeki `scoreCase`'e 3 yeni kriter eklendi (senaryo
başına 13 → 16): "çelişkili öneri yok" (önerilen seçenek uygulanabilir olmalı
ve aynı vakada aynı başlıkla birden fazla seçenek olmamalı), "boş alan yok"
(title/businessImpact/confidenceRationale/historicalComparison boş
olmamalı), "güven gerekçesi anlamlı" (confidenceRationale ≥ 30 karakter).
Yukarıdaki 128/143 taban çizgisi artık geçersiz — yeni kriterlerle tam süit
yeniden koşulup bu dosyaya yeni bir bölüm olarak eklenmeli.

## 2026-07-19 — qwen3:4b-instruct, CPU, 16 kriterli tam süit (yeniden ölçüm)

**TOPLAM: 162/176 (%92)** — 11 senaryo × 16 kriter, koşu 17:45–18:43 (~58 dk)

| Senaryo | Skor | Süre | Düşen kriterler |
|---|---|---|---|
| aviation / SAW pik saat turnaround | 15/16 | 465sn | sayı disiplini (4 desteksiz sayı) |
| aviation / Ekip görev süresi | 15/16 | 356sn | sayı disiplini (5 desteksiz sayı) |
| manufacturing / Hat darboğazı | 15/16 | 299sn | sayı disiplini (7 desteksiz sayı) |
| logistics / ETA sapması | 15/16 | 287sn | sayı disiplini (7 desteksiz sayı) |
| customerops / Kuyruk fırtınası | 15/16 | 284sn | sayı disiplini (7 desteksiz sayı) |
| retail / Kampanya stok tükenmesi | 11/16 | 544sn | en az 2 seçenek, uygulanabilir seçenek, öneri uygulanabilir seçeneğe işaret, çelişkili öneri yok; sayı (1) |
| finance / Tahsilat kayması | 15/16 | 296sn | sayı disiplini (3 desteksiz sayı) |
| health / Gece kapasite sıkışması | 15/16 | 261sn | sayı disiplini (1 desteksiz sayı) |
| energy / Pik yük + trafo kısıtı | 15/16 | 237sn | kısıta takılan seçenek gerekçeli |
| agri / Hasat penceresi | 15/16 | 247sn | sayı disiplini (8 desteksiz sayı) |
| other / Teslimat sıkışması | **16/16** | 214sn | — |

### Eski (13-kriterli) tabanla karşılaştırma

Doğrudan sayısal kıyas YANILTICI: kriter sayısı 13→16 değişti, oranlar bu
yüzden yaklaşık okunmalı.

- Toplam oran %90 → %92 — hafif iyileşme, ama bu artış çoğunlukla yeni
  eklenen "boş alan yok" ve "güven gerekçesi anlamlı" kriterlerinin kolay
  geçilmesinden geliyor; asıl sorun aşağıda aynı kalıyor.
- **Seçenek üretimi (yapısal kesilme) düzeldi**: eskiden manufacturing,
  logistics, agri seçenek/öneri kriterlerinde puan kaybediyordu; bu koşuda
  üçü de sadece sayı disiplininden düştü, seçenek üretimi tam. Bu, kesik
  JSON / options kaybı sorununun bu koşuda tekrarlanmadığını gösteriyor
  (henüz iki aşamalı üretim değişikliği YAPILMADI — bu, mevcut tek-aşamalı
  koddaki bir iyileşme, muhtemelen konu/veri farklarından veya model
  varyansından; kesin neden bilinmiyor).
- **Sayı disiplini KÖTÜLEŞTİ (yaygınlık olarak)**: eskiden 8/11 senaryoda
  düşüyordu, şimdi 9/11 senaryoda düşüyor (yalnızca energy ve other temiz).
  Retail bu koşuda ilk kez ciddi şekilde bozuldu (11/16, hem seçenek hem
  sayı kriterleri düştü) — eskiden 13/13 tamdı. En çok puan kaybettiren
  kriter hâlâ aynı: "sayı disiplini (desteksiz sayı yok)", 9 senaryoda
  toplam 43 desteksiz sayı üretildi (aviation 4+5, manufacturing 7,
  logistics 7, customerops 7, retail 1, finance 3, health 1, agri 8).
- **Ölçüm**: model qwen3:4b-instruct, Ollama, CPU (GPU yok), `next start`
  üretim derlemesi, port 3001; tarih 2026-07-19.

## 2026-07-20 — qwen3:4b-instruct, CPU, iki aşamalı üretim + genişletilmiş bilgi paketleri (iyileştirme SONRASI ölçüm)

**TOPLAM: 90/176 (%51)** — 11 senaryo × 16 kriter, koşu 09:58–11:17 (~79 dk)

Ölçülen değişiklikler: "karar üretimini iki aşamaya böl" (commit 2ec0615,
teşhis+seçenek ayrı Ollama çağrıları) ve "sektör bilgi paketlerini genişlet"
(commit 53dce99, manufacturing/logistics/customerops/agri'ye yeni
CostFactor'lar).

| Senaryo | Skor | Süre | Not |
|---|---|---|---|
| aviation / SAW pik saat turnaround | 15/16 | 573sn | sayı disiplini (1 desteksiz sayı) |
| aviation / Ekip görev süresi | **0/16 (HATA)** | — | "Yerel AI boş yanıt döndürdü" |
| manufacturing / Hat darboğazı | **0/16 (HATA)** | — | "Yerel AI boş yanıt döndürdü" |
| logistics / ETA sapması | **0/16 (HATA)** | — | "Yerel AI boş yanıt döndürdü" |
| customerops / Kuyruk fırtınası | **0/16 (HATA)** | — | "Yerel AI boş yanıt döndürdü" |
| retail / Kampanya stok tükenmesi | 15/16 | 470sn | sayı disiplini (1 desteksiz sayı) |
| finance / Tahsilat kayması | 15/16 | 429sn | sayı disiplini (4 desteksiz sayı) |
| health / Gece kapasite sıkışması | 15/16 | 444sn | sayı disiplini (2 desteksiz sayı) |
| energy / Pik yük + trafo kısıtı | 15/16 | 364sn | sayı disiplini (2 desteksiz sayı) |
| agri / Hasat penceresi | **0/16 (ÇÖKME)** | — | `Cannot read properties of undefined (reading 'map')` |
| other / Teslimat sıkışması | 15/16 | 427sn | sayı disiplini (1 desteksiz sayı) |

### ⚠️ BU ÖLÇÜM GEÇERSİZDİR (2026-07-20 sonradan eklendi)

Aşağıdaki "ciddi gerileme" yorumu, o an eldeki bilgiyle dürüstçe yazılmıştı
ama **teşhis yanlıştı**. Sonradan kök neden bulundu ve ölçülerek doğrulandı
(commit 2c034f7):

qwen3 bir *thinking* modelidir. Düşünme token'ları `message.content`'e
yazılmaz ama `num_predict` bütçesinden harcanır. Model bütçeyi düşünerek
bitirip **içerik üretmeden** duruyordu (`done_reason=length`, içerik uzunluğu
0) — belirti: "Yerel AI boş yanıt döndürdü".

Aynı manufacturing teşhis çağrısıyla ölçüm:

| Ayar | Harcanan token | Üretilen içerik |
|---|---|---|
| `think` açık (varsayılan) | 2048 | **0 karakter** |
| `think: false` | 2048 | **1790 karakter geçerli JSON** |

Uzun prompt'ta düşünme uzadığı için **önce genişletilmiş bilgi paketli
sektörler** düştü — düşen 5 senaryonun 4'ü (manufacturing, logistics,
customerops, agri) tam da yeni CostFactor eklenen sektörlerdi; küçük paketli
sektörler (retail 469, energy 497, finance 396, health 428, other 295 karakter)
sorunsuz 15/16 aldı.

**Yani 90/176 bir kalite gerilemesi değil, bir hata sonucudur.** İki
iyileştirmenin (iki aşamalı üretim, genişletilmiş bilgi paketleri) gerçek
etkisi bu koşuda ÖLÇÜLEMEDİ. Koşan 6 senaryonun her biri 15/16 aldı; bu,
16 kriterli tabandaki 14,7/16 ortalamanın üzerinde — umut verici ama
yetersiz kanıt. Doğru ölçüm için süit `think: false` düzeltmesiyle yeniden
koşulmalıdır.

Not: aynı koşuda `next start` de bozuktu (`output: "standalone"` koşulsuz
açıktı, commit 61a4527 ile düzeltildi). Bu, sunucu kararlılığını etkiledi
ama senaryo hataları ardışık olmadığı için ana sebep değildi.

### Sonuç (o anki yorum — yukarıdaki nota göre okuyun): CİDDİ GERİLEME (%92 → %51), SÜSLEMEDEN

Bu SÜSLENMEMİŞ bir gerileme raporudur. 5/11 senaryo hiç puan almadan tam
başarısızlıkla sonuçlandı (önceki 16-kriterli koşuda 11/11 senaryo en az
11/16 alıyordu). Kalan 6 senaryo yalnızca "sayı disiplini" kriterinden
düştü — bu yönüyle önceki koşuya benzer, yani sektör bilgi paketi
genişlemesinin sayı disiplinini iyileştirdiğine dair bu koşuda KANIT YOK.

**Kök neden — iki ayrı, tespit edilmiş kod hatası, ikisi de iki-aşamalı
üretim değişikliğinden (commit 2ec0615) kaynaklanıyor:**

1. **Çökme (agri)**: `src/lib/ai/decision-prompt.ts:237`,
   `buildOptionsPrompt` içinde `diagnosis.evidence.map(...)` çağrılıyor.
   `diagnosis`, teşhis çağrısının JSON çıktısından `parseJson` ile
   üretiliyor; `evidence` şemada `required` olsa da bu bir zorlama değil,
   bir istektir — model şemaya tam uymazsa ya da `repairTruncatedJson`
   kesik JSON'u onarırken `evidence` alanını düşürecek bir noktadan
   keserse, `diagnosis.evidence` `undefined` gelebilir ve kod bunu
   savunmasızca `.map()` ile çağırıp çöküyor. Tek-aşamalı eski kodda bu
   ara adım hiç yoktu.
2. **"Boş yanıt" hataları (aviation/Ekip, manufacturing, logistics,
   customerops)**: iki aşamalı üretim, senaryo başına Ollama çağrı
   sayısını 1'den 2'ye çıkarıyor (`ollama.ts` `analyzeDecisionCases`).
   Yalnızca 2. çağrı (seçenekler, `requestOptions`) bir kez yeniden
   deneniyor; 1. çağrı (teşhis, `chat({ prompt: diagnosisPrompt, ... })`)
   HİÇ yeniden denenmiyor — CPU üzerinde uzun süren bir çağrı boş yanıt
   döndürürse (`ollama.ts:126`), senaryonun tamamı hiçbir düzeltme
   girişimi olmadan başarısız oluyor. Çağrı sayısının iki katına çıkması,
   bu geçici/ara sıra oluşan boş-yanıt hatasına yakalanma olasılığını da
   kabaca ikiye katlıyor.

**Sonuç**: bu koşu, iyileştirmelerin gerçek etkisini ÖLÇEMEDİ — sonuçlar
büyük ölçüde yukarıdaki iki hatanın gürültüsü. Geçerli bir karşılaştırma
için önce bu iki hata düzeltilmeli (evidence için savunmacı varsayılan +
teşhis çağrısına da seçenek çağrısıyla aynı yeniden deneme mantığı),
sonra süit tekrar koşulmalı. Kuyruğa bu düzeltme için ayrı bir madde
eklendi.

- **Ölçüm**: model qwen3:4b-instruct, Ollama, CPU (GPU yok), `next start`
  üretim derlemesi, port 3001; tarih 2026-07-20.

## Regresyon düzeltmesi notu (2026-07-20)

Yukarıdaki iki hata (`buildOptionsPrompt` içinde savunmasız `diagnosis.evidence.map(...)`
ve `evidence`/`counterfactual` alt alanlarına aynı şekilde erişim; teşhis çağrısında
yeniden deneme eksikliği) `src/lib/ai/decision-prompt.ts` ve
`src/lib/ai/providers/ollama.ts`'te düzeltildi (bkz. `tests/decision-prompt.test.ts`,
`tests/ollama-diagnosis-retry.test.ts`). Bu düzeltme EVAL SÜİTİNİ KOŞMADI — yalnızca
kodu düzeltti. Yukarıdaki "2026-07-20" bölümündeki 90/176 sonucu hâlâ GEÇERSİZ
sayılmalı; iyileştirmelerin (iki aşamalı üretim + genişletilmiş bilgi paketleri)
gerçek etkisini ölçmek için süit bu düzeltmeden SONRA yeniden koşulmalı.

## 2026-07-20 (akşam) — qwen3:4b-instruct, CPU, think:false + regresyon düzeltmesi SONRASI (geçerli ölçüm)

**TOPLAM: 169/176 (%96)** — 11 senaryo × 16 kriter, koşu 20:04–22:39 (~155 dk)

Ölçülen değişiklikler (bu koşuya kadar birikmiş, hepsi birlikte etkisi
ölçülüyor): iki aşamalı üretim (2ec0615), genişletilmiş bilgi paketleri
(53dce99), iki regresyon düzeltmesi — savunmasız `diagnosis.evidence.map`
ve teşhis çağrısı yeniden denemesi (76e8810), `think: false` düzeltmesi
(2c034f7), standalone build düzeltmesi (61a4527), evalin ayrı DB dizininde
koşması (bd72f5f).

| Senaryo | Skor | Süre | Düşen kriterler |
|---|---|---|---|
| aviation / SAW pik saat turnaround | 15/16 | 1895sn | sayı disiplini (1 desteksiz sayı) |
| aviation / Ekip görev süresi | 15/16 | 813sn | sayı disiplini (2 desteksiz sayı) |
| manufacturing / Hat darboğazı | 15/16 | 857sn | sayı disiplini (4 desteksiz sayı) |
| logistics / ETA sapması | 15/16 | 918sn | sayı disiplini (3 desteksiz sayı) |
| customerops / Kuyruk fırtınası | 15/16 | 1778sn | sayı disiplini (10 desteksiz sayı) |
| retail / Kampanya stok tükenmesi | **16/16** | 520sn | — |
| finance / Tahsilat kayması | 15/16 | 414sn | sayı disiplini (3 desteksiz sayı) |
| health / Gece kapasite sıkışması | **16/16** | 435sn | — |
| energy / Pik yük + trafo kısıtı | **16/16** | 604sn | — |
| agri / Hasat penceresi | 15/16 | 637sn | sayı disiplini (3 desteksiz sayı) |
| other / Teslimat sıkışması | **16/16** | 411sn | — |

Hiçbir senaryo "boş yanıt" hatası veya çökme vermedi (11/11 tam koştu) —
`think: false` ve regresyon düzeltmesi bu açıdan doğrulandı.

### 16 kriterli geçerli tabanla (162/176, 2026-07-19) fark

- **Toplam**: 162/176 (%92) → 169/176 (%96), **+7 puan**.
- **Seçenek/yapısal kriterler düzeldi**: retail eskiden 11/16'ydı (en az 2
  seçenek, uygulanabilir seçenek, öneri uygulanabilir seçeneğe işaret,
  çelişkili öneri yok kriterlerinin hepsi düşüyordu) — bu koşuda **16/16**,
  hepsi geçti. health ve energy'nin eskiden düştüğü "kısıta takılan
  seçenek gerekçeli" kriteri de bu koşuda geçti (ikisi de 16/16).
  İyileşme retail'de en büyük tek kazanım (+5).
- **Sayı disiplini iyileşti ama düzelmedi**: eskiden 9/11 senaryoda
  düşüyordu (yalnızca energy, other temizdi), şimdi **7/11 senaryoda**
  düşüyor (retail, health, energy, other temiz). Toplam desteksiz sayı
  sayısı 43'ten **26'ya** düştü (%40 azalma) — genişletilmiş bilgi
  paketlerinin (manufacturing/logistics/customerops/agri) kısmi etkisi
  görülüyor ama sorunu bitirmedi; customerops hâlâ en kötü (10 desteksiz
  sayı, önceki koşuda da 7 ile en kötüsüydü).
- **Süre CİDDİ ARTTI**: önceki koşu ~58 dk, bu koşu ~155 dk (~2,7 kat).
  Beklenen kabaca 2 kat artış iki aşamalı üretimden (senaryo başına 1
  yerine 2 Ollama çağrısı) geliyor; gözlenen artış bunun da üzerinde —
  en uzun senaryolar (aviation/SAW 1895sn, customerops 1778sn) özellikle
  sıçradı. Olası ek neden: bu makinede aynı gece başka süreçlerin
  (bkz. kuyruktaki "SÜRÜYOR (yeniden başlatma)" notu — öksüz kalmış önceki
  koşu süreci, ayrıca bağımsız bir `npm run dev` süreci) CPU/bellek
  paylaşması; kesin ayrıştırma yapılmadı, izole tekrar ölçüm önerilir.
- **Sonuç**: iki aşamalı üretim + genişletilmiş bilgi paketleri iyileştirmesi
  net olarak olumlu — puan arttı, yapısal kesilme riski taşıyan retail tam
  puana çıktı, sayı disiplini kısmen iyileşti — ama bunun bedeli belirgin
  bir süre artışı oldu ve sayı disiplini sorunu hâlâ çözülmedi (7/11
  senaryoda devam ediyor, özellikle customerops).

- **Ölçüm**: model qwen3:4b-instruct, Ollama (`think: false`), CPU (GPU
  yok), `next start` üretim derlemesi (standalone kapalı), port 3001,
  ayrı ABYS_DB_DIR; tarih 2026-07-20, 20:04–22:39.
