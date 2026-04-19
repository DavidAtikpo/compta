"use client";

import { PDF_HEADER_LAYOUT_STACKED, type PdfHeaderLayoutId } from "@/lib/pdf-invoice-export";

const isStacked = (l: PdfHeaderLayoutId) => l === PDF_HEADER_LAYOUT_STACKED;

type Props = {
  layout: PdfHeaderLayoutId;
  headerImageUrl: string;
  logoUrl: string;
  title: string;
  address: string;
  table: string[][];
  extraText: string;
};

export function PdfHeaderPreview({
  layout,
  headerImageUrl,
  logoUrl,
  title,
  address,
  table,
  extraText,
}: Props) {
  if (headerImageUrl.trim()) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-2 text-xs font-medium text-slate-700">Aperçu — image d’en-tête</p>
        <p className="mb-2 text-[11px] text-slate-500">
          Une image pleine largeur est utilisée à la place du bloc logo / texte / tableau.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={headerImageUrl.trim()}
          alt=""
          className="max-h-36 w-full rounded-lg border border-slate-200 bg-white object-contain"
        />
      </div>
    );
  }

  const hasTable = table.some((row) => row.some((c) => String(c).trim()));
  const hasLogo = logoUrl.trim().length > 0;
  const useRowPreview =
    !isStacked(layout) && hasLogo && hasTable;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="mb-2 text-xs font-medium text-slate-700">Aperçu de l’en-tête PDF</p>
      <div className="mx-auto max-w-lg rounded-lg border border-slate-300 bg-white p-3 shadow-inner">
        {useRowPreview ? (
          <div className="space-y-2">
            {title.trim() && <p className="text-sm font-bold leading-tight text-slate-900">{title}</p>}
            {address.trim() && (
              <p className="whitespace-pre-line text-[11px] leading-snug text-slate-600">{address}</p>
            )}
            <div className="flex items-end gap-2 border-t border-slate-100 pt-2">
              <div className="shrink-0">
                {hasLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl.trim()}
                    alt=""
                    className="h-14 w-14 rounded border border-slate-200 bg-white object-contain"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <table className="w-full border-collapse text-[10px]">
                  <tbody>
                    {table.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="border border-slate-200 px-1 py-1 text-slate-800">
                            {cell || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="shrink-0">
                {hasLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl.trim()}
                    alt=""
                    className="h-12 w-12 rounded border border-slate-200 bg-white object-contain"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded border border-dashed border-slate-200 text-[10px] text-slate-400">
                    Logo
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {title.trim() && <p className="text-sm font-bold leading-tight text-slate-900">{title}</p>}
                {address.trim() && (
                  <p className="mt-0.5 whitespace-pre-line text-[11px] leading-snug text-slate-600">{address}</p>
                )}
              </div>
            </div>
            {hasTable && (
              <table className="w-full border-collapse text-[10px]">
                <tbody>
                  {table.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="border border-slate-200 px-1 py-1 text-slate-800">
                          {cell || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {extraText.trim() && (
          <p className="mt-2 border-t border-slate-100 pt-2 whitespace-pre-line text-[10px] text-slate-600">
            {extraText}
          </p>
        )}
        {!title.trim() && !address.trim() && !hasLogo && !hasTable && !extraText.trim() && (
          <p className="text-center text-[11px] text-slate-400">Renseignez logo, titre ou tableau pour voir l’aperçu.</p>
        )}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        {isStacked(layout)
          ? "Disposition « classique » : logo à gauche, titre et adresse à droite, tableau sur toute la largeur en dessous."
          : "Disposition « logo + tableau » : titre et adresse au-dessus, puis logo et tableau sur une même ligne (alignés en bas)."}
      </p>
    </div>
  );
}
