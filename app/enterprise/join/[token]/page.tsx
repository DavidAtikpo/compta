"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TEAM_MODE_UI } from "@/lib/plans";

interface InviteInfo {
  email: string;
  enterprise: { id: string; name: string };
  role: string;
  status: string;
}

export default function JoinEnterprisePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const res = await fetch(`/api/enterprise/join?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "active") {
          setDone(true);
          return;
        }
        setInfo(data);
      } else {
        setError("Invitation invalide ou expirée.");
      }
    })();
  }, [token]);

  async function handleJoin() {
    if (typeof window === "undefined") return;
    const authToken = window.localStorage.getItem("compta-token");
    if (!authToken) {
      window.localStorage.setItem("enterprise-invite-token", token);
      router.push(`/login?redirect=/enterprise/join/${token}`);
      return;
    }
    setJoining(true);
    const res = await fetch("/api/enterprise/join", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken: token }),
    });
    const data = await res.json();
    setJoining(false);
    if (!res.ok) { setError(data.error || "Erreur"); return; }
    setDone(true);
    setTimeout(() => router.push("/enterprise"), 2000);
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl">❌</div>
          <h1 className="text-lg font-bold text-slate-800">Invitation invalide</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <a href="/" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">Retour à l&apos;accueil</a>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full rounded-2xl border border-green-100 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">✅</div>
          <h1 className="text-lg font-bold text-slate-800">Invitation acceptée</h1>
          <p className="mt-2 text-sm text-slate-500">Redirection vers l’application…</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">
        Vérification de l&apos;invitation…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full rounded-2xl border border-indigo-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-3xl">🏢</div>
        <h1 className="text-lg font-bold text-slate-800">{TEAM_MODE_UI.joinInviteTitle}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Vous êtes invité à rejoindre <span className="font-semibold text-indigo-700">{info.enterprise.name}</span>{" "}
          en tant que <span className="font-medium capitalize">{info.role}</span>.
        </p>
        <p className="mt-1 text-xs text-slate-400">Invitation envoyée à : {info.email}</p>

        <button
          onClick={() => void handleJoin()}
          disabled={joining}
          className="mt-6 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {joining ? "Connexion en cours…" : "Accepter l'invitation"}
        </button>
        <p className="mt-3 text-xs text-slate-400">
          Vous devrez vous connecter ou créer un compte avec l&apos;email <strong>{info.email}</strong>.
        </p>
      </div>
    </div>
  );
}
