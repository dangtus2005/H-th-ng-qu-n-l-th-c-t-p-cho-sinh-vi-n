import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import { campaignAccess, globalRole, integer } from '../utils/campaign-access';
import {
  activeCampaign,
  isoDate,
  optionalText,
  pdf,
  reportPhases,
  submissionWindow,
  withCampaign,
} from '../utils/academic';
import { audit } from '../utils/audit';
import { email, fail, text, uuid } from '../utils/validation';
import { gateState, targetStudent } from './campaigns.controller';
import { eligibilityReason } from '../utils/eligibility';
import { gradeScores, rubricFor } from './rubrics.controller';
import { requireUnpublished, resultState } from '../utils/result-lock';

type DB = Pick<PoolClient, 'query'>;
const placed = ['APPROVED', 'IN_PROGRESS'];
const role = (req: Request) => req.user!.active_role;
const manages = (req: Request) =>
  globalRole(req) ||
  (role(req) === 'FACULTY_MANAGER' && !req.user!.scope.major_id && !req.user!.scope.department_id);

function internship(campaign: any) {
  if (campaign.type === 'THESIS') fail('Đợt này dành cho đồ án', 403);
  return campaign;
}
function manage(req: Request) {
  if (!manages(req)) fail('Chỉ quản lý toàn đợt thực tập được xử lý', 403);
}
function working(campaign: any) {
  if (!activeCampaign(campaign.status)) fail('Đợt chưa mở hoặc đã đóng', 403);
}
function placementWritable(campaign: any, placement: any) {
  working(campaign);
  if (!placed.includes(placement.status)) fail('Hồ sơ thực tập chưa duyệt hoặc đã đóng', 403);
}

async function access(db: DB, req: Request, id?: string) {
  const campaignId = uuid(req.params.id, 'Đợt');
  const me = req.user!.sub;
  const current = role(req);
  const s = req.user!.scope;
  let campaign;
  if (current === 'ENTERPRISE_MENTOR') {
    const {
      rows: [row],
    } = await db.query(
      `SELECT c.* FROM campaigns c LEFT JOIN majors m ON m.id=c.major_id
      WHERE c.id=$1 AND ($3::uuid IS NULL OR c.faculty_id=$3) AND ($4::uuid IS NULL OR c.id=$4)
        AND ($5::uuid IS NULL OR c.major_id IS NULL OR c.major_id=$5)
        AND ($6::uuid IS NULL OR m.department_id IS NULL OR m.department_id=$6)
        AND EXISTS(SELECT FROM internship_placements p WHERE p.campaign_id=c.id AND p.company_mentor_id=$2
           AND p.status IN ('APPROVED','IN_PROGRESS','COMPLETED'))`,
      [campaignId, me, s.faculty_id, s.campaign_id, s.major_id, s.department_id],
    );
    if (!row) fail('Không có đợt thực tập được phân công', 404);
    campaign = row;
  } else {
    campaign = await campaignAccess(req, campaignId, false, db);
  }
  internship(campaign);
  const { rows } = await db.query(
    `SELECT p.id,p.campaign_id,p.student_id,p.company_id,p.supervisor_lecturer_id,p.company_mentor_id,p.source,
          p.job_title,p.start_date::text,p.end_date::text,p.status,p.reject_reason,p.created_at,
          u.full_name AS student_name,u.code AS student_code,c.name AS company_name,
          l.full_name AS lecturer_name,m.full_name AS mentor_name,
          EXISTS(SELECT FROM internship_application_files WHERE placement_id=p.id) AS has_evidence
      FROM internship_placements p JOIN companies c ON c.id=p.company_id JOIN users u ON u.id=p.student_id
      LEFT JOIN users l ON l.id=p.supervisor_lecturer_id LEFT JOIN users m ON m.id=p.company_mentor_id
      WHERE p.campaign_id=$1 AND ($2::uuid IS NULL OR p.id=$2)
        AND ($5::boolean OR ($4='STUDENT' AND p.student_id=$3)
         OR (p.status IN ('APPROVED','IN_PROGRESS','COMPLETED') AND
              (($4='LECTURER' AND p.supervisor_lecturer_id=$3) OR ($4='ENTERPRISE_MENTOR' AND p.company_mentor_id=$3))))
      ORDER BY p.created_at DESC,p.id`,
    [campaign.id, id ?? null, me, current, manages(req)],
  );
  if (id && !rows.length) fail('Không tìm thấy hồ sơ thực tập của bạn', 404);
  return { campaign, rows };
}

