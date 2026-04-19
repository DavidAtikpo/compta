"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items: {
  href: string;
  short: string;
  icon: ReactNode;
}[] = [
  {
    href: "/",
    short: "Accueil",
    icon: (
      <svg className="mx-auto h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    href: "/invoices",
    short: "Factures",
    icon: (
      <svg className="mx-auto h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    href: "/optimize",
    short: "IA",
    icon: (
      <svg className="mx-auto h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
    ),
  },
  {
    href: "/settings",
    short: "Réglages",
    icon: (
      <svg className="mx-auto h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 pb-[max(0.35rem,env(safe-area-inset-bottom,0px))] pt-1 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] backdrop-blur-md lg:hidden"
      role="navigation"
      aria-label="Navigation principale"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between gap-0 px-0.5">
        {items.map((item) => {
          const active =
            pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium leading-tight transition active:scale-[0.98] ${
                  active ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
                aria-current={active ? "page" : undefined}
                title={item.short}
              >
                <span className={active ? "text-slate-900" : "text-slate-500"}>{item.icon}</span>
                <span className={`max-w-full truncate ${active ? "font-semibold" : ""}`}>{item.short}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
