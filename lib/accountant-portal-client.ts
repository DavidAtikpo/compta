import { ACCOUNTANT_PORTAL_LS_TOKEN } from "./accountant-portal";

/** Ouvre le portail comptable avec la session utilisateur Neurix (sans magic link). */
export async function enterAccountantPortalFromUser(): Promise<{ ok: boolean; error?: string }> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("compta-token") : null;
  if (!token) return { ok: false, error: "Connexion requise." };

  try {
    const res = await fetch("/api/accountant-portal/enter-from-user", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Accès refusé." };

    window.localStorage.setItem(ACCOUNTANT_PORTAL_LS_TOKEN, data.portalToken);
    window.location.href = data.portalPath || "/accountant/portal";
    return { ok: true };
  } catch {
    return { ok: false, error: "Erreur réseau." };
  }
}
