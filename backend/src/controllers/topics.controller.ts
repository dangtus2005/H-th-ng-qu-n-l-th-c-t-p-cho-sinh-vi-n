import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import { audit } from '../utils/audit';
import { globalRole, integer } from '../utils/campaign-access';
import { requireStaffPhase, thesisCampaign, thesisWrite } from '../utils/thesis-campaign';
import { fail, text, uuid } from '../utils/validation';
import { gateState } from './campaigns.controller';

const reviewer = (req: Request) =>
  globalRole(req) || ['FACULTY_MANAGER', 'DEPT_HEAD'].includes(req.user!.active_role);

function mayReview(req: Request, department: string) {
  const scope = req.user!.scope;
  return (
    reviewer(req) &&
    (globalRole(req) ||
      ((req.user!.active_role !== 'DEPT_HEAD' || scope.department_id) &&
        (!scope.department_id || scope.department_id === department)))
  );
}

async function authorDepartment(req: Request, db: PoolClient, campaign: any) {
  const role = req.user!.active_role;
  if (!['STUDENT', 'LECTURER'].includes(role))
    fail('Chỉ sinh viên và giảng viên được đề xuất', 403);
  const department =
    (
      await db.query(
        role === 'STUDENT'
          ? 'SELECT m.department_id FROM student_profiles p JOIN majors m ON m.id=p.major_id WHERE p.user_id=$1'
          : 'SELECT department_id FROM lecturer_profiles WHERE user_id=$1',
        [req.user!.sub],
      )
    ).rows[0]?.department_id ?? req.user!.scope.department_id;
  const scope = req.user!.scope;
  if (
    !department ||
    (scope.department_id && department !== scope.department_id) ||
    (campaign.department_id && department !== campaign.department_id) ||
    !(
      await db.query('SELECT 1 FROM departments WHERE id=$1 AND faculty_id=$2', [
        department,
        campaign.faculty_id,
      ])
    ).rowCount
  ) {
    fail('Bạn chưa có bộ môn phù hợp với đợt', 403);
  }
  if (role === 'STUDENT') {
    const gate = await gateState(req, campaign.id, 'TOPIC_SUBMISSION', db);
    if (!gate.allowed) fail(gate.reason, 403);
  } else {
    await requireStaffPhase(db, campaign, 'TOPIC_SUBMISSION');
  }
  return department as string;
}

