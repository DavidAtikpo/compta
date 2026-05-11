"use client";

import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const LS_ENTERPRISE_INVITE = "enterprise-invite-token";

/** Évite les redirections ouvertes : chemins internes uniquement. */
function safeInternalPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const p = path.trim();
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  if (p.includes("://")) return null;
  return p;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const resolveDestination = useCallback(
    (isAdmin: boolean): string => {
      const fromQuery = safeInternalPath(searchParams.get("redirect"));
      if (fromQuery) return fromQuery;

      if (typeof window !== "undefined") {
        const inviteToken = window.localStorage.getItem(LS_ENTERPRISE_INVITE)?.trim();
        if (inviteToken && /^[a-f0-9]{64}$/i.test(inviteToken)) {
          return `/enterprise/join/${inviteToken}`;
        }
      }

      if (isAdmin) return "/admin";
      return "/";
    },
    [searchParams],
  );

  useEffect(() => {
    const token = window.localStorage.getItem("compta-token");
    if (!token) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.email) {
          const dest = resolveDestination(!!d.isAdmin);
          router.replace(dest);
        }
      })
      .catch(() => {});
  }, [router, resolveDestination]);

  const handleAuth = async () => {
    setError("");
    setLoading(true);
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
    const payload: Record<string, string> = { email, password };
    if (mode === "register") payload.name = name;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur d'authentification.");
      } else {
        window.localStorage.setItem("compta-token", data.token);
        try {
          const meRes = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${data.token}` } });
          const me = await meRes.json().catch(() => ({}));
          const dest = resolveDestination(!!me?.isAdmin);
          window.localStorage.removeItem(LS_ENTERPRISE_INVITE);
          router.replace(dest);
        } catch {
          router.replace("/");
        }
      }
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  };

  const redirectHint = safeInternalPath(searchParams.get("redirect"));

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4 py-12 overflow-y-auto">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mb-4 inline-block rounded-full ring-2 ring-white/20 shadow-lg shadow-blue-500/20">
            <Image
              src="/logo.jpg"
              alt="The Code — logo"
              width={80}
              height={80}
              className="h-20 w-20 rounded-full object-cover"
              priority
            />
          </div>
          <h1 className="text-3xl font-bold text-white">Compta IA</h1>
          <p className="mt-2 text-slate-400 text-sm">
            Optimisation fiscale intelligente — Législation française
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-slate-900">
              {mode === "login" ? "Connexion" : "Créer un compte"}
            </h2>
            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {mode === "login" ? "S'inscrire" : "Se connecter"}
            </button>
          </div>

          {redirectHint?.startsWith("/enterprise/join/") && (
            <p className="mb-4 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
              Après connexion, vous serez renvoyé vers l&apos;invitation entreprise pour finaliser votre accès.
            </p>
          )}

          <div className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom complet</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="Votre nom"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleAuth()}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="exemple@domaine.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleAuth()}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{error}</p>}
            <button
              onClick={() => void handleAuth()}
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 px-6 py-3 text-white font-medium transition hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Chargement…" : mode === "login" ? "Se connecter" : "Créer le compte"}
            </button>
          </div>
        </div>

        {/* Features */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center text-xs text-slate-400">
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-lg font-bold text-white mb-1">OCR</div>
            <div>Capture photos &amp; PDF</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-lg font-bold text-white mb-1">IA</div>
            <div>Optimisation fiscale</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-lg font-bold text-white mb-1">🇫🇷</div>
            <div>Législation française</div>
          </div>
        </div>
      </div>
    </div>
  );
}
