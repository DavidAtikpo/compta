"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatInvoiceAmount, invoiceCurrencySymbol, VALID_INVOICE_CURRENCY_CODES } from "@/lib/invoice-currency";

const LS_TOKEN = "compta-accountant-token";

type PortalInvoice = {
  id: string;
  originalName: string;
  region: string;
  status: string;
  amount: number | null;
  montantHT: number | null;
  montantTTC: number | null;
  currency: string | null;
  category: string | null;
  invoiceType: string | null;
  fournisseur: string | null;
  numeroFacture: string | null;
  invoiceDate: string | null;
  sentAt: string | null;
  createdAt: string;
  shareToken: string | null;
  accountantReviewStatus: string | null;
  accountantReviewNote: string | null;
  clientEmail: string | null;
  clientName: string | null;
};

type PortalData = {
  email: string;
  invoices: PortalInvoice[];
  totalsByCurrency: Record<string, { count: number; totalHT: number; totalTTC: number }>;
  counts: { total: number; pendingReview: number; validated: number; rejected: number };
};

function PortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [filterReview, setFilterReview] = useState("");
  const [busyId, setBusyId] = useState("");
  const [noteModal, setNoteModal] = useState<{ id: string; action: "validated" | "rejected" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  useEffect(() => {
    const urlToken = searchParams.get("token");
    if (urlToken) {
      window.localStorage.setItem(LS_TOKEN, urlToken);
      setToken(urlToken);
      router.replace("/accountant/portal");
      return;
    }
    const stored = window.localStorage.getItem(LS_TOKEN);
    if (stored) setToken(stored);
    else {
      setLoading(false);
      router.replace("/accountant/login");
    }
  }, [searchParams, router]);

  const authHeaders = useMemo((): Record<string, string> => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterCurrency) params.set("currency", filterCurrency);
      if (filterReview) params.set("reviewStatus", filterReview);
      const meRes = await fetch("/api/accountant-portal/me", { headers: authHeaders });
      if (!meRes.ok) {
        window.localStorage.removeItem(LS_TOKEN);
        router.replace("/accountant/login");
        return;
      }
      const me = await meRes.json();
      setEmail(me.email);

      const invRes = await fetch(`/api/accountant-portal/invoices?${params.toString()}`, { headers: authHeaders });
      if (!invRes.ok) throw new Error();
      setData(await invRes.json());
    } catch {
      setError("Impossible de charger les factures.");
    } finally {
      setLoading(false);
    }
  }, [token, authHeaders, filterCurrency, filterReview, router]);

  useEffect(() => {
    if (token) void load();
  }, [token, load]);

  const submitReview = async (id: string, reviewStatus: "validated" | "rejected", note: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/accountant-portal/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ reviewStatus, reviewNote: note || null }),
      });
      if (!res.ok) throw new Error();
      setNoteModal(null);
      setReviewNote("");
      await load();
    } catch {
      setError("Échec de la mise à jour.");
    } finally {
      setBusyId("");
    }
  };

  const logout = () => {
    window.localStorage.removeItem(LS_TOKEN);
    router.replace("/accountant/login");
  };

  const filteredTotals = useMemo(() => {
    if (!data) return null;
    if (filterCurrency && data.totalsByCurrency[filterCurrency]) {
      return { code: filterCurrency, ...data.totalsByCurrency[filterCurrency] };
    }
    return null;
  }, [data, filterCurrency]);

  if (!token && loading) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-slate-400">Connexion…</div>;
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Portail comptable</h1>
            <p className="text-xs text-slate-500">{email || "…"}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Actualiser
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-5">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="Total" value={data.counts.total} />
              <StatCard label="À traiter" value={data.counts.pendingReview} accent="amber" />
              <StatCard label="Validées" value={data.counts.validated} accent="emerald" />
              <StatCard label="Rejetées" value={data.counts.rejected} accent="rose" />
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <div>
                <label className="text-[10px] font-medium uppercase text-slate-500">Devise</label>
                <select
                  value={filterCurrency}
                  onChange={(e) => setFilterCurrency(e.target.value)}
                  className="mt-0.5 block rounded border border-slate-200 px-2 py-1 text-xs"
                >
                  <option value="">Toutes</option>
                  {VALID_INVOICE_CURRENCY_CODES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase text-slate-500">Revue</label>
                <select
                  value={filterReview}
                  onChange={(e) => setFilterReview(e.target.value)}
                  className="mt-0.5 block rounded border border-slate-200 px-2 py-1 text-xs"
                >
                  <option value="">Toutes</option>
                  <option value="pending">À traiter</option>
                  <option value="validated">Validées</option>
                  <option value="rejected">Rejetées</option>
                </select>
              </div>
            </div>

            {filterCurrency && filteredTotals && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900">
                <strong>Dépenses {filterCurrency}</strong> — {filteredTotals.count} facture(s) · TTC{" "}
                <span className="font-mono font-semibold">
                  {filteredTotals.totalTTC.toFixed(2)} {invoiceCurrencySymbol(filterCurrency)}
                </span>
                {filteredTotals.totalHT > 0 && (
                  <span className="ml-3 text-indigo-700">
                    HT {filteredTotals.totalHT.toFixed(2)} {invoiceCurrencySymbol(filterCurrency)}
                  </span>
                )}
              </div>
            )}

            {!filterCurrency && Object.keys(data.totalsByCurrency).length > 1 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.totalsByCurrency).map(([code, t]) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setFilterCurrency(code)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left text-xs shadow-sm hover:border-indigo-300"
                  >
                    <span className="font-semibold">{code}</span>
                    <span className="ml-2 font-mono">{t.totalTTC.toFixed(2)} {invoiceCurrencySymbol(code)}</span>
                    <span className="ml-1 text-slate-400">({t.count})</span>
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <div className="py-12 text-center text-sm text-slate-400">Chargement…</div>
            ) : data.invoices.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
                Aucune facture pour ces filtres.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Client</th>
                      <th className="px-3 py-2">Facture</th>
                      <th className="px-3 py-2">Devise</th>
                      <th className="px-3 py-2 text-right">TTC</th>
                      <th className="px-3 py-2">Revue</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.invoices.map((inv) => {
                      const ttc = inv.montantTTC ?? inv.amount;
                      const review = inv.accountantReviewStatus;
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/80">
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-900">{inv.clientName || inv.clientEmail || "—"}</p>
                            <p className="text-[10px] text-slate-400">{inv.region}</p>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800">{inv.fournisseur || inv.originalName}</p>
                            <p className="text-[10px] text-slate-400">
                              {inv.numeroFacture || "—"} ·{" "}
                              {inv.invoiceDate
                                ? new Date(inv.invoiceDate).toLocaleDateString("fr-FR")
                                : new Date(inv.createdAt).toLocaleDateString("fr-FR")}
                            </p>
                          </td>
                          <td className="px-3 py-2 font-mono">{inv.currency ?? "EUR"}</td>
                          <td className="px-3 py-2 text-right font-mono font-medium">
                            {formatInvoiceAmount(ttc, inv.currency)}
                          </td>
                          <td className="px-3 py-2">
                            <ReviewBadge status={review} note={inv.accountantReviewNote} />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              {inv.shareToken && (
                                <Link
                                  href={`/share/${inv.shareToken}`}
                                  target="_blank"
                                  className="rounded border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  Voir
                                </Link>
                              )}
                              <button
                                type="button"
                                disabled={busyId === inv.id || review === "validated"}
                                onClick={() => {
                                  setNoteModal({ id: inv.id, action: "validated" });
                                  setReviewNote("");
                                }}
                                className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-800 disabled:opacity-40"
                              >
                                Valider
                              </button>
                              <button
                                type="button"
                                disabled={busyId === inv.id || review === "rejected"}
                                onClick={() => {
                                  setNoteModal({ id: inv.id, action: "rejected" });
                                  setReviewNote("");
                                }}
                                className="rounded bg-rose-100 px-2 py-1 text-[10px] font-medium text-rose-800 disabled:opacity-40"
                              >
                                Rejeter
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>

      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-sm font-semibold text-slate-900">
              {noteModal.action === "validated" ? "Valider la facture" : "Rejeter la facture"}
            </h2>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Commentaire optionnel…"
              rows={3}
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteModal(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busyId === noteModal.id}
                onClick={() => void submitReview(noteModal.id, noteModal.action, reviewNote)}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "amber" | "emerald" | "rose";
}) {
  const colors =
    accent === "amber"
      ? "border-amber-100 bg-amber-50 text-amber-900"
      : accent === "emerald"
        ? "border-emerald-100 bg-emerald-50 text-emerald-900"
        : accent === "rose"
          ? "border-rose-100 bg-rose-50 text-rose-900"
          : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${colors}`}>
      <p className="text-[10px] font-medium uppercase opacity-70">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function ReviewBadge({ status, note }: { status: string | null; note: string | null }) {
  if (status === "validated") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800" title={note ?? undefined}>
        Validée
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-800" title={note ?? undefined}>
        Rejetée
      </span>
    );
  }
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">À traiter</span>;
}

export default function AccountantPortalPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-slate-400">Chargement…</div>}>
      <PortalContent />
    </Suspense>
  );
}
