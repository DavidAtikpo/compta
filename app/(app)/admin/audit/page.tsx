"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type AdminAudit = {
  id: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
};
type Paginated<T> = { items: T[]; page: number; pageSize: number; total: number };

export default function AdminAuditPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-sm text-slate-400">Chargement audit...</div>
        </div>
      }
    >
      <AdminAuditPageContent />
    </Suspense>
  );
}

function AdminAuditPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const pageSize = 20;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<Paginated<AdminAudit> | null>(null);

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
    router.push(`/admin/audit${params.toString() ? `?${params.toString()}` : ""}`);
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
        const res = await fetch(`/api/admin/audit?page=${page}&pageSize=${pageSize}`, { headers: authHeaders });
        if (!res.ok) {
          router.replace("/");
          return;
        }
        setData((await res.json()) as Paginated<AdminAudit>);
      } catch {
        setError("Impossible de charger l'audit.");
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [authHeaders, page, pageSize, router]);

  const maxPage = Math.max(1, Math.ceil((data?.total || 0) / pageSize));

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-sm text-slate-400">Chargement audit...</div>
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
          <h2 className="text-sm font-semibold text-slate-900">Audit admin</h2>
          <p className="text-xs text-slate-500">Journal des actions.</p>
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
          <div key={entry.id} className="rounded-lg border border-slate-200 px-3 py-2">
            <p className="text-sm font-medium text-slate-900">{entry.action}</p>
            <p className="text-xs text-slate-500">
              {entry.entityType} — {entry.entityId || "n/a"}
            </p>
            <p className="text-[11px] text-slate-400">
              {entry.actorEmail} ({entry.actorRole}) — {new Date(entry.createdAt).toLocaleString("fr-FR")}
            </p>
          </div>
        ))}
      </div>

      <Pager
        page={data.page}
        maxPage={maxPage}
        onPrev={() => setUrl(Math.max(1, page - 1))}
        onNext={() => setUrl(Math.min(maxPage, page + 1))}
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

