"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TEAM_MODE_UI } from "@/lib/plans";

const settingsItem = {
  href: "/settings",
  label: "Paramètres",
  icon: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
} as const;

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  requiresEnterprise?: boolean;
  requiresAdmin?: boolean;
  /** Si true, actif seulement sur l’URL exacte (évite que `/enterprise` reste actif sur les sous-pages). */
  activeExact?: boolean;
};

const nav: NavItem[] = [
  {
    href: "/",
    label: "Tableau de bord",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: "/invoices",
    label: "Factures",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: "/fichiers",
    label: "Fichiers",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: "/comptabilite",
    label: "Comptabilité",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: "/optimize",
    label: "Optimisation IA",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "Historique",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/enterprise",
    label: "Vue d'ensemble",
    requiresEnterprise: true,
    activeExact: true,
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    href: "/enterprise/members",
    label: "Collaborateurs",
    requiresEnterprise: true,
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    href: "/enterprise/analyse",
    label: "Analyse",
    requiresEnterprise: true,
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-4 4 4 6-8" />
      </svg>
    ),
  },
  {
    href: "/enterprise/statistiques",
    label: "Statistiques",
    requiresEnterprise: true,
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    href: "/admin",
    label: "Admin",
    requiresAdmin: true,
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422A12.083 12.083 0 0112 20.055a12.083 12.083 0 01-6.16-9.477L12 14z"
        />
      </svg>
    ),
  },
];

export function Sidebar({
  showEnterpriseNav = false,
  showAdminNav = false,
}: {
  showEnterpriseNav?: boolean;
  showAdminNav?: boolean;
}) {
  const pathname = usePathname();

  const visible = nav.filter((item) => {
    if ("requiresEnterprise" in item && item.requiresEnterprise) return showEnterpriseNav;
    if ("requiresAdmin" in item && item.requiresAdmin) return showAdminNav;
    return true;
  });

  const mainItems = visible.filter((item) => !item.requiresEnterprise && !item.requiresAdmin);
  const enterpriseItems = visible.filter((item) => item.requiresEnterprise);
  const adminItems = visible.filter((item) => item.requiresAdmin);

  const linkClass = (active: boolean) =>
    `flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
      active
        ? "bg-slate-900 text-white shadow-sm"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    }`;

  const renderLink = (item: NavItem) => {
    const active =
      pathname === item.href ||
      (!item.activeExact && item.href !== "/" && pathname.startsWith(`${item.href}/`));
    return (
      <Link key={item.href} href={item.href} className={linkClass(active)}>
        {item.icon}
        {item.label}
      </Link>
    );
  };

  return (
    <aside className="hidden h-dvh w-56 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-100 px-3">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <Image
            src="/logo.jpg"
            alt="The Code — logo"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
          />
          <span className="truncate text-sm font-semibold text-slate-900">Compta IA</span>
        </Link>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          {mainItems.map(renderLink)}
          {enterpriseItems.length > 0 && (
            <>
              <p className="px-2.5 pb-0.5 pt-3 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                {TEAM_MODE_UI.navLabel}
              </p>
              {enterpriseItems.map(renderLink)}
            </>
          )}
          {adminItems.length > 0 && (
            <>
              <p className="px-2.5 pb-0.5 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Administration
              </p>
              {adminItems.map(renderLink)}
            </>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-100 p-2">
          <Link
            href={settingsItem.href}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition ${
              pathname === settingsItem.href || pathname.startsWith("/settings")
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {settingsItem.icon}
            {settingsItem.label}
          </Link>
        </div>
      </nav>
      <div className="shrink-0 border-t border-slate-100 p-2 text-[10px] leading-snug text-slate-400">
        Optimisation fiscale — usage pro. Consultez votre expert-comptable.
      </div>
    </aside>
  );
}
