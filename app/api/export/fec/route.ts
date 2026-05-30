import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "../../../../lib/postgres";
import { getAuthenticatedUserId } from "../../../../lib/auth-request";
import { resolveInvoiceWorkspace } from "@/lib/workspace";
import { accountForCategory } from "@/lib/pcg";

export const runtime = "nodejs";

// FEC — Fichier des Écritures Comptables (format DGFiP)

function formatDate(d: Date | string | null): string {
  if (!d) return "";
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function formatAmount(n: number | null): string {
  if (n == null || isNaN(n)) return "0.00";
  return Math.abs(n).toFixed(2).replace(".", ",");
}

export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { workspaceOwnerId, actorUserId, restrictAgentToOwnSubmissions } =
    await resolveInvoiceWorkspace(userId);

  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    let query = `SELECT * FROM invoices WHERE status != 'draft' AND "userId" = $1 AND ("deletedAt" IS NULL)`;
    const params: string[] = [workspaceOwnerId];
    let idx = 2;

    if (restrictAgentToOwnSubmissions) {
      query += ` AND "submittedByUserId" = $${idx++}`;
      params.push(actorUserId);
    }

    if (region) { query += ` AND region = $${idx++}`; params.push(region); }
    if (from)   { query += ` AND "createdAt" >= $${idx++}`; params.push(from); }
    if (to)     { query += ` AND "createdAt" <= $${idx++}`; params.push(to); }
    query += ` ORDER BY "createdAt" ASC`;

    const result = await pool.query(query, params);
    const invoices = result.rows;

    const header = "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise";

    const lines: string[] = [header];
    let ecritureNum = 1;

    for (const inv of invoices) {
      const account = inv.accountCode
        ? { num: String(inv.accountCode).padEnd(6, "0").slice(0, 6), lib: "Compte PCG" }
        : accountForCategory(inv.category);
      const montantTTC = inv.montantTTC ?? inv.amount ?? 0;
      const montantHT  = inv.montantHT ?? (montantTTC / 1.2);
      const montantTVA = inv.montantTVA ?? (montantTTC - montantHT);
      const dateEcriture = formatDate(inv.invoiceDate ?? inv.createdAt);
      const pieceRef = inv.numeroFacture ?? inv.id.slice(0, 8).toUpperCase();
      const lib = `${inv.fournisseur ?? inv.originalName}`.slice(0, 50).replace(/\t/g, " ");
      const numStr = String(ecritureNum).padStart(6, "0");

      // Ligne charge (débit)
      lines.push([
        "ACH", "Achats",
        numStr, dateEcriture,
        account.num, account.lib,
        "", "",
        pieceRef, dateEcriture,
        lib,
        formatAmount(montantHT), "0,00",
        "", "", "", "", "",
      ].join("\t"));

      // Ligne TVA (débit) — si TVA > 0
      if (montantTVA > 0.01) {
        lines.push([
          "ACH", "Achats",
          numStr, dateEcriture,
          "44566", "TVA déductible",
          "", "",
          pieceRef, dateEcriture,
          lib,
          formatAmount(montantTVA), "0,00",
          "", "", "", "", "",
        ].join("\t"));
      }

      // Ligne fournisseur (crédit)
      lines.push([
        "ACH", "Achats",
        numStr, dateEcriture,
        "40100", inv.fournisseur ?? "Fournisseur divers",
        "", "",
        pieceRef, dateEcriture,
        lib,
        "0,00", formatAmount(montantTTC),
        "", "", "", "", "",
      ].join("\t"));

      ecritureNum++;
    }

    const fecContent = lines.join("\n");
    const filename = `FEC_${region ?? "ALL"}_${new Date().toISOString().slice(0, 10)}.txt`;

    return new Response(fecContent, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Erreur export FEC:", error);
    return NextResponse.json({ error: "Erreur génération FEC." }, { status: 500 });
  }
}
