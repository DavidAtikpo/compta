"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TEAM_MODE_UI } from "@/lib/plans";

const nav = [
  { href: "/enterprise", label: "Vue d'ensemble", exact: true },
  { href: "/enterprise/members", label: "Collaborateurs" },
  { href: "/enterprise/analyse", label: "Analyse" },
  { href: "/enterprise/statistiques", label: "Statistiques" },
] as const;

export default function EnterpriseLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="px-3 py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{TEAM_MODE_UI.sectionTitle}</h1>
          <p className="mt-0.5 text-xs text-slate-500">{TEAM_MODE_UI.sectionSubtitle}</p>
        </div>

        <nav
          className="flex flex-wrap gap-2 border-b border-slate-100 pb-3"
          aria-label={`Navigation ${TEAM_MODE_UI.navLabel}`}
        >
          {nav.map((item) => {
            const active =
              pathname === item.href ||
              (!item.exact && item.href !== "/enterprise" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}
