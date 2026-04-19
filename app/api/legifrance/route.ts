import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "../../../lib/postgres";
import { fetchJudilibreFiscalHits } from "../../../lib/piste-judilibre";
import { getAuthenticatedUserId } from "../../../lib/auth-request";

export const runtime = "nodejs";

const JO_RSS_FEEDS = [
  {
    url: "https://www.legifrance.gouv.fr/feeds/jorf/",
    label: "Journal Officiel — Fiscalité",
    keywords: ["impôt", "taxe", "fiscal", "TVA", "IS", "IR", "CGI", "cotisation", "finances"],
  },
];

interface JOEntry {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source?: string;
}

async function fetchJOFeed(): Promise<JOEntry[]> {
  const entries: JOEntry[] = [];

  for (const feed of JO_RSS_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      });
      if (!res.ok) continue;

      const xml = await res.text();

      const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
      for (const match of itemMatches) {
        const item = match[1];
        const title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() ?? "";
        const desc  = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/)?.[1]?.trim() ?? "";
        const link  = item.match(/<link>(.*?)<\/link>/)?.[1]?.trim() ?? "";
        const date  = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? new Date().toUTCString();

        const text = `${title} ${desc}`.toLowerCase();
        const relevant = feed.keywords.some((kw) => text.includes(kw));
        if (relevant || entries.length < 5) {
          entries.push({
            title,
            description: desc.slice(0, 300),
            link,
            pubDate: date,
            source: "legifrance.gouv.fr",
          });
        }
      }
    } catch {
      // Feed unreachable — continue
    }
  }

  return entries.slice(0, 20);
}

async function fetchJudilibreEntries(): Promise<JOEntry[]> {
  const keyId = process.env.PISTE_JUDILIBRE_KEY_ID?.trim();
  if (!keyId) return [];

  try {
    const hits = await fetchJudilibreFiscalHits(keyId, 14);
    return hits.map((h) => ({
      title: h.title,
      description: h.description,
      link: h.link,
      pubDate: h.pubDate,
      source: h.source || "judilibre",
    }));
  } catch (e) {
    console.error("Judilibre:", e);
    return [];
  }
}

async function fetchDataGouvFiscal(): Promise<JOEntry[]> {
  try {
    const res = await fetch(
      "https://data.gouv.fr/api/1/reuses/?tag=fiscalite&sort=-created&page_size=10",
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data ?? []).map((item: { title: string; description: string; url: string; created_at: string }) => ({
      title: item.title,
      description: item.description?.slice(0, 300) ?? "",
      link: item.url,
      pubDate: item.created_at,
      source: "data.gouv.fr",
    }));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const doRefresh = searchParams.get("refresh") === "1";

  let newCount = 0;
  let fetched = 0;

  if (doRefresh) {
    try {
      const [joEntries, gouvEntries, judilibreEntries] = await Promise.all([
        fetchJOFeed(),
        fetchDataGouvFiscal(),
        fetchJudilibreEntries(),
      ]);

      const allEntries = [...judilibreEntries, ...joEntries, ...gouvEntries].slice(0, 35);
      fetched = allEntries.length;

      for (const entry of allEntries) {
        try {
          const existing = await pool.query(
            `SELECT id FROM legal_alerts WHERE title = $1 LIMIT 1`,
            [entry.title]
          );
          if (existing.rows.length === 0) {
            let pubDate: Date;
            try { pubDate = new Date(entry.pubDate); } catch { pubDate = new Date(); }
            if (isNaN(pubDate.getTime())) pubDate = new Date();

            await pool.query(
              `INSERT INTO legal_alerts (id, title, description, source, url, "pubDate", region, seen, "createdAt")
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'france', false, NOW())`,
              [
                entry.title,
                entry.description,
                entry.source ?? "legifrance.gouv.fr",
                entry.link,
                pubDate,
              ]
            );
            newCount++;
          }
        } catch {
          // Skip duplicates
        }
      }
    } catch (error) {
      console.error("Erreur flux Légifrance:", error);
    }
  }

  try {
    const alerts = await pool.query(
      `SELECT
         la.id,
         la.title,
         la.description,
         la.source,
         la.url,
         la."pubDate",
         la.region,
         (lar."userId" IS NOT NULL) AS seen
       FROM legal_alerts la
       LEFT JOIN legal_alert_reads lar ON lar."alertId" = la.id AND lar."userId" = $1
       ORDER BY (lar."userId" IS NOT NULL) ASC, la."pubDate" DESC
       LIMIT 50`,
      [userId]
    );

    return NextResponse.json({ alerts: alerts.rows, newCount, fetched });
  } catch (error) {
    console.error("Erreur Légifrance:", error);
    return NextResponse.json({ alerts: [], newCount: 0, error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  try {
    const { id } = await request.json();
    if (id === "all") {
      await pool.query(
        `INSERT INTO legal_alert_reads ("userId", "alertId")
         SELECT $1, id FROM legal_alerts
         ON CONFLICT ("userId", "alertId") DO NOTHING`,
        [userId]
      );
    } else if (id) {
      await pool.query(
        `INSERT INTO legal_alert_reads ("userId", "alertId") VALUES ($1, $2)
         ON CONFLICT ("userId", "alertId") DO NOTHING`,
        [userId, id]
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
