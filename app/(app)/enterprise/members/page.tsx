"use client";

import { useEffect, useMemo, useState } from "react";

interface Member {
  id: string;
  email: string;
  role: string;
  status: string;
  joinedAt?: string | null;
  createdAt: string;
  user?: { id: string; name?: string | null; email: string; imageUrl?: string | null } | null;
}

const roleLabels: Record<string, string> = {
  owner: "Propriétaire",
  manager: "Manager",
  agent: "Agent",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  removed: "bg-slate-100 text-slate-500",
};

export default function EnterpriseMembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [noEnterprise, setNoEnterprise] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const authHeaders = useMemo((): Record<string, string> => {
    if (typeof window === "undefined") return {};
    const t = window.localStorage.getItem("compta-token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, []);

  const loadMembers = useMemo(
    () => async () => {
      if (typeof window === "undefined") return;
      setLoading(true);
      const res = await fetch("/api/enterprise/members", { headers: authHeaders });
      if (res.status === 404) {
        setNoEnterprise(true);
        setForbidden(false);
        setLoading(false);
        return;
      }
      if (res.status === 403) {
        setForbidden(true);
        setNoEnterprise(false);
        setLoading(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members ?? []);
      }
      setLoading(false);
    },
    [authHeaders],
  );

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  async function handleInvite() {
    if (!inviteEmail.trim()) { setError("Email requis"); return; }
    setError("");
    setInviting(true);
    const res = await fetch("/api/enterprise/members", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });
    const data = await res.json();
    setInviting(false);
    if (!res.ok) { setError(data.error || "Erreur"); return; }
    setInviteUrl(data.inviteUrl);
    setInviteEmail("");
    void loadMembers();
  }

  async function handleRemove(memberId: string) {
    if (!confirm("Retirer cet agent de l'entreprise ?")) return;
    const res = await fetch(`/api/enterprise/members?memberId=${memberId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    if (res.ok) void loadMembers();
  }

  const inviteUrlForShare = useMemo(() => {
    if (!inviteUrl) return "";
    if (/^https?:\/\//i.test(inviteUrl)) return inviteUrl;
    if (typeof window !== "undefined") {
      const path = inviteUrl.startsWith("/") ? inviteUrl : `/${inviteUrl}`;
      return `${window.location.origin}${path}`;
    }
    return inviteUrl;
  }, [inviteUrl]);

  async function copyInviteUrl() {
    await navigator.clipboard.writeText(inviteUrlForShare);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Chargement…</div>;
  }

  if (forbidden) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
        La gestion des agents est réservée au compte dirigeant. Vous pouvez déposer des factures depuis{" "}
        <a href="/invoices" className="text-indigo-600 underline">Factures</a>.
      </div>
    );
  }

  if (noEnterprise) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
        Créez d&apos;abord votre entreprise depuis la{" "}
        <a href="/enterprise" className="text-indigo-600 underline">Vue d&apos;ensemble</a>.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Invite form */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Inviter un agent</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleInvite()}
              placeholder="agent@exemple.com"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Rôle</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            >
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <button
            onClick={() => void handleInvite()}
            disabled={inviting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {inviting ? "…" : "Inviter"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        {inviteUrl && (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-white p-3">
            <p className="text-xs font-medium text-slate-700 mb-1">Lien d&apos;invitation (URL complète, cliquable) :</p>
            {!/^https?:\/\//i.test(inviteUrl) && (
              <p className="mb-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                Aucune URL publique dans la config serveur. Le lien ci-dessous utilise ce navigateur comme domaine.
                Pour des e-mails fiables, ajoutez dans <code className="rounded bg-amber-100 px-0.5">.env</code> :{" "}
                <code className="rounded bg-amber-100 px-0.5">NEXT_PUBLIC_APP_URL=https://votre-domaine.com</code>
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <a
                href={inviteUrlForShare}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate rounded bg-slate-50 px-2 py-2 text-xs font-medium text-indigo-700 underline decoration-indigo-300 hover:text-indigo-900"
              >
                {inviteUrlForShare}
              </a>
              <button
                type="button"
                onClick={() => void copyInviteUrl()}
                className="shrink-0 rounded bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-200"
              >
                {copied ? "✓ Copié" : "Copier"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Ne partagez que des liens commençant par <strong>https://</strong> : sinon WhatsApp / e-mail ne les rendent
              souvent pas cliquables.
            </p>
          </div>
        )}
      </div>

      {/* Members list */}
      {members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
          Aucun agent pour le moment. Invitez votre premier collaborateur.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="px-4 py-3 text-left">Agent</th>
                <th className="px-4 py-3 text-left">Rôle</th>
                <th className="px-4 py-3 text-left">Statut</th>
                <th className="px-4 py-3 text-left">Rejoint le</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                        {(m.user?.name || m.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{m.user?.name || "—"}</div>
                        <div className="text-xs text-slate-400">{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{roleLabels[m.role] ?? m.role}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[m.status] ?? "bg-slate-100 text-slate-500"}`}>
                      {m.status === "active" ? "Actif" : m.status === "pending" ? "En attente" : "Retiré"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.status !== "removed" && (
                      <button
                        onClick={() => void handleRemove(m.id)}
                        className="text-xs text-red-500 hover:text-red-700 hover:underline"
                      >
                        Retirer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
