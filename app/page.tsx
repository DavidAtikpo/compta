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

  const handleLogout = () => {
    window.localStorage.removeItem("compta-token");
    router.replace("/login");
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Chargement…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Bonjour, {userName || userEmail} 👋
            </h1>
            <p className="text-slate-500 mt-1 text-sm">
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 shadow-sm"
          >
            Déconnexion
          </button>
        </div>

        {/* Stats */}
        {loadingStats ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-white border border-slate-200 p-6 animate-pulse shadow-sm">
                <div className="h-4 bg-slate-200 rounded w-24 mb-3" />
                <div className="h-8 bg-slate-200 rounded w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total factures</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{stats.invoices}</p>
              <p className="mt-1 text-xs text-slate-400">Documents enregistrés</p>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">En attente</p>
              <p className="mt-2 text-3xl font-bold text-amber-600">{stats.pending}</p>
              <p className="mt-1 text-xs text-slate-400">À transmettre</p>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Transmis</p>
              <p className="mt-2 text-3xl font-bold text-emerald-600">{stats.sent}</p>
              <p className="mt-1 text-xs text-slate-400">Envoyés au cabinet</p>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Taux de succès</p>
              <p className="mt-2 text-3xl font-bold text-blue-600">{stats.successRate}%</p>
              <p className="mt-1 text-xs text-slate-400">Envois réussis</p>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/invoices"
            className="rounded-2xl bg-slate-900 p-6 text-white shadow-sm hover:bg-slate-800 transition"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="font-semibold">Capturer</span>
            </div>
            <p className="text-sm text-slate-300">Photo ticket ou PDF, OCR automatique</p>
          </Link>

          <Link
            href="/optimize"
            className="rounded-2xl bg-blue-600 p-6 text-white shadow-sm hover:bg-blue-500 transition"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span className="font-semibold">Optimiser</span>
            </div>
            <p className="text-sm text-blue-100">IA fiscale — toutes les ficelles légales</p>
          </Link>

          <Link
            href="/history"
            className="rounded-2xl bg-white border border-slate-200 p-6 text-slate-900 shadow-sm hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                <svg className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="font-semibold">Historique</span>
            </div>
            <p className="text-sm text-slate-500">Envois au cabinet, logs</p>
          </Link>

          <Link
            href="/settings"
            className="rounded-2xl bg-white border border-slate-200 p-6 text-slate-900 shadow-sm hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                <svg className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="font-semibold">Paramètres</span>
            </div>
            <p className="text-sm text-slate-500">Cabinets par pays, emails</p>
          </Link>
        </div>

        {/* Recent data */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Factures récentes</h2>
              <Link href="/invoices" className="text-sm text-blue-600 hover:text-blue-700">Voir tout</Link>
            </div>
            {recentInvoices.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-400">
                <p className="text-sm">Aucune facture enregistrée.</p>
                <Link href="/invoices" className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-700">
                  Capturer la première facture
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentInvoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg">{regionFlag[inv.region] || "🌍"}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{inv.originalName}</p>
                        <p className="text-xs text-slate-400">
                          {regionLabel[inv.region] || inv.region} •{" "}
                          {new Date(inv.createdAt).toLocaleDateString("fr-FR")}
                          {inv.category ? ` • ${inv.category}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {inv.amount != null && (
                        <span className="text-sm font-medium text-slate-700">{inv.amount.toFixed(2)} €</span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
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

          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Envois récents</h2>
              <Link href="/history" className="text-sm text-blue-600 hover:text-blue-700">Voir tout</Link>
            </div>
            {recentSends.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-400">
                <p className="text-sm">Aucun envoi enregistré.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentSends.map((send) => (
                  <li key={send.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg">{regionFlag[send.region] || "🌍"}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{send.recipientEmail}</p>
                        <p className="text-xs text-slate-400">
                          {regionLabel[send.region] || send.region} • {send.filesCount} fichier(s) •{" "}
                          {new Date(send.sentAt).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
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
        <div className="rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white text-xl">
              🇫🇷
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900">Rappel fiscal — {new Date().getFullYear()}</h3>
              <p className="text-sm text-blue-700 mt-1">
                PER : déduisez jusqu'à <strong>35 194 €</strong> de votre revenu imposable.
                TVA récupérable sur achats professionnels.
                Pensez aux cotisations Madelin si vous êtes TNS.
              </p>
            </div>
            <Link
              href="/optimize"
              className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition"
            >
              Lancer l'analyse IA
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
