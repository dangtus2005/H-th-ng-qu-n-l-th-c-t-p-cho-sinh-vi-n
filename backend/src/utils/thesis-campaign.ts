import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import { campaignAccess } from './campaign-access';
import { fail, uuid } from './validation';
import { requireUnpublished } from './result-lock';

type DB = Pick<PoolClient, 'query'>;

export async function thesisCampaign(req: Request, db: DB = pool) {
  const campaign = await campaignAccess(req, req.params.id, false, db);
  if (campaign.type === 'INTERNSHIP') fail('Đợt này chỉ dành cho thực tập', 403);
  return campaign;
}

export async function thesisWrite<T>(
  req: Request,
  run: (db: PoolClient, campaign: any) => Promise<T>,
) {
  const id = uuid(req.params.id, 'Đợt');
  await thesisCampaign(req);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [id]);
    await requireUnpublished(db, id);
    const result = await run(db, await thesisCampaign(req, db));
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export async function requireStaffPhase(
  db: DB,
  campaign: any,
  phase: 'TOPIC_SUBMISSION' | 'TOPIC_APPROVAL',
) {
  if (!['OPEN', 'IN_PROGRESS'].includes(campaign.status)) fail('Đợt chưa mở hoặc đã đóng', 403);
  const { rows } = await db.query(
    `SELECT NOT coalesce(is_locked_override,false) AND clock_timestamp()>=start_at
       AND clock_timestamp()<end_at AS allowed
     FROM campaign_milestones WHERE campaign_id=$1 AND phase=$2`,
    [campaign.id, phase],
  );
  if (!rows[0]?.allowed) {
    fail(
      phase === 'TOPIC_SUBMISSION' ? 'Mốc đề xuất đề tài chưa mở' : 'Mốc duyệt đề tài chưa mở',
      403,
    );
  }
}
