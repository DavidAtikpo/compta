"use client";

import { useEffect, useMemo, useState } from "react";

type Point = { month: string; achat: number; vente: number };

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

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
}

export default function EnterpriseStatistiquesPage() {
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
      const res = await fetch("/api/enterprise/stats/monthly", { headers: authHeaders });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Impossible de charger les statistiques.");
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
  const h = 280;
  const pad = 36;
  const pathAchat = useMemo(() => buildPath(series, "achat", w, h, pad), [series]);
  const pathVente = useMemo(() => buildPath(series, "vente", w, h, pad), [series]);

  const maxAchat = useMemo(() => Math.max(0, ...series.map((p) => p.achat)), [series]);
  const maxVente = useMemo(() => Math.max(0, ...series.map((p) => p.vente)), [series]);
  const hasData = series.some((p) => p.achat > 0 || p.vente > 0);

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-400">Chargement des statistiques…</div>;
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
        Aucune période à afficher. Vérifiez vos factures avec une date de facture ou une date d&apos;ajout.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Montants TTC <strong className="text-slate-800">par mois calendaire</strong>, selon la{" "}
        <strong className="text-slate-800">date sur la facture</strong> (sinon date d&apos;ajout). Courbes{" "}
        <span className="font-semibold text-indigo-600">achats</span> et{" "}
        <span className="font-semibold text-emerald-600">ventes</span> — échelle normalisée par série (max de chaque
        courbe = hauteur du graphique).
      </p>

      {!hasData ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          Aucun montant sur la période. Les mois affichés incluent des zéros tant qu&apos;il n&apos;y a pas de factures
          datées dans l&apos;intervalle.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full min-w-[320px] max-w-[720px]">
            <rect x={0} y={0} width={w} height={h} fill="#fafafa" rx={8} />
            <text x={pad} y={20} className="fill-slate-500 text-[11px]">
              € — max achats {maxAchat.toFixed(0)} · max ventes {maxVente.toFixed(0)}
            </text>
            <path d={pathAchat} fill="none" stroke="#4f46e5" strokeWidth={2.5} strokeLinejoin="round" />
            <path d={pathVente} fill="none" stroke="#059669" strokeWidth={2.5} strokeLinejoin="round" />
          </svg>
          <div
            className="mt-1 grid max-w-[720px] gap-0.5 px-1"
            style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}
          >
            {series.map((p) => (
              <div key={p.month} className="truncate text-center text-[9px] leading-tight text-slate-500" title={p.month}>
                {monthLabel(p.month)}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-4 rounded-sm bg-indigo-600" /> Achats (TTC / mois)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-4 rounded-sm bg-emerald-600" /> Ventes (TTC / mois)
            </span>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2">Mois (facture)</th>
              <th className="px-3 py-2 text-right">Achats TTC (€)</th>
              <th className="px-3 py-2 text-right">Ventes TTC (€)</th>
              <th className="px-3 py-2 text-right">Total (€)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {series.map((r) => {
              const total = r.achat + r.vente;
              const muted = total === 0;
              return (
                <tr key={r.month} className={muted ? "text-slate-400" : ""}>
                  <td className="px-3 py-1.5 font-mono text-slate-700">{r.month}</td>
                  <td className="px-3 py-1.5 text-right text-indigo-700">{r.achat.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right text-emerald-700">{r.vente.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right font-medium text-slate-800">{total.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
