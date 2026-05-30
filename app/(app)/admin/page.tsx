"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AdminOverview = {
  admin: { id: string; email: string; role: "super_admin" | "support_admin" | "read_only_admin" };
  stats: { usersCount: number; invoicesCount: number; sendHistoryCount: number; accountantsCount: number; structuresCount: number };
};

export default function AdminOverviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<AdminOverview | null>(null);

  const authHeaders = useMemo(() => {
    if (typeof window === "undefined") return {};
    const token = window.localStorage.getItem("compta-token");
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, []);

  useEffect(() => {
    const boot = async () => {
      const token = window.localStorage.getItem("compta-token");
      if (!token) {
        router.replace("/login");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/admin/overview", { headers: authHeaders });
        if (!res.ok) {
          router.replace("/");
          return;
        }
        setOverview((await res.json()) as AdminOverview);
      } catch {
        setError("Impossible de charger l'overview admin.");
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [authHeaders, router]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-sm text-slate-400">Chargement overview...</div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error || "Aucune donnée admin."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Vue globale</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Admin: <span className="font-medium">{overview.admin.email}</span> — rôle{" "}
          <span className="font-medium">{overview.admin.role}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <StatCard label="Utilisateurs" value={overview.stats.usersCount} />
        <StatCard label="Factures" value={overview.stats.invoicesCount} />
        <StatCard label="Envois" value={overview.stats.sendHistoryCount} />
        <StatCard label="Comptables" value={overview.stats.accountantsCount} />
        <StatCard label="Structures" value={overview.stats.structuresCount} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <QuickLink href="/admin/users" title="Gérer les utilisateurs" desc="Recherche, plans, crédits, soft delete." />
        <QuickLink href="/admin/invoices" title="Gérer les factures" desc="Filtrer, changer statut, soft delete." />
        <QuickLink href="/admin/audit" title="Voir l'audit" desc="Journal des actions admin." />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
    </Link>
  );
}
