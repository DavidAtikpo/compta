import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Facture partagée — Compta IA",
};

const regionLabel: Record<string, string> = {
  france: "France 🇫🇷", togo: "Togo 🇹🇬", vietnam: "Vietnam 🇻🇳", autre: "Autre 🌍",
};

interface InvoiceData {
  id: string;
  originalName: string;
  region: string;
  amount: number | null;
  montantHT: number | null;
  montantTVA: number | null;
  montantTTC: number | null;
  tauxTVA: number | null;
  category: string | null;
  status: string;
  fournisseur: string | null;
  numeroFacture: string | null;
  invoiceDate: string | null;
  createdAt: string;
  sentAt: string | null;
  fileUrl: string | null;
  accountant_email: string | null;
}

async function getInvoice(token: string): Promise<InvoiceData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/share/${token}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invoice = await getInvoice(token);

  if (!invoice) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
        <div className="rounded-2xl bg-white p-10 text-center shadow-xl border border-slate-200 max-w-sm w-full">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Lien invalide</h1>
          <p className="text-slate-500 text-sm">Ce lien de partage n'existe pas ou a été révoqué.</p>
          <Link href="/login" className="mt-6 inline-block rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-700">
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    sent: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    archived: "bg-slate-100 text-slate-600",
  };

  const statusLabels: Record<string, string> = {
    sent: "Transmis", pending: "En attente", archived: "Archivé",
  };
  const amountTTC = invoice.montantTTC ?? invoice.amount;

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-6">
          <p className="text-slate-400 text-sm">Partagé via</p>
          <h1 className="text-2xl font-bold text-white">Compta IA</h1>
        </div>

        <div className="rounded-2xl bg-white shadow-2xl overflow-hidden">
          <div className="bg-slate-900 px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-slate-400 text-xs mb-1">Document</p>
                <h2 className="text-white font-semibold text-lg leading-tight">{invoice.originalName}</h2>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusColors[invoice.status] ?? "bg-slate-100 text-slate-600"}`}>
                {statusLabels[invoice.status] ?? invoice.status}
              </span>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Fournisseur</p>
                <p className="text-sm font-medium text-slate-900">{invoice.fournisseur ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">N° Facture</p>
                <p className="text-sm font-medium text-slate-900">{invoice.numeroFacture ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Région</p>
                <p className="text-sm font-medium text-slate-900">{regionLabel[invoice.region] ?? invoice.region}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Catégorie</p>
                <p className="text-sm font-medium text-slate-900">{invoice.category ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Date facture</p>
                <p className="text-sm font-medium text-slate-900">
                  {invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString("fr-FR") : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Enregistré le</p>
                <p className="text-sm font-medium text-slate-900">
                  {new Date(invoice.createdAt).toLocaleDateString("fr-FR")}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Montants extraits</p>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Montant HT</span>
                <span className="font-medium text-slate-900">{invoice.montantHT != null ? `${invoice.montantHT.toFixed(2)} €` : "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Taux TVA</span>
                <span className="font-medium text-slate-900">{invoice.tauxTVA != null ? `${invoice.tauxTVA}%` : "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Montant TVA</span>
                <span className="font-medium text-slate-900">{invoice.montantTVA != null ? `${invoice.montantTVA.toFixed(2)} €` : "—"}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-slate-200 pt-2 mt-1">
                <span className="text-slate-900">Total TTC</span>
                <span className="text-slate-900">{amountTTC != null ? `${amountTTC.toFixed(2)} €` : "—"}</span>
              </div>
            </div>

            {invoice.fileUrl && (
              <a
                href={`/api/share/${token}/file`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Télécharger le document
              </a>
            )}

            {invoice.sentAt && (
              <p className="text-xs text-center text-slate-400">
                Transmis au cabinet le {new Date(invoice.sentAt).toLocaleDateString("fr-FR")}
                {invoice.accountant_email ? ` — ${invoice.accountant_email}` : ""}
              </p>
            )}
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-4">
          Document partagé via Compta IA — usage professionnel uniquement
        </p>
      </div>
    </div>
  );
}
