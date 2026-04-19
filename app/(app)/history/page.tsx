"use client";

import { useCallback, useEffect, useState } from "react";

function getAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (typeof window === "undefined") return h;
  const t = window.localStorage.getItem("compta-token");
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

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

interface AiHistoryRecord {
  id: string;
  invoiceId: string | null;
  prompt: string;
  response: string;
  region: string;
  createdAt: string;
}

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState<"send" | "ia">("send");
  const [records, setRecords] = useState<SendRecord[]>([]);
  const [aiRecords, setAiRecords] = useState<AiHistoryRecord[]>([]);
  const [loadingSend, setLoadingSend] = useState(true);
  const [loadingAi, setLoadingAi] = useState(false);
  const [filterRegion, setFilterRegion] = useState("");
  const [expandedSendId, setExpandedSendId] = useState<string | null>(null);
  const [expandedAiId, setExpandedAiId] = useState<string | null>(null);
  const [iaAuthError, setIaAuthError] = useState(false);
  const [iaDeleting, setIaDeleting] = useState(false);

  const loadHistory = useCallback(async (region?: string) => {
    setLoadingSend(true);
    try {
      let url = "/api/history?limit=200";
      if (region) url += `&region=${region}`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.ok) setRecords(await res.json());
    } catch (err) {
      console.error("Erreur chargement historique:", err);
    } finally {
      setLoadingSend(false);
    }
  }, []);

  const loadAiHistory = useCallback(async (region?: string) => {
    setLoadingAi(true);
    setIaAuthError(false);
    try {
      let url = "/api/ai/history?limit=200";
      if (region) url += `&region=${region}`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.status === 401) {
        setAiRecords([]);
        setIaAuthError(true);
        return;
      }
      if (res.ok) setAiRecords(await res.json());
    } catch (err) {
      console.error("Erreur chargement historique IA:", err);
    } finally {
      setLoadingAi(false);
    }
  }, []);

  const deleteAiEntry = async (id: string) => {
    if (!window.confirm("Supprimer cet échange ?")) return;
    setIaDeleting(true);
    try {
      const res = await fetch(`/api/ai/history?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setAiRecords((prev) => prev.filter((r) => r.id !== id));
        setExpandedAiId((e) => (e === id ? null : e));
      }
    } finally {
      setIaDeleting(false);
    }
  };

  const deleteAllAiHistory = async () => {
    if (!window.confirm("Supprimer tout l’historique IA affiché pour votre compte ? Cette action est irréversible."))
      return;
    setIaDeleting(true);
    try {
      const res = await fetch("/api/ai/history?all=1", {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setAiRecords([]);
        setExpandedAiId(null);
      }
    } finally {
      setIaDeleting(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (activeTab === "ia") loadAiHistory(filterRegion || undefined);
  }, [activeTab, filterRegion, loadAiHistory]);

  const sendStats = {
    total: records.length,
    success: records.filter((r) => r.success).length,
    failure: records.filter((r) => !r.success).length,
    totalFiles: records.reduce((sum, r) => sum + r.filesCount, 0),
    byRegion: regionOptions.map((opt) => ({
      ...opt,
      count: records.filter((r) => r.region === opt.value).length,
    })),
  };

  const aiStats = {
    total: aiRecords.length,
    byRegion: regionOptions.map((opt) => ({
      ...opt,
      count: aiRecords.filter((r) => r.region === opt.value).length,
    })),
  };

  const regionsWithSendData = sendStats.byRegion.filter((r) => r.count > 0);
  const regionsWithAiData = aiStats.byRegion.filter((r) => r.count > 0);

  const regionLabel = (r: string) =>
    regionOptions.find((o) => o.value === r)?.label || r;
  const regionFlag = (r: string) =>
    regionOptions.find((o) => o.value === r)?.flag || "🌍";

  const promptPreview = (text: string, max = 100) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
  };

  return (
    <div className="px-3 py-4 sm:px-4 sm:py-5 lg:px-5 lg:py-6">
      <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-5">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Historique</h1>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500 sm:text-xs sm:leading-relaxed">
            Transmissions au cabinet comptable et échanges avec le conseiller fiscal IA
          </p>
        </div>

        {/* Onglets */}
        <div className="flex gap-0.5 rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 sm:inline-flex">
          <button
            type="button"
            onClick={() => {
              setActiveTab("send");
              setExpandedAiId(null);
            }}
            className={`flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition sm:flex-none sm:px-3 sm:text-xs ${
              activeTab === "send"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Transmissions
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("ia");
              setExpandedSendId(null);
            }}
            className={`flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition sm:flex-none sm:px-3 sm:text-xs ${
              activeTab === "ia"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Conseiller IA
          </button>
        </div>

        {activeTab === "send" && (
          <>
            {/* Stats envois — une ligne de 4 sur mobile, alignés (libellé + chiffre centrés) */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
              <div className="flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-slate-200 bg-white px-1 py-2 text-center shadow-sm sm:min-h-0 sm:items-stretch sm:justify-start sm:gap-0 sm:rounded-2xl sm:p-3.5 sm:text-left">
                <p className="text-[9px] font-medium uppercase leading-tight tracking-wide text-slate-500 sm:text-[11px]">Total envois</p>
                <p className="text-lg font-bold tabular-nums leading-none text-slate-900 sm:mt-1.5 sm:text-2xl">{sendStats.total}</p>
              </div>
              <div className="flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-slate-200 bg-white px-1 py-2 text-center shadow-sm sm:min-h-0 sm:items-stretch sm:justify-start sm:gap-0 sm:rounded-2xl sm:p-3.5 sm:text-left">
                <p className="text-[9px] font-medium uppercase leading-tight tracking-wide text-slate-500 sm:text-[11px]">Réussis</p>
                <p className="text-lg font-bold tabular-nums leading-none text-emerald-600 sm:mt-1.5 sm:text-2xl">{sendStats.success}</p>
              </div>
              <div className="flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-slate-200 bg-white px-1 py-2 text-center shadow-sm sm:min-h-0 sm:items-stretch sm:justify-start sm:gap-0 sm:rounded-2xl sm:p-3.5 sm:text-left">
                <p className="text-[9px] font-medium uppercase leading-tight tracking-wide text-slate-500 sm:text-[11px]">Échecs</p>
                <p className="text-lg font-bold tabular-nums leading-none text-rose-600 sm:mt-1.5 sm:text-2xl">{sendStats.failure}</p>
              </div>
              <div className="flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-slate-200 bg-white px-1 py-2 text-center shadow-sm sm:min-h-0 sm:items-stretch sm:justify-start sm:gap-0 sm:rounded-2xl sm:p-3.5 sm:text-left">
                <p className="text-[9px] font-medium uppercase leading-tight tracking-wide text-slate-500 sm:text-[11px]">Fichiers</p>
                <p className="text-lg font-bold tabular-nums leading-none text-blue-600 sm:mt-1.5 sm:text-2xl">{sendStats.totalFiles}</p>
              </div>
            </div>

            {regionsWithSendData.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4">
                {regionsWithSendData.map((opt) => (
                  <div key={opt.value} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:gap-2.5 sm:p-3 sm:rounded-2xl">
                    <span className="text-lg sm:text-xl">{opt.flag}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900 sm:text-sm">{opt.label}</p>
                      <p className="text-[10px] text-slate-400 sm:text-xs">{opt.count} envoi(s)</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
              <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3">
                <h2 className="text-xs font-semibold text-slate-900 sm:text-sm">Journal des envois</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={filterRegion}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFilterRegion(v);
                      loadHistory(v || undefined);
                    }}
                    className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 focus:outline-none sm:flex-none sm:px-2.5 sm:text-xs"
                  >
                    <option value="">Toutes régions</option>
                    {regionOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.flag} {o.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => loadHistory(filterRegion || undefined)}
                    className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] text-slate-700 transition hover:bg-slate-200 sm:px-2.5 sm:text-xs"
                  >
                    Actualiser
                  </button>
                </div>
              </div>

              {loadingSend ? (
                <div className="space-y-2 p-3 sm:p-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100 sm:h-12 sm:rounded-xl" />
                  ))}
                </div>
              ) : records.length === 0 ? (
                <div className="px-3 py-8 text-center text-slate-400 sm:py-10">
                  <p className="mb-2 text-2xl sm:text-3xl">📭</p>
                  <p className="text-xs font-medium text-slate-600 sm:text-sm">Aucun envoi enregistré</p>
                  <p className="mt-0.5 text-[11px] sm:text-xs">Les transmissions au cabinet apparaîtront ici.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {records.map((record) => (
                    <div key={record.id} className="transition hover:bg-slate-50">
                      <button
                        type="button"
                        className="flex w-full items-start justify-between px-3 py-2.5 text-left sm:px-4 sm:py-3"
                        onClick={() => setExpandedSendId(expandedSendId === record.id ? null : record.id)}
                      >
                        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
                          <span className="shrink-0 text-base sm:text-lg">{regionFlag(record.region)}</span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-slate-900 sm:text-sm">
                              {record.recipientEmail}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-400 sm:text-xs">
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
                        <div className="ml-2 flex shrink-0 items-center gap-1.5 sm:ml-3 sm:gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium sm:text-xs ${
                            record.success
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}>
                            {record.success ? "Succès" : "Échec"}
                          </span>
                          <svg
                            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform sm:h-4 sm:w-4 ${expandedSendId === record.id ? "rotate-180" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {expandedSendId === record.id && (
                        <div className="space-y-2 border-t border-slate-100 bg-slate-50 px-3 py-3 sm:space-y-2.5 sm:px-4 sm:py-3.5">
                          <div>
                            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Destinataire</p>
                            <p className="break-all text-xs text-slate-800 sm:text-sm">{record.recipientEmail}</p>
                          </div>
                          <div>
                            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Message envoyé</p>
                            <p className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2 text-[11px] leading-snug text-slate-700 sm:max-h-36 sm:rounded-xl sm:p-2.5 sm:text-xs sm:leading-5">
                              {record.message}
                            </p>
                          </div>
                          {!record.success && record.error && (
                            <div>
                              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600 sm:text-xs">Erreur</p>
                              <p className="rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700 sm:rounded-xl sm:p-2.5 sm:text-sm">{record.error}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "ia" && (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-2xl sm:p-3.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:text-[11px]">Échanges IA</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 sm:mt-1.5 sm:text-2xl">{aiStats.total}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:col-span-2 sm:rounded-2xl sm:p-3.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:text-[11px]">Origine</p>
                <p className="mt-1 text-[11px] leading-snug text-slate-600 sm:text-xs sm:leading-relaxed">
                  Chaque question/réponse du conseiller fiscal (page Optimisation) est enregistrée côté serveur lorsqu&apos;une réponse est obtenue.
                </p>
              </div>
            </div>

            {regionsWithAiData.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4">
                {regionsWithAiData.map((opt) => (
                  <div key={opt.value} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:gap-2.5 sm:p-3 sm:rounded-2xl">
                    <span className="text-lg sm:text-xl">{opt.flag}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900 sm:text-sm">{opt.label}</p>
                      <p className="text-[10px] text-slate-400 sm:text-xs">{opt.count} échange(s)</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
              <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3">
                <h2 className="text-xs font-semibold text-slate-900 sm:text-sm">Historique conseiller IA</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={filterRegion}
                    onChange={(e) => setFilterRegion(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 focus:outline-none sm:flex-none sm:px-2.5 sm:text-xs"
                  >
                    <option value="">Toutes régions</option>
                    {regionOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.flag} {o.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => loadAiHistory(filterRegion || undefined)}
                    disabled={iaDeleting}
                    className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] text-slate-700 transition hover:bg-slate-200 disabled:opacity-50 sm:px-2.5 sm:text-xs"
                  >
                    Actualiser
                  </button>
                  {aiRecords.length > 0 && !iaAuthError && (
                    <button
                      type="button"
                      onClick={() => void deleteAllAiHistory()}
                      disabled={iaDeleting}
                      className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 sm:px-2.5 sm:text-xs"
                    >
                      Tout supprimer
                    </button>
                  )}
                </div>
              </div>

              {loadingAi ? (
                <div className="space-y-2 p-3 sm:p-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100 sm:h-12 sm:rounded-xl" />
                  ))}
                </div>
              ) : iaAuthError ? (
                <div className="px-3 py-8 text-center text-slate-400 sm:py-10">
                  <p className="mb-2 text-2xl sm:text-3xl">🔐</p>
                  <p className="text-xs font-medium text-slate-600 sm:text-sm">Connectez-vous pour voir l&apos;historique IA</p>
                  <p className="mt-0.5 text-[11px] sm:text-xs">Votre session a peut-être expiré. Reconnectez-vous depuis la page de connexion.</p>
                </div>
              ) : aiRecords.length === 0 ? (
                <div className="px-3 py-8 text-center text-slate-400 sm:py-10">
                  <p className="mb-2 text-2xl sm:text-3xl">🤖</p>
                  <p className="text-xs font-medium text-slate-600 sm:text-sm">Aucun échange IA enregistré</p>
                  <p className="mt-0.5 text-[11px] sm:text-xs">Utilisez la page Optimisation fiscale IA : les réponses apparaîtront ici.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {aiRecords.map((row) => (
                    <div key={row.id} className="transition hover:bg-slate-50">
                      <div className="flex items-stretch">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-start justify-between px-3 py-2.5 text-left sm:px-4 sm:py-3"
                          onClick={() => setExpandedAiId(expandedAiId === row.id ? null : row.id)}
                        >
                          <div className="flex min-w-0 items-start gap-2 sm:gap-2.5">
                            <span className="shrink-0 text-base sm:text-lg">{regionFlag(row.region)}</span>
                            <div className="min-w-0">
                              <p className="text-xs font-medium leading-snug text-slate-900 sm:text-sm">
                                {promptPreview(row.prompt, 100)}
                              </p>
                              <p className="mt-0.5 text-[10px] text-slate-400 sm:text-xs">
                                {regionLabel(row.region)}
                                {row.invoiceId ? " • lien facture" : ""}
                                {" • "}
                                {new Date(row.createdAt).toLocaleString("fr-FR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          </div>
                          <svg
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform sm:h-4 sm:w-4 ${expandedAiId === row.id ? "rotate-180" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          title="Supprimer cet échange"
                          disabled={iaDeleting}
                          onClick={() => void deleteAiEntry(row.id)}
                          className="shrink-0 border-l border-slate-100 px-2.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 sm:px-3"
                          aria-label="Supprimer cet échange"
                        >
                          <svg className="h-4 w-4 sm:h-[18px] sm:w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      {expandedAiId === row.id && (
                        <div className="space-y-2 border-t border-slate-100 bg-slate-50 px-3 py-3 sm:space-y-2.5 sm:px-4 sm:py-3.5">
                          <div>
                            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Question</p>
                            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2 text-[11px] leading-snug text-slate-800 sm:max-h-40 sm:rounded-xl sm:p-2.5 sm:text-xs">
                              {row.prompt}
                            </p>
                          </div>
                          <div>
                            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Réponse IA</p>
                            <p className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2 text-[11px] leading-relaxed text-slate-700 sm:max-h-72 sm:rounded-xl sm:p-2.5 sm:text-sm">
                              {row.response}
                            </p>
                          </div>
                          {row.invoiceId && (
                            <p className="text-[10px] text-slate-400 sm:text-[11px]">
                              Réf. facture : <span className="font-mono text-slate-500">{row.invoiceId}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
