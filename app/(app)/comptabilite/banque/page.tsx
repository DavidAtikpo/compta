"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type BankTx = {
  id: string;
  transactionDate: string;
  label: string;
  amount: number;
  reference: string | null;
  matchedInvoiceId: string | null;
  importBatch?: { fileName: string; format: string };
};

type InvoicePick = {
  id: string;
  originalName: string;
  fournisseur: string | null;
  montantTTC: number | null;
  amount: number | null;
  invoiceDate: string | null;
  createdAt: string;
};

function authHeaders(): Record<string, string> {
  const t = typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function BanquePage() {
  const [transactions, setTransactions] = useState<BankTx[]>([]);
  const [invoices, setInvoices] = useState<InvoicePick[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");
  const [format, setFormat] = useState<"csv" | "ofx" | "qif">("csv");
  const [showUnmatchedOnly, setShowUnmatchedOnly] = useState(true);
  const [reconcileTx, setReconcileTx] = useState<BankTx | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [txRes, invRes] = await Promise.all([
      fetch(`/api/bank/transactions?limit=200${showUnmatchedOnly ? "&unmatched=1" : ""}`, {
        headers: authHeaders(),
      }),
      fetch("/api/invoices?limit=200", { headers: authHeaders() }),
    ]);
    const txData = txRes.ok ? await txRes.json() : [];
    const invData = invRes.ok ? await invRes.json() : [];
    setTransactions(Array.isArray(txData) ? txData : []);
    setInvoices(Array.isArray(invData) ? invData : []);
    setLoading(false);
  }, [showUnmatchedOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((inv) => {
      const name = `${inv.originalName} ${inv.fournisseur ?? ""}`.toLowerCase();
      return name.includes(q);
    });
  }, [invoices, invoiceSearch]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMsg("");
    const form = new FormData();
    form.append("file", file);
    form.append("format", format);
    const res = await fetch("/api/bank/import", {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || "Import échoué.");
    } else {
      setMsg(`${data.imported ?? 0} transaction(s) importée(s) (${data.format}).`);
      await load();
    }
    setImporting(false);
    e.target.value = "";
  };

  const handleReconcile = async () => {
    if (!reconcileTx || !selectedInvoiceId) return;
    setReconciling(true);
    setMsg("");
    const res = await fetch("/api/bank/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        transactionId: reconcileTx.id,
        invoiceId: selectedInvoiceId,
        createJournal: true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || "Rapprochement échoué.");
    } else {
      setMsg("Transaction rapprochée et écriture bancaire générée.");
      setReconcileTx(null);
      setSelectedInvoiceId("");
      await load();
    }
    setReconciling(false);
  };

  const invoiceAmount = (inv: InvoicePick) => inv.montantTTC ?? inv.amount ?? 0;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Import bancaire</h2>
        <p className="mt-0.5 text-xs text-slate-500">Formats supportés : CSV, OFX, QIF.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "csv" | "ofx" | "qif")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
          >
            <option value="csv">CSV</option>
            <option value="ofx">OFX / QFX</option>
            <option value="qif">QIF</option>
          </select>
          <label className="cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800">
            {importing ? "Import…" : "Choisir un fichier"}
            <input type="file" accept=".csv,.ofx,.qfx,.qif,text/*" className="hidden" onChange={(e) => void handleImport(e)} />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showUnmatchedOnly}
              onChange={(e) => setShowUnmatchedOnly(e.target.checked)}
            />
            Non rapprochées seulement
          </label>
        </div>
        {msg && <p className="mt-3 text-xs text-emerald-700">{msg}</p>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Rapprochement bancaire</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Associez une transaction importée à une facture pour générer l&apos;écriture comptable.
          </p>
        </div>
        {loading ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">Chargement…</p>
        ) : transactions.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">Aucune transaction à rapprocher.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Libellé</th>
                  <th className="px-4 py-2">Montant</th>
                  <th className="px-4 py-2">Statut</th>
                  <th className="px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {new Date(tx.transactionDate).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-2">{tx.label}</td>
                    <td className={`px-4 py-2 font-medium ${tx.amount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {tx.amount.toFixed(2)} €
                    </td>
                    <td className="px-4 py-2">
                      {tx.matchedInvoiceId ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">
                          Rapprochée
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                          En attente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {!tx.matchedInvoiceId && (
                        <button
                          type="button"
                          onClick={() => {
                            setReconcileTx(tx);
                            setSelectedInvoiceId("");
                            setInvoiceSearch(tx.label.slice(0, 20));
                          }}
                          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-indigo-500"
                        >
                          Rapprocher
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reconcileTx && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Rapprocher la transaction</h3>
              <p className="mt-1 text-xs text-slate-500">
                {reconcileTx.label} — {reconcileTx.amount.toFixed(2)} €
              </p>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-4">
              <input
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="Rechercher une facture…"
                className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <ul className="space-y-1">
                {filteredInvoices.slice(0, 30).map((inv) => {
                  const amt = invoiceAmount(inv);
                  const diff = Math.abs(Math.abs(reconcileTx.amount) - amt);
                  const selected = selectedInvoiceId === inv.id;
                  return (
                    <li key={inv.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedInvoiceId(inv.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                          selected
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-slate-100 hover:bg-slate-50"
                        }`}
                      >
                        <p className="font-medium text-slate-900">{inv.fournisseur ?? inv.originalName}</p>
                        <p className="text-slate-500">
                          {amt.toFixed(2)} €
                          {amt > 0 && diff < 0.05 && (
                            <span className="ml-2 text-emerald-600">Montant proche</span>
                          )}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setReconcileTx(null)}
                className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!selectedInvoiceId || reconciling}
                onClick={() => void handleReconcile()}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {reconciling ? "Rapprochement…" : "Valider le rapprochement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
