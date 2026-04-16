"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Stats {
  invoices: number;
  sent: number;
  pending: number;
  successRate: number;
}

interface RecentInvoice {
  id: string;
  originalName: string;
  region: string;
  status: string;
  amount: number | null;
  category: string | null;
  createdAt: string;
}

interface RecentSend {
  id: string;
  region: string;
  recipientEmail: string;
  filesCount: number;
  sentAt: string;
  success: boolean;
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

  const [stats, setStats] = useState<Stats>({ invoices: 0, sent: 0, pending: 0, successRate: 0 });
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);
  const [recentSends, setRecentSends] = useState<RecentSend[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

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
      const [invoicesRes, historyRes, allInvoicesRes, allHistoryRes] = await Promise.all([
        fetch("/api/invoices?limit=5"),
        fetch("/api/history?limit=5"),
        fetch("/api/invoices?limit=1000"),
        fetch("/api/history?limit=1000"),
      ]);

      const invoices: RecentInvoice[] = invoicesRes.ok ? await invoicesRes.json() : [];
      const history: RecentSend[] = historyRes.ok ? await historyRes.json() : [];
      const allInvoices: RecentInvoice[] = allInvoicesRes.ok ? await allInvoicesRes.json() : [];
      const allHistory: RecentSend[] = allHistoryRes.ok ? await allHistoryRes.json() : [];

      const successCount = allHistory.filter((h) => h.success).length;
      setStats({
        invoices: allInvoices.length,
        sent: allInvoices.filter((i) => i.status === "sent").length,
        pending: allInvoices.filter((i) => i.status === "pending").length,
        successRate: allHistory.length > 0 ? Math.round((successCount / allHistory.length) * 100) : 0,
      });
      setRecentInvoices(invoices.slice(0, 5));
      setRecentSends(history.slice(0, 5));
    } catch (err) {
      console.error("Erreur chargement dashboard:", err);
    } finally {
      setLoadingStats(false);
    }
  };

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
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">En attente</p>
              <p className="mt-1.5 text-2xl font-bold text-amber-600">{stats.pending}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">À transmettre</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Transmis</p>
              <p className="mt-1.5 text-2xl font-bold text-emerald-600">{stats.sent}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">Envoyés au cabinet</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Taux de succès</p>
              <p className="mt-1.5 text-2xl font-bold text-blue-600">{stats.successRate}%</p>
              <p className="mt-0.5 text-[10px] text-slate-400">Envois réussis</p>
            </div>
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
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        inv.status === "sent" ? "bg-emerald-100 text-emerald-700"
                        : inv.status === "archived" ? "bg-slate-100 text-slate-600"
                        : "bg-amber-100 text-amber-700"
                      }`}>
                        {inv.status === "sent" ? "Envoyé" : inv.status === "archived" ? "Archivé" : "En attente"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-slate-900">Envois récents</h2>
              <Link href="/history" className="text-xs text-blue-600 hover:text-blue-700">Voir tout</Link>
            </div>
            {recentSends.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-400">
                <p className="text-xs">Aucun envoi enregistré.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentSends.map((send) => (
                  <li key={send.id} className="flex items-center justify-between px-4 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-base">{regionFlag[send.region] || "🌍"}</span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-900">{send.recipientEmail}</p>
                        <p className="text-[10px] text-slate-400">
                          {regionLabel[send.region] || send.region} • {send.filesCount} fichier(s) •{" "}
                          {new Date(send.sentAt).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                    </div>
                    <span className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      send.success ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    }`}>
                      {send.success ? "Succès" : "Échec"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
