export type ParsedBankTransaction = {
  date: Date;
  label: string;
  amount: number;
  reference?: string;
  raw?: string;
};

function parseFlexibleDate(raw: string): Date | null {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const fr = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(s);
  if (fr) {
    let y = Number(fr[3]);
    if (y < 100) y = y >= 70 ? 1900 + y : 2000 + y;
    const d = new Date(Date.UTC(y, Number(fr[2]) - 1, Number(fr[1])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".").replace(/[^\d.\-+]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function detectDelimiter(header: string): string {
  const counts = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of header) {
    if (ch === ";") counts[";"]++;
    if (ch === ",") counts[","]++;
    if (ch === "\t") counts["\t"]++;
  }
  if (counts[";"] >= counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] >= counts[","]) return "\t";
  return ",";
}

/** Import CSV bancaire (séparateur auto, colonnes date/libellé/montant) */
export function parseBankCsv(content: string): ParsedBankTransaction[] {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const delim = detectDelimiter(lines[0]);
  const headers = lines[0].split(delim).map((h) => h.trim().toLowerCase());

  const dateIdx = headers.findIndex((h) =>
    /date|dat|op[eé]ration|valeur/.test(h),
  );
  const labelIdx = headers.findIndex((h) =>
    /libell[eé]|label|description|d[eé]signation|memo|detail/.test(h),
  );
  const amountIdx = headers.findIndex((h) =>
    /montant|amount|somme|cr[eé]dit|d[eé]bit|solde/.test(h),
  );
  const debitIdx = headers.findIndex((h) => /^d[eé]bit$/.test(h));
  const creditIdx = headers.findIndex((h) => /^cr[eé]dit$/.test(h));
  const refIdx = headers.findIndex((h) => /r[eé]f|reference|ref/.test(h));

  const out: ParsedBankTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim);
    const dateRaw = dateIdx >= 0 ? cols[dateIdx] : cols[0];
    const label = (labelIdx >= 0 ? cols[labelIdx] : cols[1] ?? "").trim();
    const date = parseFlexibleDate(dateRaw ?? "");
    if (!date || !label) continue;

    let amount: number | null = null;
    if (debitIdx >= 0 || creditIdx >= 0) {
      const debit = debitIdx >= 0 ? parseAmount(cols[debitIdx] ?? "0") ?? 0 : 0;
      const credit = creditIdx >= 0 ? parseAmount(cols[creditIdx] ?? "0") ?? 0 : 0;
      if (debit > 0) amount = -debit;
      else if (credit > 0) amount = credit;
    } else if (amountIdx >= 0) {
      amount = parseAmount(cols[amountIdx] ?? "");
    }
    if (amount == null) continue;

    out.push({
      date,
      label,
      amount,
      reference: refIdx >= 0 ? cols[refIdx]?.trim() : undefined,
      raw: lines[i],
    });
  }
  return out;
}

/** Import OFX (Open Financial Exchange) */
export function parseBankOfx(content: string): ParsedBankTransaction[] {
  const out: ParsedBankTransaction[] = [];
  const blocks = content.split(/<STMTTRN>/i).slice(1);

  for (const block of blocks) {
    const dtPosted = /<DTPOSTED>(\d{8})/i.exec(block)?.[1];
    const trnAmt = /<TRNAMT>([-\d.]+)/i.exec(block)?.[1];
    const name = /<NAME>([^<\r\n]+)/i.exec(block)?.[1];
    const memo = /<MEMO>([^<\r\n]+)/i.exec(block)?.[1];
    const fitId = /<FITID>([^<\r\n]+)/i.exec(block)?.[1];

    if (!dtPosted || !trnAmt) continue;
    const y = Number(dtPosted.slice(0, 4));
    const mo = Number(dtPosted.slice(4, 6));
    const d = Number(dtPosted.slice(6, 8));
    const date = new Date(Date.UTC(y, mo - 1, d));
    const amount = Number.parseFloat(trnAmt);
    if (Number.isNaN(amount)) continue;

    out.push({
      date,
      label: (name || memo || "Opération bancaire").trim(),
      amount,
      reference: fitId?.trim(),
      raw: block.slice(0, 200),
    });
  }
  return out;
}

/** Import QIF (Quicken Interchange Format) */
export function parseBankQif(content: string): ParsedBankTransaction[] {
  const out: ParsedBankTransaction[] = [];
  const records = content.split(/^\^/m).map((r) => r.trim()).filter(Boolean);

  for (const rec of records) {
    const lines = rec.split(/\r?\n/);
    let date: Date | null = null;
    let amount: number | null = null;
    let label = "";
    let reference: string | undefined;

    for (const line of lines) {
      const code = line[0];
      const val = line.slice(1).trim();
      if (code === "D") date = parseFlexibleDate(val);
      if (code === "T" || code === "U") amount = parseAmount(val);
      if (code === "P" || code === "N") label = val || label;
      if (code === "M") reference = val;
    }
    if (!date || amount == null) continue;
    out.push({ date, label: label || "Opération bancaire", amount, reference, raw: rec.slice(0, 200) });
  }
  return out;
}

export function parseBankFile(
  content: string,
  format: "csv" | "ofx" | "qif",
): ParsedBankTransaction[] {
  if (format === "ofx") return parseBankOfx(content);
  if (format === "qif") return parseBankQif(content);
  return parseBankCsv(content);
}

export function detectBankFormat(fileName: string, content: string): "csv" | "ofx" | "qif" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ofx") || lower.endsWith(".qfx") || content.includes("<OFX>") || content.includes("<STMTTRN>")) {
    return "ofx";
  }
  if (lower.endsWith(".qif") || content.trimStart().startsWith("!Type:")) return "qif";
  return "csv";
}
