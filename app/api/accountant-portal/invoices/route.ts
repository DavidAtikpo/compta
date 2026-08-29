import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPortalContextFromRequest } from "@/lib/auth-request";
import {
  listCabinetsForOwner,
  listInvoicesForAccountant,
  listInvoicesForOwnerPortal,
} from "@/lib/accountant-portal-invoices";
import { VALID_INVOICE_CURRENCY_CODES } from "@/lib/invoice-currency";

export async function GET(request: NextRequest) {
  const ctx = getPortalContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Connexion comptable requise." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const currency = searchParams.get("currency")?.trim().toUpperCase() || undefined;
  const reviewStatus = searchParams.get("reviewStatus")?.trim() || undefined;

  if (currency && !VALID_INVOICE_CURRENCY_CODES.includes(currency as (typeof VALID_INVOICE_CURRENCY_CODES)[number])) {
    return NextResponse.json({ error: "Devise invalide." }, { status: 400 });
  }

  const mode = ctx.mode === "owner" && ctx.ownerUserId ? "owner" : "cabinet";

  try {
    const cabinets =
      mode === "owner" && ctx.ownerUserId ? await listCabinetsForOwner(ctx.ownerUserId) : [];

    const invoices =
      mode === "owner" && ctx.ownerUserId
        ? await listInvoicesForOwnerPortal(ctx.ownerUserId, { currency, reviewStatus })
        : await listInvoicesForAccountant(ctx.email, { currency, reviewStatus });

    const totalsByCurrency: Record<string, { count: number; totalHT: number; totalTTC: number }> = {};
    for (const inv of invoices) {
      const c = inv.currency ?? "EUR";
      if (!totalsByCurrency[c]) totalsByCurrency[c] = { count: 0, totalHT: 0, totalTTC: 0 };
      totalsByCurrency[c].count++;
      const ttc = inv.montantTTC ?? inv.amount;
      if (ttc != null) totalsByCurrency[c].totalTTC += ttc;
      if (inv.montantHT != null) totalsByCurrency[c].totalHT += inv.montantHT;
    }

    return NextResponse.json({
      email: ctx.email,
      mode,
      cabinets,
      invoices,
      totalsByCurrency,
      counts: {
        total: invoices.length,
        pendingReview: invoices.filter((i) => !i.accountantReviewStatus).length,
        validated: invoices.filter((i) => i.accountantReviewStatus === "validated").length,
        rejected: invoices.filter((i) => i.accountantReviewStatus === "rejected").length,
      },
    });
  } catch (error) {
    console.error("Erreur portail comptable:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
