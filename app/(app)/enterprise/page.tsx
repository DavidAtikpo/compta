"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { isEntreprisePlan } from "@/lib/plans";

interface Enterprise {
  id: string;
  name: string;
  siret?: string | null;
  createdAt: string;
  owner: { id: string; name?: string | null; email: string; billingPlan?: string };
}

export default function EnterprisePage() {
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [ownerBillingPlan, setOwnerBillingPlan] = useState("starter");
  const [myBillingPlan, setMyBillingPlan] = useState("starter");
  const [loading, setLoading] = useState(true);

  const authHeaders = useMemo((): Record<string, string> => {
    if (typeof window === "undefined") return {};
    const t = window.localStorage.getItem("compta-token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    void (async () => {
      setLoading(true);
      const [meRes, entRes] = await Promise.all([
        fetch("/api/auth/me", { headers: authHeaders }),
        fetch("/api/enterprise", { headers: authHeaders }),
      ]);
      const me = await meRes.json().catch(() => ({}));
      if (me?.billingPlan) setMyBillingPlan(String(me.billingPlan));
      if (entRes.ok) {
        const data = await entRes.json();
        setEnterprise(data.enterprise);
        setRole(data.role ?? null);
        setMemberCount(data.memberCount ?? 0);
        setOwnerBillingPlan(data.ownerBillingPlan ?? "starter");
      }
      setLoading(false);
    })();
  }, [authHeaders]);

  const canUseEntrepriseUi =
    isEntreprisePlan(myBillingPlan) || (enterprise != null && isEntreprisePlan(ownerBillingPlan));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Chargement…</div>
    );
  }

  if (!canUseEntrepriseUi) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-8 text-center">
        <h2 className="text-base font-semibold text-slate-900">Plan Entreprise</h2>
        <p className="mt-2 text-sm text-slate-600">
          Passez au plan Entreprise pour regrouper toutes les factures (y compris celles déjà ajoutées), inviter des
          agents, et accéder aux analyses.
        </p>
        <Link
          href="/settings?tab=overview"
          className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Voir les offres et payer
        </Link>
      </div>
    );
  }

  if (!enterprise) {
    return (
      <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-8 text-center">
        <h2 className="text-base font-semibold text-slate-800">Finaliser l&apos;espace entreprise</h2>
        <p className="mt-1 text-sm text-slate-500">
          Donnez un nom à votre structure (le paiement Stripe crée souvent un brouillon « Mon entreprise » — vous pouvez
          le renommer ici).
        </p>
        <CreateEnterpriseForm authHeaders={authHeaders} onCreated={(e) => setEnterprise(e)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏢</span>
              <h2 className="text-lg font-bold text-slate-900">{enterprise.name}</h2>
              {role && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 capitalize">
                  {role}
                </span>
              )}
            </div>
            {enterprise.siret && <p className="mt-0.5 text-xs text-slate-500">SIRET : {enterprise.siret}</p>}
            <p className="mt-1 text-xs text-slate-500">
              Plan compte : <strong>{ownerBillingPlan}</strong> — toutes les factures (anciennes + agents) sont sur la
              page <Link href="/invoices" className="text-indigo-600 underline">Factures</Link>, avec la colonne
              « Ajouté par » lorsque plusieurs personnes déposent des pièces.
            </p>
          </div>
          <div className="flex gap-4 text-center text-sm">
            <div>
              <div className="text-xl font-bold text-indigo-700">{memberCount}</div>
              <div className="text-xs text-slate-500">Agents actifs</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/enterprise/members"
          className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-800 shadow-sm hover:border-indigo-200 hover:bg-indigo-50/40"
        >
          Gérer les agents →
        </Link>
        <Link
          href="/enterprise/analyse"
          className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-800 shadow-sm hover:border-indigo-200 hover:bg-indigo-50/40"
        >
          Analyse achats / ventes →
        </Link>
      </div>
    </div>
  );
}

function CreateEnterpriseForm({
  authHeaders,
  onCreated,
}: {
  authHeaders: Record<string, string>;
  onCreated: (e: Enterprise) => void;
}) {
  const [name, setName] = useState("");
  const [siret, setSiret] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) {
      setErr("Nom requis");
      return;
    }
    setBusy(true);
    setErr("");
    const res = await fetch("/api/enterprise", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ name, siret }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Erreur");
      return;
    }
    if (data.enterprise) onCreated(data.enterprise as Enterprise);
  }

  return (
    <div className="mx-auto mt-4 max-w-sm space-y-3 text-left">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Nom</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Ex. ACME SAS"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">SIRET (optionnel)</label>
        <input
          value={siret}
          onChange={(e) => setSiret(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "…" : "Créer"}
      </button>
    </div>
  );
}
