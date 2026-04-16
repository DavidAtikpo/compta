"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("compta-token");
    if (token) {
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => {
          if (d.email) router.replace("/");
        })
        .catch(() => {});
    }
  }, [router]);

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
        router.replace("/");
      }
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4 py-12 overflow-y-auto">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-white text-3xl font-bold mb-4">
            C
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
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {mode === "login" ? "S'inscrire" : "Se connecter"}
            </button>
          </div>

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
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
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
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{error}</p>
            )}
            <button
              onClick={handleAuth}
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
