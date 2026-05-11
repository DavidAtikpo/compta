import Link from "next/link";

const nav = [
  { href: "/enterprise", label: "Vue d'ensemble" },
  { href: "/enterprise/members", label: "Agents" },
  { href: "/enterprise/analyse", label: "Analyse" },
] as const;

export default function EnterpriseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Plan Entreprise</h1>
          <p className="mt-0.5 text-xs text-slate-500">Gérez votre équipe et suivez toutes les dépenses.</p>
        </div>

        <nav className="flex flex-wrap gap-2" aria-label="Navigation entreprise">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </div>
  );
}
