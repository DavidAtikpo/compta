import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { VatDeclaration } from "./vat-declaration";

function fmt(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

function monthLabel(month?: number): string {
  if (!month) return "";
  return new Date(2000, month - 1, 1).toLocaleDateString("fr-FR", { month: "long" });
}

export async function buildVatDeclarationPdf(decl: VatDeclaration): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const title = decl.type === "CA12"
    ? `Déclaration TVA CA12 — Exercice ${decl.year}`
    : `Déclaration TVA CA3 — ${monthLabel(decl.month)} ${decl.year}`;

  let y = 800;
  const draw = (text: string, size = 10, bold = false) => {
    page.drawText(text, {
      x: 50,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= size + 6;
  };

  draw("Compta IA — Récapitulatif TVA (document de travail)", 9);
  draw("Ce document n'est pas le formulaire Cerfa officiel.", 8);
  y -= 8;
  draw(title, 14, true);
  y -= 4;
  draw(`Période : ${new Date(decl.periodStart).toLocaleDateString("fr-FR")} → ${new Date(decl.periodEnd).toLocaleDateString("fr-FR")}`, 9);
  y -= 12;

  draw("LIGNES CA3 / CA12 (synthèse)", 11, true);
  draw(`Ligne 08 — TVA brute due : ${fmt(decl.lineCA3.ligne08_tvaBrute)}`);
  draw(`Ligne 16 — TVA déductible : ${fmt(decl.lineCA3.ligne16_tvaDeductible)}`);
  draw(`Ligne 23 — Solde à payer / crédit : ${fmt(decl.lineCA3.ligne23_solde)}`, 10, true);
  y -= 8;

  draw("DÉTAIL DES BASES", 11, true);
  draw(`Base HT ventes : ${fmt(decl.baseHTVentes)}`);
  draw(`Base HT achats : ${fmt(decl.baseHTAchats)}`);
  draw(`TVA collectée : ${fmt(decl.tvaCollectee)}`);
  draw(`TVA déductible : ${fmt(decl.tvaDeductible)}`);
  y -= 8;

  if (decl.byRate.length > 0) {
    draw("Ventilation par taux de TVA", 11, true);
    for (const row of decl.byRate) {
      draw(`  ${row.rate} % — Base HT ${fmt(row.baseHT)} — TVA ${fmt(row.tva)}`, 9);
    }
  }

  y -= 16;
  draw("Document généré automatiquement à partir des factures enregistrées.", 8);
  draw("À valider par votre expert-comptable avant télédéclaration.", 8);

  return pdf.save();
}
