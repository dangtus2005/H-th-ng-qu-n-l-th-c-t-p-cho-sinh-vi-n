import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import { campaignAccess, globalRole, integer } from '../utils/campaign-access';
import { activeCampaign, optionalText, reportPhases, withCampaign } from '../utils/academic';
import { audit } from '../utils/audit';
import { fail, text, uuid } from '../utils/validation';
import { requireUnpublished } from '../utils/result-lock';

const targets = ['THESIS_SUPERVISOR', 'INTERNSHIP_MENTOR', 'INTERNSHIP_LECTURER'];
export const slots = [...reportPhases, 'INTERNSHIP_MENTOR', 'INTERNSHIP_LECTURER'];
const slotTarget = (slot: string) => (reportPhases.includes(slot) ? 'THESIS_SUPERVISOR' : slot);
const applicable = (campaign: any, slot: string) =>
  reportPhases.includes(slot) ? campaign.type !== 'INTERNSHIP' : campaign.type !== 'THESIS';

function manager(req: Request) {
  const user = req.user!;
  if (
    !globalRole(req) &&
    (user.active_role !== 'FACULTY_MANAGER' || user.scope.major_id || user.scope.department_id)
  ) {
    fail('Chỉ quản lý toàn đợt cấu hình rubric', 403);
  }
}

export function gradeScores(template: any, values: unknown) {
  if (!Array.isArray(values) || values.length !== template.criteria.length)
    fail('Nhập điểm cho tất cả tiêu chí');
  let total = 0;
  const scores = template.criteria.map((c: any, i: number) => {
    const score = values[i];
    if (
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > c.max ||
      Math.abs(score * 100 - Math.round(score * 100)) > 1e-7
    )
      fail('Điểm tiêu chí phải từ 0 đến điểm tối đa, tối đa hai số lẻ');
    total += ((score / c.max) * c.weight) / 10;
    return score;
  });
  return { scores, total_score: Math.round(total * 100) / 100 };
}

export async function rubricFor(
  db: Pick<PoolClient, 'query'>,
  campaign: string,
  slot: string,
  previous?: string,
) {
  const {
    rows: [template],
  } = previous
    ? await db.query('SELECT * FROM rubric_templates WHERE id=$1', [previous])
    : await db.query(
        `SELECT t.* FROM campaign_rubric_templates c JOIN rubric_templates t ON t.id=c.template_id
       WHERE c.campaign_id=$1 AND c.slot=$2`,
        [campaign, slot],
      );
  if (!template) fail('Đợt chưa gắn rubric cho phần đánh giá này', 409);
  return template;
}

export const list = async (req: Request, res: Response) => {
  manager(req);
  const campaign = await campaignAccess(req, req.params.id, true);
  const { rows: templates } = await pool.query(
    'SELECT * FROM rubric_templates WHERE faculty_id=$1 ORDER BY created_at DESC,id',
    [campaign.faculty_id],
  );
  const { rows: bindings } = await pool.query(
    'SELECT slot,template_id FROM campaign_rubric_templates WHERE campaign_id=$1 ORDER BY slot',
    [campaign.id],
  );
  res.json({ templates, bindings, slots: slots.filter((slot) => applicable(campaign, slot)) });
};

export const create = async (req: Request, res: Response) => {
  manager(req);
  const body = req.body ?? {};
  const name = text(body.name, 'Tên rubric', 150);
  if (!targets.includes(body.target)) fail('Vai trò chấm không hợp lệ');
  if (!Array.isArray(body.criteria) || !body.criteria.length || body.criteria.length > 12)
    fail('Rubric cần 1–12 tiêu chí');
  const criteria = (body.criteria as Record<string, unknown>[]).map((c) => ({
    title: text(c?.title, 'Tiêu chí', 150),
    max: integer(c?.max, 'Điểm tối đa', 1, 100),
    weight: integer(c?.weight, 'Trọng số', 1, 100),
    guide: optionalText(c?.guide, 'Hướng dẫn chấm', 800),
  }));
  if (new Set(criteria.map((c) => c.title.toLowerCase())).size !== criteria.length)
    fail('Tên tiêu chí bị trùng');
  if (criteria.reduce((sum, c) => sum + c.weight, 0) !== 100) fail('Tổng trọng số phải bằng 100%');
  const result = await withCampaign(req, async (db, campaign) => {
    await campaignAccess(req, campaign.id, true, db);
    const {
      rows: [row],
    } = await db.query(
      `INSERT INTO rubric_templates(faculty_id,name,target,criteria,created_by)
      VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [campaign.faculty_id, name, body.target, JSON.stringify(criteria), req.user!.sub],
    );
    await audit(db, req, 'CREATE_RUBRIC_TEMPLATE', 'rubric_templates', row.id, null, row);
    return row;
  });
  res.status(201).json(result);
};

export const bind = async (req: Request, res: Response) => {
  manager(req);
  const slot = text(req.params.slot, 'Mốc đánh giá', 50);
  const id = uuid(req.body?.template_id, 'Rubric');
  if (!slots.includes(slot)) fail('Mốc đánh giá không hợp lệ');
  await withCampaign(req, async (db, campaign) => {
    await campaignAccess(req, campaign.id, true, db);
    if (!applicable(campaign, slot)) fail('Rubric không phù hợp loại đợt');
    await requireUnpublished(db, campaign.id);
    if (!activeCampaign(campaign.status) && campaign.status !== 'DRAFT') fail('Đợt đã đóng', 403);
    if (
      !(
        await db.query(
          'SELECT 1 FROM rubric_templates WHERE id=$1 AND faculty_id=$2 AND target=$3',
          [id, campaign.faculty_id, slotTarget(slot)],
        )
      ).rowCount
    )
      fail('Rubric không đúng khoa hoặc vai trò', 404);
    const {
      rows: [previous],
    } = await db.query(
      'SELECT template_id FROM campaign_rubric_templates WHERE campaign_id=$1 AND slot=$2',
      [campaign.id, slot],
    );
    await db.query(
      `INSERT INTO campaign_rubric_templates(campaign_id,slot,template_id) VALUES($1,$2,$3)
      ON CONFLICT (campaign_id,slot) DO UPDATE SET template_id=EXCLUDED.template_id`,
      [campaign.id, slot, id],
    );
    await audit(db, req, 'BIND_RUBRIC_TEMPLATE', 'campaigns', campaign.id, previous ?? null, {
      slot,
      template_id: id,
    });
  });
  res.json({ message: 'Đã gắn rubric vào đợt' });
};
