import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import { campaignAccess, globalRole, integer, timestamp } from '../utils/campaign-access';
import { fail, text, uuid } from '../utils/validation';
import { audit } from '../utils/audit';
import { readExcel, template } from '../utils/excel';

export const phases = [
  'TOPIC_SUBMISSION',
  'TOPIC_APPROVAL',
  'WISH_REGISTRATION',
  'OUTLINE_SUBMISSION',
  'MIDTERM_REPORT_1',
  'MIDTERM_REPORT_2',
  'FINAL_SUBMISSION',
  'GRADING_REVIEW',
  'DEFENSE_COUNCIL',
  'POST_DEFENSE_ARCHIVE',
  'CAMPAIGN_CLOSURE',
];

const eligibilityHeaders = ['student_code', 'status', 'reason'];

export const saveCampaign = async (req: Request, res: Response) => {
  const id = uuid(req.params.id, 'Đợt');
  const client = await pool.connect();
  const b = req.body ?? {};
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [id]);
    const before = await campaignAccess(req, id, true, client);
    if (!['DRAFT', 'OPEN', 'IN_PROGRESS', 'DEFENSE', 'CLOSED', 'ARCHIVED'].includes(b.status)) {
      fail('Trạng thái đợt không hợp lệ');
    }
    if (!['THESIS', 'INTERNSHIP', 'COMBINED'].includes(b.type)) {
      fail('Loại đợt không hợp lệ');
    }
    if (typeof b.allow_student_propose_topic !== 'boolean') {
      fail('Cờ tự đề xuất không hợp lệ');
    }
    const training = b.training_system ? text(b.training_system, 'Hệ đào tạo', 50) : null;
    if (
      training &&
      !(await client.query('SELECT 1 FROM training_systems WHERE code=$1', [training])).rowCount
    ) {
      fail('Hệ đào tạo không tồn tại');
    }
    const values = [
      text(b.code, 'Mã đợt', 50),
      text(b.name, 'Tên đợt'),
      b.type,
      b.status,
      training,
      integer(b.max_students_per_topic, 'Số SV/đề tài', 1, 50),
      integer(b.max_wish_choices, 'Số nguyện vọng', 1, 5),
      b.allow_student_propose_topic,
      id,
    ];
    const after = (
      await client.query(
        `UPDATE campaigns SET code=$1,name=$2,type=$3,status=$4,training_system=$5,max_students_per_topic=$6,max_wish_choices=$7,allow_student_propose_topic=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
        values,
      )
    ).rows[0];
    // Khi đã có dữ liệu chỉ sửa quy tắc, không đổi khoa/ngành/học kỳ của đợt.
    await audit(client, req, 'UPDATE_CAMPAIGN', 'campaigns', id, before, after);
    await client.query('COMMIT');
    res.json(after);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deleteCampaign = async (req: Request, res: Response) => {
  const id = uuid(req.params.id, 'Đợt');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [id]);
    const before = await campaignAccess(req, id, true, client);
    if (before.status !== 'DRAFT') {
      fail('Chỉ xóa đợt nháp chưa sử dụng', 409);
    }
    const refs = await client.query(
      `SELECT t.relname,a.attname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1] WHERE c.contype='f' AND c.confrelid='public.campaigns'::regclass`,
    );
    const quote = (s: string) => '"' + s.replace(/"/g, '""') + '"';
    for (const r of refs.rows)
      if (
        (
          await client.query(
            `SELECT 1 FROM public.${quote(r.relname)} WHERE ${quote(r.attname)}=$1 LIMIT 1`,
            [id],
          )
        ).rowCount
      ) {
        fail('Đợt đã có dữ liệu liên quan; không thể xóa', 409);
      }
    await client.query('DELETE FROM campaigns WHERE id=$1', [id]);
    await audit(client, req, 'DELETE_CAMPAIGN', 'campaigns', id, before);
    await client.query('COMMIT');
    res.json({ message: 'Đã xóa đợt nháp' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

async function targetStudent(client: Pick<PoolClient, 'query'>, campaign: any, studentId: string) {
  const student = (
    await client.query(
      `SELECT p.*,d.faculty_id,m.training_system FROM student_profiles p JOIN majors m ON m.id=p.major_id JOIN departments d ON d.id=m.department_id JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND u.is_active=true AND EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.code='STUDENT')`,
      [studentId],
    )
  ).rows[0];
  if (
    !student ||
    student.faculty_id !== campaign.faculty_id ||
    (campaign.major_id && student.major_id !== campaign.major_id) ||
    (campaign.training_system && student.training_system !== campaign.training_system)
  ) {
    fail('Sinh viên không thuộc khoa/ngành/hệ đào tạo của đợt', 403);
  }
  return student;
}

export const eligibilityTemplate = async (_req: Request, res: Response) => {
  await template(res, eligibilityHeaders, 'eligible-students');
};

export const listEligibility = async (req: Request, res: Response) => {
  await campaignAccess(req, req.params.id, true);
  res.json(
    (
      await pool.query(
        `SELECT e.*,u.code,u.full_name FROM campaign_eligible_students e JOIN users u ON u.id=e.student_id WHERE e.campaign_id=$1 ORDER BY u.code`,
        [req.params.id],
      )
    ).rows,
  );
};

export const importEligibility = async (req: Request, res: Response) => {
  const rows = await readExcel(req, eligibilityHeaders);
  const client = await pool.connect();
  const results: any[] = [];
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [
      uuid(req.params.id, 'Đợt'),
    ]);
    const campaign = await campaignAccess(req, req.params.id, true, client);
    const seen = new Set<string>();
    for (const row of rows) {
      await client.query('SAVEPOINT eligible_row');
      try {
        if (row.error) {
          fail(row.error);
        }
        const v = row.values;
        const code = text(v.student_code, 'Mã SV', 50);
        if (seen.has(code)) {
          fail('Mã sinh viên trùng trong file');
        }
        seen.add(code);
        if (!['ELIGIBLE', 'INELIGIBLE', 'DROPPED_OUT', 'DEFERRED'].includes(v.status!)) {
          fail('Trạng thái cần ELIGIBLE/INELIGIBLE/DROPPED_OUT/DEFERRED');
        }
        const student = (await client.query('SELECT id FROM users WHERE code=$1', [code])).rows[0];
        if (!student) {
          fail('Mã sinh viên không tồn tại');
        }
        await targetStudent(client, campaign, student.id);
        await client.query(
          `INSERT INTO campaign_eligible_students (campaign_id,student_id,status,ineligible_reason,verified_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(campaign_id,student_id) DO UPDATE SET status=EXCLUDED.status,ineligible_reason=EXCLUDED.ineligible_reason,verified_by=EXCLUDED.verified_by`,
          [
            campaign.id,
            student.id,
            v.status,
            v.reason ? text(v.reason, 'Lý do', 2000) : null,
            req.user!.sub,
          ],
        );
        await audit(client, req, 'SET_ELIGIBILITY', 'campaigns', campaign.id, null, {
          student_id: student.id,
          status: v.status,
        });
        results.push({ row: row.row, code, status: 'saved', message: 'Đã lưu điều kiện' });
        await client.query('RELEASE SAVEPOINT eligible_row');
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT eligible_row');
        const e = error as any;
        results.push({
          row: row.row,
          code: row.values.student_code,
          status: 'error',
          message: [400, 403].includes(e.status) ? e.message : 'Dữ liệu không hợp lệ',
        });
      }
    }
    await client.query('COMMIT');
    res.json({ saved: results.filter((r) => r.status === 'saved').length, results });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const timeline = async (req: Request, res: Response) => {
  await campaignAccess(req, req.params.id);
  const milestones = (
    await pool.query(
      'SELECT * FROM campaign_milestones WHERE campaign_id=$1 ORDER BY sequence_order,start_at',
      [req.params.id],
    )
  ).rows;
  const manage = globalRole(req) || req.user!.active_role === 'FACULTY_MANAGER';
  const overrides = (
    await pool.query(
      `SELECT o.*,u.code,u.full_name FROM timeline_overrides o JOIN campaign_milestones m ON m.id=o.milestone_id JOIN users u ON u.id=o.target_user_id WHERE m.campaign_id=$1 AND ($2::boolean OR o.target_user_id=$3) ORDER BY o.created_at DESC`,
      [req.params.id, manage, req.user!.sub],
    )
  ).rows;
  res.json({ phases, milestones, overrides, server_time: new Date().toISOString() });
};

export const saveMilestone = async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const start = timestamp(b.start_at, 'Bắt đầu');
  const end = timestamp(b.end_at, 'Kết thúc');
  if (start >= end) {
    fail('Kết thúc phải sau bắt đầu');
  }
  if (!phases.includes(b.phase)) {
    fail('Giai đoạn không hợp lệ');
  }
  if (typeof b.is_locked !== 'boolean') {
    fail('Cờ khóa không hợp lệ');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [
      uuid(req.params.id, 'Đợt'),
    ]);
    const campaign = await campaignAccess(req, req.params.id, true, client);
    const before = (
      await client.query(
        'SELECT * FROM campaign_milestones WHERE campaign_id=$1 AND phase=$2 FOR UPDATE',
        [campaign.id, b.phase],
      )
    ).rows[0];
    const after = (
      await client.query(
        `INSERT INTO campaign_milestones (campaign_id,phase,title,start_at,end_at,sequence_order,is_locked_override) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(campaign_id,phase) DO UPDATE SET title=EXCLUDED.title,start_at=EXCLUDED.start_at,end_at=EXCLUDED.end_at,sequence_order=EXCLUDED.sequence_order,is_locked_override=EXCLUDED.is_locked_override RETURNING *`,
        [
          campaign.id,
          b.phase,
          text(b.title, 'Tên mốc'),
          start,
          end,
          phases.indexOf(b.phase),
          b.is_locked ? true : null,
        ],
      )
    ).rows[0];
    await audit(client, req, 'SET_MILESTONE', 'campaign_milestones', after.id, before, after);
    await client.query('COMMIT');
    res.json(after);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const grantOverride = async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const client = await pool.connect();
  const studentId = uuid(b.student_id, 'Sinh viên');
  const until = timestamp(b.extended_until, 'Gia hạn');
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [
      uuid(req.params.id, 'Đợt'),
    ]);
    const campaign = await campaignAccess(req, req.params.id, true, client);
    await targetStudent(client, campaign, studentId);
    const milestone = (
      await client.query(
        'SELECT * FROM campaign_milestones WHERE id=$1 AND campaign_id=$2 FOR UPDATE',
        [uuid(b.milestone_id, 'Mốc'), campaign.id],
      )
    ).rows[0];
    if (!milestone) {
      fail('Mốc không thuộc đợt');
    }
    if (new Date(until) <= new Date(milestone.end_at) || new Date(until) <= new Date()) {
      fail('Gia hạn phải sau hạn chung và thời điểm hiện tại');
    }
    const after = (
      await client.query(
        `INSERT INTO timeline_overrides (milestone_id,target_user_id,extended_until,reason,granted_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(milestone_id,target_user_id) DO UPDATE SET extended_until=EXCLUDED.extended_until,reason=EXCLUDED.reason,granted_by=EXCLUDED.granted_by RETURNING *`,
        [milestone.id, studentId, until, text(b.reason, 'Lý do', 2000), req.user!.sub],
      )
    ).rows[0];
    await audit(client, req, 'GRANT_OVERRIDE', 'timeline_overrides', after.id, null, after);
    await client.query('COMMIT');
    res.json(after);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const revokeOverride = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [
      uuid(req.params.id, 'Đợt'),
    ]);
    await campaignAccess(req, req.params.id, true, client);
    const result = await client.query(
      `DELETE FROM timeline_overrides o USING campaign_milestones m WHERE o.id=$1 AND m.id=o.milestone_id AND m.campaign_id=$2 RETURNING o.*`,
      [uuid(req.params.overrideId, 'Ngoại lệ'), req.params.id],
    );
    if (!result.rows[0]) {
      fail('Không tìm thấy ngoại lệ', 404);
    }
    await audit(
      client,
      req,
      'REVOKE_OVERRIDE',
      'timeline_overrides',
      result.rows[0].id,
      result.rows[0],
    );
    await client.query('COMMIT');
    res.json({ message: 'Đã thu hồi ngoại lệ' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export async function gateState(
  req: Request,
  id: unknown,
  phase: string,
  client: Pick<PoolClient, 'query'> = pool,
) {
  if (!phases.includes(phase)) {
    fail('Giai đoạn không hợp lệ');
  }
  const campaign = await campaignAccess(req, id, false, client);
  const now = new Date();
  const locked = (reason: string) => ({
    allowed: false,
    reason,
    server_time: now.toISOString(),
    effective_end: null as string | null,
    registered: false,
  });
  if (!['OPEN', 'IN_PROGRESS', 'DEFENSE'].includes(campaign.status)) {
    return locked('Đợt chưa mở hoặc đã đóng');
  }
  if (req.user!.active_role !== 'STUDENT') {
    return locked('Chuyển sang vai trò Sinh viên để đăng ký');
  }
  try {
    await targetStudent(client, campaign, req.user!.sub);
  } catch {
    return locked('Hồ sơ không thuộc ngành/hệ đào tạo của đợt');
  }
  const eligibility = (
    await client.query(
      'SELECT status FROM campaign_eligible_students WHERE campaign_id=$1 AND student_id=$2',
      [campaign.id, req.user!.sub],
    )
  ).rows[0];
  if (eligibility?.status !== 'ELIGIBLE') {
    return locked('Bạn chưa có trong danh sách đủ điều kiện');
  }
  if (phase === 'TOPIC_SUBMISSION' && !campaign.allow_student_propose_topic) {
    return locked('Đợt không cho phép sinh viên tự đề xuất');
  }
  const milestone = (
    await client.query(
      `SELECT m.*,o.extended_until FROM campaign_milestones m LEFT JOIN timeline_overrides o ON o.milestone_id=m.id AND o.target_user_id=$2 WHERE m.campaign_id=$1 AND m.phase=$3`,
      [campaign.id, req.user!.sub, phase],
    )
  ).rows[0];
  if (!milestone) {
    return locked('Chưa cấu hình mốc thời gian');
  }
  if (milestone.is_locked_override === true) {
    return locked('Giai đoạn đã được Khoa khóa thủ công');
  }
  if (now < new Date(milestone.start_at)) {
    return locked('Chưa tới thời gian mở đăng ký');
  }
  const end = new Date(
    Math.max(
      new Date(milestone.end_at).getTime(),
      milestone.extended_until ? new Date(milestone.extended_until).getTime() : 0,
    ),
  );
  const registered = !!(
    await client.query(
      'SELECT 1 FROM campaign_enrollments WHERE campaign_id=$1 AND student_id=$2',
      [campaign.id, req.user!.sub],
    )
  ).rowCount;
  return {
    allowed: now < end,
    reason: now < end ? 'Đang trong thời gian cho phép' : 'Đã hết hạn',
    server_time: now.toISOString(),
    effective_end: end.toISOString(),
    registered,
  };
}

export const gate = async (req: Request, res: Response) => {
  res.json(
    await gateState(
      req,
      req.params.id,
      typeof req.query.phase === 'string' ? req.query.phase : 'WISH_REGISTRATION',
    ),
  );
};

export const enroll = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [
      uuid(req.params.id, 'Đợt'),
    ]);
    const state = await gateState(req, req.params.id, 'WISH_REGISTRATION', client);
    if (!state.allowed) {
      fail(state.reason, 403);
    }
    const result = await client.query(
      'INSERT INTO campaign_enrollments (campaign_id,student_id) VALUES ($1,$2) ON CONFLICT(campaign_id,student_id) DO NOTHING RETURNING *',
      [req.params.id, req.user!.sub],
    );
    if (result.rows[0]) {
      await audit(
        client,
        req,
        'ENROLL_CAMPAIGN',
        'campaign_enrollments',
        result.rows[0].id,
        null,
        result.rows[0],
      );
    }
    await client.query('COMMIT');
    res.json({ message: state.registered ? 'Bạn đã đăng ký đợt này' : 'Đã đăng ký tham gia đợt' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
