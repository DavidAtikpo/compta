"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  invoiceWorkflowBadge,
  invoiceWorkflowBadgeClass,
  isAwaitingUserConfirmation,
  isUserConfirmed,
} from "@/lib/invoice-workflow-ui";
import { isInvoiceExtractionDone } from "@/lib/invoice-extraction-marker";

interface Stats {
  invoices: number;
  toConfirm: number;
  confirmed: number;
  toExtract: number;
}

interface RecentInvoice {
  id: string;
  originalName: string;
  region: string;
  status: string;
  amount: number | null;
  category: string | null;
  createdAt: string;
  userConfirmedAt?: string | null;
  fileUrl?: string | null;
  ocrText?: string | null;
  montantTTC?: number | null;
}

const regionLabel: Record<string, string> = {
  france: "France",
  togo: "Togo",
  vietnam: "Vietnam",
  autre: "Autre",
};

const regionFlag: Record<string, string> = {
  france: "🇫🇷",
  togo: "🇹🇬",
  vietnam: "🇻🇳",
  autre: "🌍",
};

export default function DashboardPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [ready, setReady] = useState(false);

  const [stats, setStats] = useState<Stats>({ invoices: 0, toConfirm: 0, confirmed: 0, toExtract: 0 });
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [analyticsSeries, setAnalyticsSeries] = useState<{ date: string; achat: number; vente: number }[]>([]);
  const [byCategory, setByCategory] = useState<{ category: string; count: number }[]>([]);

  useEffect(() => {
    const token = window.localStorage.getItem("compta-token");
    if (!token) {
      router.replace("/login");
      return;
    }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (!d.email) {
          window.localStorage.removeItem("compta-token");
          router.replace("/login");
        } else {
          setUserEmail(d.email);
          setUserName(d.name || "");
          setReady(true);
          loadDashboardData();
        }
      })
      .catch(() => {
        window.localStorage.removeItem("compta-token");
        router.replace("/login");
      });
  }, [router]);

  const loadDashboardData = async () => {
    setLoadingStats(true);
    try {
      const t = typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null;
      const headers: Record<string, string> = {};
      if (t) headers.Authorization = `Bearer ${t}`;
      const [invoicesRes, allInvoicesRes, analyticsRes] = await Promise.all([
        fetch("/api/invoices?limit=5", { headers }),
        fetch("/api/invoices?limit=1000", { headers }),
        fetch("/api/analytics", { headers }),
      ]);

      const invoices: RecentInvoice[] = invoicesRes.ok ? await invoicesRes.json() : [];
      const allInvoices: RecentInvoice[] = allInvoicesRes.ok ? await allInvoicesRes.json() : [];

      setStats({
        invoices: allInvoices.length,
        toConfirm: allInvoices.filter((i) => isAwaitingUserConfirmation(i)).length,
        confirmed: allInvoices.filter((i) => isUserConfirmed(i) && i.status !== "archived").length,
        toExtract: allInvoices.filter((i) => i.fileUrl && !isInvoiceExtractionDone(i)).length,
      });
      setRecentInvoices(invoices.slice(0, 5));

      if (analyticsRes.ok) {
        const analytics = await analyticsRes.json();
        setAnalyticsSeries(Array.isArray(analytics.series) ? analytics.series : []);
        setByCategory(Array.isArray(analytics.byCategory) ? analytics.byCategory : []);
      }
    } catch (err) {
      console.error("Erreur chargement dashboard:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  const chartPath = useMemo(() => {
    const w = 640;
    const h = 180;
    const pad = 24;
    if (analyticsSeries.length < 2) return "";
    const max = Math.max(1, ...analyticsSeries.flatMap((p) => [p.achat, p.vente]));
    const step = (w - pad * 2) / (analyticsSeries.length - 1);
    const toY = (v: number) => h - pad - (v / max) * (h - pad * 2);
    const achatPts = analyticsSeries.map((p, i) => `${pad + i * step},${toY(p.achat)}`);
    const ventePts = analyticsSeries.map((p, i) => `${pad + i * step},${toY(p.vente)}`);
    return { w, h, achat: `M ${achatPts.join(" L ")}`, vente: `M ${ventePts.join(" L ")}` };
  }, [analyticsSeries]);

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="text-slate-400 text-sm">Chargement…</div>
      </div>
    );
  }

  return (
    <div className="px-3 py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Bonjour, {userName || userEmail} 👋
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {new Date().toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Raccourcis mobile : Fichiers & Historique (absents de la barre du bas) */}
        <div className="grid grid-cols-2 gap-2 lg:hidden">
          <Link
            href="/fichiers"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition active:scale-[0.99] hover:border-slate-300 hover:bg-slate-50"
          >
            <svg className="h-5 w-5 shrink-0 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Fichiers
          </Link>
          <Link
            href="/history"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition active:scale-[0.99] hover:border-slate-300 hover:bg-slate-50"
          >
            <svg className="h-5 w-5 shrink-0 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Historique
          </Link>
        </div>

        {/* Stats */}
        {loadingStats ? (
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 h-3 w-20 rounded bg-slate-200" />
                <div className="h-7 w-14 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Total factures</p>
              <p className="mt-1.5 text-2xl font-bold text-slate-900">{stats.invoices}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">Documents enregistrés</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">À confirmer</p>
              <p className="mt-1.5 text-2xl font-bold text-indigo-600">{stats.toConfirm}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">Extraction validée</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Confirmées</p>
              <p className="mt-1.5 text-2xl font-bold text-emerald-600">{stats.confirmed}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">Montants validés</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">À extraire</p>
              <p className="mt-1.5 text-2xl font-bold text-amber-600">{stats.toExtract}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">OCR / IA en attente</p>
            </div>
          </div>
        )}

        {/* Graphiques analytiques */}
        {analyticsSeries.length > 1 && chartPath && typeof chartPath !== "string" && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Activité (90 derniers jours)</h2>
            <p className="mt-0.5 text-[10px] text-slate-500">Nombre de factures achat vs vente par jour</p>
            <svg viewBox={`0 0 ${chartPath.w} ${chartPath.h}`} className="mt-3 h-auto w-full max-h-[200px]">
              <rect width={chartPath.w} height={chartPath.h} fill="#fafafa" rx={8} />
              <path d={chartPath.achat} fill="none" stroke="#4f46e5" strokeWidth={2} />
              <path d={chartPath.vente} fill="none" stroke="#059669" strokeWidth={2} />
            </svg>
            <div className="mt-2 flex gap-4 text-[10px] text-slate-600">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-indigo-600" /> Achats</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-emerald-600" /> Ventes</span>
            </div>
            {byCategory.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-[10px] font-medium text-slate-700">Répartition par catégorie</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {byCategory.map((c) => (
                    <span key={c.category} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">
                      {c.category} ({c.count})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent data */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-slate-900">Factures récentes</h2>
              <Link href="/invoices" className="text-xs text-blue-600 hover:text-blue-700">Voir tout</Link>
            </div>
            {recentInvoices.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-400">
                <p className="text-xs">Aucune facture enregistrée.</p>
                <Link href="/invoices" className="mt-1.5 inline-block text-xs text-blue-600 hover:text-blue-700">
                  Capturer la première facture
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentInvoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between px-4 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-base">{regionFlag[inv.region] || "🌍"}</span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-900">{inv.originalName}</p>
                        <p className="text-[10px] text-slate-400">
                          {regionLabel[inv.region] || inv.region} •{" "}
                          {new Date(inv.createdAt).toLocaleDateString("fr-FR")}
                          {inv.category ? ` • ${inv.category}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="ml-2 flex shrink-0 items-center gap-1.5">
                      {inv.amount != null && (
                        <span className="text-xs font-medium text-slate-700">{inv.amount.toFixed(2)} €</span>
                      )}
                      {(() => {
                        const wf = invoiceWorkflowBadge(inv);
                        return (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${invoiceWorkflowBadgeClass(wf.tone)}`}
                          >
                            {wf.label}
                          </span>
                        );
                      })()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-slate-900">Conseiller fiscal IA</h2>
              <Link href="/history" className="text-xs text-blue-600 hover:text-blue-700">Historique IA</Link>
            </div>
            <div className="px-4 py-6 text-center text-slate-500">
              <p className="text-xs leading-relaxed">
                Posez vos questions sur la page{" "}
                <Link href="/optimize" className="font-medium text-blue-600 hover:text-blue-700">
                  Optimisation IA
                </Link>
                . Les échanges sont enregistrés dans l&apos;historique.
              </p>
            </div>
          </div>
        </div>

        {/* Fiscal tip */}
        <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-base text-white">
              🇫🇷
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900">Rappel fiscal — {new Date().getFullYear()}</h3>
              <p className="mt-0.5 text-xs text-blue-700">
                PER : déduisez jusqu'à <strong>35 194 €</strong> de votre revenu imposable.
                TVA récupérable sur achats professionnels.
                Pensez aux cotisations Madelin si vous êtes TNS.
              </p>
            </div>
            <Link
              href="/optimize"
              className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
            >
              Lancer l'analyse IA
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
