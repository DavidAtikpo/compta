export type VatInvoiceRow = {
  invoiceType: string | null;
  montantHT: number | null;
  montantTVA: number | null;
  montantTTC: number | null;
  tauxTVA: number | null;
  invoiceDate: Date | string | null;
  createdAt: Date | string;
};

export type VatRateBreakdown = {
  rate: number;
  baseHT: number;
  tva: number;
};

export type VatDeclaration = {
  type: "CA3" | "CA12";
  periodStart: string;
  periodEnd: string;
  year: number;
  month?: number;
  /** TVA collectée (ventes) */
  tvaCollectee: number;
  /** TVA déductible (achats) */
  tvaDeductible: number;
  /** Solde à payer (>0) ou crédit (<0) */
  solde: number;
  baseHTVentes: number;
  baseHTAchats: number;
  byRate: VatRateBreakdown[];
  lineCA3: {
    ligne08_tvaBrute: number;
    ligne16_tvaDeductible: number;
    ligne23_solde: number;
  };
};

function toDate(d: Date | string | null, fallback: Date | string): Date {
  const raw = d ?? fallback;
  return raw instanceof Date ? raw : new Date(raw);
}

function amountsFromRow(row: VatInvoiceRow): { ht: number; tva: number; ttc: number; rate: number } {
  const ttc = row.montantTTC ?? 0;
  let ht = row.montantHT ?? 0;
  let tva = row.montantTVA ?? 0;
  let rate = row.tauxTVA ?? 20;

  if (ht <= 0 && tva <= 0 && ttc > 0) {
    ht = ttc / (1 + rate / 100);
    tva = ttc - ht;
  } else if (ht > 0 && tva <= 0 && ttc > ht) {
    tva = ttc - ht;
    rate = ht > 0 ? Math.round((tva / ht) * 10000) / 100 : rate;
  }

  return { ht, tva, ttc: ttc || ht + tva, rate };
}

export function computeVatDeclaration(
  invoices: VatInvoiceRow[],
  opts: { year: number; month?: number; type?: "CA3" | "CA12" },
): VatDeclaration {
  const type = opts.type ?? (opts.month != null ? "CA3" : "CA12");
  const year = opts.year;

  let periodStart: Date;
  let periodEnd: Date;

  if (type === "CA12") {
    periodStart = new Date(Date.UTC(year, 0, 1));
    periodEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  } else {
    const month = opts.month ?? new Date().getUTCMonth() + 1;
    periodStart = new Date(Date.UTC(year, month - 1, 1));
    periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  }

  const inPeriod = invoices.filter((inv) => {
    const dt = toDate(inv.invoiceDate, inv.createdAt);
    return dt >= periodStart && dt <= periodEnd;
  });

  let tvaCollectee = 0;
  let tvaDeductible = 0;
  let baseHTVentes = 0;
  let baseHTAchats = 0;
  const rateMap = new Map<number, { baseHT: number; tva: number }>();

  for (const inv of inPeriod) {
    const isVente = String(inv.invoiceType ?? "achat").toLowerCase() === "vente";
    const { ht, tva, rate } = amountsFromRow(inv);
    const bucket = rateMap.get(rate) ?? { baseHT: 0, tva: 0 };
    bucket.baseHT += ht;
    bucket.tva += tva;
    rateMap.set(rate, bucket);

    if (isVente) {
      tvaCollectee += tva;
      baseHTVentes += ht;
    } else {
      tvaDeductible += tva;
      baseHTAchats += ht;
    }
  }

  const solde = Math.round((tvaCollectee - tvaDeductible) * 100) / 100;
  const byRate = [...rateMap.entries()]
    .map(([rate, v]) => ({ rate, baseHT: Math.round(v.baseHT * 100) / 100, tva: Math.round(v.tva * 100) / 100 }))
    .sort((a, b) => b.rate - a.rate);

  return {
    type,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    year,
    month: type === "CA3" ? (opts.month ?? periodStart.getUTCMonth() + 1) : undefined,
    tvaCollectee: Math.round(tvaCollectee * 100) / 100,
    tvaDeductible: Math.round(tvaDeductible * 100) / 100,
    solde,
    baseHTVentes: Math.round(baseHTVentes * 100) / 100,
    baseHTAchats: Math.round(baseHTAchats * 100) / 100,
    byRate,
    lineCA3: {
      ligne08_tvaBrute: Math.round(tvaCollectee * 100) / 100,
      ligne16_tvaDeductible: Math.round(tvaDeductible * 100) / 100,
      ligne23_solde: solde,
    },
  };
}
