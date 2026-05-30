"use client";

import { useCallback, useEffect, useState } from "react";

type VatDeclaration = {
  type: "CA3" | "CA12";
  year: number;
  month?: number;
  tvaCollectee: number;
  tvaDeductible: number;
  solde: number;
  baseHTVentes: number;
  baseHTAchats: number;
  byRate: Array<{ rate: number; baseHT: number; tva: number }>;
  lineCA3: {
    ligne08_tvaBrute: number;
    ligne16_tvaDeductible: number;
    ligne23_solde: number;
  };
};

function authHeaders(): Record<string, string> {
  const t = typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function TvaPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [type, setType] = useState<"CA3" | "CA12">("CA3");
  const [decl, setDecl] = useState<VatDeclaration | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(year), type });
    if (type === "CA3") params.set("month", String(month));
    const res = await fetch(`/api/vat/declaration?${params}`, { headers: authHeaders() });
    const data = res.ok ? await res.json() : null;
    setDecl(data);
    setLoading(false);
  }, [year, month, type]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "CA3" | "CA12")}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="CA3">CA3 (mensuel / trimestriel)</option>
          <option value="CA12">CA12 (annuel)</option>
        </select>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        {type === "CA3" && (
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleDateString("fr-FR", { month: "long" })}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams({ year: String(year), type });
            if (type === "CA3") params.set("month", String(month));
            const t = typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null;
            fetch(`/api/vat/declaration/pdf?${params}`, {
              headers: t ? { Authorization: `Bearer ${t}` } : {},
            })
              .then(async (res) => {
                if (!res.ok) throw new Error("Export PDF échoué");
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download =
                  type === "CA12"
                    ? `TVA_CA12_${year}.pdf`
                    : `TVA_CA3_${year}-${String(month).padStart(2, "0")}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              })
              .catch(() => alert("Impossible de générer le PDF TVA."));
          }}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Télécharger PDF (récapitulatif)
        </button>
      </div>

      {loading ? (
        <p className="text-center text-xs text-slate-400">Calcul TVA…</p>
      ) : !decl ? (
        <p className="text-center text-xs text-rose-600">Impossible de calculer la déclaration.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] uppercase text-slate-500">TVA collectée (l.08)</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">{decl.tvaCollectee.toFixed(2)} €</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] uppercase text-slate-500">TVA déductible (l.16)</p>
              <p className="mt-1 text-xl font-bold text-indigo-700">{decl.tvaDeductible.toFixed(2)} €</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] uppercase text-slate-500">Solde à payer (l.23)</p>
              <p className={`mt-1 text-xl font-bold ${decl.solde >= 0 ? "text-rose-700" : "text-emerald-700"}`}>
                {decl.solde.toFixed(2)} €
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Récapitulatif {decl.type}</h3>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Base HT ventes</dt>
                <dd className="font-medium">{decl.baseHTVentes.toFixed(2)} €</dd>
              </div>
              <div>
                <dt className="text-slate-500">Base HT achats</dt>
                <dd className="font-medium">{decl.baseHTAchats.toFixed(2)} €</dd>
              </div>
            </dl>
            {decl.byRate.length > 0 && (
              <table className="mt-4 min-w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1">Taux TVA</th>
                    <th className="py-1">Base HT</th>
                    <th className="py-1">TVA</th>
                  </tr>
                </thead>
                <tbody>
                  {decl.byRate.map((r) => (
                    <tr key={r.rate} className="border-t border-slate-50">
                      <td className="py-1">{r.rate} %</td>
                      <td className="py-1">{r.baseHT.toFixed(2)} €</td>
                      <td className="py-1">{r.tva.toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
