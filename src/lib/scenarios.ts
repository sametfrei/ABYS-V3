import type { SectorId } from "./sectors";

/**
 * Sektör başına örnek operasyonel veri senaryoları.
 * Gerçek entegrasyon bağlanmadan önce, karar motorunun uçtan uca
 * çalışmasını göstermek için kullanılır. Havacılık senaryosu ABYS'in
 * ilk kaması olan "önlenebilir turnaround gecikmesi" üzerine kuruludur;
 * diğer sektörler aynı yapının muadilleridir.
 */

export interface Scenario {
  id: string;
  label: string;
  description: string;
  data: string;
}

export const SCENARIOS: Partial<Record<SectorId, Scenario[]>> = {
  aviation: [
    {
      id: "turnaround-sag",
      label: "SAW pik saat turnaround",
      description: "Sabiha Gökçen'de akşam pikinde 3 uçuşun turnaround durumu",
      data: `İstasyon: SAW | Saat: 18:10 yerel | METAR: rüzgar 24012KT, görüş 9999, hafif yağmur başlangıcı bekleniyor (TAF 19Z)

TK-2043 (A321, kapı uzak park R4) — STD 18:45
- Boarding: başlamadı (plan 18:05), kapı ataması 17:58'de değişti
- Bagaj: %60 yüklendi, BRS'te 14 transfer bagaj eksik görünüyor
- Yakıt: ikmal sürüyor, tahmini bitiş 18:20 (tek araç çalışıyor)
- Catering: tamamlandı 17:40
- Kokpit ekibi: uçakta; kabin ekibinin 2 üyesi TK-1980'den bağlantılı, TK-1980 blok 18:05 (15 dk rötarlı indi)
- Geçmiş: Bu rotasyonda son 30 günde ortalama turnaround 52 dk (hedef 45 dk), cuma akşamları ortalama +9 dk

PC-4110 (B737-8, kapı 12) — STD 19:05
- Boarding: plan 18:25, kapı önü yoğunluğu normal
- Bagaj: yükleme başlamadı, bagaj ekibi TK-2043'te
- Yakıt: araç sırada, TK-2043 sonrası
- Ekip: tam, uçakta

TK-2087 (A320, kapı 8) — STD 19:30, İzmir dönüşü rotasyon devamında 22:10 AYT bacağı var
- İnbound uçak havada, tahmini iniş 18:40 (7 dk erken)
- Slot: AYT bacağı için CTOT 22:25, esneme payı düşük

Operasyon notları:
- Uzak park R4 için apron otobüsü 1 adet atandı (normalde 2)
- Yer hizmetleri gece vardiyası 22:00'de devralıyor, devir sırasında 15 dk kapasite düşüşü yaşanıyor
- Dün benzer koşullarda TK-2041 34 dk rötar yaptı, ana neden bagaj + tek yakıt aracı sırasıydı`,
    },
    {
      id: "crew-limit",
      label: "Ekip görev süresi sıkışması",
      description: "Akşam rotasyonunda görev süresi limitine yaklaşan ekipler",
      data: `İstasyon: IST | Saat: 20:30 yerel

TK-1523 (A330, ESB dönüşü) — STD 21:15
- Kokpit ekibi görev başlangıcı 11:00, kalan görev süresi 3s 40dk; ESB dönüş bloğu 2s 10dk — dönüşte limit payı 35 dk
- Yedek kokpit ekibi: IST'de 1 standby ekip var, çağrı-hazır süresi 90 dk
- Kabin: tam
- Meteoroloji ESB: kapalı, ILS CAT-II aktif, olası pas geçme + bekleme yakıtı hesaba katılmalı
- Geçmiş: Son 14 günde ESB akşam bacaklarında ortalama +18 dk blok sapması

TK-1119 (A321, ADB) — STD 21:40
- Ekip: tam, limit sorunu yok
- Bagaj/yakıt: normal akışta`,
    },
  ],
  manufacturing: [
    {
      id: "line-bottleneck",
      label: "Hat darboğazı + teslimat riski",
      description: "CNC bakımı sırasında biriken iş emirleri ve teslim tarihi riski",
      data: `Tesis: Ana fabrika | Vardiya: 2/2 | Tarih: bugün

Hat durumu:
- CNC-3 planlı bakımda (kalan 31 saat), işleri CNC-1 ve CNC-2'ye dağıtıldı
- CNC-1 doluluk %97, kuyrukta 14 iş emri (normal: 6)
- CNC-2 doluluk %88, operatörlerden biri yarın izinli (onaylı)
- Montaj hattı beslemesi 4 saatlik stokla dönüyor (normal: 12 saat)

Siparişler:
- SIP-8842 (ihracat, ceza maddeli): teslim 5 gün sonra, rota CNC-1 → kaplama → montaj; kaplama tedarikçisi standart terminde 3 gün
- SIP-8867: teslim 12 gün sonra, esnek
- Son 3 ayda benzer bakım pencerelerinde ortalama teslim gecikmesi: 2,1 gün

Kalite:
- CNC-1'de son 48 saatte hurda oranı %1,4 → %2,6 (operatör yoğunluğuyla korele)`,
    },
  ],
  logistics: [
    {
      id: "eta-cascade",
      label: "ETA sapması ve dağıtım zinciri",
      description: "Ana güzergâh gecikmesinin dağıtım ağına yayılma riski",
      data: `Filo durumu: 18 araç sahada, 4 boşta (2'si D-100 üzerinde)

- İST→ANK ana hat aracı TR-34-KL: D-100'de kaza kaynaklı trafik, ETA +2s 15dk
- Bu araç ANK aktarma deposundaki 3 dağıtım turunun beslemesi (46 teslimat noktası)
- ANK deposunda mevcut stokla ilk tur çıkabilir, 2. ve 3. tur besleme bekliyor
- Sürücü AETR kalan süresi: 3s 05dk (mola zorunluluğu yaklaşan)
- Alternatif: ANK yakınındaki boş araç TR-06-BC devralabilir, devir noktası Gerede (buluşma ~50 dk)
- Soğuk zincir: 2. turda 6 frigorifik teslimat var, sıcaklık payı 4 saat
- SLA: Kurumsal müşteri X'in teslimatları 17:00 kesim saatine bağlı, ceza maddesi var
- Geçmiş: Benzer D-100 olaylarında ortalama toplam ağ gecikmesi 3,4 saat`,
    },
  ],
  customerops: [
    {
      id: "queue-storm",
      label: "Kuyruk fırtınası",
      description: "Fatura kesim günü + sistem yavaşlığı birleşince oluşan kuyruk riski",
      data: `Çağrı merkezi anlık durum (14:20):
- Gelen çağrı: son 1 saatte 640 (tahmin 410 idi, +%56)
- ASA: 4dk 40sn (hedef 45sn), SLA anlık %38 (hedef %80)
- Kuyrukta bekleyen: 84 çağrı, en uzun bekleme 11 dk
- Vardiyada 34 temsilci, 3'ü eğitimde, öğle molası rotasyonu sürüyor
- Teknik destek kuyruğu: sadece 8 yetkin temsilci, doluluk %100
- Neden: bugün fatura kesim günü + self-servis uygulamada yavaşlık bildirimi (BT olay kaydı OPEN-4412, çözüm tahmini 2 saat)
- AHT son 1 saatte 6:10 → 7:25 (uygulama yavaşlığı temsilci işlemlerini de uzatıyor)
- Geçmiş: benzer kesim günlerinde pik 15:00-17:00 arası sürüyor
- Churn sinyali: son 1 saatte 12 çağrıda iptal talebi geçti (normalin 3 katı)`,
    },
  ],
  retail: [
    {
      id: "stockout-wave",
      label: "Kampanya stok tükenmesi",
      description: "Kampanya ürününde bölgesel stok tükenme dalgası",
      data: `Kampanya: 3. gün / 7 gün

- Kampanya ürünü SKU-1180: Marmara depolarında kalan stok 320 adet, günlük satış hızı 410 adet/gün (plan: 250)
- Ege deposunda 1.150 adet fazla stok var (satış hızı planın %60'ı)
- Mağazalar arası transfer süresi: min 2 gün; depolar arası ana hat: 1 gün
- Tedarikçi MOQ 500 adet, standart termin 10 gün, hızlandırılmış termin 4 gün (+%18 maliyet)
- E-ticaret aynı SKU'da stok rezervi 90 adet, iptal oranı %6
- Kampanya sayfası trafiği artıyor (dün +%22), stok bitince ikame ürüne dönüş oranı geçmişte %31
- Geçmiş: benzer kampanyada erken stockout, ciro kaybı ~%9 ve müşteri şikayetlerinde 2 kat artış yaratmıştı`,
    },
  ],
  finance: [
    {
      id: "collection-drift",
      label: "Tahsilat kayması",
      description: "Belirli segmentte gecikme oranının hızlanması",
      data: `Portföy anlık durum:
- KOBİ segmenti 30+ gün gecikme oranı: %4,2 → %5,8 (son 6 hafta)
- Kayma en çok inşaat alt segmentinde (%9,1), coğrafi olarak 2 bölgede yoğun
- Erken uyarı: aynı segmentte kısmi ödeme davranışı %14 → %23
- Sektörel konsantrasyon limiti %85 dolulukta (inşaat)
- Yeniden yapılandırma kapasitesi: saha ekibi ayda 120 dosya işleyebiliyor, kuyrukta 96 dosya
- Fonlama maliyeti sabit, marj güncel gecikme hızında çeyrek sonunda 40bp erir
- Geçmiş: 2 yıl önceki benzer kaymada erken yapılandırma yapılan dosyaların %68'i kurtarıldı, geç kalınanlarda oran %31`,
    },
  ],
  health: [
    {
      id: "capacity-night",
      label: "Gece kapasite sıkışması",
      description: "Yoğun bakım doluluğu + nöbet kadrosu kısıtı",
      data: `Hastane anlık durum (21:40):
- Yoğun bakım doluluk: %88 (2 boş yatak), acilde yoğun bakım endikasyonlu 3 hasta bekliyor
- Gece nöbetinde 2 uzman, ek çağrı listesinde 1 kişi (ulaşım süresi 40 dk)
- Acil başvuru hızı son 3 saatte +%35 (mevsimsel viral dalga)
- Servis yataklarında taburcu edilebilir 5 hasta var (sabah vizitesi bekliyor)
- Ameliyathane: yarın 08:00'de 2 planlı büyük vaka, yoğun bakım yatağı rezervasyonu gerekiyor
- Komşu hastane yoğun bakımı %95 dolu, sevk protokolü aktif ama yavaş
- Geçmiş: benzer dalga gecelerinde sabaha karşı 02:00-05:00 arasında 2-3 ek yoğun bakım talebi geliyor`,
    },
  ],
  energy: [
    {
      id: "peak-risk",
      label: "Pik yük + trafo kısıtı",
      description: "Sıcak hava dalgasında bölgesel şebeke zorlanması",
      data: `Şebeke anlık durum (16:00):
- Bölgesel talep tahmini bu akşam 19:00-21:00 için %8 yukarı revize edildi (sıcak hava)
- Trafo T-4 %95 yükte, soğutma fanlarından biri arızalı (bakım kaydı açık)
- Santral B planlı bakımda (kalan 5 gün), yedek kapasite azaldı
- Spot piyasa akşam pik fiyatı sabahki kapanışa göre +%34
- T-4 bölgesinde kritik yük: 1 hastane, 2 veri merkezi (kesinti önceliği en düşük)
- Alternatif: T-7 üzerinden yük aktarımı mümkün ama şalt sahasında manuel manevra gerektiriyor (ekip yolda 45 dk)
- Geçmiş: T-4 geçen yaz benzer yükte 2 kez termal alarma girdi, biri 40 dk bölgesel kesintiyle sonuçlandı`,
    },
  ],
  agri: [
    {
      id: "harvest-window",
      label: "Hasat penceresi + yağış riski",
      description: "Yaklaşan yağış öncesi hasat ve kurutma kapasitesi kararı",
      data: `Kooperatif durum raporu:
- 3 gün sonra 2 günlük kuvvetli yağış bekleniyor (MGM güven: yüksek)
- Hasada hazır parsel: 240 ha (nem %14,5 — ideal %13)
- Biçerdöver kapasitesi: 2 makine × 35 ha/gün (1 makine bakımda, yarın dönebilir)
- Kurutma tesisi kapasitesi: günlük 90 ton, silo doluluk %70
- Nemli hasat edilirse kurutma maliyeti +%40, fire riski +%3
- Yağış sonrası hasatta tarla kaybı geçmişte %8-12 aralığında gerçekleşti
- İşçilik: mevsimlik ekip mevcut, gece vardiyası için aydınlatma sadece 1 makinede var`,
    },
  ],
  other: [
    {
      id: "delivery-crunch",
      label: "Teslimat sıkışması",
      description: "Aynı haftaya denk gelen iki kritik proje teslimi",
      data: `Operasyon durumu:
- Proje A teslimi cuma (sözleşme cezalı), kalan iş 3 kişi-gün, atanan ekipten 1 kişi hasta
- Proje B teslimi pazartesi, kalan iş 5 kişi-gün, müşteri kabul testine katılacak
- Ekip doluluk %90, dışarıdan takviye onay süreci min 1 hafta
- Proje A'daki eksik modül, B'de de kullanılacak ortak bileşen
- Geçmiş: son 4 çeyrekte cezalı teslim gecikmesi 1 kez yaşandı, maliyeti sözleşme bedelinin %5'iydi`,
    },
  ],
};

export function getScenarios(sectorId: SectorId): Scenario[] {
  return SCENARIOS[sectorId] ?? [];
}
