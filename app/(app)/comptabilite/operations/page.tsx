"use client";

import { useCallback, useEffect, useState } from "react";
import { INVOICE_CATEGORIES } from "@/lib/pcg-data";

type JournalLine = {
  accountNum: string;
  accountLabel?: string;
  debit: number;
  credit: number;
};

type JournalEntry = {
  id: string;
  journalCode: string;
  entryDate: string;
  label: string;
  pieceRef: string | null;
  lines: JournalLine[];
};

function authHeaders(): Record<string, string> {
  const t = typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function OperationsPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [label, setLabel] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [debitAccount, setDebitAccount] = useState("606400");
  const [creditAccount, setCreditAccount] = useState("512000");
  const [amount, setAmount] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentName, setAttachmentName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/journal?limit=50", { headers: authHeaders() });
    const data = res.ok ? await res.json() : [];
    setEntries(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number.parseFloat(amount.replace(",", "."));
    if (!label.trim() || !Number.isFinite(amt) || amt <= 0) {
      setMsg("Libellé et montant valides requis.");
      return;
    }
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        label: label.trim(),
        entryDate,
        journalCode: "OD",
        journalLabel: "Opérations diverses",
        attachmentUrl: attachmentUrl.trim() || undefined,
        attachmentName: attachmentName.trim() || undefined,
        lines: [
          { accountNum: debitAccount, debit: amt, credit: 0 },
          { accountNum: creditAccount, debit: 0, credit: amt },
        ],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || "Erreur lors de la saisie.");
      setSaving(false);
      return;
    }
    setLabel("");
    setAmount("");
    setAttachmentUrl("");
    setAttachmentName("");
    setMsg("Opération enregistrée.");
    setSaving(false);
    await load();
  };

  return (
    <div className="space-y-5">
      <form onSubmit={(e) => void handleSubmit(e)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Nouvelle opération</h2>
        <p className="mt-0.5 text-xs text-slate-500">Saisie manuelle avec pièce jointe (URL Cloudinary ou lien).</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="font-medium text-slate-700">Libellé</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Ex. Achat fournitures"
            />
          </label>
          <label className="block text-xs">
            <span className="font-medium text-slate-700">Date</span>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="font-medium text-slate-700">Compte débit</span>
            <input
              value={debitAccount}
              onChange={(e) => setDebitAccount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="font-medium text-slate-700">Compte crédit</span>
            <input
              value={creditAccount}
              onChange={(e) => setCreditAccount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="font-medium text-slate-700">Montant (€)</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="120,00"
            />
          </label>
          <label className="block text-xs">
            <span className="font-medium text-slate-700">URL pièce jointe</span>
            <input
              value={attachmentUrl}
              onChange={(e) => setAttachmentUrl(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </label>
          <label className="block text-xs sm:col-span-2">
            <span className="font-medium text-slate-700">Nom du fichier</span>
            <input
              value={attachmentName}
              onChange={(e) => setAttachmentName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="justificatif.pdf"
            />
          </label>
        </div>
        {msg && <p className="mt-3 text-xs text-emerald-700">{msg}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer l'opération"}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Journal des opérations</h2>
        </div>
        {loading ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">Chargement…</p>
        ) : entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">
            Aucune écriture. Créez une opération ou générez une écriture depuis une facture.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <li key={entry.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{entry.label}</p>
                    <p className="text-[10px] text-slate-400">
                      {entry.journalCode} • {new Date(entry.entryDate).toLocaleDateString("fr-FR")}
                      {entry.pieceRef ? ` • ${entry.pieceRef}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1 pr-3">Compte</th>
                        <th className="py-1 pr-3">Libellé</th>
                        <th className="py-1 pr-3">Débit</th>
                        <th className="py-1">Crédit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.lines.map((line, i) => (
                        <tr key={i} className="border-t border-slate-50 text-slate-700">
                          <td className="py-1 pr-3 font-mono">{line.accountNum}</td>
                          <td className="py-1 pr-3">{line.accountLabel ?? "—"}</td>
                          <td className="py-1 pr-3">{line.debit > 0 ? line.debit.toFixed(2) : "—"}</td>
                          <td className="py-1">{line.credit > 0 ? line.credit.toFixed(2) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[10px] text-slate-400">
        Catégories factures reconnues : {INVOICE_CATEGORIES.join(", ")}. La classification IA remplit automatiquement
        le compte PCG à l&apos;extraction OCR.
      </p>
    </div>
  );
}
