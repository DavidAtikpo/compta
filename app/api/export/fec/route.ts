import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "../../../../lib/postgres";

export const runtime = "nodejs";

// FEC — Fichier des Écritures Comptables (format DGFiP)
// Colonnes obligatoires : JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise

const categoryToAccount: Record<string, { num: string; lib: string }> = {
  "Fournitures bureau":     { num: "60600", lib: "Achats fournitures bureau" },
  "Déplacement / Transport":{ num: "62510", lib: "Frais déplacements" },
  "Repas professionnel":    { num: "62500", lib: "Frais missions" },
  "Informatique / Logiciel":{ num: "60500", lib: "Achats logiciels" },
  "Téléphone / Internet":   { num: "62600", lib: "Frais télécommunications" },
  "Loyer / Bureau":         { num: "61300", lib: "Loyers" },
  "Formation":              { num: "63300", lib: "Formation professionnelle" },
  "Publicité / Marketing":  { num: "62300", lib: "Publicité" },
  "Assurance":              { num: "61600", lib: "Assurances" },
  "Honoraires / Sous-traitance": { num: "62200", lib: "Honoraires" },
  "Matériel / Équipement":  { num: "21500", lib: "Matériel" },
};

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
  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    let query = `SELECT * FROM invoices WHERE status != 'draft'`;
    const params: (string)[] = [];
    let idx = 1;

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
      const account = categoryToAccount[inv.category] ?? { num: "60700", lib: "Achats divers" };
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
