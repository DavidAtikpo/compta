"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { normalizeRegionKey, regionDisplayLabel, regionsMatch } from "@/lib/country-regions";
import { isUserConfirmed } from "@/lib/invoice-workflow-ui";

export type SendToCabinetInvoice = {
  id: string;
  region: string;
  originalName: string;
  fileUrl?: string | null;
  userConfirmedAt?: string | null;
  sentAt?: string | null;
  status?: string;
};

type AccountantRow = {
  id: string;
  region: string;
  email: string;
  label: string | null;
};

type RegionBatch = {
  regionKey: string;
  regionLabel: string;
  invoices: SendToCabinetInvoice[];
  accountants: AccountantRow[];
};

function recipientKey(regionKey: string, email: string): string {
  return `${regionKey}::${email.toLowerCase()}`;
}

export function SendToCabinetModal({
  open,
  invoices,
  restrictToRegion,
  token,
  defaultSenderName,
  onClose,
  onSuccess,
}: {
  open: boolean;
  invoices: SendToCabinetInvoice[];
  /** Depuis un onglet Cabinet : n’envoyer qu’à ce pays (pas aux cabinets des autres pays). */
  restrictToRegion?: string | null;
  token: string | null;
  defaultSenderName?: string;
  onClose: () => void;
  onSuccess: (summary: string) => void;
}) {
  const [accountants, setAccountants] = useState<AccountantRow[]>([]);
  const [loadingAcc, setLoadingAcc] = useState(false);
  const [senderName, setSenderName] = useState(defaultSenderName?.trim() || "Client Compta IA");
  const [message, setMessage] = useState(
    "Bonjour,\n\nVeuillez trouver ci-joint les pièces justificatives comptables.\n\nCordialement",
  );
  const [selectedRecipients, setSelectedRecipients] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restrictKey = restrictToRegion ? normalizeRegionKey(restrictToRegion) : null;

  const eligible = useMemo(() => invoices.filter((inv) => inv.fileUrl), [invoices]);

  const batches = useMemo((): RegionBatch[] => {
    if (restrictKey) {
      return [
        {
          regionKey: restrictKey,
          regionLabel: regionDisplayLabel(restrictKey),
          invoices: eligible,
          accountants: accountants.filter((a) => regionsMatch(a.region, restrictKey)),
        },
      ];
    }
    const byRegion = new Map<string, SendToCabinetInvoice[]>();
    for (const inv of eligible) {
      const key = normalizeRegionKey(inv.region);
      const list = byRegion.get(key) ?? [];
      list.push(inv);
      byRegion.set(key, list);
    }
    return [...byRegion.entries()].map(([regionKey, invs]) => ({
      regionKey,
      regionLabel: regionDisplayLabel(regionKey),
      invoices: invs,
      accountants: accountants.filter((a) => regionsMatch(a.region, regionKey)),
    }));
  }, [eligible, accountants, restrictKey]);

  useEffect(() => {
    if (!open) return;
    setSenderName(defaultSenderName?.trim() || "Client Compta IA");
    setError(null);
  }, [open, defaultSenderName]);

  useEffect(() => {
    if (!open || !token) return;
    setLoadingAcc(true);
    void (async () => {
      try {
        const res = await fetch("/api/accountants", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setAccountants([]);
          return;
        }
        const data = (await res.json()) as AccountantRow[];
        setAccountants(Array.isArray(data) ? data : []);
      } catch {
        setAccountants([]);
      } finally {
        setLoadingAcc(false);
      }
    })();
  }, [open, token]);

  useEffect(() => {
    if (!open || batches.length === 0) return;
    const next: Record<string, boolean> = {};
    for (const batch of batches) {
      for (const a of batch.accountants) {
        next[recipientKey(batch.regionKey, a.email)] = true;
      }
    }
    setSelectedRecipients(next);
  }, [open, batches]);

  if (!open) return null;

  const unconfirmedCount = eligible.filter((inv) => !isUserConfirmed(inv)).length;
  const missingCabinetRegions = batches.filter((b) => b.accountants.length === 0);

  const toggleRecipient = (regionKey: string, email: string) => {
    const k = recipientKey(regionKey, email);
    setSelectedRecipients((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const handleSend = async () => {
    if (!token) {
      setError("Connexion requise.");
      return;
    }
    if (eligible.length === 0) {
      setError("Aucune facture avec pièce jointe à envoyer.");
      return;
    }
    if (missingCabinetRegions.length > 0) {
      setError(
        `Ajoutez un cabinet dans Paramètres pour : ${missingCabinetRegions.map((b) => b.regionLabel).join(", ")}.`,
      );
      return;
    }

    setSending(true);
    setError(null);
    const messages: string[] = [];

    try {
      for (const batch of batches) {
        const emails = batch.accountants
          .map((a) => a.email)
          .filter((email) => selectedRecipients[recipientKey(batch.regionKey, email)]);
        if (emails.length === 0) {
          setError(`Sélectionnez au moins un cabinet pour ${batch.regionLabel}.`);
          setSending(false);
          return;
        }

        const fd = new FormData();
        fd.append("region", batch.regionKey);
        fd.append("senderName", senderName.trim() || "Client Compta IA");
        fd.append("message", message);
        for (const id of batch.invoices.map((i) => i.id)) {
          fd.append("invoiceIds", id);
        }
        for (const e of emails) {
          fd.append("recipientEmails", e);
        }

        const res = await fetch("/api/send-to-accountant", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        if (!res.ok) {
          setError(
            typeof json.error === "string"
              ? `${batch.regionLabel} : ${json.error}`
              : `Échec envoi (${batch.regionLabel}).`,
          );
          setSending(false);
          return;
        }
        if (typeof json.message === "string") messages.push(json.message);
      }

      onSuccess(messages.join("\n") || "Envoi au cabinet effectué.");
      onClose();
    } catch {
      setError("Erreur réseau lors de l'envoi.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-cabinet-title"
      onClick={() => !sending && onClose()}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-4 py-3">
            <h2 id="send-cabinet-title" className="text-base font-semibold text-slate-900">
              {restrictKey
                ? `Envoyer au cabinet — ${regionDisplayLabel(restrictKey)}`
                : "Envoyer au cabinet comptable"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {restrictKey
                ? "Les pièces peuvent venir de n’importe quel pays ; seuls les emails du cabinet sélectionné ci-dessous recevront l’envoi."
                : "Les factures partent vers le(s) cabinet(s) configuré(s) pour leur pays."}{" "}
              <Link href="/settings" className="font-medium text-indigo-700 hover:underline" onClick={onClose}>
                Paramètres → Cabinets par pays
              </Link>
            </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <p className="text-xs text-slate-700">
            <strong>{eligible.length}</strong> facture(s) avec pièce jointe
            {eligible.length !== invoices.length ? ` (${invoices.length - eligible.length} sans fichier ignorée(s))` : ""}.
          </p>

          {unconfirmedCount > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {unconfirmedCount} facture(s) non confirmée(s) — vous pouvez quand même envoyer, mais vérifiez les montants.
            </p>
          )}

          {loadingAcc ? (
            <p className="text-xs text-slate-500">Chargement des cabinets…</p>
          ) : (
            batches.map((batch) => (
              <div key={batch.regionKey} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-xs font-semibold text-slate-900">
                  {batch.regionLabel}{" "}
                  <span className="font-normal text-slate-500">({batch.invoices.length} facture(s))</span>
                </p>
                {batch.accountants.length === 0 ? (
                  <p className="mt-1 text-xs text-red-600">Aucun cabinet pour ce pays — ajoutez-en dans Paramètres.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {batch.accountants.map((a) => {
                      const k = recipientKey(batch.regionKey, a.email);
                      return (
                        <li key={a.id}>
                          <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={!!selectedRecipients[k]}
                              onChange={() => toggleRecipient(batch.regionKey, a.email)}
                              className="mt-0.5 rounded border-slate-300"
                            />
                            <span>
                              {a.label ? (
                                <>
                                  <span className="font-medium">{a.label}</span>
                                  <span className="text-slate-500"> — {a.email}</span>
                                </>
                              ) : (
                                a.email
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <ul className="mt-2 max-h-24 overflow-y-auto text-[10px] text-slate-500">
                  {batch.invoices.map((inv) => (
                    <li key={inv.id} className="truncate">
                      {inv.originalName}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">Nom expéditeur</label>
            <input
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">Message email</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            disabled={sending}
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={sending || eligible.length === 0 || loadingAcc}
            onClick={() => void handleSend()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {sending ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}
