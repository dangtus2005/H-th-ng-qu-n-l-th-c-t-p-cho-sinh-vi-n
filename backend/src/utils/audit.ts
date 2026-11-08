import type { PoolClient } from 'pg';
import type { Request } from 'express';

export async function audit(
  client: PoolClient,
  req: Request,
  action: string,
  table: string,
  id: string,
  before: unknown = null,
  after: unknown = null,
  actorId: string | null = req.user?.sub || null,
) {
  await client.query(
    `INSERT INTO audit_logs (actor_id,actor_role,action,entity_table,entity_id,old_values,new_values,ip_address)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      actorId,
      req.user?.active_role || null,
      action,
      table,
      id,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      req.ip,
    ],
  );
}
