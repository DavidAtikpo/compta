"use client";

import { useEffect, useMemo, useState } from "react";

type Point = { date: string; achat: number; vente: number };

function buildPath(
  points: Point[],
  key: "achat" | "vente",
  width: number,
  height: number,
  pad: number,
): string {
  if (points.length === 0) return "";
  const vals = points.map((p) => p[key]);
  const maxY = Math.max(1, ...vals);
  const minX = 0;
  const maxX = Math.max(1, points.length - 1);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  return points
    .map((p, i) => {
      const x = pad + (i / maxX) * innerW;
      const y = pad + innerH - (p[key] / maxY) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function EnterpriseAnalysePage() {
  const [series, setSeries] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const authHeaders = useMemo((): Record<string, string> => {
    if (typeof window === "undefined") return {};
    const t = window.localStorage.getItem("compta-token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const res = await fetch("/api/enterprise/analytics", { headers: authHeaders });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Impossible de charger les données.");
        setSeries([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setSeries(Array.isArray(data.series) ? data.series : []);
      setError("");
      setLoading(false);
    })();
  }, [authHeaders]);

  const w = 720;
  const h = 260;
  const pad = 28;
  const pathAchat = useMemo(() => buildPath(series, "achat", w, h, pad), [series]);
  const pathVente = useMemo(() => buildPath(series, "vente", w, h, pad), [series]);

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-400">Chargement des courbes…</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        {error}{" "}
        <a href="/settings?tab=overview" className="underline">
          Abonnement
        </a>
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
        Pas encore assez de factures datées pour tracer les courbes. Ajoutez des factures d&apos;achat ou de vente avec
        une date.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Montants TTC cumulés par jour (date sur la facture, sinon date d&apos;ajout). Courbe{" "}
        <span className="font-semibold text-indigo-600">achats</span> vs{" "}
        <span className="font-semibold text-emerald-600">ventes</span>.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white p-4">
        <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full min-w-[320px] max-w-[720px]">
          <rect x={0} y={0} width={w} height={h} fill="#fafafa" rx={8} />
          <text x={pad} y={18} className="fill-slate-500 text-[11px]">
            € (max normalisé par série)
          </text>
          <path d={pathAchat} fill="none" stroke="#4f46e5" strokeWidth={2} />
          <path d={pathVente} fill="none" stroke="#059669" strokeWidth={2} />
        </svg>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-4 rounded-sm bg-indigo-600" /> Achats
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-4 rounded-sm bg-emerald-600" /> Ventes
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-100">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Achats (€)</th>
              <th className="px-3 py-2 text-right">Ventes (€)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {series.map((r) => (
              <tr key={r.date}>
                <td className="px-3 py-1.5 font-mono text-slate-700">{r.date}</td>
                <td className="px-3 py-1.5 text-right text-indigo-700">{r.achat.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right text-emerald-700">{r.vente.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
