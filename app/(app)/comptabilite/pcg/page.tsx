"use client";

import { useCallback, useEffect, useState } from "react";

type Account = {
  num: string;
  label: string;
  pcgClass: number;
  parentNum: string | null;
};

const CLASS_LABELS: Record<number, string> = {
  1: "Capitaux",
  2: "Immobilisations",
  3: "Stocks",
  4: "Tiers",
  6: "Charges",
  7: "Produits",
};

function authHeaders(): Record<string, string> {
  const t = typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function PcgPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [q, setQ] = useState("");
  const [pcgClass, setPcgClass] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (pcgClass) params.set("class", pcgClass);
    const res = await fetch(`/api/accounts?${params}`, { headers: authHeaders() });
    const data = res.ok ? await res.json() : { accounts: [] };
    setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    setLoading(false);
  }, [q, pcgClass]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un compte (numéro ou libellé)…"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          value={pcgClass}
          onChange={(e) => setPcgClass(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">Toutes les classes</option>
          {[1, 2, 3, 4, 6, 7].map((c) => (
            <option key={c} value={String(c)}>
              Classe {c} — {CLASS_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">Chargement du plan comptable…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2">Classe</th>
                  <th className="px-4 py-2">Numéro</th>
                  <th className="px-4 py-2">Libellé</th>
                  <th className="px-4 py-2">Parent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((a) => (
                  <tr key={a.num}>
                    <td className="px-4 py-2">{a.pcgClass}</td>
                    <td className="px-4 py-2 font-mono font-medium">{a.num}</td>
                    <td className="px-4 py-2">{a.label}</td>
                    <td className="px-4 py-2 text-slate-400">{a.parentNum ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-slate-400">
        Plan comptable général (PCG) — comptes standards classes 1 à 7. Utilisé pour les écritures, l&apos;export FEC
        et la classification automatique des factures.
      </p>
    </div>
  );
}
