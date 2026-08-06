import type { SectorId } from "./sectors";

/**
 * Canlı kısıt modeli: ABYS bir aksiyon önermeden önce bu kısıtlara
 * bakar ve gerçekçi olmayan seçenekleri eler ya da gerekçesiyle
 * "uygulanamaz" olarak işaretler. Kısıtlar sektöre göre şablonla gelir,
 * kullanıcı kendi operasyonuna göre düzenleyebilir.
 */

export interface Constraint {
  id: string;
  label: string;
  value: string;
  note?: string;
}

const KEY_PREFIX = "abys.constraints.";

export const CONSTRAINT_TEMPLATES: Partial<Record<SectorId, Constraint[]>> = {
  aviation: [
    { id: "ground-teams", label: "Müsait yer hizmetleri ekibi", value: "2 ekip (1 bagaj, 1 temizlik)", note: "Vardiya 22:00'de değişiyor" },
    { id: "gates", label: "Kapı kapasitesi", value: "3 uzak park pozisyonu boş, körüklü kapı yok" },
    { id: "crew-duty", label: "Ekip görev süresi limiti", value: "Kokpit ekibi max 2 saat ek görev alabilir", note: "SHGM görev süresi mevzuatı" },
    { id: "fueling", label: "Yakıt ikmal aracı", value: "1 araç aktif, ikincisi bakımda" },
    { id: "deice", label: "De-ice kapasitesi", value: "Mevsimsel — şu an aktif değil" },
    { id: "sla", label: "Yer hizmeti SLA", value: "Turnaround hedefi 45 dk (dar gövde)" },
  ],
  manufacturing: [
    { id: "shifts", label: "Vardiya kapasitesi", value: "2 vardiya aktif, 3. vardiya için personel yok" },
    { id: "machines", label: "Kritik tezgah durumu", value: "CNC-3 planlı bakımda (48 saat)" },
    { id: "overtime", label: "Fazla mesai limiti", value: "Haftalık max 6 saat/kişi", note: "Toplu sözleşme sınırı" },
    { id: "materials", label: "Hammadde teslim süresi", value: "Kritik alaşım tedariki min 2 hafta" },
    { id: "quality-gate", label: "Kalite kontrol zorunluluğu", value: "Sevkiyat öncesi %100 kontrol atlanamaz" },
  ],
  logistics: [
    { id: "fleet", label: "Müsait araç", value: "4 çekici boşta, 2'si D-100 güzergâhında" },
    { id: "drivers", label: "Sürücü çalışma saati", value: "AETR: kalan sürüş süreleri kritik seviyede" },
    { id: "warehouse", label: "Depo kapasitesi", value: "Ana depo %92 dolu" },
    { id: "cold-chain", label: "Soğuk zincir aracı", value: "1 frigorifik araç müsait" },
  ],
  customerops: [
    { id: "agents", label: "Müsait temsilci", value: "34 temsilci vardiyada, 3'ü eğitimde" },
    { id: "overtime", label: "Fazla mesai bütçesi", value: "Bu ay %80'i kullanıldı" },
    { id: "skills", label: "Yetkinlik kısıtı", value: "Teknik destek kuyruğuna sadece 8 temsilci bakabiliyor" },
    { id: "wfm", label: "Vardiya değişiklik kuralı", value: "Vardiya değişimi min 24 saat önce bildirilmeli" },
  ],
  retail: [
    { id: "stock-transfer", label: "Mağazalar arası transfer süresi", value: "Min 2 gün" },
    { id: "supplier-moq", label: "Tedarikçi minimum sipariş", value: "Ana tedarikçi MOQ: 500 adet" },
    { id: "staff", label: "Mağaza personeli", value: "Hafta sonu ek personel havuzu dolu" },
    { id: "budget", label: "Kampanya bütçesi", value: "Çeyrek bütçesinin %90'ı kullanıldı" },
  ],
  finance: [
    { id: "limits", label: "Risk limitleri", value: "Sektörel konsantrasyon limiti %85 dolulukta" },
    { id: "regulation", label: "Regülasyon", value: "BDDK raporlama dönemi — portföy değişiklikleri kayıt altında" },
    { id: "liquidity-buffer", label: "Likidite tamponu", value: "Zorunlu tampon altına inilemez" },
  ],
  health: [
    { id: "beds", label: "Yatak kapasitesi", value: "Yoğun bakım %88 dolu" },
    { id: "staff", label: "Nöbet kadrosu", value: "Gece vardiyasında 2 uzman, ek çağrı listesi 1 kişi" },
    { id: "regulation", label: "Mevzuat", value: "Hemşire/hasta oranı yasal sınırın altına inemez" },
  ],
  energy: [
    { id: "capacity", label: "Üretim kapasitesi", value: "Santral B planlı bakımda (5 gün)" },
    { id: "grid", label: "Şebeke kısıtı", value: "Trafo T-4 %95 yükte, ek yük bağlanamaz" },
    { id: "regulation", label: "EPDK bildirimi", value: "Plansız kesinti 24 saat içinde raporlanmalı" },
  ],
  agri: [
    { id: "water", label: "Sulama kotası", value: "Baraj kotası nedeniyle haftalık su tahsisi sınırlı" },
    { id: "labor", label: "Mevsimlik işçi", value: "Hasat dönemine kadar ek işçi bulunamıyor" },
    { id: "machinery", label: "Makine parkı", value: "1 biçerdöver bakımda" },
  ],
  other: [
    { id: "budget", label: "Bütçe", value: "Çeyrek bütçesi sınırlı, ek harcama onay gerektirir" },
    { id: "staff", label: "Ekip kapasitesi", value: "Ekip mevcut projelerle %90 dolulukta" },
    { id: "sla", label: "SLA taahhütleri", value: "Mevcut müşteri SLA'ları önceliklidir" },
  ],
};

export function getConstraints(sectorId: SectorId): Constraint[] {
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(KEY_PREFIX + sectorId);
    if (raw) {
      try {
        return JSON.parse(raw) as Constraint[];
      } catch {
        // düşmüş kayıt — şablona dön
      }
    }
  }
  return CONSTRAINT_TEMPLATES[sectorId] ?? CONSTRAINT_TEMPLATES.other ?? [];
}

export function saveConstraints(sectorId: SectorId, constraints: Constraint[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_PREFIX + sectorId, JSON.stringify(constraints));
}

export function constraintsToPrompt(constraints: Constraint[]): string {
  return constraints.map((c) => `- ${c.label}: ${c.value}${c.note ? ` (${c.note})` : ""}`).join("\n");
}