function topicFields(req: Request) {
  const b = req.body ?? {};
  const optional = (value: unknown, label: string, limit: number) =>
    value == null || value === '' ? null : text(value, label, limit);
  const list = (value: unknown, label: string) =>
    (optional(value, label, 1500) ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  const cap =
    typeof b.max_students === 'string' && /^\d+$/.test(b.max_students)
      ? Number(b.max_students)
      : b.max_students;
  return {
    title_vi: text(b.title_vi, 'Tên đề tài', 500),
    description: text(b.description, 'Mô tả', 8000),
    objectives: optional(b.objectives, 'Mục tiêu', 4000),
    required_skills: list(b.required_skills, 'Yêu cầu kiến thức'),
    technologies: list(b.technologies, 'Công nghệ'),
    research_field: text(b.research_field, 'Hướng đề tài', 255),
    max_students: integer(cap, 'Số sinh viên tối đa', 1, 50),
  };
}

async function permittedAdviser(
  db: Pick<PoolClient, 'query'>,
  campaign: any,
  department: string,
  id?: string,
) {
  return (
    await db.query(
      `SELECT DISTINCT u.id,u.full_name FROM users u
     JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
     LEFT JOIN lecturer_profiles p ON p.user_id=u.id
     WHERE u.is_active AND r.code='LECTURER' AND ur.faculty_id=$1
       AND coalesce(ur.department_id,p.department_id)=$2
       AND (ur.campaign_id IS NULL OR ur.campaign_id=$3)
       AND (ur.major_id IS NULL OR $5::uuid IS NULL OR ur.major_id=$5)
       AND ($4::uuid IS NULL OR u.id=$4)
     ORDER BY u.full_name,u.id`,
      [campaign.faculty_id, department, campaign.id, id ?? null, campaign.major_id],
    )
  ).rows;
}

const editable = ['DRAFT', 'REVISION_REQUIRED'];
const publicStatuses = ['APPROVED', 'ASSIGNED'];

function normalized(value: string) {
  return value
    .normalize('NFD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function titleScore(a: string, b: string) {
  const x = normalized(a);
  const y = normalized(b);
  if (x === y && x) return 100;
  const words = new Set(x.split(' ').filter(Boolean));
  const other = new Set(y.split(' ').filter(Boolean));
  if (!words.size || !other.size) return 0;
  const common = [...words].filter((word) => other.has(word)).length;
  return Math.round((200 * common) / (words.size + other.size));
}

async function similar(db: Pick<PoolClient, 'query'>, topic: any) {
  const { rows } = await db.query(
    `SELECT t.id,t.title_vi FROM topics t WHERE t.department_id=$1 AND t.id<>$2
       AND (t.status IN ('APPROVED','ASSIGNED')
            OR (t.campaign_id=$3 AND t.status='PENDING_APPROVAL'))
     ORDER BY t.id`,
    [topic.department_id, topic.id, topic.campaign_id],
  );
  return rows
    .map((t) => ({ ...t, score: titleScore(topic.title_vi, t.title_vi) }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export const list = async (req: Request, res: Response) => {
  const campaign = await thesisCampaign(req);
  const role = req.user!.active_role;
  const scope = req.user!.scope;
  const { rows } = await pool.query(
    `SELECT t.*,u.full_name AS supervisor_name,a.full_name AS author_name,
       EXISTS (SELECT FROM topic_documents doc WHERE doc.topic_id=t.id) AS has_document,
       (SELECT feedback_comment FROM topic_approval_logs l WHERE l.topic_id=t.id
        ORDER BY l.created_at DESC,l.id DESC LIMIT 1) AS feedback
     FROM topics t LEFT JOIN users u ON u.id=t.supervisor_id JOIN users a ON a.id=t.proposed_by_id
     WHERE t.campaign_id=$1 AND ($2::uuid IS NULL OR t.department_id=$2)
       AND (t.status IN ('APPROVED','ASSIGNED') OR t.proposed_by_id=$3 OR t.supervisor_id=$3 OR $4::boolean)
     ORDER BY t.updated_at DESC NULLS LAST,t.id`,
    [
      campaign.id,
      globalRole(req) ? null : scope.department_id,
      req.user!.sub,
      reviewer(req) && (role !== 'DEPT_HEAD' || !!scope.department_id),
    ],
  );
  const phases = (
    await pool.query(
      `SELECT phase,NOT coalesce(is_locked_override,false) AND clock_timestamp()>=start_at
       AND clock_timestamp()<end_at AS allowed FROM campaign_milestones
     WHERE campaign_id=$1 AND phase IN ('TOPIC_SUBMISSION','TOPIC_APPROVAL')`,
      [campaign.id],
    )
  ).rows;
  const open = ['OPEN', 'IN_PROGRESS'].includes(campaign.status);
  const phaseOpen = (phase: string) =>
    open && Boolean(phases.find((p) => p.phase === phase)?.allowed);
  let canSubmit = role === 'LECTURER' && phaseOpen('TOPIC_SUBMISSION');
  let advisers: any[] = [];
  if (role === 'STUDENT') {
    const gate = await gateState(req, campaign.id, 'TOPIC_SUBMISSION');
    canSubmit = open && gate.allowed;
    if (canSubmit) {
      const department = (
        await pool.query(
          'SELECT m.department_id FROM student_profiles p JOIN majors m ON m.id=p.major_id WHERE p.user_id=$1',
          [req.user!.sub],
        )
      ).rows[0]?.department_id;
      if (department) advisers = await permittedAdviser(pool, campaign, department);
    }
  }
  const assignable = rows.filter(
    (t) =>
      t.source === 'STUDENT_PROPOSED' &&
      t.status === 'DRAFT' &&
      !t.supervisor_id &&
      mayReview(req, t.department_id) &&
      phaseOpen('TOPIC_APPROVAL'),
  );
  const departments = new Map<string, any[]>();
  for (const department of new Set<string>(assignable.map((t) => t.department_id))) {
    departments.set(department, await permittedAdviser(pool, campaign, department));
  }
  res.json({
    can_submit: canSubmit,
    advisers,
    max_students: campaign.max_students_per_topic ?? 2,
    topics: rows.map((t) => ({
      ...t,
      assign_advisers: assignable.includes(t) ? departments.get(t.department_id) : undefined,
      can_edit: canSubmit && t.proposed_by_id === req.user!.sub && editable.includes(t.status),
      can_endorse:
        phaseOpen('TOPIC_APPROVAL') &&
        role === 'LECTURER' &&
        t.supervisor_id === req.user!.sub &&
        t.source === 'STUDENT_PROPOSED' &&
        t.status === 'PENDING_APPROVAL' &&
        !t.supervisor_endorsed_at,
      can_adviser_review:
        phaseOpen('TOPIC_APPROVAL') &&
        role === 'LECTURER' &&
        t.supervisor_id === req.user!.sub &&
        t.source === 'STUDENT_PROPOSED' &&
        t.status === 'PENDING_APPROVAL',
      can_review:
        phaseOpen('TOPIC_APPROVAL') &&
        mayReview(req, t.department_id) &&
        t.status === 'PENDING_APPROVAL',
    })),
  });
};

export const submit = async (req: Request, res: Response) => {
  const id = req.params.topicId ? uuid(req.params.topicId, 'Đề tài') : null;
  const fields = topicFields(req);
  const file = req.file;
  if (
    file &&
    (!/\.pdf$/i.test(file.originalname) || file.buffer.subarray(0, 5).toString() !== '%PDF-')
  ) {
    fail('Tài liệu đính kèm phải là PDF tối đa 5 MB');
  }
  const topic = await thesisWrite(req, async (db, campaign) => {
    const department = await authorDepartment(req, db, campaign);
    if (!['OPEN', 'IN_PROGRESS'].includes(campaign.status)) fail('Đợt chưa mở hoặc đã đóng', 403);
    if (fields.max_students > (campaign.max_students_per_topic ?? 2))
      fail('Số sinh viên vượt giới hạn của đợt');
    const student = req.user!.active_role === 'STUDENT';
    const requestedAdviser = req.body?.supervisor_id;
    const supervisor = student
      ? requestedAdviser
        ? uuid(requestedAdviser, 'Giảng viên hướng dẫn')
        : null
      : req.user!.sub;
    if (
      student &&
      supervisor &&
      !(await permittedAdviser(db, campaign, department, supervisor)).length
    ) {
      fail('Giảng viên hướng dẫn không thuộc bộ môn hoặc đợt', 403);
    }
    const status = supervisor ? 'PENDING_APPROVAL' : 'DRAFT';
    const previous = id
      ? (
          await db.query(
            'SELECT * FROM topics WHERE id=$1 AND campaign_id=$2 AND proposed_by_id=$3 FOR UPDATE',
            [id, campaign.id, req.user!.sub],
          )
        ).rows[0]
      : null;
    if (id && !previous) fail('Không tìm thấy đề tài của bạn', 404);
    if (
      previous &&
      (previous.department_id !== department ||
        previous.source !== (student ? 'STUDENT_PROPOSED' : 'LECTURER_PROPOSED'))
    ) {
      fail('Đề tài không thuộc vai trò hoặc bộ môn đang sử dụng', 403);
    }
    if (previous && !editable.includes(previous.status))
      fail('Đề tài đang được duyệt hoặc đã chốt', 409);
    const values = [
      fields.title_vi,
      fields.description,
      fields.objectives,
      fields.required_skills,
      fields.technologies,
      fields.research_field,
      fields.max_students,
      supervisor,
      status,
    ];
    const {
      rows: [saved],
    } = previous
      ? await db.query(
          `UPDATE topics SET title_vi=$1,description=$2,objectives=$3,required_skills=$4,technologies=$5,
        research_field=$6,max_students=$7,supervisor_id=$8,status=$9,supervisor_endorsed_at=NULL,updated_at=now()
        WHERE id=$10 RETURNING *`,
          [...values, id],
        )
      : await db.query(
          `INSERT INTO topics(title_vi,description,objectives,required_skills,technologies,research_field,
        max_students,supervisor_id,status,campaign_id,department_id,proposed_by_id,source)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [
            ...values,
            campaign.id,
            department,
            req.user!.sub,
            student ? 'STUDENT_PROPOSED' : 'LECTURER_PROPOSED',
          ],
        );
    if (file)
      await db.query(
        `INSERT INTO topic_documents(topic_id,original_name,content) VALUES($1,$2,$3)
      ON CONFLICT(topic_id) DO UPDATE SET original_name=EXCLUDED.original_name,content=EXCLUDED.content`,
        [saved.id, text(file.originalname, 'Tên tài liệu', 255), file.buffer],
      );
    await audit(db, req, 'SUBMIT_TOPIC', 'topics', saved.id, previous, saved);
    return saved;
  });
  res.status(id ? 200 : 201).json(topic);
};

async function privateTopic(req: Request) {
  const campaign = await thesisCampaign(req);
  const id = uuid(req.params.topicId, 'Đề tài');
  const {
    rows: [topic],
  } = await pool.query('SELECT * FROM topics WHERE campaign_id=$1 AND id=$2', [campaign.id, id]);
  if (
    !topic ||
    (!globalRole(req) &&
      req.user!.scope.department_id &&
      topic.department_id !== req.user!.scope.department_id) ||
    (!publicStatuses.includes(topic.status) &&
      !mayReview(req, topic.department_id) &&
      ![topic.supervisor_id, topic.proposed_by_id].includes(req.user!.sub))
  )
    fail('Không tìm thấy đề tài', 404);
  return topic;
}

export const duplicates = async (req: Request, res: Response) => {
  const topic = await privateTopic(req);
  if (!mayReview(req, topic.department_id)) fail('Chỉ Bộ môn hoặc Khoa có quyền rà soát', 403);
  res.json(await similar(pool, topic));
};

export const document = async (req: Request, res: Response) => {
  const topic = await privateTopic(req);
  const {
    rows: [file],
  } = await pool.query('SELECT original_name,content FROM topic_documents WHERE topic_id=$1', [
    topic.id,
  ]);
  if (!file) fail('Đề tài chưa có tài liệu', 404);
  res.attachment(file.original_name).type('application/pdf').send(file.content);
};

export const review = async (req: Request, res: Response) => {
  const id = uuid(req.params.topicId, 'Đề tài');
  const decision = req.body?.decision;
  const states: Record<string, string> = {
    approve: 'APPROVED',
    revise: 'REVISION_REQUIRED',
    reject: 'REJECTED',
  };
  if (decision !== 'endorse' && !Object.hasOwn(states, decision)) fail('Quyết định không hợp lệ');
  const note =
    ['revise', 'reject'].includes(decision) || req.body?.feedback
      ? text(req.body?.feedback, 'Nhận xét', 2000)
      : null;
  const result = await thesisWrite(req, async (db, campaign) => {
    const {
      rows: [topic],
    } = await db.query('SELECT * FROM topics WHERE id=$1 AND campaign_id=$2 FOR UPDATE', [
      id,
      campaign.id,
    ]);
    if (!topic) fail('Không tìm thấy đề tài', 404);
    const adviser =
      req.user!.active_role === 'LECTURER' &&
      topic.source === 'STUDENT_PROPOSED' &&
      topic.supervisor_id === req.user!.sub;
    if (
      !(decision === 'endorse'
        ? adviser
        : mayReview(req, topic.department_id) ||
          (adviser && ['revise', 'reject'].includes(decision)))
    ) {
      fail('Bạn không có quyền xử lý đề tài này', 403);
    }
    if (topic.proposed_by_id === req.user!.sub) fail('Người đề xuất không tự duyệt đề tài', 403);
    await requireStaffPhase(db, campaign, 'TOPIC_APPROVAL');
    if (topic.status !== 'PENDING_APPROVAL') fail('Đề tài không ở trạng thái chờ duyệt', 409);
    let next;
    if (decision === 'endorse') {
      if (topic.supervisor_endorsed_at) return topic;
      next = (
        await db.query(
          'UPDATE topics SET supervisor_endorsed_at=now(),updated_at=now() WHERE id=$1 RETURNING *',
          [id],
        )
      ).rows[0];
    } else {
      if (
        decision === 'approve' &&
        topic.source === 'STUDENT_PROPOSED' &&
        !topic.supervisor_endorsed_at
      ) {
        fail('Đề tài sinh viên cần giảng viên xác nhận trước khi duyệt', 409);
      }
      const matches = await similar(db, topic);
      next = (
        await db.query(
          `UPDATE topics SET status=$2,similarity_score=$3,most_similar_topic_id=$4,updated_at=now()
        WHERE id=$1 RETURNING *`,
          [id, states[decision], matches[0]?.score ?? 0, matches[0]?.id ?? null],
        )
      ).rows[0];
      await db.query(
        `INSERT INTO topic_approval_logs(topic_id,reviewer_id,previous_status,new_status,feedback_comment)
        VALUES($1,$2,$3,$4,$5)`,
        [id, req.user!.sub, topic.status, next.status, note],
      );
    }
    await audit(db, req, 'REVIEW_TOPIC', 'topics', id, topic, next);
    return next;
  });
  res.json(result);
};

export const assignAdviser = async (req: Request, res: Response) => {
  const id = uuid(req.params.topicId, 'Đề tài');
  const adviser = uuid(req.body?.supervisor_id, 'Giảng viên hướng dẫn');
  const result = await thesisWrite(req, async (db, campaign) => {
    const {
      rows: [topic],
    } = await db.query('SELECT * FROM topics WHERE campaign_id=$1 AND id=$2 FOR UPDATE', [
      campaign.id,
      id,
    ]);
    if (!topic) fail('Không tìm thấy đề tài', 404);
    if (!mayReview(req, topic.department_id))
      fail('Chỉ Bộ môn hoặc Khoa trong phạm vi được phân công', 403);
    await requireStaffPhase(db, campaign, 'TOPIC_APPROVAL');
    if (topic.source !== 'STUDENT_PROPOSED' || topic.status !== 'DRAFT' || topic.supervisor_id) {
      fail('Đề tài không còn chờ phân công giảng viên', 409);
    }
    if (!(await permittedAdviser(db, campaign, topic.department_id, adviser)).length) {
      fail('Giảng viên không thuộc bộ môn hoặc đợt', 403);
    }
    const {
      rows: [saved],
    } = await db.query(
      `UPDATE topics SET supervisor_id=$2,status='PENDING_APPROVAL',updated_at=now()
      WHERE id=$1 RETURNING *`,
      [id, adviser],
    );
    await db.query(
      `INSERT INTO topic_approval_logs(topic_id,reviewer_id,previous_status,new_status,feedback_comment)
      VALUES($1,$2,'DRAFT','PENDING_APPROVAL','Đã phân công giảng viên hướng dẫn')`,
      [id, req.user!.sub],
    );
    await audit(db, req, 'ASSIGN_TOPIC_ADVISER', 'topics', id, topic, saved);
    return saved;
  });
  res.json(result);
};

export const archive = async (req: Request, res: Response) => {
  const scope = req.user!.scope;
  const filter = (key: string) => (req.query[key] ? text(req.query[key], key, 255) : null);
  const year = req.query.year ? integer(Number(req.query.year), 'Năm học', 1900, 3000) : null;
  const { rows } = await pool.query(
    `SELECT t.id,t.title_vi,t.description,t.research_field,t.status,t.campaign_id,
            c.name AS campaign_name,y.start_year,y.end_year,u.full_name AS supervisor_name
     FROM topics t JOIN campaigns c ON c.id=t.campaign_id JOIN semesters s ON s.id=c.semester_id
     JOIN academic_years y ON y.id=s.academic_year_id LEFT JOIN users u ON u.id=t.supervisor_id
     WHERE t.status IN ('APPROVED','ASSIGNED') AND ($1::boolean OR
       (c.faculty_id=$2 AND ($3::uuid IS NULL OR t.department_id=$3)
        AND ($4::uuid IS NULL OR c.major_id IS NULL OR c.major_id=$4)
        AND ($5::uuid IS NULL OR c.id=$5)))
       AND ($6::int IS NULL OR y.start_year=$6)
       AND ($7::text IS NULL OR strpos(lower(coalesce(t.research_field,'')),lower($7))>0)
       AND ($8::text IS NULL OR strpos(lower(coalesce(u.full_name,'')),lower($8))>0)
       AND ($9::text IS NULL OR strpos(lower(t.title_vi),lower($9))>0)
     ORDER BY y.start_year DESC,t.title_vi,t.id LIMIT 100`,
    [
      globalRole(req),
      scope.faculty_id,
      scope.department_id,
      scope.major_id,
      scope.campaign_id,
      year,
      filter('direction'),
      filter('lecturer'),
      filter('q'),
    ],
  );
  res.json(rows);
};
