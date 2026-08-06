import type { SectorId } from "./sectors";

/**
 * Sektör bilgi paketi: modelin "iş alanında zeki" olmasını sağlayan
 * eşik değerler, maliyet katsayıları ve süreç normları.
 *
 * İlke: model sayı UYDURMAZ — sayısal tahmin gerekiyorsa ya operasyonel
 * verideki sayıları ya da buradaki katsayıları kullanır. Çarpma/projeksiyon
 * gibi hesaplar modele bırakılmaz; REFERANS HESAPLAR bölümünü bu dosyadaki
 * kod üretir, model hazır sonucu alıntılar.
 *
 * Değerler sektör ortalaması varsayılanlardır (dayanak her satırda yazar);
 * şirkete özel değerlerle güncellenmesi hedeflenir.
 */

export interface CostFactor {
  label: string;
  value: number;
  unit: string; // "€/dk", "TL/saat" gibi
  basis: string; // dayanak — bu sayı nereden geliyor
  /** Verilirse kod tarafında referans hesap üretilir: steps × value */
  reference?: { stepLabel: string; steps: number[] };
}

export interface KnowledgePack {
  thresholds: string[]; // eşikler ve kurallar
  costFactors: CostFactor[];
  norms: string[]; // süreç normları
}

const PACKS: Partial<Record<SectorId, KnowledgePack>> = {
  aviation: {
    thresholds: [
      "Dar gövde turnaround hedefi 45 dk; 60 dk üzeri gecikmeler rotasyonun sonraki bacaklarına yayılma eğilimindedir.",
      "CTOT (slot) toleransı -5/+10 dk; pencere kaçırılırsa yeni slot tipik olarak +30 dk ve üzeridir.",
      "İç hat transfer için minimum bağlantı süresi ~40 dk; altında kalan bağlantılar riskli sayılır.",
      "Tazminat eşiği (EU261/SHY-Yolcu): varışta 3 saat ve üzeri gecikme — uçuş mesafesine göre yolcu başı 250-600 €.",
      "Vardiya devri sırasında yer hizmeti kapasitesi geçici düşer (tipik 10-15 dk).",
    ],
    costFactors: [
      {
        label: "Rötar dakika maliyeti (dar gövde, tüm kalemler)",
        value: 100,
        unit: "€/dk",
        basis: "EUROCONTROL ortalama taktik gecikme maliyeti — sektör ortalaması varsayılan",
        reference: { stepLabel: "dk rötar", steps: [15, 30, 60] },
      },
      {
        label: "Rush (uçağa yetişmeyen transfer) bagaj işlem maliyeti",
        value: 50,
        unit: "€/bagaj",
        basis: "Sektör ortalaması varsayılan",
        reference: { stepLabel: "bagaj", steps: [14] },
      },
    ],
    norms: [
      "Turnaround kritik yolu çoğunlukla boarding'dir; bagaj ve yakıt paralel ilerler.",
      "Tek yakıt aracı iki uçağı sıralı besler: ikinci uçak için tipik ek bekleme 20-30 dk.",
      "Uzak park pozisyonu, körüklü kapıya göre boarding süresini tipik 10-15 dk uzatır (otobüs turu).",
    ],
  },
  manufacturing: {
    thresholds: [
      "Hurda oranında %2 üzeri sapma kök neden araştırması gerektirir.",
      "Montaj hattı beslemesinde 8 saatin altındaki stok kritik seviye kabul edilir.",
      "Ceza maddeli siparişlerde tipik gecikme cezası: sözleşme bedelinin haftalık %0,5-1'i.",
    ],
    costFactors: [
      {
        label: "Hat duruş maliyeti",
        value: 5000,
        unit: "TL/saat",
        basis: "Örnek varsayılan — şirket verisiyle güncellenmeli",
        reference: { stepLabel: "saat duruş", steps: [1, 4, 8] },
      },
      {
        label: "Sözleşme cezalı sipariş gecikme cezası",
        value: 6000,
        unit: "TL/gün gecikme",
        basis:
          "Sektör tipik/tahmini değer — sözleşme bedelinin haftalık %0,5-1'i eşiğinden türetilmiş günlük karşılık; gerçek sözleşme değeriyle güncellenmeli",
        reference: { stepLabel: "gün gecikme", steps: [1, 2, 3] },
      },
      {
        label: "Hurda (ıskarta) parça birim maliyeti",
        value: 350,
        unit: "TL/parça",
        basis: "Sektör tipik/tahmini değer — CNC işlenmiş parça malzeme+işçilik ortalaması",
        reference: { stepLabel: "ıskarta parça", steps: [5, 10] },
      },
      {
        label: "Hızlandırılmış (ekspres) tedarik/kaplama ek maliyeti",
        value: 20,
        unit: "% sipariş bedeli",
        basis: "Sektör tipik/tahmini değer — tedarikçi ekspres hizmet priminin ortalaması",
      },
      {
        label: "Fazla mesai (ek vardiya) işçilik maliyeti",
        value: 450,
        unit: "TL/saat",
        basis: "Sektör tipik/tahmini değer — normal ücretin ek mesai zammı dahil ortalaması",
        reference: { stepLabel: "saat fazla mesai", steps: [4, 8] },
      },
    ],
    norms: [
      "Darboğaz tezgahta kuyruk normalin 2 katını aşarsa teslim tarihleri yeniden planlanmalıdır.",
      "Operatör yoğunluğu ile hurda oranı koreledir; %95 üzeri doluluk kalite riskini artırır.",
    ],
  },
  logistics: {
    thresholds: [
      "AETR: kesintisiz sürüş max 4,5 saat, günlük sürüş max 9 saat; ihlal cezası ve güvenlik riski yüksektir.",
      "Soğuk zincirde sıcaklık payı aşılırsa yük sigorta kapsamı dışına çıkabilir.",
      "SLA kesim saatine 2 saatten az pay kalan teslimatlar kritik kabul edilir.",
    ],
    costFactors: [
      {
        label: "Araç bekleme/rölanti maliyeti",
        value: 400,
        unit: "TL/saat",
        basis: "Örnek varsayılan — şirket verisiyle güncellenmeli",
        reference: { stepLabel: "saat bekleme", steps: [2, 4] },
      },
      {
        label: "SLA kesim saati kaçırma cezası",
        value: 750,
        unit: "TL/teslimat",
        basis: "Sektör tipik/tahmini değer — kurumsal SLA sözleşmelerindeki tipik ceza maddesi ortalaması",
        reference: { stepLabel: "kaçırılan teslimat", steps: [6, 46] },
      },
      {
        label: "Soğuk zincir sıcaklık payı aşım fire maliyeti",
        value: 1200,
        unit: "TL/teslimat",
        basis: "Sektör tipik/tahmini değer — frigorifik yük bozulma/sigorta kapsam dışı kalma ortalaması",
        reference: { stepLabel: "frigorifik teslimat", steps: [6] },
      },
      {
        label: "AETR (sürücü süre) ihlali idari para cezası",
        value: 5000,
        unit: "TL/ihlal",
        basis: "Sektör tipik/tahmini değer — kara yolu taşımacılığı idari para cezası ortalaması",
      },
      {
        label: "Devir noktası (araç değişimi) ek operasyon maliyeti",
        value: 600,
        unit: "TL/devir",
        basis: "Sektör tipik/tahmini değer — buluşma noktası yakıt+zaman ek maliyeti ortalaması",
      },
    ],
    norms: [
      "Ana hat gecikmesi aktarma deposundaki dağıtım turlarına katlanarak yayılır (1 saat ana hat ≈ 2-3 saat ağ etkisi).",
      "Devir noktalı araç değişimi, sürücü süre ihlalinden her zaman daha ucuzdur.",
    ],
  },
  customerops: {
    thresholds: [
      "SLA hedefi tipik %80/45sn (çağrıların %80'i 45 saniyede yanıt); anlık %50 altı eskalasyon gerektirir.",
      "İptal talebi oranı normalin 2 katını aşarsa churn alarmı kabul edilir.",
      "AHT'de %15 üzeri artış sistemik neden (uygulama/altyapı) işaretidir, temsilci performansı değil.",
    ],
    costFactors: [
      {
        label: "Kaybedilen müşteri başına tipik yıllık gelir kaybı",
        value: 2500,
        unit: "TL/müşteri",
        basis: "Örnek varsayılan — şirket verisiyle güncellenmeli",
      },
      {
        label: "Terk edilen (kuyrukta vazgeçilen) çağrı fırsat maliyeti",
        value: 180,
        unit: "TL/çağrı",
        basis: "Sektör tipik/tahmini değer — kayıp işlem ve yeniden çağrı operasyon maliyeti ortalaması",
        reference: { stepLabel: "terk çağrı", steps: [12, 84] },
      },
      {
        label: "Ek (takviye) temsilci vardiya maliyeti",
        value: 350,
        unit: "TL/saat",
        basis: "Sektör tipik/tahmini değer — fazla mesai/geçici takviye ücreti ortalaması",
        reference: { stepLabel: "saat takviye", steps: [1, 2] },
      },
      {
        label: "SLA hedefi altı yanıt dakikası başına itibar/ceza maliyeti",
        value: 400,
        unit: "TL/dk aşım",
        basis: "Sektör tipik/tahmini değer — kurumsal SLA sözleşmelerindeki ceza/itibar kaybı ortalaması",
        reference: { stepLabel: "dk SLA aşımı", steps: [4] },
      },
    ],
    norms: [
      "Kesim günü pikleri öngörülebilirdir; vardiya planı pik saatine göre 1 saat önceden takviye edilmelidir.",
      "Yetkinlik darboğazında (teknik kuyruk) genel takviye işe yaramaz; çapraz eğitimli temsilci gerekir.",
    ],
  },
  retail: {
    thresholds: [
      "Kampanya ürününde kalan stok / günlük satış hızı < 2 gün ise stockout riski kritiktir.",
      "Stockout durumunda ikame ürüne dönüş tipik %30-35; kalan talep kaybedilir.",
    ],
    costFactors: [
      {
        label: "Hızlandırılmış tedarik ek maliyeti",
        value: 18,
        unit: "% sipariş bedeli",
        basis: "Örnek varsayılan — tedarikçi sözleşmesine göre güncellenmeli",
      },
    ],
    norms: ["Depolar arası dengeleme (1 gün), mağazalar arası transferden (2+ gün) her zaman önce değerlendirilmelidir."],
  },
  finance: {
    thresholds: [
      "30+ gün gecikme oranında 6 haftada %30 üzeri artış erken müdahale eşiğidir.",
      "Kısmi ödeme davranışındaki artış, tam temerrüdün öncü göstergesidir (tipik 2-3 ay önden).",
      "Erken yeniden yapılandırmada kurtarma oranı, geç kalınana göre yaklaşık 2 kat yüksektir.",
    ],
    costFactors: [],
    norms: ["Konsantrasyon limiti %85 üzerindeyken aynı sektöre yeni risk alınması limit ihlali doğurabilir."],
  },
  health: {
    thresholds: [
      "Yoğun bakım doluluğu %85 üzeri: elektif vaka planı gözden geçirilmeli; %90 üzeri: sevk/taburcu aksiyonu şart.",
      "Viral dalga gecelerinde 02:00-05:00 arası ek yoğun bakım talebi tipik 2-3 hastadır.",
    ],
    costFactors: [],
    norms: [
      "Taburcu edilebilir hastaların sabah vizitesi beklenmeden değerlendirilmesi, en hızlı kapasite kazanım yoludur.",
      "Ek çağrı personelinin ulaşım süresi kapasiteye dahil edilmeden plan yapılmaz.",
    ],
  },
  energy: {
    thresholds: [
      "Trafo %95 üzeri yükte soğutma arızası varsa termal alarm riski yüksektir; geçmişte benzer durum kesintiyle sonuçlanmıştır.",
      "Kritik yük (hastane, veri merkezi) barındıran bölgede planlı kesinti son çaredir.",
    ],
    costFactors: [
      {
        label: "Spot piyasadan pik saat ek tedarik primi",
        value: 34,
        unit: "% baz fiyat",
        basis: "Güncel piyasa verisi girilmeli — örnek değer",
      },
    ],
    norms: ["Yük aktarımı manevrası ekip sahaya varmadan başlatılamaz; ekip yol süresi karar zamanlamasının parçasıdır."],
  },
  agri: {
    thresholds: [
      "Yağış öncesi hasat penceresi: kalan alan / günlük biçerdöver kapasitesi hesabı yağıştan 1 gün önce tamamlanacak şekilde planlanır.",
      "Nemli hasatta (%14 üzeri) kurutma maliyeti +%40, fire +%3 civarındadır.",
      "Yağış sonrası hasatta tarla kaybı geçmişte %8-12 aralığında gerçekleşmiştir.",
    ],
    costFactors: [
      {
        label: "Yağış sonrası hasat edilemeyen parsel kaybı",
        value: 9500,
        unit: "TL/ha",
        basis:
          "Sektör tipik/tahmini değer — kaybedilen ürün bedeli ortalaması, bölgeye/ürüne göre güncellenmeli",
        reference: { stepLabel: "ha kaybedilen parsel", steps: [35, 70, 240] },
      },
      {
        label: "Nemli hasat kurutma ek maliyeti",
        value: 400,
        unit: "TL/ton",
        basis:
          "Sektör tipik/tahmini değer — enerji ve işçilik ek yükü ortalaması (nemli hasatta +%40 kurutma maliyeti eşiğine karşılık gelir)",
        reference: { stepLabel: "ton nemli ürün", steps: [90] },
      },
      {
        label: "Gece vardiyası ek işçilik/aydınlatma maliyeti",
        value: 300,
        unit: "TL/saat",
        basis: "Sektör tipik/tahmini değer — gece vardiyası zammı ve jeneratör/aydınlatma ek maliyeti ortalaması",
        reference: { stepLabel: "saat gece vardiyası", steps: [8] },
      },
    ],
    norms: ["Gece vardiyası yalnızca aydınlatmalı makinelerle planlanabilir."],
  },
  other: {
    thresholds: [
      "Cezalı teslimde gecikme maliyeti tipik sözleşme bedelinin %5'i mertebesindedir.",
      "Ekip doluluğu %90 üzerindeyken yeni taahhüt, mevcut teslim tarihlerini riske atar.",
    ],
    costFactors: [],
    norms: ["Ortak bileşen içeren projelerde önce ortak bileşen tamamlanır (iki teslimi birden açar)."],
  },
};

