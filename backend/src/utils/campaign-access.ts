import type { Request } from 'express';
import { pool } from '../config/db';
import { fail, uuid } from './validation';

export const globalRole = (req: Request) =>
  ['SYSTEM_ADMIN', 'TRAINING_DEPT'].includes(req.user!.active_role);

export async function campaignAccess(
  req: Request,
  id: unknown,
  write = false,
  db: Pick<typeof pool, 'query'> = pool,
) {
  const campaign = (
    await db.query(
      `SELECT c.*,m.department_id FROM campaigns c LEFT JOIN majors m ON m.id=c.major_id WHERE c.id=$1`,
      [uuid(id, 'Đợt')],
    )
  ).rows[0];
  if (!campaign) {
    fail('Đợt không tồn tại', 404);
  }
  const s = req.user!.scope;
  if (
    !globalRole(req) &&
    (s.faculty_id !== campaign.faculty_id ||
      (s.campaign_id && s.campaign_id !== campaign.id) ||
      (s.major_id && campaign.major_id && s.major_id !== campaign.major_id) ||
      (s.department_id && campaign.department_id && s.department_id !== campaign.department_id))
  ) {
    fail('Đợt ngoài phạm vi của bạn', 403);
  }
  if (write && !globalRole(req) && req.user!.active_role !== 'FACULTY_MANAGER') {
    fail('Chỉ Admin, Đào tạo hoặc Khoa được cấu hình đợt', 403);
  }
  return campaign;
}

export function integer(value: unknown, label: string, min = 0, max = 1000) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail(`${label}: số nguyên từ ${min} đến ${max}`);
  }
  return value as number;
}

export function timestamp(value: unknown, label: string) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    fail(`${label} không hợp lệ`);
  }
  return new Date(value as string).toISOString();
}
