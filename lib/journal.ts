import { prisma } from "@/lib/prisma";
import { accountForCategory, findAccount, normalizeAccountNum } from "@/lib/pcg";

export type JournalLineInput = {
  accountNum: string;
  accountLabel?: string;
  debit: number;
  credit: number;
};

export type CreateJournalEntryInput = {
  userId: string;
  journalCode?: string;
  journalLabel?: string;
  entryDate: Date;
  pieceRef?: string;
  label: string;
  invoiceId?: string;
  bankTransactionId?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  mimeType?: string;
  lines: JournalLineInput[];
};

export async function createJournalEntry(input: CreateJournalEntryInput) {
  const totalDebit = input.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = input.lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.02) {
    throw new Error("Écriture déséquilibrée : débit ≠ crédit.");
  }

  const resolvedLines = await Promise.all(
    input.lines.map(async (line) => {
      const num = normalizeAccountNum(line.accountNum) ?? line.accountNum;
      const found = await findAccount(num);
      return {
        accountNum: found?.num ?? num,
        accountLabel: line.accountLabel ?? found?.label ?? num,
        debit: line.debit,
        credit: line.credit,
      };
    }),
  );

  return prisma.journalEntry.create({
    data: {
      userId: input.userId,
      journalCode: input.journalCode ?? "OD",
      journalLabel: input.journalLabel ?? "Opérations diverses",
      entryDate: input.entryDate,
      pieceRef: input.pieceRef ?? null,
      label: input.label,
      invoiceId: input.invoiceId ?? null,
      bankTransactionId: input.bankTransactionId ?? null,
      attachmentUrl: input.attachmentUrl ?? null,
      attachmentName: input.attachmentName ?? null,
      mimeType: input.mimeType ?? null,
      lines: { create: resolvedLines },
    },
    include: { lines: true },
  });
}

/** Génère une écriture d'achat standard à partir d'une facture */
export async function journalEntryFromInvoice(invoice: {
  id: string;
  userId: string;
  category?: string | null;
  accountCode?: string | null;
  fournisseur?: string | null;
  originalName?: string;
  numeroFacture?: string | null;
  montantHT?: number | null;
  montantTVA?: number | null;
  montantTTC?: number | null;
  amount?: number | null;
  invoiceDate?: Date | null;
  createdAt?: Date;
  invoiceType?: string | null;
  fileUrl?: string | null;
  originalName2?: string;
  mimeType?: string | null;
}) {
  const isVente = String(invoice.invoiceType ?? "achat").toLowerCase() === "vente";
  const ttc = invoice.montantTTC ?? invoice.amount ?? 0;
  const ht = invoice.montantHT ?? (ttc > 0 ? ttc / 1.2 : 0);
  const tva = invoice.montantTVA ?? Math.max(0, ttc - ht);
  const chargeAccount = invoice.accountCode
    ? (await findAccount(invoice.accountCode)) ?? accountForCategory(invoice.category)
    : accountForCategory(invoice.category);

  const lines: JournalLineInput[] = isVente
    ? [
        { accountNum: "411000", accountLabel: "Clients", debit: ttc, credit: 0 },
        { accountNum: chargeAccount.num, accountLabel: chargeAccount.label, debit: 0, credit: ht },
        ...(tva > 0.01
          ? [{ accountNum: "445710", accountLabel: "TVA collectée", debit: 0, credit: tva }]
          : []),
      ]
    : [
        { accountNum: chargeAccount.num, accountLabel: chargeAccount.label, debit: ht, credit: 0 },
        ...(tva > 0.01
          ? [{ accountNum: "445660", accountLabel: "TVA déductible", debit: tva, credit: 0 }]
          : []),
        {
          accountNum: "401000",
          accountLabel: invoice.fournisseur ?? "Fournisseurs",
          debit: 0,
          credit: ttc,
        },
      ];

  return createJournalEntry({
    userId: invoice.userId,
    journalCode: isVente ? "VTE" : "ACH",
    journalLabel: isVente ? "Ventes" : "Achats",
    entryDate: invoice.invoiceDate ?? invoice.createdAt ?? new Date(),
    pieceRef: invoice.numeroFacture ?? invoice.id.slice(0, 8).toUpperCase(),
    label: (invoice.fournisseur ?? invoice.originalName ?? "Facture").slice(0, 80),
    invoiceId: invoice.id,
    attachmentUrl: invoice.fileUrl ?? undefined,
    attachmentName: invoice.originalName ?? undefined,
    mimeType: invoice.mimeType ?? undefined,
    lines,
  });
}