function formatNumber(n: number): string {
  return n.toLocaleString("tr-TR");
}

/**
 * Sektörün bilgi paketini prompt'a girecek metin bloğuna çevirir.
 * REFERANS HESAPLAR bölümündeki çarpımlar burada, kodda yapılır —
 * model hazır sonucu alıntılar, kendisi hesap yapmaz.
 */
export function buildKnowledgeBlock(sectorId: SectorId): string {
  const pack = PACKS[sectorId] ?? PACKS.other;
  if (!pack) return "";

  const parts: string[] = [];

  if (pack.thresholds.length > 0) {
    parts.push("Eşikler ve kurallar:\n" + pack.thresholds.map((t) => `- ${t}`).join("\n"));
  }

  if (pack.costFactors.length > 0) {
    parts.push(
      "Maliyet katsayıları (dayanağıyla):\n" +
        pack.costFactors
          .map((f) => `- ${f.label}: ${formatNumber(f.value)} ${f.unit} (${f.basis})`)
          .join("\n")
    );

    const refs = pack.costFactors
      .filter((f) => f.reference)
      .flatMap((f) =>
        f.reference!.steps.map((s) => {
          const total = s * f.value;
          const currency = f.unit.split("/")[0];
          return `- ${s} ${f.reference!.stepLabel} ≈ ${formatNumber(total)} ${currency} (${s} × ${formatNumber(f.value)} ${f.unit} — ${f.label})`;
        })
      );
    if (refs.length > 0) {
      parts.push("REFERANS HESAPLAR (kod tarafından hesaplandı, doğrudan alıntılanabilir):\n" + refs.join("\n"));
    }
  }

  if (pack.norms.length > 0) {
    parts.push("Süreç normları:\n" + pack.norms.map((n) => `- ${n}`).join("\n"));
  }

  return parts.join("\n\n");
}
