"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type AdminOverview = {
  admin: { id: string; email: string; role: "super_admin" | "support_admin" | "read_only_admin" };
};
type AdminAccountant = {
  id: string;
  region: string;
  email: string;
  label: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string | null } | null;
};
type Paginated<T> = { items: T[]; page: number; pageSize: number; total: number };

export default function AdminAccountantsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const pageSize = 20;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [data, setData] = useState<Paginated<AdminAccountant> | null>(null);
  const [busyId, setBusyId] = useState("");

  const role = overview?.admin.role;
  const canDelete = role === "super_admin";

  const authHeaders = useMemo(() => {
    if (typeof window === "undefined") return {};
    const token = window.localStorage.getItem("compta-token");
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, []);

  const setUrl = (nextPage: number) => {
    const params = new URLSearchParams();
    if (nextPage > 1) params.set("page", String(nextPage));
    router.push(`/admin/accountants${params.toString() ? `?${params.toString()}` : ""}`);
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

        const res = await fetch(`/api/admin/accountants?page=${page}&pageSize=${pageSize}`, { headers: authHeaders });
        if (!res.ok) throw new Error();
        setData((await res.json()) as Paginated<AdminAccountant>);
      } catch {
        setError("Impossible de charger les comptables.");
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [authHeaders, page, pageSize, router]);

  const fetchData = async () => {
    const res = await fetch(`/api/admin/accountants?page=${page}&pageSize=${pageSize}`, { headers: authHeaders });
    if (!res.ok) throw new Error();
    setData((await res.json()) as Paginated<AdminAccountant>);
  };

  const deleteAccountant = async (id: string) => {
    if (!window.confirm("Supprimer ce comptable ? (soft delete)")) return;
    setBusyId(id);
    setError("");
    try {
      const res = await fetch("/api/admin/accountants", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      await fetchData();
    } catch {
      setError("Suppression comptable échouée.");
    } finally {
      setBusyId("");
    }
  };

  const maxPage = Math.max(1, Math.ceil((data?.total || 0) / pageSize));

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-sm text-slate-400">Chargement comptables...</div>
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
          <h2 className="text-sm font-semibold text-slate-900">Comptables</h2>
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

      <div className="space-y-2">
        {data.items.map((entry) => (
          <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-900">{entry.email}</p>
              <p className="text-xs text-slate-500">
                {entry.region} — {entry.label || "Sans label"} — {entry.user?.email || "Sans utilisateur"}
              </p>
            </div>
            <button
              disabled={!canDelete || busyId === entry.id}
              onClick={() => void deleteAccountant(entry.id)}
              className="rounded bg-rose-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>

      <Pager page={data.page} maxPage={maxPage} onPrev={() => setUrl(Math.max(1, page - 1))} onNext={() => setUrl(Math.min(maxPage, page + 1))} />
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
      <button onClick={onPrev} disabled={page <= 1} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 disabled:opacity-40">
        Précédent
      </button>
      <button onClick={onNext} disabled={page >= maxPage} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 disabled:opacity-40">
        Suivant
      </button>
    </div>
  );
}

