import { isInvoiceExtractionDone } from "@/lib/invoice-extraction-marker";
import { normalizeRegionKey } from "@/lib/country-regions";

export type InvoiceWorkflowBadge = {
  label: string;
  tone: "slate" | "amber" | "indigo" | "emerald";
};

export function isUserConfirmed(inv: { userConfirmedAt?: string | null }): boolean {
  return !!inv.userConfirmedAt;
}

export type CabinetSendRegions = Record<string, string> | null | undefined;

export function cabinetSentAtForRegion(
  cabinetSentAtByRegion: CabinetSendRegions,
  region: string,
): string | null {
  if (!cabinetSentAtByRegion) return null;
  const key = normalizeRegionKey(region);
  return cabinetSentAtByRegion[key] ?? null;
}

export function isSentToCabinetRegion(
  inv: { cabinetSentAtByRegion?: CabinetSendRegions },
  region: string,
): boolean {
  return cabinetSentAtForRegion(inv.cabinetSentAtByRegion, region) != null;
}

/** Au moins un cabinet (par pays) a reçu la facture. */
export function isSentToAnyCabinet(inv: {
  cabinetSentAtByRegion?: CabinetSendRegions;
  status?: string;
  sentAt?: string | null;
}): boolean {
  if (inv.cabinetSentAtByRegion && Object.keys(inv.cabinetSentAtByRegion).length > 0) {
    return true;
  }
  return inv.status === "sent" || !!inv.sentAt;
}

export function isSentToCabinet(inv: {
  cabinetSentAtByRegion?: CabinetSendRegions;
  status: string;
  sentAt?: string | null;
}): boolean {
  return isSentToAnyCabinet(inv);
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

export function invoiceWorkflowBadge(
  inv: {
    status: string;
    userConfirmedAt?: string | null;
    fileUrl?: string | null;
    ocrText?: string | null;
    montantTTC?: number | null;
    amount?: number | null;
    fournisseur?: string | null;
    numeroFacture?: string | null;
    invoiceDate?: string | null;
    cabinetSentAtByRegion?: CabinetSendRegions;
    sentAt?: string | null;
  },
  opts?: { cabinetRegion?: string },
): InvoiceWorkflowBadge {
  if (inv.status === "archived") {
    return { label: "Archivé", tone: "slate" };
  }
  if (isAwaitingUserConfirmation(inv)) {
    return { label: "À confirmer", tone: "indigo" };
  }
  if (isUserConfirmed(inv)) {
    if (opts?.cabinetRegion) {
      const at = cabinetSentAtForRegion(inv.cabinetSentAtByRegion, opts.cabinetRegion);
      if (at) {
        const d = new Date(at).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        return { label: `Envoyée ${d}`, tone: "emerald" };
      }
      return { label: "Confirmée", tone: "emerald" };
    }
    if (isSentToAnyCabinet(inv)) {
      const n = inv.cabinetSentAtByRegion ? Object.keys(inv.cabinetSentAtByRegion).length : 0;
      return {
        label: n > 1 ? `Envoyée (${n} cabinets)` : "Envoyée cabinet",
        tone: "emerald",
      };
    }
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
  if (filter === "confirmed") {
    return isUserConfirmed(inv) && !isSentToCabinet(inv) && inv.status !== "archived";
  }
  if (filter === "to_send") {
    return isUserConfirmed(inv) && !isSentToCabinet(inv) && inv.status !== "archived";
  }
  if (filter === "sent") return isSentToCabinet(inv) && inv.status !== "archived";
  if (filter === "to_confirm") return isAwaitingUserConfirmation(inv);
  if (filter === "not_extracted") return !!inv.fileUrl && !isInvoiceExtractionDone(inv);
  return true;
}
