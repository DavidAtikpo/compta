import {
  CATEGORY_TO_ACCOUNT,
  categoryFromAccountCode,
  normalizeAccountNum,
} from "@/lib/pcg";

/** Applique compte PCG + catégorie déduite depuis l'extraction OCR/IA */
export function resolveClassificationFromExtract(extracted: Record<string, unknown>): {
  accountCode: string | null;
  category: string;
} {
  const rawCode =
    (extracted.compteComptable as string | null | undefined) ??
    (extracted.accountCode as string | null | undefined) ??
    null;
  const accountCode = normalizeAccountNum(rawCode);

  const rawCategory = extracted.category as string | null | undefined;
  if (rawCategory && CATEGORY_TO_ACCOUNT[rawCategory]) {
    const mapped = CATEGORY_TO_ACCOUNT[rawCategory];
    return { accountCode: accountCode ?? mapped.num, category: rawCategory };
  }

  if (accountCode) {
    return { accountCode, category: categoryFromAccountCode(accountCode) };
  }

  return { accountCode: null, category: "Autre" };
}

/** Règles OCR locales (même logique que extract route) */
export function pickAccountingCodeFromText(text: string): string | null {
  const t = String(text || "").toLowerCase();
  if (/(honoraires?|avocat|juridique|expert[-\s]?comptable|consultant|conseil)/i.test(t)) return "622600";
  if (/(hotel|h[ôo]tel|uber|taxi|train|sncf|avion|parking|peage|péage|carburant)/i.test(t)) return "625100";
  if (/(telephone|t[ée]l[ée]phone|internet|fibre|box|mobile|forfait|t[ée]l[ée]com)/i.test(t)) return "626000";
  if (/(banque|frais\s+bancaires?|commission\s+bancaire|cb\s+pro|carte\s+bancaire)/i.test(t)) return "627000";
  if (/(entretien|maintenance|r[ée]paration|depannage|d[ée]pannage)/i.test(t)) return "615000";
  if (/(fournitures?|papeterie|cartouche|encre|papier|bureau)/i.test(t)) return "606400";
  if (/(logiciel|informatique|saas|licence)/i.test(t)) return "605000";
  if (/(loyer|bail|location)/i.test(t)) return "613200";
  if (/(publicit[eé]|marketing|google ads|facebook ads)/i.test(t)) return "623000";
  if (/(assurance|mutuelle)/i.test(t)) return "616000";
  if (/(achat|marchandises?|mat[ée]riel|ordinateur|imprimante)/i.test(t)) return "607000";
  return null;
}
