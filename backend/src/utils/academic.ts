import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import { campaignAccess } from './campaign-access';
import { fail, text, uuid } from './validation';

export const reportPhases = [
  'OUTLINE_SUBMISSION',
  'MIDTERM_REPORT_1',
  'MIDTERM_REPORT_2',
  'FINAL_SUBMISSION',
];
export const activeCampaign = (status: string) =>
  ['OPEN', 'IN_PROGRESS', 'DEFENSE'].includes(status);

export async function withCampaign<T>(
  req: Request,
  run: (db: PoolClient, campaign: any) => Promise<T>,
) {
  const id = uuid(req.params.id, 'Đợt');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const campaign = await campaignAccess(req, id, false, db);
    await db.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [id]);
    const result = await run(db, await campaignAccess(req, campaign.id, false, db));
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export function optionalText(value: unknown, label: string, max = 2000) {
  return value == null || value === '' ? null : text(value, label, max);
}

export function pdf(req: Request, required = true) {
  const file = req.file;
  if (!file && !required) return null;
  if (
    !file ||
    !/\.pdf$/i.test(file.originalname) ||
    file.buffer.subarray(0, 5).toString() !== '%PDF-' ||
    file.size > 5 * 1024 * 1024
  )
    fail('Chọn tệp PDF hợp lệ, tối đa 5 MB');
  return { name: text(file.originalname, 'Tên tệp', 255), bytes: file.buffer };
}

export async function submissionWindow(
  db: PoolClient,
  campaign: any,
  milestone: string,
  student: string,
) {
  if (!activeCampaign(campaign.status)) fail('Đợt chưa mở hoặc đã đóng', 403);
  const {
    rows: [m],
  } = await db.query(
    `SELECT m.*,clock_timestamp() AS current_time,o.extended_until FROM campaign_milestones m
     LEFT JOIN timeline_overrides o ON o.milestone_id=m.id AND o.target_user_id=$4
     WHERE m.id=$1 AND m.campaign_id=$2 AND m.phase::text=ANY($3::text[])`,
    [milestone, campaign.id, reportPhases, student],
  );
  if (!m) fail('Mốc nộp báo cáo không thuộc đợt', 404);
  if (m.is_locked_override || m.current_time < m.start_at)
    fail('Mốc nộp chưa mở hoặc đã khóa', 403);
  const due = Math.max(m.end_at.getTime(), m.extended_until?.getTime() ?? 0);
  const cutoff = Math.max(due, m.hard_deadline_at?.getTime() ?? 0);
  if (m.current_time.getTime() >= cutoff) fail('Đã hết hạn nộp báo cáo', 403);
  return { lateMinutes: Math.max(0, Math.ceil((m.current_time.getTime() - due) / 60000)) };
}

export function isoDate(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail(label + ' không hợp lệ');
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    fail(label + ' không hợp lệ');
  return value;
}
