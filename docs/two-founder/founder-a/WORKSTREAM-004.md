# Founder A — Workstream 004

Tarih: 2026-11-20

## İncelenenler

- `src/app/dashboard/page.tsx`: mevcut üst açık karar vakası kartı, dashboard yerleşimi ve responsive grid.
- `src/lib/decisions.ts`: `DecisionCase`, `EvidenceItem`, `Counterfactual`, `ActionOption` ve `RELIABILITY_META` sözleşmeleri.

## Değişen davranış

- Mevcut **EN KRİTİK KARAR VAKASI** kartı korunarak altına dört kompakt bilgi alanı eklendi.
- Kanıt güvenilirliği sayıları `verified`, `estimated` ve `unknown` olarak mevcut `DecisionCase.evidence` dizisinden türetiliyor.
- Kanıt alanında en fazla iki somut kayıt gösteriliyor; doğrulanmış kayıtlar tahmini kayıtlardan önce seçiliyor ve yalnızca dolu `fact` metinleri kullanılıyor.
- Güven gerekçesi ve mevcut `confidence` değeri gösteriliyor; gerekçe boşsa “Güven gerekçesi belirtilmemiş.” yazıyor.
- Karşı senaryo alanında yalnızca mevcut `projectedImpact` ve `timeHorizon` alanları “Tahmini etki” ve “Zaman ufku” etiketleriyle gösteriliyor; boş alanlarda “Belirtilmemiş.” yazıyor.
- Önerilen seçenek `recommendedOptionId` ile bulunuyor; mevcut `title` ve `expectedOutcome` alanları gösteriliyor. Seçenek yoksa veya sonuç boşsa açık fallback metni kullanılıyor.
- Kartın mevcut tam tıklanabilir `Link` davranışı, navigasyon, responsive `md:grid-cols-2` düzeni ve ABYS tasarım tokenları korundu.

## Doğrulama

```text
$ npx tsc --noEmit
exit code 0 (çıktı yok)

$ npx eslint src/app/dashboard/page.tsx
exit code 0 (çıktı yok)

$ git --no-pager diff --stat -- src/app/dashboard/page.tsx
 1 file changed, 86 insertions(+), 10 deletions(-)
```

## Sınırlamalar

- Tarayıcı/CUA görsel doğrulaması yapılmadı; yerleşim yalnızca kod ve mevcut responsive grid kalıpları üzerinden değerlendirildi.
- Gösterilen tüm değerler seçili `DecisionCase` üzerindeki mevcut alanlardan geliyor; yeni güven, etki, zaman ufku, nedensellik veya finansal değer üretilmedi.
- Kanıt sayıları mevcut kayıtların güvenilirlik alanlarına göre hesaplanan toplamlardır; yeni bir kanıt skoru değildir.
- Yalnızca `src/app/dashboard/page.tsx` değiştirildi; API, backend, izinler, paketler ve diğer üretim dosyaları değiştirilmedi.
- Git yazma komutu çalıştırılmadı; entegrasyon ve commit kararı kök Codex'e bırakıldı.
