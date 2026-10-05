import { isInvoiceExtractionDone } from "@/lib/invoice-extraction-marker";

export type InvoiceWorkflowBadge = {
  label: string;
  tone: "slate" | "amber" | "indigo" | "emerald";
};

export function isUserConfirmed(inv: { userConfirmedAt?: string | null }): boolean {
  return !!inv.userConfirmedAt;
}

export function isAwaitingUserConfirmation(inv: {
  fileUrl?: string | null;
  userConfirmedAt?: string | null;
  ocrText?: string | null;
  montantTTC?: number | null;
  amount?: number | null;
  fournisseur?: string | null;
  numeroFacture?: string | null;
  invoiceDate?: string | null;
}): boolean {
  if (!inv.fileUrl) return false;
  return isInvoiceExtractionDone(inv) && !isUserConfirmed(inv);
}

export function invoiceWorkflowBadge(inv: {
  status: string;
  userConfirmedAt?: string | null;
  fileUrl?: string | null;
  ocrText?: string | null;
  montantTTC?: number | null;
  amount?: number | null;
  fournisseur?: string | null;
  numeroFacture?: string | null;
  invoiceDate?: string | null;
}): InvoiceWorkflowBadge {
  if (inv.status === "archived") {
    return { label: "Archivé", tone: "slate" };
  }
  if (isAwaitingUserConfirmation(inv)) {
    return { label: "À confirmer", tone: "indigo" };
  }
  if (isUserConfirmed(inv)) {
    return { label: "Confirmée", tone: "emerald" };
  }
  if (inv.fileUrl && !isInvoiceExtractionDone(inv)) {
    return { label: "À extraire", tone: "amber" };
  }
  return { label: "Enregistrée", tone: "slate" };
}

export function invoiceWorkflowBadgeClass(tone: InvoiceWorkflowBadge["tone"]): string {
  switch (tone) {
    case "emerald":
      return "bg-emerald-100 text-emerald-800";
    case "indigo":
      return "bg-indigo-100 text-indigo-800";
    case "amber":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

/** Filtre liste factures (côté client) — remplace l’ancien pending/sent (envoi cabinet). */
export function matchesInvoiceWorkflowFilter(
  inv: Parameters<typeof invoiceWorkflowBadge>[0],
  filter: string,
): boolean {
  if (!filter) return true;
  if (filter === "archived") return inv.status === "archived";
  if (filter === "confirmed") return isUserConfirmed(inv) && inv.status !== "archived";
  if (filter === "to_confirm") return isAwaitingUserConfirmation(inv);
  if (filter === "not_extracted") return !!inv.fileUrl && !isInvoiceExtractionDone(inv);
  return true;
}
