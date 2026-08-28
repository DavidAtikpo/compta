"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type DayPoint = { date: string; achat: number; vente: number };
type MonthPoint = { month: string; achat: number; vente: number };

function buildPath<T extends DayPoint | MonthPoint>(
  points: T[],
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
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
}

function ReportingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "month" ? "month" : "day";

  const [daySeries, setDaySeries] = useState<DayPoint[]>([]);
  const [monthSeries, setMonthSeries] = useState<MonthPoint[]>([]);
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
      setError("");
      try {
        const [dayRes, monthRes] = await Promise.all([
          fetch("/api/enterprise/analytics", { headers: authHeaders }),
          fetch("/api/enterprise/stats/monthly", { headers: authHeaders }),
        ]);
        if (!dayRes.ok || !monthRes.ok) {
          const d = await (dayRes.ok ? monthRes : dayRes).json().catch(() => ({}));
          setError(d.error || "Impossible de charger le reporting.");
          setDaySeries([]);
          setMonthSeries([]);
          return;
        }
        const dayData = await dayRes.json();
        const monthData = await monthRes.json();
        setDaySeries(Array.isArray(dayData.series) ? dayData.series : []);
        setMonthSeries(Array.isArray(monthData.series) ? monthData.series : []);
      } catch {
        setError("Erreur réseau.");
      } finally {
        setLoading(false);
      }
    })();
  }, [authHeaders]);

  const setTab = (next: "day" | "month") => {
    router.replace(`/enterprise/reporting?tab=${next}`);
  };

  const w = 720;
  const dayH = 260;
  const monthH = 280;
  const dayPad = 28;
  const monthPad = 36;
  const dayPathAchat = useMemo(() => buildPath(daySeries, "achat", w, dayH, dayPad), [daySeries]);
  const dayPathVente = useMemo(() => buildPath(daySeries, "vente", w, dayH, dayPad), [daySeries]);
  const monthPathAchat = useMemo(() => buildPath(monthSeries, "achat", w, monthH, monthPad), [monthSeries]);
  const monthPathVente = useMemo(() => buildPath(monthSeries, "vente", w, monthH, monthPad), [monthSeries]);
  const maxAchat = useMemo(() => Math.max(0, ...monthSeries.map((p) => p.achat)), [monthSeries]);
  const maxVente = useMemo(() => Math.max(0, ...monthSeries.map((p) => p.vente)), [monthSeries]);
  const hasMonthData = monthSeries.some((p) => p.achat > 0 || p.vente > 0);

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-400">Chargement du reporting…</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        {error}{" "}
        <Link href="/settings?tab=overview" className="underline">
          Abonnement
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab("day")}
          className={`rounded px-3 py-1 text-xs font-medium transition ${
            tab === "day" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Par jour
        </button>
        <button
          type="button"
          onClick={() => setTab("month")}
          className={`rounded px-3 py-1 text-xs font-medium transition ${
            tab === "month" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Par mois
        </button>
      </div>

      {tab === "day" ? (
        daySeries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            Pas encore assez de factures datées pour tracer les courbes journalières.
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Montants TTC cumulés <strong>par jour</strong> (date sur la facture, sinon date d&apos;ajout).
            </p>
            <ChartBlock w={w} h={dayH} pad={dayPad} pathAchat={dayPathAchat} pathVente={dayPathVente} subtitle="€ (max normalisé par série)" />
            <DayTable series={daySeries} />
          </>
        )
      ) : monthSeries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          Aucune période mensuelle à afficher.
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Montants TTC <strong>par mois calendaire</strong>, selon la date sur la facture.
          </p>
          {!hasMonthData ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              Aucun montant sur la période mensuelle.
            </div>
          ) : (
            <>
              <ChartBlock
                w={w}
                h={monthH}
                pad={monthPad}
                pathAchat={monthPathAchat}
                pathVente={monthPathVente}
                subtitle={`€ — max achats ${maxAchat.toFixed(0)} · max ventes ${maxVente.toFixed(0)}`}
                monthLabels={monthSeries.map((p) => p.month)}
              />
              <MonthTable series={monthSeries} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function ChartBlock({
  w,
  h,
  pad,
  pathAchat,
  pathVente,
  subtitle,
  monthLabels,
}: {
  w: number;
  h: number;
  pad: number;
  pathAchat: string;
  pathVente: string;
  subtitle: string;
  monthLabels?: string[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full min-w-[320px] max-w-[720px]">
        <rect x={0} y={0} width={w} height={h} fill="#fafafa" rx={8} />
        <text x={pad} y={18} className="fill-slate-500 text-[11px]">
          {subtitle}
        </text>
        <path d={pathAchat} fill="none" stroke="#4f46e5" strokeWidth={2.5} strokeLinejoin="round" />
        <path d={pathVente} fill="none" stroke="#059669" strokeWidth={2.5} strokeLinejoin="round" />
      </svg>
      {monthLabels && monthLabels.length > 0 && (
        <div
          className="mt-1 grid max-w-[720px] gap-0.5 px-1"
          style={{ gridTemplateColumns: `repeat(${monthLabels.length}, minmax(0, 1fr))` }}
        >
          {monthLabels.map((m) => (
            <div key={m} className="truncate text-center text-[9px] leading-tight text-slate-500" title={m}>
              {monthLabel(m)}
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-indigo-600" /> Achats
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-emerald-600" /> Ventes
        </span>
      </div>
    </div>
  );
}

function DayTable({ series }: { series: DayPoint[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
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
  );
}

function MonthTable({ series }: { series: MonthPoint[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2">Mois</th>
            <th className="px-3 py-2 text-right">Achats TTC (€)</th>
            <th className="px-3 py-2 text-right">Ventes TTC (€)</th>
            <th className="px-3 py-2 text-right">Total (€)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {series.map((r) => {
            const total = r.achat + r.vente;
            return (
              <tr key={r.month} className={total === 0 ? "text-slate-400" : ""}>
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
  );
}

export default function EnterpriseReportingPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-slate-400">Chargement…</div>}>
      <ReportingContent />
    </Suspense>
  );
}