async function writePlacement<T>(
  req: Request,
  run: (db: PoolClient, c: any, p: any) => Promise<T>,
) {
  const id = uuid(req.params.placementId, 'Hồ sơ thực tập');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const first = await access(db, req, id);
    await db.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [first.campaign.id]);
    const {
      campaign,
      rows: [placement],
    } = await access(db, req, id);
    await requireUnpublished(db, campaign.id);
    const result = await run(db, campaign, placement);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

async function companyFields(body: any) {
  return {
    name: text(body?.name, 'Tên doanh nghiệp', 255),
    industry: optionalText(body?.industry, 'Lĩnh vực', 150),
    address: optionalText(body?.address, 'Địa chỉ', 500),
    contact_email: body?.contact_email ? email(body.contact_email) : null,
    contact_phone: optionalText(body?.contact_phone, 'Điện thoại', 20),
  };
}
async function addCompany(
  db: PoolClient,
  faculty: string,
  fields: Awaited<ReturnType<typeof companyFields>>,
  verified: boolean,
) {
  return (
    await db.query(
      `INSERT INTO companies(managing_faculty_id,name,industry,address,contact_email,contact_phone,is_verified)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        faculty,
        fields.name,
        fields.industry,
        fields.address,
        fields.contact_email,
        fields.contact_phone,
        verified,
      ],
    )
  ).rows[0];
}

export const mentorCampaigns = async (req: Request, res: Response) => {
  if (role(req) !== 'ENTERPRISE_MENTOR') fail('Chỉ mentor xem danh sách này', 403);
  const s = req.user!.scope;
  const { rows } = await pool.query(
    `SELECT DISTINCT c.id,c.name,c.type FROM campaigns c
    JOIN internship_placements p ON p.campaign_id=c.id LEFT JOIN majors m ON m.id=c.major_id
    WHERE c.type IN ('INTERNSHIP','COMBINED') AND p.company_mentor_id=$1 AND p.status IN ('APPROVED','IN_PROGRESS','COMPLETED')
      AND ($2::uuid IS NULL OR c.faculty_id=$2) AND ($3::uuid IS NULL OR c.id=$3)
      AND ($4::uuid IS NULL OR c.major_id IS NULL OR c.major_id=$4)
      AND ($5::uuid IS NULL OR m.department_id IS NULL OR m.department_id=$5) ORDER BY c.name,c.id`,
    [req.user!.sub, s.faculty_id, s.campaign_id, s.major_id, s.department_id],
  );
  res.json(rows);
};

export const list = async (req: Request, res: Response) => {
  const { campaign, rows } = await access(pool, req);
  const me = req.user!.sub;
  const { rows: companies } =
    manages(req) || role(req) === 'STUDENT'
      ? await pool.query(
          `SELECT id,name,industry,address,contact_email,contact_phone,is_verified FROM companies
      WHERE managing_faculty_id=$1 AND ($2::boolean OR is_verified OR id IN (
        SELECT company_id FROM internship_placements WHERE campaign_id=$3 AND student_id=$4)) ORDER BY name,id`,
          [campaign.faculty_id, manages(req), campaign.id, me],
        )
      : { rows: [] };
  const gate =
    role(req) === 'STUDENT' ? await gateState(req, campaign.id, 'CAMPAIGN_ENROLLMENT') : null;
  const { rows: milestones } = await pool.query(
    `SELECT id,title,phase,start_at,end_at,hard_deadline_at,is_locked_override FROM campaign_milestones
      WHERE campaign_id=$1 AND phase::text=ANY($2::text[]) ORDER BY sequence_order,id`,
    [campaign.id, reportPhases],
  );
  let lecturers: any[] = [];
  let mentors: any[] = [];
  if (manages(req)) {
    ({ rows: lecturers } = await pool.query(
      `SELECT DISTINCT u.id,u.full_name,u.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id
       WHERE r.code='LECTURER' AND u.is_active AND ur.faculty_id=$1
         AND (ur.major_id IS NULL OR ur.major_id=$2) AND (ur.department_id IS NULL OR ur.department_id=$3)
         AND (ur.campaign_id IS NULL OR ur.campaign_id=$4) ORDER BY u.full_name,u.id`,
      [campaign.faculty_id, campaign.major_id, campaign.department_id, campaign.id],
    ));
    ({ rows: mentors } = await pool.query(
      `SELECT DISTINCT co.company_id,u.id,u.full_name,u.code FROM internship_company_mentors co
       JOIN companies c ON c.id=co.company_id JOIN users u ON u.id=co.mentor_id
       JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
       WHERE c.managing_faculty_id=$1 AND u.is_active AND r.code='ENTERPRISE_MENTOR'
         AND (ur.faculty_id IS NULL OR ur.faculty_id=$1) AND (ur.campaign_id IS NULL OR ur.campaign_id=$2)
         AND (ur.major_id IS NULL OR ur.major_id=$3) AND (ur.department_id IS NULL OR ur.department_id=$4)
       ORDER BY u.full_name,u.id`,
      [campaign.faculty_id, campaign.id, campaign.major_id, campaign.department_id],
    ));
  }
  res.json({
    placements: rows,
    companies,
    lecturers,
    mentors,
    milestones,
    gate,
    open: activeCampaign(campaign.status) && !(await resultState(pool, campaign.id))?.published_at,
    allow_self_find_company: campaign.allow_self_find_company,
    manager: manages(req),
  });
};

export const company = async (req: Request, res: Response) => {
  manage(req);
  const fields = await companyFields(req.body);
  const id = req.params.companyId ? uuid(req.params.companyId, 'Doanh nghiệp') : null;
  const row = await withCampaign(req, async (db, campaign) => {
    internship(campaign);
    if (!id) {
      const created = await addCompany(db, campaign.faculty_id, fields, true);
      await audit(db, req, 'CREATE_INTERNSHIP_COMPANY', 'companies', created.id, null, created);
      return created;
    }
    const {
      rows: [before],
    } = await db.query(
      'SELECT * FROM companies WHERE id=$1 AND managing_faculty_id=$2 FOR UPDATE',
      [id, campaign.faculty_id],
    );
    if (!before) fail('Không tìm thấy doanh nghiệp thuộc khoa', 404);
    const {
      rows: [after],
    } = await db.query(
      `UPDATE companies SET name=$2,industry=$3,address=$4,contact_email=$5,contact_phone=$6,
      is_verified=true,updated_at=now() WHERE id=$1 RETURNING *`,
      [
        id,
        fields.name,
        fields.industry,
        fields.address,
        fields.contact_email,
        fields.contact_phone,
      ],
    );
    await audit(db, req, 'VERIFY_INTERNSHIP_COMPANY', 'companies', id, before, after);
    return after;
  });
  res.status(id ? 200 : 201).json(row);
};

export const addMentor = async (req: Request, res: Response) => {
  manage(req);
  const id = uuid(req.params.companyId, 'Doanh nghiệp');
  const code = text(req.body?.code, 'Mã tài khoản mentor', 50);
  await withCampaign(req, async (db, campaign) => {
    internship(campaign);
    if (
      !(
        await db.query(
          'SELECT FROM companies WHERE id=$1 AND managing_faculty_id=$2 AND is_verified',
          [id, campaign.faculty_id],
        )
      ).rowCount
    )
      fail('Doanh nghiệp chưa xác minh hoặc ngoài khoa', 404);
    const {
      rows: [mentor],
    } = await db.query(
      `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
       WHERE u.code=$1 AND u.is_active AND r.code='ENTERPRISE_MENTOR'
         AND (ur.faculty_id IS NULL OR ur.faculty_id=$2) AND (ur.campaign_id IS NULL OR ur.campaign_id=$3)
         AND (ur.major_id IS NULL OR ur.major_id=$4) AND (ur.department_id IS NULL OR ur.department_id=$5) LIMIT 1`,
      [code, campaign.faculty_id, campaign.id, campaign.major_id, campaign.department_id],
    );
    if (!mentor) fail('Không tìm thấy tài khoản mentor phù hợp', 404);
    const { rowCount } = await db.query(
      'INSERT INTO internship_company_mentors(company_id,mentor_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [id, mentor.id],
    );
    if (rowCount)
      await audit(db, req, 'LINK_INTERNSHIP_MENTOR', 'companies', id, null, {
        mentor_id: mentor.id,
      });
  });
  res.json({ message: 'Đã liên kết tài khoản mentor' });
};

export const apply = async (req: Request, res: Response) => {
  if (role(req) !== 'STUDENT') fail('Chỉ sinh viên gửi hồ sơ thực tập', 403);
  const me = req.user!.sub;
  const fields = req.body ?? {};
  const companyId = fields.company_id ? uuid(fields.company_id, 'Doanh nghiệp') : null;
  const title = text(fields.job_title, 'Vị trí thực tập', 255);
  const start = isoDate(fields.start_date, 'Ngày bắt đầu');
  const end = isoDate(fields.end_date, 'Ngày kết thúc');
  if (end < start) fail('Ngày kết thúc phải từ ngày bắt đầu trở đi');
  const file = pdf(req, false);
  const row = await withCampaign(req, async (db, campaign) => {
    internship(campaign);
    const gate = await gateState(req, campaign.id, 'CAMPAIGN_ENROLLMENT', db);
    if (!gate.allowed) fail(gate.reason, 403);
    if (!companyId && campaign.allow_self_find_company !== true)
      fail('Đợt chưa cho phép tự tìm nơi thực tập', 403);
    const {
      rows: [before],
    } = await db.query(
      'SELECT * FROM internship_placements WHERE campaign_id=$1 AND student_id=$2 FOR UPDATE',
      [campaign.id, me],
    );
    if (before && before.status !== 'REJECTED')
      fail('Đã có hồ sơ trong đợt. Hồ sơ bị từ chối mới được gửi lại.', 409);
    const company = companyId
      ? (
          await db.query(
            'SELECT id FROM companies WHERE id=$1 AND managing_faculty_id=$2 AND is_verified',
            [companyId, campaign.faculty_id],
          )
        ).rows[0]
      : await addCompany(db, campaign.faculty_id, await companyFields(fields), false);
    if (!company) fail('Không tìm thấy doanh nghiệp đã xác minh', 404);
    const {
      rows: [saved],
    } = await db.query(
      `INSERT INTO internship_placements(campaign_id,student_id,company_id,source,job_title,start_date,end_date,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,'PENDING_VERIFICATION') ON CONFLICT(campaign_id,student_id) DO UPDATE
       SET company_id=EXCLUDED.company_id,source=EXCLUDED.source,job_title=EXCLUDED.job_title,start_date=EXCLUDED.start_date,
           end_date=EXCLUDED.end_date,status='PENDING_VERIFICATION',reject_reason=NULL,company_mentor_id=NULL,
           supervisor_lecturer_id=NULL,position_id=NULL,acceptance_letter_file_id=NULL,introduction_letter_file_id=NULL
       RETURNING *`,
      [
        campaign.id,
        me,
        company.id,
        companyId ? 'SCHOOL_ASSIGNED' : 'STUDENT_SELF_FOUND',
        title,
        start,
        end,
      ],
    );
    if (file)
      await db.query(
        `INSERT INTO internship_application_files(placement_id,original_name,content) VALUES($1,$2,$3)
      ON CONFLICT(placement_id) DO UPDATE SET original_name=EXCLUDED.original_name,content=EXCLUDED.content`,
        [saved.id, file.name, file.bytes],
      );
    else if (before)
      await db.query('DELETE FROM internship_application_files WHERE placement_id=$1', [saved.id]);
    await audit(
      db,
      req,
      'APPLY_INTERNSHIP',
      'internship_placements',
      saved.id,
      before ?? null,
      saved,
    );
    return saved;
  });
  res.status(201).json(row);
};

export const review = async (req: Request, res: Response) => {
  manage(req);
  const decision = req.body?.decision;
  if (!['approve', 'reject'].includes(decision)) fail('Chọn duyệt hoặc từ chối');
  const row = await writePlacement(req, async (db, campaign, p) => {
    working(campaign);
    if (p.status !== 'PENDING_VERIFICATION') fail('Hồ sơ đã được xử lý', 409);
    let lecturer = null,
      mentor = null,
      reason = null;
    if (decision === 'approve') {
      await targetStudent(db, campaign, p.student_id);
      const {
        rows: [evidence],
      } = await db.query(
        'SELECT status,verified_credits,verified_prerequisite FROM campaign_eligible_students WHERE campaign_id=$1 AND student_id=$2',
        [campaign.id, p.student_id],
      );
      if (evidence?.status !== 'ELIGIBLE' || eligibilityReason(campaign, evidence)) {
        fail('Sinh viên không còn đủ điều kiện thực tập trong đợt', 409);
      }
      lecturer = uuid(req.body?.lecturer_id, 'Giảng viên');
      mentor = uuid(req.body?.mentor_id, 'Mentor');
      if (lecturer === mentor || [lecturer, mentor].includes(p.student_id))
        fail('Người hướng dẫn phải khác nhau và khác sinh viên');
      const {
        rows: [valid],
      } = await db.query(
        `SELECT EXISTS(SELECT FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id
          WHERE u.id=$1 AND u.is_active AND r.code='LECTURER' AND ur.faculty_id=$4
            AND (ur.campaign_id IS NULL OR ur.campaign_id=$6) AND (ur.major_id IS NULL OR ur.major_id=$7)
            AND (ur.department_id IS NULL OR ur.department_id=$8)) AS lecturer,
        EXISTS(SELECT FROM internship_company_mentors im JOIN companies c ON c.id=im.company_id
          JOIN users u ON u.id=im.mentor_id JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
          WHERE im.company_id=$3 AND im.mentor_id=$2 AND u.is_active AND c.managing_faculty_id=$4 AND c.is_verified
            AND r.code=$5 AND (ur.faculty_id IS NULL OR ur.faculty_id=$4) AND (ur.campaign_id IS NULL OR ur.campaign_id=$6)
            AND (ur.major_id IS NULL OR ur.major_id=$7) AND (ur.department_id IS NULL OR ur.department_id=$8)) AS mentor`,
        [
          lecturer,
          mentor,
          p.company_id,
          campaign.faculty_id,
          'ENTERPRISE_MENTOR',
          campaign.id,
          campaign.major_id,
          campaign.department_id,
        ],
      );
      if (!valid.lecturer || !valid.mentor)
        fail('Cần giảng viên đúng phạm vi và mentor thuộc doanh nghiệp đã xác minh', 409);
    } else reason = text(req.body?.reason, 'Lý do từ chối', 2000);
    const {
      rows: [saved],
    } = await db.query(
      `UPDATE internship_placements SET status=$2,supervisor_lecturer_id=$3,
      company_mentor_id=$4,reject_reason=$5 WHERE id=$1 RETURNING *`,
      [p.id, decision === 'approve' ? 'APPROVED' : 'REJECTED', lecturer, mentor, reason],
    );
    await audit(db, req, 'REVIEW_INTERNSHIP', 'internship_placements', p.id, p, saved);
    return saved;
  });
  res.json(row);
};

export const detail = async (req: Request, res: Response) => {
  const {
    campaign,
    rows: [placement],
  } = await access(pool, req, uuid(req.params.placementId, 'Hồ sơ'));
  const evaluator =
    role(req) === 'ENTERPRISE_MENTOR'
      ? 'INTERNSHIP_MENTOR'
      : role(req) === 'LECTURER'
        ? 'INTERNSHIP_LECTURER'
        : null;
  const [{ rows: logs }, { rows: reports }, { rows: grades }] = await Promise.all([
    pool.query(
      `SELECT id,week_number,start_date::text,end_date::text,tasks_performed,results_achieved,mentor_feedback,lecturer_feedback,
      is_confirmed_by_mentor FROM internship_weekly_logs WHERE placement_id=$1 ORDER BY week_number`,
      [placement.id],
    ),
    pool.query(
      `SELECT r.id,r.original_name,r.description,r.version_number,r.submitted_at,r.late_minutes,m.title,m.phase
      FROM internship_reports r JOIN campaign_milestones m ON m.id=r.milestone_id WHERE r.placement_id=$1 AND m.campaign_id=$2
      ORDER BY m.sequence_order,r.version_number DESC`,
      [placement.id, campaign.id],
    ),
    pool.query(
      `SELECT g.evaluator_role,g.scores,g.total_score,g.comment,g.template_id,t.name,t.criteria
      FROM internship_rubric_grades g JOIN rubric_templates t ON t.id=g.template_id
      WHERE g.placement_id=$1 AND ($2::text IS NULL OR g.evaluator_role=$2) ORDER BY g.evaluator_role`,
      [placement.id, evaluator],
    ),
  ]);
  const {
    rows: [rubric],
  } = evaluator
    ? await pool.query(
        `SELECT t.id,t.name,t.criteria FROM campaign_rubric_templates c JOIN rubric_templates t ON t.id=c.template_id
     WHERE c.campaign_id=$1 AND c.slot=$2`,
        [campaign.id, evaluator],
      )
    : { rows: [] };
  res.json({
    placement,
    logs,
    reports,
    grades,
    rubric: grades.find((g) => g.evaluator_role === evaluator) ?? rubric ?? null,
    writable:
      activeCampaign(campaign.status) &&
      placed.includes(placement.status) &&
      !(await resultState(pool, campaign.id))?.published_at,
    evaluator,
  });
};

export const log = async (req: Request, res: Response) => {
  if (role(req) !== 'STUDENT') fail('Chỉ sinh viên nộp nhật ký', 403);
  const week = integer(Number(req.params.week), 'Tuần', 1, 24);
  const start = isoDate(req.body?.start_date, 'Ngày bắt đầu');
  const end = isoDate(req.body?.end_date, 'Ngày kết thúc');
  const tasks = text(req.body?.tasks_performed, 'Công việc', 4000);
  const results = optionalText(req.body?.results_achieved, 'Kết quả', 4000);
  const saved = await writePlacement(req, async (db, c, p) => {
    placementWritable(c, p);
    if (start > end || !p.start_date || !p.end_date || start < p.start_date || end > p.end_date)
      fail('Ngày nhật ký phải nằm trong thời gian thực tập');
    const {
      rows: [before],
    } = await db.query(
      'SELECT * FROM internship_weekly_logs WHERE placement_id=$1 AND week_number=$2',
      [p.id, week],
    );
    if (before?.is_confirmed_by_mentor) fail('Nhật ký đã được mentor xác nhận', 409);
    const {
      rows: [row],
    } = await db.query(
      `INSERT INTO internship_weekly_logs(placement_id,week_number,start_date,end_date,tasks_performed,results_achieved)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(placement_id,week_number) DO UPDATE SET start_date=EXCLUDED.start_date,
       end_date=EXCLUDED.end_date,tasks_performed=EXCLUDED.tasks_performed,results_achieved=EXCLUDED.results_achieved RETURNING *`,
      [p.id, week, start, end, tasks, results],
    );
    await db.query(
      "UPDATE internship_placements SET status='IN_PROGRESS' WHERE id=$1 AND status='APPROVED'",
      [p.id],
    );
    await audit(
      db,
      req,
      'SUBMIT_INTERNSHIP_LOG',
      'internship_weekly_logs',
      row.id,
      before ?? null,
      row,
    );
    return row;
  });
  res.json(saved);
};

export const reviewLog = async (req: Request, res: Response) => {
  if (!['ENTERPRISE_MENTOR', 'LECTURER'].includes(role(req)))
    fail('Chỉ mentor hoặc giảng viên được phản hồi', 403);
  const week = integer(Number(req.params.week), 'Tuần', 1, 24);
  const note = text(req.body?.feedback, 'Nhận xét', 4000);
  const confirm = req.body?.confirm;
  if (typeof confirm !== 'boolean' || (role(req) === 'LECTURER' && confirm))
    fail('Chỉ mentor được xác nhận nhật ký', 403);
  const saved = await writePlacement(req, async (db, c, p) => {
    placementWritable(c, p);
    const {
      rows: [before],
    } = await db.query(
      'SELECT * FROM internship_weekly_logs WHERE placement_id=$1 AND week_number=$2',
      [p.id, week],
    );
    if (!before) fail('Không tìm thấy nhật ký', 404);
    const {
      rows: [row],
    } =
      role(req) === 'ENTERPRISE_MENTOR'
        ? await db.query(
            `UPDATE internship_weekly_logs SET mentor_feedback=$2,
        is_confirmed_by_mentor=coalesce(is_confirmed_by_mentor,false) OR $3 WHERE id=$1 RETURNING *`,
            [before.id, note, confirm],
          )
        : await db.query(
            'UPDATE internship_weekly_logs SET lecturer_feedback=$2 WHERE id=$1 RETURNING *',
            [before.id, note],
          );
    await audit(db, req, 'REVIEW_INTERNSHIP_LOG', 'internship_weekly_logs', row.id, before, row);
    return row;
  });
  res.json(saved);
};

export const report = async (req: Request, res: Response) => {
  if (role(req) !== 'STUDENT') fail('Chỉ sinh viên nộp báo cáo thực tập', 403);
  const milestone = uuid(req.body?.milestone_id, 'Mốc');
  const note = optionalText(req.body?.description, 'Ghi chú');
  const file = pdf(req)!;
  const row = await writePlacement(req, async (db, c, p) => {
    placementWritable(c, p);
    const { lateMinutes } = await submissionWindow(db, c, milestone, req.user!.sub);
    const {
      rows: [saved],
    } = await db.query(
      `INSERT INTO internship_reports(placement_id,milestone_id,version_number,original_name,content,description,late_minutes)
       SELECT $1,$2,coalesce(max(version_number),0)+1,$3,$4,$5,$6 FROM internship_reports
       WHERE placement_id=$1 AND milestone_id=$2 RETURNING id,version_number,late_minutes`,
      [p.id, milestone, file.name, file.bytes, note, lateMinutes],
    );
    await audit(db, req, 'SUBMIT_INTERNSHIP_REPORT', 'internship_reports', saved.id, null, saved);
    return saved;
  });
  res.status(201).json(row);
};

export const file = async (req: Request, res: Response) => {
  const {
    campaign,
    rows: [p],
  } = await access(pool, req, uuid(req.params.placementId, 'Hồ sơ'));
  const id = req.params.reportId;
  if (!id && !manages(req) && role(req) !== 'STUDENT')
    fail('Chỉ sinh viên và quản lý được xem minh chứng', 403);
  const {
    rows: [doc],
  } = id
    ? await pool.query(
        `SELECT r.original_name,r.content FROM internship_reports r JOIN campaign_milestones m ON m.id=r.milestone_id
     WHERE r.id=$1 AND r.placement_id=$2 AND m.campaign_id=$3`,
        [uuid(id, 'Báo cáo'), p.id, campaign.id],
      )
    : await pool.query(
        'SELECT original_name,content FROM internship_application_files WHERE placement_id=$1',
        [p.id],
      );
  if (!doc) fail('Không tìm thấy tệp', 404);
  res.attachment(doc.original_name).type('application/pdf').send(doc.content);
};

export const grade = async (req: Request, res: Response) => {
  const evaluator =
    role(req) === 'ENTERPRISE_MENTOR'
      ? 'INTERNSHIP_MENTOR'
      : role(req) === 'LECTURER'
        ? 'INTERNSHIP_LECTURER'
        : null;
  if (!evaluator) fail('Chỉ mentor hoặc giảng viên được đánh giá', 403);
  const result = await writePlacement(req, async (db, c, p) => {
    placementWritable(c, p);
    const {
      rows: [before],
    } = await db.query(
      'SELECT * FROM internship_rubric_grades WHERE placement_id=$1 AND evaluator_role=$2',
      [p.id, evaluator],
    );
    const template = await rubricFor(db, c.id, evaluator, before?.template_id);
    if (template.id !== uuid(req.body?.template_id, 'Rubric'))
      fail('Rubric đã đổi. Tải lại trang để đánh giá.', 409);
    const score = gradeScores(template, req.body?.scores);
    const {
      rows: [row],
    } = await db.query(
      `INSERT INTO internship_rubric_grades(placement_id,evaluator_role,template_id,evaluator_id,scores,total_score,comment)
       VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(placement_id,evaluator_role) DO UPDATE SET evaluator_id=EXCLUDED.evaluator_id,
       scores=EXCLUDED.scores,total_score=EXCLUDED.total_score,comment=EXCLUDED.comment,updated_at=now() RETURNING *`,
      [
        p.id,
        evaluator,
        template.id,
        req.user!.sub,
        JSON.stringify(score.scores),
        score.total_score,
        optionalText(req.body?.comment, 'Nhận xét'),
      ],
    );
    await audit(db, req, 'GRADE_INTERNSHIP', 'internship_placements', p.id, before ?? null, row);
    return row;
  });
  res.json(result);
};
