"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TEAM_MODE_UI } from "@/lib/plans";

type AdminOverview = {
  admin: { id: string; email: string; role: "super_admin" | "support_admin" | "read_only_admin" };
};
type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  billingPlan: string;
  aiCreditsBalance: number;
  createdAt: string;
  _count: { invoices: number; sendHistory: number; accountants: number; structures: number };
};
type Paginated<T> = { items: T[]; page: number; pageSize: number; total: number };

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const q = (searchParams.get("q") || "").trim();
  const pageSize = 20;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [data, setData] = useState<Paginated<AdminUser> | null>(null);
  const [queryInput, setQueryInput] = useState(q);
  const [busyUserId, setBusyUserId] = useState("");

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

  const setUrl = (next: { page?: number; q?: string }) => {
    const params = new URLSearchParams();
    const nextPage = next.page ?? page;
    const nextQ = next.q ?? q;
    if (nextPage > 1) params.set("page", String(nextPage));
    if (nextQ) params.set("q", nextQ);
    router.push(`/admin/users${params.toString() ? `?${params.toString()}` : ""}`);
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
        const overviewPayload = (await overviewRes.json()) as AdminOverview;
        setOverview(overviewPayload);

        const url = `/api/admin/users?page=${page}&pageSize=${pageSize}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
        const res = await fetch(url, { headers: authHeaders });
        if (!res.ok) throw new Error();
        setData((await res.json()) as Paginated<AdminUser>);
      } catch {
        setError("Impossible de charger les utilisateurs.");
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [authHeaders, page, pageSize, q, router]);

  const updateUser = async (id: string, patch: { billingPlan?: string; aiCreditsBalance?: number }) => {
    setBusyUserId(id);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error();
      await fetchData();
    } catch {
      setError("Mise à jour utilisateur échouée.");
    } finally {
      setBusyUserId("");
    }
  };

  const deleteUser = async (id: string) => {
    if (!window.confirm("Supprimer cet utilisateur ? (soft delete)")) return;
    setBusyUserId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE", headers: authHeaders });
      if (!res.ok) throw new Error();
      await fetchData();
    } catch {
      setError("Suppression utilisateur échouée.");
    } finally {
      setBusyUserId("");
    }
  };

  const fetchData = async () => {
    const url = `/api/admin/users?page=${page}&pageSize=${pageSize}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
    const res = await fetch(url, { headers: authHeaders });
    if (!res.ok) throw new Error();
    setData((await res.json()) as Paginated<AdminUser>);
  };

  const maxPage = Math.max(1, Math.ceil((data?.total || 0) / pageSize));

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-sm text-slate-400">Chargement utilisateurs...</div>
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
          <h2 className="text-sm font-semibold text-slate-900">Utilisateurs</h2>
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
          placeholder="Recherche email ou nom"
          className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
        <button
          onClick={() => setUrl({ page: 1, q: queryInput.trim() })}
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white"
        >
          Rechercher
        </button>
      </div>

      <div className="space-y-2">
        {data.items.map((u) => (
          <div key={u.id} className="rounded-lg border border-slate-200 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{u.name || u.email}</p>
                <p className="text-xs text-slate-500">{u.email}</p>
              </div>
              <button
                disabled={!canDelete || busyUserId === u.id}
                onClick={() => void deleteUser(u.id)}
                className="rounded bg-rose-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
              >
                Supprimer
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>Plan: {u.billingPlan}</span>
              <span>Crédits: {u.aiCreditsBalance}</span>
              <span>Factures: {u._count.invoices}</span>
              <span>Envois: {u._count.sendHistory}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                disabled={!canWrite || busyUserId === u.id}
                onClick={() => void updateUser(u.id, { billingPlan: "starter" })}
                className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-800 disabled:opacity-60"
              >
                Plan starter
              </button>
              <button
                disabled={!canWrite || busyUserId === u.id}
                onClick={() => void updateUser(u.id, { billingPlan: "pro" })}
                className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-800 disabled:opacity-60"
              >
                Plan pro
              </button>
              <button
                disabled={!canWrite || busyUserId === u.id}
                onClick={() => void updateUser(u.id, { billingPlan: "entreprise" })}
                className="rounded bg-violet-100 px-2 py-1 text-xs text-violet-900 disabled:opacity-60"
              >
                {TEAM_MODE_UI.planDisplayName}
              </button>
              <button
                disabled={!canWrite || busyUserId === u.id}
                onClick={() => void updateUser(u.id, { aiCreditsBalance: u.aiCreditsBalance + 1000 })}
                className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-800 disabled:opacity-60"
              >
                +1000 crédits
              </button>
              <button
                disabled={!canWrite || busyUserId === u.id}
                onClick={() => void updateUser(u.id, { aiCreditsBalance: 0 })}
                className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800 disabled:opacity-60"
              >
                Reset crédits
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

