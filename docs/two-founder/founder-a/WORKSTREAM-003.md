# Founder A — Workstream 003

Tarih: 2026-11-20

## İncelenenler

- `src/app/dashboard/forecast/page.tsx`: KPI seçimi, tahmin grafiği, model karşılaştırması ve mevcut kaynak kartı.
- `src/app/api/forecast/route.ts`: `/api/forecast` yanıt sözleşmesi, `provenance` ve varsayım metinleri.
- `src/lib/forecasting.ts`: kanıt düzeyi, P10–P90 aralığı, geriye dönük test metrikleri ve sınırlama notu.
- `src/components/PageHeader.tsx` ve mevcut dashboard sayfaları: ABYS başlık, kart ve renk tokenları.

## Değişen davranış

- Tahmin sonucunun üstüne kompakt bir **TAHMİN KANITI VE SINIRLARI** kartı eklendi.
- Kart, yalnızca mevcut yanıttaki alanları gösteriyor: kanıt düzeyi, geriye dönük test MAE, son gözlem zamanı, ilk dönemin P10–P90 aralığı ve yanıttaki varsayım/sınırlama metinleri.
- Yeterli veri yoksa kart açıkça “kanıt düzeyi, geriye dönük MAE ve P10–P90 belirsizlik aralığı bu yanıtta yok” diyor; eksik son gözlem veya boş varsayım listesi için ayrı dürüst fallback metinleri bulunuyor.
- Her tahmin dönemi kartındaki aralık artık `P10–P90:` etiketiyle sunuluyor; çıplak iki sayı olarak bırakılmıyor.
- Tekrarlanan varsayım listesi ve son gözlem satırı alttaki teknik kaynak kartından kaldırıldı; aynı bilgiler üstteki kanıt kartında daha görünür biçimde duruyor.
- Mevcut sayfa düzeni, KPI seçimi, grafik, model karşılaştırması, erken uyarı bloğu ve navigasyon korundu.

## Doğrulama

```text
$ npx tsc --noEmit
exit code 0 (çıktı yok)

$ npx eslint src/app/dashboard/forecast/page.tsx
exit code 0 (çıktı yok)

$ git --no-pager diff --stat -- src/app/dashboard/forecast/page.tsx
 1 file changed, 69 insertions(+), 7 deletions(-)
```

## Sınırlamalar

- Tarayıcı/CUA görsel doğrulaması yapılmadı; yerleşim yalnızca kod, mevcut tasarım tokenları ve mevcut sayfa yapısı üzerinden değerlendirildi.
- Kanıt düzeyi ve aralıklar `forecasting.ts` tarafından üretilen mevcut değerlerdir; bu çalışmada yeni istatistik, olasılık, güven veya nedensellik hesabı eklenmedi.
- API en fazla mevcut sözleşmedeki alanları döndürüyor; zincir dışı veri, ek provenance kaynağı veya yeni tazelik ölçümü eklenmedi.
- Yalnızca `src/app/dashboard/forecast/page.tsx` değiştirildi; API, backend, izinler, paketler ve diğer üretim dosyaları değiştirilmedi.
- Git yazma komutu çalıştırılmadı; entegrasyon ve commit kararı kök Codex'e bırakıldı.

## Founder B entegrasyon incelemesi

- Founder A yalnızca `src/app/dashboard/forecast/page.tsx` dosyasını değiştirdi; üretim sözleşmesine uydurulmuş sahte güven veya nedensellik iddiası bulunmadı.
- Yeni `tests/forecast-evidence.test.ts`, mevcut tahmin sonucundaki P10–P90 ve kanıt alanlarının deterministik sözleşmesini doğrular.
- Test, gerçek bir aralık kusuru yakaladı: trendli seride P10 merkez değerden büyük olabiliyordu. `src/lib/forecasting.ts` merkez tahmini geriye dönük hata ortalamasıyla düzeltiyor ve aralıkları merkezlenmiş hatalardan üretiyor.
- `npx vitest run tests/forecasting.test.ts tests/forecast-evidence.test.ts tests/decision-brief.test.ts tests/kpi-values.test.ts`: 22 test geçti.
- `npx tsc --noEmit` ve hedefli `eslint`: geçti.
- `npm run build`: Next.js 16.2.11, 94 rota ile geçti.
- Tarayıcı görsel doğrulaması hâlâ mevcut değil; bu durum doğrulanmış sayılmadı.
