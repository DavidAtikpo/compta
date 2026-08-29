"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { enterAccountantPortalFromUser } from "@/lib/accountant-portal-client";
import { TEAM_MODE_UI } from "@/lib/plans";

const titles: Record<string, string> = {
  "/": "Tableau de bord",
  "/invoices": "Factures",
  "/fichiers": "Pièces jointes",
  "/comptabilite": "Comptabilité",
  "/comptabilite/operations": "Opérations comptables",
  "/comptabilite/banque": "Banque",
  "/comptabilite/pcg": "Plan comptable",
  "/comptabilite/tva": "TVA (CA3 / CA12)",
  "/optimize": "Optimisation IA",
  "/history": "Historique",
  "/settings": "Paramètres",
  "/enterprise": TEAM_MODE_UI.sectionTitle,
  "/enterprise/members": "Collaborateurs",
  "/enterprise/reporting": "Reporting équipe",
  "/enterprise/analyse": "Reporting équipe",
  "/enterprise/statistiques": "Reporting équipe",
  "/admin": "Administration",
  "/admin/users": "Utilisateurs",
  "/admin/invoices": "Factures (admin)",
  "/admin/accountants": "Comptables",
  "/admin/structures": "Structures",
  "/admin/audit": "Audit",
};

function resolveTitle(pathname: string): string {
  if (titles[pathname]) return titles[pathname]!;
  if (pathname.startsWith("/comptabilite")) return "Comptabilité";
  if (pathname.startsWith("/enterprise")) return TEAM_MODE_UI.sectionTitle;
  if (pathname.startsWith("/admin")) return "Administration";
  return "Compta IA";
}

type HeaderProps = {
  userName: string;
  userEmail: string;
  userImageUrl?: string;
  onLogout: () => void;
  /** Mode multi-utilisateurs (plan Équipe ou membre actif) : affiche le contexte dans le profil. */
  teamWorkspaceActive?: boolean;
  /** Nom de l'organisation (si déjà créée), affiché sous le nom d'utilisateur. */
  organizationName?: string | null;
};

export function Header({
  userName,
  userEmail,
  userImageUrl,
  onLogout,
  teamWorkspaceActive = false,
  organizationName = null,
}: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [portalBusy, setPortalBusy] = useState(false);
  const title = resolveTitle(pathname);
  const isOptimize = pathname === "/optimize";
  const display = userName || userEmail || "…";
  const initial = (userName || userEmail || "?").slice(0, 1).toUpperCase();
  const isLoggedIn = !!userEmail;

  const openAccountantPortal = async () => {
    setPortalBusy(true);
    const result = await enterAccountantPortalFromUser();
    if (!result.ok) {
      setPortalBusy(false);
      router.push("/accountant/login");
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-sm lg:h-12 lg:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">{title}</p>
          {isOptimize && (
            <p className="hidden truncate text-[11px] text-slate-500 lg:block">
              IA specialisee en fiscalite - baremes et dispositifs ; alertes JO, data.gouv et Judilibre (PISTE) si configure
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
        {isOptimize && (
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("compta-open-alerts"));
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            title="Alertes loi"
          >
            Alertes loi
          </button>
        )}
        {isLoggedIn && (
          <button
            type="button"
            onClick={() => void openAccountantPortal()}
            disabled={portalBusy}
            className="inline-flex rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[11px] font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-100 disabled:opacity-60 sm:px-2.5 sm:text-xs"
            title="Accéder au portail comptable avec votre compte Neurix"
          >
            {portalBusy ? "Ouverture…" : "Portail comptable"}
          </button>
        )}
        {teamWorkspaceActive && (
          <span
            className="max-w-[5.5rem] truncate rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-800 sm:hidden"
            title={organizationName ?? TEAM_MODE_UI.planDisplayName}
          >
            {TEAM_MODE_UI.navShort}
          </span>
        )}
        {userImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={userImageUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full border border-slate-200 object-cover shadow-sm"
          />
        ) : (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600"
            aria-hidden
          >
            {initial}
          </span>
        )}
        <div className="hidden min-w-0 max-w-[14rem] flex-col items-end text-right sm:flex">
          <span className="truncate text-xs font-medium text-slate-700" title={userEmail}>
            {display}
          </span>
          {teamWorkspaceActive && (
            <span
              className="mt-0.5 max-w-full truncate text-[10px] font-semibold text-indigo-700"
              title={organizationName ?? TEAM_MODE_UI.planDisplayName}
            >
              {organizationName
                ? `${TEAM_MODE_UI.navShort} · ${organizationName}`
                : `${TEAM_MODE_UI.planDisplayName} activé`}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Déconnexion
        </button>
      </div>
    </header>
  );
}
