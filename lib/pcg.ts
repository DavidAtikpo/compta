import { prisma } from "@/lib/prisma";
import {
  ALL_PCG_ACCOUNTS,
  CATEGORY_TO_ACCOUNT,
  type InvoiceCategory,
} from "@/lib/pcg-data";

export { INVOICE_CATEGORIES, CATEGORY_TO_ACCOUNT, type InvoiceCategory } from "@/lib/pcg-data";

/** Compte PCG (3 chiffres ou 6) → catégorie facture */
const ACCOUNT_PREFIX_TO_CATEGORY: Array<{ prefix: string; category: InvoiceCategory }> = [
  { prefix: "606", category: "Fournitures bureau" },
  { prefix: "605", category: "Informatique / Logiciel" },
  { prefix: "613", category: "Loyer / Bureau" },
  { prefix: "615", category: "Autre" },
  { prefix: "616", category: "Assurance" },
  { prefix: "618", category: "Formation" },
  { prefix: "622", category: "Honoraires / Sous-traitance" },
  { prefix: "623", category: "Publicité / Marketing" },
  { prefix: "625", category: "Déplacement / Transport" },
  { prefix: "626", category: "Téléphone / Internet" },
  { prefix: "627", category: "Autre" },
  { prefix: "215", category: "Matériel / Équipement" },
  { prefix: "607", category: "Autre" },
];

export function normalizeAccountNum(code: string | null | undefined): string | null {
  if (!code) return null;
  const digits = String(code).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 3) return digits.padEnd(6, "0");
  return digits.padEnd(6, "0").slice(0, 6);
}

export function accountForCategory(category: string | null | undefined): { num: string; label: string } {
  if (category && CATEGORY_TO_ACCOUNT[category]) return CATEGORY_TO_ACCOUNT[category];
  return { num: "607000", label: "Achats de marchandises" };
}

export function categoryFromAccountCode(code: string | null | undefined): InvoiceCategory {
  const norm = normalizeAccountNum(code);
  if (!norm) return "Autre";
  const prefix3 = norm.slice(0, 3);
  for (const row of ACCOUNT_PREFIX_TO_CATEGORY) {
    if (prefix3.startsWith(row.prefix) || norm.startsWith(row.prefix)) return row.category;
  }
  return "Autre";
}

export async function ensurePcgSeeded(): Promise<number> {
  await prisma.chartAccount.createMany({
    data: ALL_PCG_ACCOUNTS.map((a) => ({
      num: a.num,
      label: a.label,
      pcgClass: a.pcgClass,
      parentNum: a.parentNum ?? null,
    })),
    skipDuplicates: true,
  });
  return prisma.chartAccount.count();
}

export async function findAccount(num: string): Promise<{ num: string; label: string } | null> {
  const normalized = normalizeAccountNum(num);
  if (!normalized) return null;
  const row = await prisma.chartAccount.findFirst({
    where: {
      OR: [{ num: normalized }, { num: normalized.slice(0, 3) }],
    },
  });
  if (row) return { num: row.num, label: row.label };
  const seed = ALL_PCG_ACCOUNTS.find((a) => a.num === normalized || a.num.startsWith(normalized.slice(0, 3)));
  return seed ? { num: seed.num, label: seed.label } : null;
}
