export type SectorId =
  | "aviation"
  | "customerops"
  | "agri"
  | "manufacturing"
  | "retail"
  | "logistics"
  | "finance"
  | "health"
  | "energy"
  | "other";

export interface RiskCategory {
  id: string;
  label: string;
  sources: string[];
  outputExample: string;
}

export interface Sector {
  id: SectorId;
  label: string;
  description: string;
  icon: string;
  riskCategories: RiskCategory[];
  dataSources: string[];
}

export const SECTORS: Sector[] = [
  {
    id: "aviation",
    label: "Havacılık",
    description: "Havayolu, yer hizmetleri, havalimanı operasyonları",
    icon: "✈️",
    riskCategories: [
      {
        id: "turnaround-delay",
        label: "Turnaround Gecikme Riski",
        sources: ["Boarding ilerlemesi", "Bagaj yükleme", "Yakıt ikmali", "Catering", "Ekip hazırlığı", "Kapı aktivitesi"],
        outputExample: "TK-2043 için önlenebilir turnaround gecikmesi riski oluşuyor.",
      },
      {
        id: "delay-propagation",
        label: "Gecikme Zinciri Riski",
        sources: ["Rotasyon planı", "Slot pencereleri", "Kapı çakışmaları", "Ağ etkisi"],
        outputExample: "Tek uçak gecikmesi akşam rotasyonunda 4 uçuşu etkileyebilir.",
      },
      {
        id: "crew-disruption",
        label: "Ekip Kesinti Riski",
        sources: ["Görev süresi limitleri", "Ekip uygunluğu", "Bağlantı uçuşları"],
        outputExample: "Kokpit ekibi görev süresi limiti yaklaşan uçuşlar var.",
      },
      {
        id: "ground-ops",
        label: "Yer Operasyonu Riski",
        sources: ["Ekipman durumu", "Ekip vardiyaları", "Meydan yoğunluğu", "Meteoroloji"],
        outputExample: "Yer hizmetleri kapasitesi pik saatte talebin altında kalabilir.",
      },
    ],
    dataSources: [
      "DCS / Yolcu Sistemleri (Amadeus Altéa/SITA)",
      "Operasyon Kontrol Sistemi (OCC)",
      "Yer Hizmetleri Sistemi (BRS/Ramp)",
      "ACARS/OOOI Verisi",
      "Meteoroloji (METAR/TAF)",
      "Bakım Sistemi (AMOS/TRAX)",
    ],
  },
  {
    id: "customerops",
    label: "Müşteri Operasyonları",
    description: "Çağrı merkezi, müşteri hizmetleri, telesatış, tahsilat",
    icon: "🎧",
    riskCategories: [
      { id: "queue-saturation", label: "Queue Saturation Risk", sources: ["SLA", "ASA", "AWT", "Occupancy"], outputExample: "Kuyruk doygunluk riski artıyor." },
      { id: "customer-experience", label: "Customer Experience Risk", sources: ["CSAT", "FCR", "NPS"], outputExample: "Müşteri deneyimi riski oluşuyor." },
      { id: "revenue", label: "Revenue Risk", sources: ["Conversion Rate", "Lead Response Time", "Sales Performance"], outputExample: "Gelir kaybı riski oluşuyor." },
      { id: "agent-burnout", label: "Agent Burnout Risk", sources: ["Occupancy", "ACW", "Attrition"], outputExample: "Temsilci tükenmişlik riski yükseliyor." },
    ],
    dataSources: [
      "Çağrı Merkezi Sistemi (Genesys/Avaya/Five9/Amazon Connect)",
      "CRM (Salesforce/HubSpot/Zoho/Dynamics)",
      "Workforce Management",
      "AI Speech Analytics",
    ],
  },
  {
    id: "agri",
    label: "Tarım & Gıda",
    description: "Çiftçilik, kooperatif, gıda işleme",
    icon: "🌾",
    riskCategories: [
      { id: "yield", label: "Verim Riski", sources: ["Uydu görüntüleri", "Saha raporları", "Geçmiş hasat verisi"], outputExample: "Bu bölgede verim riski artıyor." },
      { id: "drought", label: "Kuraklık / Su Riski", sources: ["Meteoroloji (MGM)", "Sulama kayıtları", "Toprak nemi sensörleri"], outputExample: "Sulama kapasitesi mevcut ihtiyacın altında kalabilir." },
      { id: "market", label: "Pazar Riski", sources: ["Hal fiyatları", "İhracat talebi", "Rakip bölge üretimi"], outputExample: "Fiyat baskısı önümüzdeki hasat döneminde artabilir." },
      { id: "profitability", label: "Kârlılık Riski", sources: ["Girdi maliyetleri", "Beklenen verim", "Satış fiyatları"], outputExample: "Girdi maliyetleri kârlılığı baskılıyor." },
    ],
    dataSources: ["MGM Meteoroloji API", "Sentinel Uydu Verisi", "Toprak Sensörleri", "Hal Fiyat Verileri"],
  },
  {
    id: "manufacturing",
    label: "Üretim & Sanayi",
    description: "İmalat, fabrika, tedarik zinciri",
    icon: "🏭",
    riskCategories: [
      { id: "production-delay", label: "Üretim Gecikme Riski", sources: ["Üretim hızı", "Sipariş yoğunluğu", "Hat performansı"], outputExample: "Üretim gecikme riski oluşuyor." },
      { id: "bottleneck", label: "Darboğaz Riski", sources: ["Çevrim süreleri", "İş merkezi yoğunluğu"], outputExample: "Darboğaz riski oluşuyor." },
      { id: "equipment", label: "Ekipman Riski", sources: ["Arıza trendleri", "Bakım gecikmeleri"], outputExample: "Ekipman riski yükseliyor." },
      { id: "quality", label: "Kalite Riski", sources: ["Hata oranları", "Hurda oranları"], outputExample: "Kalite riski oluşuyor." },
    ],
    dataSources: ["ERP", "MES", "SCADA/PLC", "Bakım Yönetim Sistemi", "Kalite Sistemi"],
  },
  {
    id: "retail",
    label: "Perakende & Ticaret",
    description: "Mağaza, e-ticaret, toptan satış",
    icon: "🛒",
    riskCategories: [
      { id: "inventory", label: "Stok Riski", sources: ["Stok seviyeleri", "Satış hızı", "Tedarik süreleri"], outputExample: "Stok tükenme riski oluşuyor." },
      { id: "revenue", label: "Gelir Riski", sources: ["Satış performansı", "Ürün kullanılabilirliği"], outputExample: "Gelir kaybı riski oluşuyor." },
      { id: "supply-chain", label: "Tedarik Zinciri Riski", sources: ["Sevkiyat performansı", "Depo kapasitesi"], outputExample: "Tedarik zinciri baskısı oluşuyor." },
      { id: "customer-experience", label: "Müşteri Deneyimi Riski", sources: ["Şikayetler", "İade oranları"], outputExample: "Müşteri deneyimi riski oluşuyor." },
    ],
    dataSources: ["ERP", "POS", "CRM", "WMS", "E-Ticaret Sistemi"],
  },
  {
    id: "logistics",
    label: "Lojistik & Ulaşım",
    description: "Nakliye, depolama, dağıtım",
    icon: "🚚",
    riskCategories: [
      { id: "capacity", label: "Kapasite Riski", sources: ["Araç doluluk oranları", "Bekleyen yükler"], outputExample: "Kapasite baskısı oluşuyor." },
      { id: "delivery-delay", label: "Teslimat Gecikme Riski", sources: ["ETA sapmaları", "Transit süreleri"], outputExample: "Teslimat gecikme riski yükseliyor." },
      { id: "carrier-network", label: "Taşıyıcı Ağı Riski", sources: ["Taşıyıcı performansı", "İptal trendleri"], outputExample: "Taşıyıcı ağı baskı altında." },
      { id: "margin", label: "Kârlılık Riski", sources: ["Boş kilometre", "Yakıt maliyetleri"], outputExample: "Kârlılık baskısı oluşuyor." },
    ],
    dataSources: ["TMS", "WMS", "GPS/Telematik", "Carrier Network", "ERP"],
  },
  {
    id: "finance",
    label: "Finans & Bankacılık",
    description: "Banka, sigorta, yatırım",
    icon: "🏛️",
    riskCategories: [
      { id: "credit", label: "Kredi Riski", sources: ["Tahsilat performansı", "Gecikme oranları"], outputExample: "Kredi portföyünde tahsilat riski artıyor." },
      { id: "liquidity", label: "Likidite Riski", sources: ["Nakit pozisyonu", "Vade uyumsuzluğu"], outputExample: "Likidite baskısı oluşuyor." },
      { id: "compliance", label: "Uyum Riski", sources: ["Denetim bulguları", "Mevzuat değişiklikleri"], outputExample: "Uyum riski yükseliyor." },
      { id: "market-exposure", label: "Piyasa Riski", sources: ["Faiz/kur hareketleri", "Portföy dağılımı"], outputExample: "Piyasa dalgalanmaları portföyü etkileyebilir." },
    ],
    dataSources: ["Core Banking", "CRM", "Risk Yönetim Sistemi", "Piyasa Veri Sağlayıcıları"],
  },
  {
    id: "health",
    label: "Sağlık",
    description: "Hastane, klinik, ilaç",
    icon: "❤️",
    riskCategories: [
      { id: "capacity", label: "Kapasite Riski", sources: ["Yatak doluluğu", "Randevu yoğunluğu"], outputExample: "Kapasite baskısı oluşuyor." },
      { id: "staffing", label: "Personel Riski", sources: ["Vardiya kapsamı", "Devamsızlık"], outputExample: "Personel yetersizliği riski yükseliyor." },
      { id: "supply", label: "Malzeme/İlaç Tedarik Riski", sources: ["Stok seviyeleri", "Tedarikçi teslim süreleri"], outputExample: "Kritik malzeme tükenme riski oluşuyor." },
      { id: "quality", label: "Bakım Kalitesi Riski", sources: ["Komplikasyon oranları", "Hasta memnuniyeti"], outputExample: "Bakım kalitesi göstergelerinde sapma oluşuyor." },
    ],
    dataSources: ["HBYS", "Laboratuvar Sistemleri", "Eczane/Stok Sistemi", "Randevu Sistemi"],
  },
  {
    id: "energy",
    label: "Enerji",
    description: "Elektrik, yenilenebilir, doğalgaz",
    icon: "⚡",
    riskCategories: [
      { id: "supply-demand", label: "Arz-Talep Dengesi Riski", sources: ["Tüketim tahmini", "Üretim kapasitesi"], outputExample: "Talep tahminin üzerinde seyrediyor." },
      { id: "grid", label: "Şebeke Riski", sources: ["Arıza kayıtları", "Bakım programı"], outputExample: "Şebeke arıza riski yükseliyor." },
      { id: "price-volatility", label: "Fiyat Oynaklığı Riski", sources: ["Spot piyasa fiyatları", "Yakıt maliyetleri"], outputExample: "Fiyat oynaklığı marjları baskılıyor." },
      { id: "regulatory", label: "Regülasyon Riski", sources: ["Mevzuat takibi", "Denetim bulguları"], outputExample: "Yeni regülasyon uyum riski oluşturuyor." },
    ],
    dataSources: ["SCADA", "Enerji Yönetim Sistemi (EMS)", "Piyasa Veri Sağlayıcıları"],
  },
  {
    id: "other",
    label: "Diğer",
    description: "Hizmet, teknoloji ve diğerleri",
    icon: "🌐",
    riskCategories: [
      { id: "operational", label: "Operasyonel Risk", sources: ["Süreç verileri", "SLA performansı"], outputExample: "Operasyonel performansta sapma oluşuyor." },
      { id: "financial", label: "Finansal Risk", sources: ["Nakit akışı", "Gelir/gider"], outputExample: "Finansal baskı sinyalleri artıyor." },
      { id: "customer", label: "Müşteri Riski", sources: ["Memnuniyet skorları", "Churn oranı"], outputExample: "Müşteri kaybı riski yükseliyor." },
      { id: "people", label: "İnsan Kaynağı Riski", sources: ["Kapasite", "Devir oranı"], outputExample: "Ekip kapasitesinde baskı oluşuyor." },
    ],
    dataSources: ["ERP", "CRM", "Muhasebe/Finans Sistemi"],
  },
];

export function getSector(id: string | null | undefined): Sector | undefined {
  return SECTORS.find((s) => s.id === id);
}

export function getKpiFields(sector: Sector): string[] {
  const seen = new Set<string>();
  for (const rc of sector.riskCategories) {
    for (const source of rc.sources) seen.add(source);
  }
  return [...seen];
}
