import { pool } from "@/lib/postgres";
import type { AdminRole } from "@/lib/admin";

let auditTableReady = false;

async function ensureAuditTable() {
  if (auditTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_user_id text NOT NULL,
      actor_email text NOT NULL,
      actor_role text NOT NULL,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id text,
      details jsonb,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  auditTableReady = true;
}

export async function logAdminAudit(params: {
  actorUserId: string;
  actorEmail: string;
  actorRole: AdminRole;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: unknown;
}) {
  await ensureAuditTable();
  await pool.query(
    `INSERT INTO admin_audit_logs
     (actor_user_id, actor_email, actor_role, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      params.actorUserId,
      params.actorEmail,
      params.actorRole,
      params.action,
      params.entityType,
      params.entityId ?? null,
      JSON.stringify(params.details ?? {}),
    ],
  );
}

export async function listAdminAudit(page: number, pageSize: number) {
  await ensureAuditTable();
  const safePage = Math.max(page, 1);
  const safePageSize = Math.min(Math.max(pageSize, 1), 100);
  const offset = (safePage - 1) * safePageSize;

  const [countResult, dataResult] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM admin_audit_logs`),
    pool.query(
      `SELECT
        id,
        actor_user_id AS "actorUserId",
        actor_email AS "actorEmail",
        actor_role AS "actorRole",
        action,
        entity_type AS "entityType",
        entity_id AS "entityId",
        details,
        created_at AS "createdAt"
      FROM admin_audit_logs
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2`,
      [safePageSize, offset],
    ),
  ]);

  return {
    total: Number(countResult.rows[0]?.total || 0),
    page: safePage,
    pageSize: safePageSize,
    items: dataResult.rows,
  };
}
