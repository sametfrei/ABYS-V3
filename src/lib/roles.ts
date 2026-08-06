export type RoleId = "ceo" | "finance" | "hr" | "operations" | "bizdev" | "product";

export interface Role {
  id: RoleId;
  label: string;
  tagline: string;
  description: string;
  placeholder: string;
  focus: string;
}

export const ROLES: Role[] = [
  {
    id: "ceo",
    label: "CEO",
    tagline: "Şirket geneli stratejik görünüm",
    description:
      "Company health, biggest risks, capital allocation signals. The 30,000-foot view that actually means something.",
    placeholder:
      "Örn: Bu çeyrek gelir %8 arttı ama nakit akışı daralıyor, iki büyük müşteri sözleşme yenilemesi bekliyor...",
    focus:
      "Genel şirket sağlığı, en büyük riskler, sermaye tahsisi kararları. Yönetim kurulunun bilmesi gereken tek şey.",
  },
  {
    id: "finance",
    label: "Finance",
    tagline: "Marj, nakit, maliyet yapısı",
    description:
      "Spot margin compression early. Model breakeven, ROI, and cost structures before committing.",
    placeholder:
      "Örn: Brüt marj geçen yıla göre 3 puan düştü, tedarik maliyetleri arttı, yeni yatırımın geri dönüş süresi belirsiz...",
    focus: "Marj daralması, nakit akışı, breakeven ve ROI hesapları.",
  },
  {
    id: "hr",
    label: "HR",
    tagline: "İnsan, kapasite, tükenmişlik",
    description:
      "Catch overload signals before they turn into attrition. Workload heatmaps and capacity drift.",
    placeholder:
      "Örn: Operasyon ekibinde son 2 ayda 3 kişi işten ayrıldı, kalanların mesai saatleri artıyor...",
    focus: "İş yükü, tükenmişlik sinyalleri, kapasite kayması, işten ayrılma riski.",
  },
  {
    id: "operations",
    label: "Operations",
    tagline: "Teslimat hızı, darboğaz, kaynaklar",
    description:
      "Cycle time, blockers, the single stage where everything piles up. The system view of throughput.",
    placeholder:
      "Örn: Teslimat süreleri son ayda %20 uzadı, kalite kontrol aşamasında birikme var...",
    focus: "Döngü süresi, darboğazlar, tek bir aşamada yığılma, verimlilik.",
  },
  {
    id: "bizdev",
    label: "Business Development",
    tagline: "Pipeline, anlaşma kalitesi, momentum",
    description:
      "Coverage, win rate, deal-size trends. Where the next quarter is actually going to land.",
    placeholder:
      "Örn: Pipeline'da 40 fırsat var ama kazanma oranı geçen çeyreğe göre düştü, ortalama anlaşma büyüklüğü küçüldü...",
    focus: "Pipeline kapsamı, kazanma oranı, anlaşma büyüklüğü trendleri.",
  },
  {
    id: "product",
    label: "Product / Tech",
    tagline: "Teknik borç, sistem stabilitesi, kalite",
    description:
      "Where rework is concentrated, which modules eat the most bug volume, and what to refactor first.",
    placeholder:
      "Örn: Ödeme modülünde son 3 sprint'te tekrarlanan hatalar var, teknik borç birikiyor...",
    focus: "Teknik borç yoğunlaşması, en çok hata üreten modüller, öncelikli refactor alanları.",
  },
];

export function getRole(id: string | null | undefined): Role | undefined {
  return ROLES.find((r) => r.id === id);
}
