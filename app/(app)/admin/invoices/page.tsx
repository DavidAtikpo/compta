"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type AdminOverview = {
  admin: { id: string; email: string; role: "super_admin" | "support_admin" | "read_only_admin" };
};
type AdminInvoice = {
  id: string;
  originalName: string;
  status: string;
  category: string | null;
  amount: number | null;
  region: string;
  createdAt: string;
  user: { id: string; email: string; name: string | null } | null;
};
type Paginated<T> = { items: T[]; page: number; pageSize: number; total: number };

export default function AdminInvoicesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const q = (searchParams.get("q") || "").trim();
  const status = (searchParams.get("status") || "").trim();
  const pageSize = 20;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [data, setData] = useState<Paginated<AdminInvoice> | null>(null);
  const [queryInput, setQueryInput] = useState(q);
  const [statusInput, setStatusInput] = useState(status);
  const [busyInvoiceId, setBusyInvoiceId] = useState("");

  const role = overview?.admin.role;
  const canWrite = role === "super_admin" || role === "support_admin";
  const canDelete = role === "super_admin";

  const authHeaders = useMemo(() => {
    if (typeof window === "undefined") return {};
    const token = window.localStorage.getItem("compta-token");
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, []);

  const setUrl = (next: { page?: number; q?: string; status?: string }) => {
    const params = new URLSearchParams();
    const nextPage = next.page ?? page;
    const nextQ = (next.q ?? q).trim();
    const nextStatus = (next.status ?? status).trim();
    if (nextPage > 1) params.set("page", String(nextPage));
    if (nextQ) params.set("q", nextQ);
    if (nextStatus) params.set("status", nextStatus);
    router.push(`/admin/invoices${params.toString() ? `?${params.toString()}` : ""}`);
  };

  useEffect(() => {
    const boot = async () => {
      if (typeof window === "undefined") return;
      const token = window.localStorage.getItem("compta-token");
      if (!token) {
        router.replace("/login");
        return;
      }

      setLoading(true);
      setError("");
      try {
        const overviewRes = await fetch("/api/admin/overview", { headers: authHeaders });
        if (!overviewRes.ok) {
          router.replace("/");
          return;
        }
        setOverview((await overviewRes.json()) as AdminOverview);

        const url = `/api/admin/invoices?page=${page}&pageSize=${pageSize}${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}`;
        const res = await fetch(url, { headers: authHeaders });
        if (!res.ok) throw new Error();
        setData((await res.json()) as Paginated<AdminInvoice>);
      } catch {
        setError("Impossible de charger les factures.");
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [authHeaders, page, pageSize, q, router, status]);

  const fetchData = async () => {
    const url = `/api/admin/invoices?page=${page}&pageSize=${pageSize}${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}`;
    const res = await fetch(url, { headers: authHeaders });
    if (!res.ok) throw new Error();
    setData((await res.json()) as Paginated<AdminInvoice>);
  };

  const updateStatus = async (id: string, nextStatus: string) => {
    setBusyInvoiceId(id);
    setError("");
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      if (!res.ok) throw new Error();
      await fetchData();
    } catch {
      setError("Mise à jour facture échouée.");
    } finally {
      setBusyInvoiceId("");
    }
  };

  const deleteInvoice = async (id: string) => {
    if (!window.confirm("Supprimer cette facture ? (soft delete)")) return;
    setBusyInvoiceId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, { method: "DELETE", headers: authHeaders });
      if (!res.ok) throw new Error();
      await fetchData();
    } catch {
      setError("Suppression facture échouée.");
    } finally {
      setBusyInvoiceId("");
    }
  };

  const maxPage = Math.max(1, Math.ceil((data?.total || 0) / pageSize));

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-sm text-slate-400">Chargement factures...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error || "Aucune donnée."}
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Factures</h2>
          <p className="text-xs text-slate-500">
            Rôle courant: <span className="font-medium">{role}</span>
          </p>
        </div>
        <div className="text-xs text-slate-500">
          Total: <span className="font-medium text-slate-700">{data.total}</span>
        </div>
      </div>

      {!!error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Recherche fichier/fournisseur/numéro"
          className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
        <select
          value={statusInput}
          onChange={(e) => setStatusInput(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">Tous statuts</option>
          <option value="pending">pending</option>
          <option value="sent">sent</option>
          <option value="archived">archived</option>
        </select>
        <button
          onClick={() => setUrl({ page: 1, q: queryInput.trim(), status: statusInput.trim() })}
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white"
        >
          Filtrer
        </button>
      </div>

      <div className="space-y-2">
        {data.items.map((inv) => (
          <div key={inv.id} className="rounded-lg border border-slate-200 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{inv.originalName}</p>
                <p className="text-xs text-slate-500">
                  {inv.user?.email || "Sans utilisateur"} — {inv.region} — {new Date(inv.createdAt).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <button
                disabled={!canDelete || busyInvoiceId === inv.id}
                onClick={() => void deleteInvoice(inv.id)}
                className="rounded bg-rose-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
              >
                Supprimer
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">Statut: {inv.status}</span>
              {inv.amount != null && (
                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">Montant: {inv.amount}€</span>
              )}
              {inv.category && (
                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">Catégorie: {inv.category}</span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                disabled={!canWrite || busyInvoiceId === inv.id}
                onClick={() => void updateStatus(inv.id, "pending")}
                className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800 disabled:opacity-60"
              >
                Mettre pending
              </button>
              <button
                disabled={!canWrite || busyInvoiceId === inv.id}
                onClick={() => void updateStatus(inv.id, "sent")}
                className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-800 disabled:opacity-60"
              >
                Mettre sent
              </button>
              <button
                disabled={!canWrite || busyInvoiceId === inv.id}
                onClick={() => void updateStatus(inv.id, "archived")}
                className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-700 disabled:opacity-60"
              >
                Mettre archived
              </button>
            </div>
          </div>
        ))}
      </div>

      <Pager
        page={data.page}
        maxPage={maxPage}
        onPrev={() => setUrl({ page: Math.max(1, page - 1) })}
        onNext={() => setUrl({ page: Math.min(maxPage, page + 1) })}
      />
    </section>
  );
}

function Pager({
  page,
  maxPage,
  onPrev,
  onNext,
}: {
  page: number;
  maxPage: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
      <span className="text-xs text-slate-500">
        Page {page}/{maxPage}
      </span>
      <button
        onClick={onPrev}
        disabled={page <= 1}
        className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 disabled:opacity-40"
      >
        Précédent
      </button>
      <button
        onClick={onNext}
        disabled={page >= maxPage}
        className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 disabled:opacity-40"
      >
        Suivant
      </button>
    </div>
  );
}

