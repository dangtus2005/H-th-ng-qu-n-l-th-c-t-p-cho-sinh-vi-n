import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import {
  activeCampaign,
  optionalText,
  pdf,
  reportPhases,
  submissionWindow,
  withCampaign,
} from '../utils/academic';
import { campaignAccess } from '../utils/campaign-access';
import { audit } from '../utils/audit';
import { fail, text, uuid } from '../utils/validation';
import { gradeScores, rubricFor } from './rubrics.controller';
import { requireUnpublished, resultState } from '../utils/result-lock';

type DB = Pick<PoolClient, 'query'>;
async function assignment(db: DB, req: Request, campaign: string, id: string) {
  const role = req.user!.active_role;
  const {
    rows: [row],
  } = await db.query(
    `SELECT a.id,a.group_id,g.leader_id,a.status FROM thesis_assignments a JOIN student_groups g ON g.id=a.group_id
     WHERE a.campaign_id=$1 AND a.id=$2 AND (
       ($4='LECTURER' AND a.supervisor_id=$3) OR ($4='STUDENT' AND EXISTS (
        SELECT FROM group_members gm WHERE gm.group_id=g.id AND gm.student_id=$3 AND gm.confirmation_status='CONFIRMED')))`,
    [campaign, id, req.user!.sub, role],
  );
  if (!row) fail('Không tìm thấy phân công của bạn', 404);
  return row;
}

async function submission(db: DB, req: Request, campaign: string) {
  const id = uuid(req.params.submissionId, 'Phiên bản báo cáo');
  const {
    rows: [report],
  } = await db.query(
    `SELECT s.id,s.assignment_id,m.phase FROM submissions s JOIN campaign_milestones m ON m.id=s.milestone_id
     WHERE s.id=$1 AND m.campaign_id=$2`,
    [id, campaign],
  );
  if (!report) fail('Không tìm thấy báo cáo', 404);
  const group = await assignment(db, req, campaign, report.assignment_id);
  return { report, group };
}

function writable(campaign: any, a: any) {
  if (!activeCampaign(campaign.status) || ['COMPLETED', 'FAILED'].includes(a.status))
    fail('Hồ sơ đồ án đã đóng', 403);
}

export const list = async (req: Request, res: Response) => {
  const campaign = await campaignAccess(req, req.params.id);
  const role = req.user!.active_role;
  if (!['STUDENT', 'LECTURER'].includes(role)) fail('Chỉ thành viên đồ án được xem báo cáo', 403);
  const { rows: assignments } = await pool.query(
    `SELECT a.id,a.status,g.name,g.leader_id=$2 AS is_leader,t.title_vi,u.full_name AS supervisor
     FROM thesis_assignments a JOIN student_groups g ON g.id=a.group_id JOIN topics t ON t.id=a.topic_id
     JOIN users u ON u.id=a.supervisor_id WHERE a.campaign_id=$1
     AND (($3='LECTURER' AND a.supervisor_id=$2) OR ($3='STUDENT' AND EXISTS (
       SELECT FROM group_members m WHERE m.group_id=g.id AND m.student_id=$2 AND m.confirmation_status='CONFIRMED')))
     ORDER BY g.name,a.id`,
    [campaign.id, req.user!.sub, role],
  );
  const { rows: milestones } = await pool.query(
    `SELECT id,phase,title,start_at,end_at,hard_deadline_at,is_locked_override FROM campaign_milestones
     WHERE campaign_id=$1 AND phase::text=ANY($2::text[]) ORDER BY sequence_order,id`,
    [campaign.id, reportPhases],
  );
  res.json({ assignments, milestones, open: activeCampaign(campaign.status) });
};

export const reports = async (req: Request, res: Response) => {
  const campaign = await campaignAccess(req, req.params.id);
  const group = await assignment(
    pool,
    req,
    campaign.id,
    uuid(req.params.assignmentId, 'Phân công'),
  );
  const staff = req.user!.active_role === 'LECTURER';
  const { rows } = await pool.query(
    `SELECT s.id,s.version_number,s.submitted_at,s.is_late,s.late_minutes,s.description,
            m.title,m.phase,f.original_name,
      coalesce((SELECT json_agg(json_build_object('content',p.content,'created_at',p.created_at,'approved',p.is_approved_milestone)
        ORDER BY p.created_at,p.id) FROM submission_feedbacks p WHERE p.submission_id=s.id),'[]') AS feedback,
      coalesce((SELECT json_agg(json_build_object('student_id',r.student_id,'total_score',r.total_score,'scores',r.scores,
        'comment',r.comment,'template_id',r.template_id,'rubric_name',rt.name,'criteria',rt.criteria) ORDER BY r.student_id)
        FROM thesis_report_grades r JOIN rubric_templates rt ON rt.id=r.template_id
        WHERE r.submission_id=s.id AND ($3::boolean OR r.student_id=$4)),'[]') AS grades
     FROM submissions s JOIN campaign_milestones m ON m.id=s.milestone_id
     LEFT JOIN thesis_report_files f ON f.submission_id=s.id
     WHERE s.assignment_id=$1 AND m.campaign_id=$2 ORDER BY m.sequence_order,s.version_number DESC`,
    [group.id, campaign.id, staff, req.user!.sub],
  );
  const { rows: members } = staff
    ? await pool.query(
        `SELECT m.student_id,u.full_name,u.code FROM group_members m JOIN users u ON u.id=m.student_id
     WHERE m.group_id=$1 AND m.confirmation_status='CONFIRMED' ORDER BY u.full_name,u.id`,
        [group.group_id],
      )
    : { rows: [] };
  const { rows: rubrics } = staff
    ? await pool.query(
        `SELECT c.slot,t.id,t.name,t.criteria FROM campaign_rubric_templates c JOIN rubric_templates t ON t.id=c.template_id
     WHERE c.campaign_id=$1 AND t.target='THESIS_SUPERVISOR'`,
        [campaign.id],
      )
    : { rows: [] };
  res.json({
    reports: rows,
    members,
    rubrics,
    editable:
      activeCampaign(campaign.status) &&
      !['COMPLETED', 'FAILED'].includes(group.status) &&
      !(await resultState(pool, campaign.id))?.published_at,
  });
};

