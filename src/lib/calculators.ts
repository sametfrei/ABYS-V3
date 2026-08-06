import type { SectorId } from "./sectors";

export interface CalculatorField {
  key: string;
  label: string;
  unit?: string;
  defaultValue?: number;
}

export interface CalculatorResultRow {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}

export interface CalculatorDef {
  id: string;
  title: string;
  desc: string;
  fields: CalculatorField[];
  compute: (v: Record<string, number>) => CalculatorResultRow[];
}

function pct(n: number): string {
  return Number.isFinite(n) ? `%${n.toFixed(1)}` : "—";
}

export const SECTOR_CALCULATORS: Record<SectorId, CalculatorDef[]> = {
  aviation: [
    {
      id: "delay-cost",
      title: "Gecikme Maliyeti Hesaplayıcı",
      desc: "Rötar dakikası, etkilenen uçuş sayısı ve dakika başı maliyetten toplam operasyonel kaybı hesaplar.",
      fields: [
        { key: "rotarDakika", label: "Ortalama Rötar (dk/uçuş)" },
        { key: "ucusSayisi", label: "Etkilenen Uçuş Sayısı" },
        { key: "dakikaMaliyet", label: "Dakika Başı Maliyet (€)", defaultValue: 85 },
      ],
      compute: (v) => {
        const toplamDakika = v.rotarDakika * v.ucusSayisi;
        const maliyet = toplamDakika * v.dakikaMaliyet;
        return [
          { label: "Toplam Rötar", value: `${Math.round(toplamDakika).toLocaleString("tr-TR")} dk` },
          {
            label: "Tahmini Maliyet",
            value: `€${Math.round(maliyet).toLocaleString("tr-TR")}`,
            tone: maliyet > 10000 ? "bad" : "neutral",
          },
        ];
      },
    },
    {
      id: "turnaround",
      title: "Turnaround Performans Hesaplayıcı",
      desc: "Gerçekleşen turnaround sürelerinin hedefe göre sapmasını ve zamanında kalkış oranını hesaplar.",
      fields: [
        { key: "hedefSure", label: "Hedef Turnaround (dk)", defaultValue: 45 },
        { key: "ortalamaSure", label: "Gerçekleşen Ortalama (dk)" },
        { key: "toplamUcus", label: "Toplam Uçuş" },
        { key: "zamanindaKalkis", label: "Zamanında Kalkan Uçuş" },
      ],
      compute: (v) => {
        const sapma = ((v.ortalamaSure - v.hedefSure) / v.hedefSure) * 100;
        const otp = (v.zamanindaKalkis / v.toplamUcus) * 100;
        return [
          { label: "Hedeften Sapma", value: pct(sapma), tone: sapma > 0 ? "bad" : "good" },
          { label: "Zamanında Kalkış (OTP)", value: pct(otp), tone: otp < 80 ? "bad" : "good" },
        ];
      },
    },
    {
      id: "utilization",
      title: "Uçak Kullanım Hesaplayıcı",
      desc: "Filo başına günlük blok saat kullanımını hedefle karşılaştırır.",
      fields: [
        { key: "toplamBlokSaat", label: "Günlük Toplam Blok Saat" },
        { key: "ucakSayisi", label: "Uçak Sayısı" },
        { key: "hedefKullanim", label: "Hedef Kullanım (saat/uçak)", defaultValue: 10 },
      ],
      compute: (v) => {
        const kullanim = v.toplamBlokSaat / v.ucakSayisi;
        const fark = ((kullanim - v.hedefKullanim) / v.hedefKullanim) * 100;
        return [
          { label: "Uçak Başı Kullanım", value: `${kullanim.toFixed(1)} saat` },
          { label: "Hedefe Göre", value: pct(fark), tone: fark < 0 ? "bad" : "good" },
        ];
      },
    },
  ],
  customerops: [
    {
      id: "funnel",
      title: "Dönüşüm Hunisi Hesaplayıcı",
      desc: "Toplam data, ulaşılan data ve kayıt sayısından ulaşma ve dönüşüm oranlarını hesaplar.",
      fields: [
        { key: "toplamData", label: "Toplam Data" },
        { key: "ulasilanData", label: "Ulaşılan Data" },
        { key: "kayitData", label: "Kayıt / Dönüşüm Sayısı" },
      ],
      compute: (v) => {
        const ulasmaOrani = (v.ulasilanData / v.toplamData) * 100;
        const donusumOrani = (v.kayitData / v.toplamData) * 100;
        const ulasilandanDonusum = (v.kayitData / v.ulasilanData) * 100;
        return [
          { label: "Ulaşma Oranı", value: pct(ulasmaOrani), tone: ulasmaOrani < 60 ? "bad" : "good" },
          { label: "Toplam Dönüşüm Oranı", value: pct(donusumOrani), tone: donusumOrani < 5 ? "bad" : "good" },
          { label: "Ulaşılandan Dönüşüm Oranı", value: pct(ulasilandanDonusum) },
        ];
      },
    },
    {
      id: "agent-capacity",
      title: "Danışman Kapasite Hesaplayıcı",
      desc: "Danışman başına düşen data yükünü ve önerilen kapasiteye göre aşımı hesaplar.",
      fields: [
        { key: "toplamData", label: "Toplam Data" },
        { key: "danismanSayisi", label: "Danışman Sayısı" },
        { key: "onerilenMaxKapasite", label: "Önerilen Max Kapasite (kişi başı)", defaultValue: 500 },
      ],
      compute: (v) => {
        const kisiBasi = v.toplamData / v.danismanSayisi;
        const asim = ((kisiBasi - v.onerilenMaxKapasite) / v.onerilenMaxKapasite) * 100;
        return [
          { label: "Kişi Başı Ortalama Data", value: Math.round(kisiBasi).toLocaleString("tr-TR") },
          { label: "Önerilen Kapasiteye Göre Sapma", value: pct(asim), tone: asim > 0 ? "bad" : "good" },
        ];
      },
    },
  ],
  manufacturing: [
    {
      id: "oee",
      title: "OEE (Genel Ekipman Verimliliği) Hesaplayıcı",
      desc: "Kullanılabilirlik × Performans × Kalite ile genel ekipman verimliliğini hesaplar.",
      fields: [
        { key: "planlananSure", label: "Planlanan Süre (dk)" },
        { key: "calismaSuresi", label: "Gerçek Çalışma Süresi (dk)" },
        { key: "hedefUretim", label: "Hedef Üretim (adet)" },
        { key: "gercekUretim", label: "Gerçek Üretim (adet)" },
        { key: "iyiUrun", label: "İyi Ürün (adet)" },
      ],
      compute: (v) => {
        const availability = (v.calismaSuresi / v.planlananSure) * 100;
        const performance = (v.gercekUretim / v.hedefUretim) * 100;
        const quality = (v.iyiUrun / v.gercekUretim) * 100;
        const oee = (availability * performance * quality) / 10000;
        return [
          { label: "Kullanılabilirlik", value: pct(availability) },
          { label: "Performans", value: pct(performance) },
          { label: "Kalite", value: pct(quality) },
          { label: "OEE", value: pct(oee), tone: oee < 60 ? "bad" : "good" },
        ];
      },
    },
    {
      id: "capacity",
      title: "Darboğaz Kapasite Hesaplayıcı",
      desc: "Günlük talebin kapasiteye oranını hesaplar.",
      fields: [
        { key: "gunlukKapasite", label: "Günlük Kapasite (adet)" },
        { key: "gunlukTalep", label: "Günlük Talep (adet)" },
      ],
      compute: (v) => {
        const kullanim = (v.gunlukTalep / v.gunlukKapasite) * 100;
        return [{ label: "Kapasite Kullanım Oranı", value: pct(kullanim), tone: kullanim > 90 ? "bad" : "good" }];
      },
    },
  ],
  retail: [
    {
      id: "inventory-turnover",
      title: "Stok Devir Hızı Hesaplayıcı",
      desc: "Satılan malın maliyetini ortalama stok değerine oranlayarak devir hızını hesaplar.",
      fields: [
        { key: "smm", label: "Dönem Satılan Malın Maliyeti (₺)" },
        { key: "ortalamaStok", label: "Ortalama Stok Değeri (₺)" },
      ],
      compute: (v) => {
        const devirHizi = v.smm / v.ortalamaStok;
        const gun = 365 / devirHizi;
        return [
          { label: "Stok Devir Hızı", value: devirHizi.toFixed(2) + "x" },
          { label: "Ortalama Stokta Kalma Süresi", value: Math.round(gun) + " gün" },
        ];
      },
    },
    {
      id: "stockout",
      title: "Stok Tükenme Riski Hesaplayıcı",
      desc: "Mevcut stoğun günlük satış hızına göre kaç gün yeteceğini hesaplar.",
      fields: [
        { key: "mevcutStok", label: "Mevcut Stok (adet)" },
        { key: "gunlukSatis", label: "Günlük Ortalama Satış (adet)" },
      ],
      compute: (v) => {
        const gun = v.mevcutStok / v.gunlukSatis;
        return [{ label: "Stoğun Yeteceği Süre", value: Math.round(gun) + " gün", tone: gun < 7 ? "bad" : "good" }];
      },
    },
  ],
  logistics: [
    {
      id: "capacity-utilization",
      title: "Kapasite Kullanım Hesaplayıcı",
      desc: "Kullanılan araç/depo kapasitesinin toplam kapasiteye oranını hesaplar.",
      fields: [
        { key: "toplamKapasite", label: "Toplam Kapasite" },
        { key: "kullanilanKapasite", label: "Kullanılan Kapasite" },
      ],
      compute: (v) => {
        const kullanim = (v.kullanilanKapasite / v.toplamKapasite) * 100;
        return [{ label: "Kapasite Kullanım Oranı", value: pct(kullanim), tone: kullanim > 95 ? "bad" : "good" }];
      },
    },
    {
      id: "empty-km-cost",
      title: "Boş Kilometre Maliyeti Hesaplayıcı",
      desc: "Boş kilometrenin toplam maliyetini hesaplar.",
      fields: [
        { key: "bosKm", label: "Boş Kilometre" },
        { key: "kmMaliyet", label: "Km Başı Maliyet (₺)" },
      ],
      compute: (v) => {
        const toplam = v.bosKm * v.kmMaliyet;
        return [{ label: "Toplam Boş Km Maliyeti", value: toplam.toLocaleString("tr-TR") + " ₺", tone: "bad" }];
      },
    },
  ],
  finance: [
    {
      id: "liquidity",
      title: "Likidite (Cari) Oranı Hesaplayıcı",
      desc: "Dönen varlıkların kısa vadeli borçlara oranını hesaplar.",
      fields: [
        { key: "donenVarliklar", label: "Dönen Varlıklar (₺)" },
        { key: "kisaVadeliBorclar", label: "Kısa Vadeli Borçlar (₺)" },
      ],
      compute: (v) => {
        const oran = v.donenVarliklar / v.kisaVadeliBorclar;
        return [{ label: "Cari Oran", value: oran.toFixed(2), tone: oran < 1 ? "bad" : "good" }];
      },
    },
    {
      id: "collection-risk",
      title: "Tahsilat Riski Hesaplayıcı",
      desc: "Geciken alacağın toplam alacağa oranını hesaplar.",
      fields: [
        { key: "toplamAlacak", label: "Toplam Alacak (₺)" },
        { key: "gecikenAlacak", label: "Geciken Alacak (₺)" },
      ],
      compute: (v) => {
        const oran = (v.gecikenAlacak / v.toplamAlacak) * 100;
        return [{ label: "Gecikme Oranı", value: pct(oran), tone: oran > 10 ? "bad" : "good" }];
      },
    },
  ],
  health: [
    {
      id: "bed-occupancy",
      title: "Yatak Doluluk Oranı Hesaplayıcı",
      desc: "Dolu yatakların toplam yatağa oranını hesaplar.",
      fields: [
        { key: "toplamYatak", label: "Toplam Yatak" },
        { key: "doluYatak", label: "Dolu Yatak" },
      ],
      compute: (v) => {
        const oran = (v.doluYatak / v.toplamYatak) * 100;
        return [{ label: "Doluluk Oranı", value: pct(oran), tone: oran > 90 ? "bad" : "good" }];
      },
    },
    {
      id: "staff-ratio",
      title: "Personel Yeterlilik Hesaplayıcı",
      desc: "Hasta başına düşen personel sayısını hesaplar.",
      fields: [
        { key: "hastaSayisi", label: "Hasta Sayısı" },
        { key: "personelSayisi", label: "Personel Sayısı" },
      ],
      compute: (v) => {
        const oran = v.hastaSayisi / v.personelSayisi;
        return [{ label: "Personel Başına Hasta", value: oran.toFixed(1), tone: oran > 8 ? "bad" : "good" }];
      },
    },
  ],
  energy: [
    {
      id: "supply-demand",
      title: "Arz-Talep Dengesi Hesaplayıcı",
      desc: "Üretim kapasitesinin tahmini talebi karşılama oranını hesaplar.",
      fields: [
        { key: "uretimKapasitesi", label: "Üretim Kapasitesi (MW)" },
        { key: "tahminiTalep", label: "Tahmini Talep (MW)" },
      ],
      compute: (v) => {
        const oran = (v.uretimKapasitesi / v.tahminiTalep) * 100;
        return [{ label: "Talebi Karşılama Oranı", value: pct(oran), tone: oran < 100 ? "bad" : "good" }];
      },
    },
    {
      id: "outage-cost",
      title: "Şebeke Kesinti Maliyeti Hesaplayıcı",
      desc: "Kesinti süresi ve saatlik kayıptan toplam maliyeti hesaplar.",
      fields: [
        { key: "kesintiSuresi", label: "Kesinti Süresi (saat)" },
        { key: "saatlikKayip", label: "Saatlik Kayıp (₺)" },
      ],
      compute: (v) => {
        const toplam = v.kesintiSuresi * v.saatlikKayip;
        return [{ label: "Toplam Kesinti Maliyeti", value: toplam.toLocaleString("tr-TR") + " ₺", tone: "bad" }];
      },
    },
  ],
  agri: [
    {
      id: "yield-cost",
      title: "Verim / Maliyet Hesaplayıcı",
      desc: "Birim maliyeti ve tahmini kârı hesaplar.",
      fields: [
        { key: "toplamMaliyet", label: "Toplam Maliyet (₺)" },
        { key: "uretimMiktari", label: "Üretim Miktarı (kg/ton)" },
        { key: "satisFiyati", label: "Birim Satış Fiyatı (₺)" },
      ],
      compute: (v) => {
        const birimMaliyet = v.toplamMaliyet / v.uretimMiktari;
        const kar = (v.satisFiyati - birimMaliyet) * v.uretimMiktari;
        return [
          { label: "Birim Maliyet", value: birimMaliyet.toFixed(2) + " ₺" },
          { label: "Tahmini Toplam Kâr", value: kar.toLocaleString("tr-TR") + " ₺", tone: kar < 0 ? "bad" : "good" },
        ];
      },
    },
    {
      id: "irrigation",
      title: "Sulama İhtiyaç Hesaplayıcı",
      desc: "Mevcut sulama kapasitesinin ihtiyacı karşılama oranını hesaplar.",
      fields: [
        { key: "mevcutKapasite", label: "Mevcut Kapasite (m³/gün)" },
        { key: "ihtiyac", label: "İhtiyaç (m³/gün)" },
      ],
      compute: (v) => {
        const oran = (v.mevcutKapasite / v.ihtiyac) * 100;
        return [{ label: "Karşılama Oranı", value: pct(oran), tone: oran < 100 ? "bad" : "good" }];
      },
    },
  ],
  other: [
    {
      id: "roi",
      title: "ROI Hesaplayıcı",
      desc: "Yatırım getirisini hesaplar.",
      fields: [
        { key: "yatirim", label: "Yatırım Tutarı (₺)" },
        { key: "getiri", label: "Getiri Tutarı (₺)" },
      ],
      compute: (v) => {
        const roi = ((v.getiri - v.yatirim) / v.yatirim) * 100;
        return [{ label: "ROI", value: pct(roi), tone: roi < 0 ? "bad" : "good" }];
      },
    },
    {
      id: "breakeven",
      title: "Break-even Hesaplayıcı",
      desc: "Başabaş noktasını hesaplar.",
      fields: [
        { key: "sabitMaliyet", label: "Sabit Maliyet (₺)" },
        { key: "birimFiyat", label: "Birim Fiyat (₺)" },
        { key: "birimDegiskenMaliyet", label: "Birim Değişken Maliyet (₺)" },
      ],
      compute: (v) => {
        const margin = v.birimFiyat - v.birimDegiskenMaliyet;
        const breakEven = margin > 0 ? v.sabitMaliyet / margin : NaN;
        return [
          {
            label: "Başabaş Noktası",
            value: Number.isFinite(breakEven) ? Math.ceil(breakEven).toLocaleString("tr-TR") + " birim" : "—",
            tone: !Number.isFinite(breakEven) ? "bad" : "neutral",
          },
        ];
      },
    },
  ],
};
