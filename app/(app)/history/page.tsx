"use client";

import { useEffect, useState } from "react";

const regionOptions = [
  { value: "france", label: "France", flag: "🇫🇷" },
  { value: "togo", label: "Togo", flag: "🇹🇬" },
  { value: "vietnam", label: "Vietnam", flag: "🇻🇳" },
  { value: "autre", label: "Autre", flag: "🌍" },
];

interface SendRecord {
  id: string;
  region: string;
  recipientEmail: string;
  message: string;
  filesCount: number;
  sentAt: string;
  success: boolean;
  error: string | null;
}

export default function HistoryPage() {
  const [records, setRecords] = useState<SendRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRegion, setFilterRegion] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async (region?: string) => {
    setLoading(true);
    try {
      let url = "/api/history?limit=200";
      if (region) url += `&region=${region}`;
      const res = await fetch(url);
      if (res.ok) setRecords(await res.json());
    } catch (err) {
      console.error("Erreur chargement historique:", err);
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    total: records.length,
    success: records.filter((r) => r.success).length,
    failure: records.filter((r) => !r.success).length,
    totalFiles: records.reduce((sum, r) => sum + r.filesCount, 0),
    byRegion: regionOptions.map((opt) => ({
      ...opt,
      count: records.filter((r) => r.region === opt.value).length,
    })),
  };

  const regionLabel = (r: string) =>
    regionOptions.find((o) => o.value === r)?.label || r;
  const regionFlag = (r: string) =>
    regionOptions.find((o) => o.value === r)?.flag || "🌍";

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Historique des transmissions</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Log complet de tous les envois au cabinet comptable
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total envois</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{stats.total}</p>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Réussis</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">{stats.success}</p>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Échecs</p>
            <p className="mt-2 text-3xl font-bold text-rose-600">{stats.failure}</p>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Fichiers transmis</p>
            <p className="mt-2 text-3xl font-bold text-blue-600">{stats.totalFiles}</p>
          </div>
        </div>

        {/* By region */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.byRegion.map((opt) => (
            <div key={opt.value} className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm flex items-center gap-3">
              <span className="text-2xl">{opt.flag}</span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{opt.label}</p>
                <p className="text-xs text-slate-400">{opt.count} envoi(s)</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters + list */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <h2 className="font-semibold text-slate-900">Journal des envois</h2>
            <div className="flex items-center gap-3">
              <select
                value={filterRegion}
                onChange={(e) => {
                  setFilterRegion(e.target.value);
                  loadHistory(e.target.value || undefined);
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 focus:outline-none"
              >
                <option value="">Toutes régions</option>
                {regionOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.flag} {o.label}</option>
                ))}
              </select>
              <button
                onClick={() => loadHistory(filterRegion || undefined)}
                className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200 transition"
              >
                Actualiser
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-4xl mb-3">📭</p>
              <p className="font-medium text-slate-600">Aucun envoi enregistré</p>
              <p className="text-sm mt-1">Les transmissions au cabinet apparaîtront ici.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {records.map((record) => (
                <div key={record.id} className="hover:bg-slate-50 transition">
                  <button
                    className="w-full flex items-start justify-between px-6 py-4 text-left"
                    onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl shrink-0">{regionFlag(record.region)}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {record.recipientEmail}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {regionLabel(record.region)} •{" "}
                          {record.filesCount} fichier(s) •{" "}
                          {new Date(record.sentAt).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        record.success
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700"
                      }`}>
                        {record.success ? "Succès" : "Échec"}
                      </span>
                      <svg
                        className={`h-4 w-4 text-slate-400 transition-transform ${expandedId === record.id ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {expandedId === record.id && (
                    <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Destinataire</p>
                        <p className="text-sm text-slate-800">{record.recipientEmail}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Message envoyé</p>
                        <p className="text-sm text-slate-700 leading-5 whitespace-pre-wrap bg-white rounded-xl border border-slate-200 p-3 max-h-36 overflow-y-auto">
                          {record.message}
                        </p>
                      </div>
                      {!record.success && record.error && (
                        <div>
                          <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide mb-1">Erreur</p>
                          <p className="text-sm text-rose-700 bg-rose-50 rounded-xl p-3">{record.error}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