export const submit = async (req: Request, res: Response) => {
  const id = uuid(req.params.assignmentId, 'Phân công');
  const milestone = uuid(req.body?.milestone_id, 'Mốc');
  const note = optionalText(req.body?.description, 'Ghi chú');
  const file = pdf(req)!;
  const row = await withCampaign(req, async (db, campaign) => {
    const group = await assignment(db, req, campaign.id, id);
    if (req.user!.active_role !== 'STUDENT' || group.leader_id !== req.user!.sub)
      fail('Chỉ trưởng nhóm nộp báo cáo', 403);
    writable(campaign, group);
    await requireUnpublished(db, campaign.id);
    const window = await submissionWindow(db, campaign, milestone, req.user!.sub);
    const {
      rows: [report],
    } = await db.query(
      `INSERT INTO submissions(assignment_id,milestone_id,submitted_by,version_number,description,is_late,late_minutes)
       SELECT $1,$2,$3,coalesce(max(version_number),0)+1,$4,$5>0,$5
       FROM submissions WHERE assignment_id=$1 AND milestone_id=$2 RETURNING *`,
      [id, milestone, req.user!.sub, note, window.lateMinutes],
    );
    await db.query(
      'INSERT INTO thesis_report_files(submission_id,original_name,content) VALUES($1,$2,$3)',
      [report.id, file.name, file.bytes],
    );
    await audit(db, req, 'SUBMIT_THESIS_REPORT', 'submissions', report.id, null, report);
    return report;
  });
  res.status(201).json(row);
};

export const download = async (req: Request, res: Response) => {
  const campaign = await campaignAccess(req, req.params.id);
  const { report } = await submission(pool, req, campaign.id);
  const {
    rows: [file],
  } = await pool.query(
    'SELECT original_name,content FROM thesis_report_files WHERE submission_id=$1',
    [report.id],
  );
  if (!file) fail('Không tìm thấy tệp báo cáo', 404);
  res.attachment(file.original_name).type('application/pdf').send(file.content);
};

export const feedback = async (req: Request, res: Response) => {
  const content = text(req.body?.content, 'Nhận xét', 4000);
  const approved = req.body?.approved;
  if (approved !== null && typeof approved !== 'boolean') fail('Chọn trạng thái phản hồi');
  if (req.user!.active_role !== 'LECTURER') fail('Chỉ giảng viên hướng dẫn phản hồi', 403);
  const result = await withCampaign(req, async (db, campaign) => {
    const { report, group } = await submission(db, req, campaign.id);
    writable(campaign, group);
    await requireUnpublished(db, campaign.id);
    const {
      rows: [row],
    } = await db.query(
      `INSERT INTO submission_feedbacks(submission_id,author_id,content,is_approved_milestone)
       VALUES($1,$2,$3,$4) RETURNING *`,
      [report.id, req.user!.sub, content, approved],
    );
    await audit(db, req, 'REVIEW_THESIS_REPORT', 'submission_feedbacks', row.id, null, row);
    return row;
  });
  res.status(201).json(result);
};

export const grade = async (req: Request, res: Response) => {
  const student = uuid(req.params.studentId, 'Sinh viên');
  const evaluator = req.user!.sub;
  if (req.user!.active_role !== 'LECTURER') fail('Chỉ giảng viên hướng dẫn chấm báo cáo', 403);
  const result = await withCampaign(req, async (db, campaign) => {
    const { report, group } = await submission(db, req, campaign.id);
    writable(campaign, group);
    await requireUnpublished(db, campaign.id);
    if (
      !(
        await db.query(
          "SELECT 1 FROM group_members WHERE group_id=$1 AND student_id=$2 AND confirmation_status='CONFIRMED'",
          [group.group_id, student],
        )
      ).rowCount
    )
      fail('Sinh viên không thuộc nhóm được hướng dẫn', 404);
    const {
      rows: [before],
    } = await db.query(
      'SELECT * FROM thesis_report_grades WHERE submission_id=$1 AND student_id=$2',
      [report.id, student],
    );
    const template = await rubricFor(db, campaign.id, report.phase, before?.template_id);
    if (uuid(req.body?.template_id, 'Rubric') !== template.id)
      fail('Rubric đã thay đổi. Tải lại trang để chấm.', 409);
    const grade = gradeScores(template, req.body?.scores);
    const {
      rows: [row],
    } = await db.query(
      `INSERT INTO thesis_report_grades(submission_id,student_id,template_id,evaluator_id,scores,total_score,comment)
       VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(submission_id,student_id) DO UPDATE SET
       evaluator_id=EXCLUDED.evaluator_id,scores=EXCLUDED.scores,total_score=EXCLUDED.total_score,
       comment=EXCLUDED.comment,updated_at=now() RETURNING *`,
      [
        report.id,
        student,
        template.id,
        evaluator,
        JSON.stringify(grade.scores),
        grade.total_score,
        optionalText(req.body?.comment, 'Nhận xét'),
      ],
    );
    await audit(db, req, 'GRADE_THESIS_REPORT', 'submissions', report.id, before ?? null, row);
    return row;
  });
  res.json(result);
};
