import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAccountantEmailFromRequest } from "@/lib/auth-request";
import { listInvoicesForAccountant } from "@/lib/accountant-portal-invoices";
import { VALID_INVOICE_CURRENCY_CODES } from "@/lib/invoice-currency";

export async function GET(request: NextRequest) {
  const email = getAccountantEmailFromRequest(request);
  if (!email) {
    return NextResponse.json({ error: "Connexion comptable requise." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const currency = searchParams.get("currency")?.trim().toUpperCase() || undefined;
  const reviewStatus = searchParams.get("reviewStatus")?.trim() || undefined;

  if (currency && !VALID_INVOICE_CURRENCY_CODES.includes(currency as (typeof VALID_INVOICE_CURRENCY_CODES)[number])) {
    return NextResponse.json({ error: "Devise invalide." }, { status: 400 });
  }

  try {
    const invoices = await listInvoicesForAccountant(email, { currency, reviewStatus });

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
      email,
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
