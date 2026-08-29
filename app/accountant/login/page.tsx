"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { ACCOUNTANT_PORTAL_LS_TOKEN } from "@/lib/accountant-portal";

function LoginContent() {
  const searchParams = useSearchParams();
  const prefill = searchParams.get("email") ?? "";
  const [email, setEmail] = useState(prefill);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [devLink, setDevLink] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setDevLink("");
    try {
      const res = await fetch("/api/accountant-portal/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "Erreur.");
        return;
      }
      setMessage(data.message || "Consultez votre boîte mail.");
      if (data.devLoginUrl) setDevLink(data.devLoginUrl);
    } catch {
      setMessage("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Compta IA</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Portail comptable</h1>
          <p className="mt-2 text-sm text-slate-600">
            Connectez-vous avec l&apos;adresse email configurée par vos clients dans leurs paramètres cabinet.
          </p>
          <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
            Déjà un compte Neurix ? Connectez-vous à l&apos;application puis utilisez le bouton{" "}
            <strong>Portail comptable</strong> en haut à droite, ou dans Paramètres.
          </p>
        </div>

        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Email du cabinet</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              placeholder="cabinet@example.com"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Envoi…" : "Recevoir le lien de connexion"}
          </button>
        </form>

        {message && (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p>
        )}
        {devLink && (
          <p className="mt-2 text-xs text-amber-800">
            Dev :{" "}
            <a href={devLink} className="underline break-all">
              {devLink}
            </a>
          </p>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Vous êtes client ?{" "}
          <Link href="/login" className="text-slate-600 underline hover:text-slate-900">
            Connexion utilisateur
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function AccountantLoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-slate-400">Chargement…</div>}>
      <LoginContent />
    </Suspense>
  );
}

export { ACCOUNTANT_PORTAL_LS_TOKEN as LS_TOKEN };
