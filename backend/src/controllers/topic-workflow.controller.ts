import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import { campaignAccess, globalRole, integer } from '../utils/campaign-access';
import { audit } from '../utils/audit';
import { fail, text, uuid } from '../utils/validation';

const reviewerRoles = ['DEPT_HEAD', 'FACULTY_MANAGER', 'TRAINING_DEPT', 'SYSTEM_ADMIN'];

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > max) {
    fail(`${label}: tối đa ${max} ký tự`);
  }
  return value.trim() || null;
}

function stringArray(value: unknown, label: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > 40) {
    fail(`${label}: tối đa 40 mục`);
  }
  return value.map((item, index) => text(item, `${label} (${index + 1})`, 100));
}

async function assertMilestoneOpen(
  client: Pick<PoolClient, 'query'>,
  campaignId: string,
  phase: 'TOPIC_SUBMISSION' | 'TOPIC_APPROVAL',
) {
  const milestone = (
    await client.query(
      'SELECT start_at,end_at,is_locked_override FROM campaign_milestones WHERE campaign_id=$1 AND phase=$2 FOR SHARE',
      [campaignId, phase],
    )
  ).rows[0];
  if (!milestone) {
    fail(`Đợt chưa cấu hình mốc ${phase}`, 409);
  }
  if (milestone.is_locked_override === true) {
    fail(`Mốc ${phase} đang bị khóa`, 403);
  }
  const now = Date.now();
  if (now < new Date(milestone.start_at).getTime() || now >= new Date(milestone.end_at).getTime()) {
    fail(`Ngoài thời gian xử lý mốc ${phase}`, 403);
  }
}

function assertTopicsCampaign(campaign: {
  type: string;
  status: string;
  max_students_per_topic: number;
}) {
  if (!['THESIS', 'COMBINED'].includes(campaign.type)) {
    fail('Chỉ đợt khóa luận hoặc đợt kết hợp hỗ trợ đề tài', 409);
  }
  if (!['OPEN', 'IN_PROGRESS'].includes(campaign.status)) {
    fail('Đợt chưa mở hoặc đã kết thúc', 403);
  }
}

export const submitTopic = async (req: Request, res: Response) => {
  if (req.user!.active_role !== 'LECTURER') {
    fail('Chỉ giảng viên được gửi đề tài', 403);
  }
  const campaignId = uuid(req.params.campaignId, 'Đợt');
  const body = req.body ?? {};
  const title = text(body.title_vi, 'Tên đề tài', 500);
  const titleEn = optionalText(body.title_en, 'Tên tiếng Anh', 500);
  const description = text(body.description, 'Mô tả', 20000);
  const objectives = optionalText(body.objectives, 'Mục tiêu', 10000);
  const researchField = optionalText(body.research_field, 'Lĩnh vực nghiên cứu', 255);
  const requiredSkills = stringArray(body.required_skills, 'Kỹ năng yêu cầu');
  const technologies = stringArray(body.technologies, 'Công nghệ');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM campaigns WHERE id=$1 FOR SHARE', [campaignId]);
    const campaign = await campaignAccess(req, campaignId, false, client);
    assertTopicsCampaign(campaign);

    const departmentId = req.user!.scope.department_id;
    if (!departmentId) {
      fail('Tài khoản giảng viên chưa được gán bộ môn', 403);
    }
    const lecturer = (
      await client.query(
        'SELECT department_id FROM lecturer_profiles WHERE user_id=$1 AND department_id=$2',
        [req.user!.sub, departmentId],
      )
    ).rows[0];
    if (!lecturer) {
      fail('Hồ sơ giảng viên không thuộc bộ môn được cấp', 403);
    }
    await assertMilestoneOpen(client, campaignId, 'TOPIC_SUBMISSION');

    const campaignMax = integer(campaign.max_students_per_topic, 'Số sinh viên tối đa của đợt', 1, 50);
    const maxStudents =
      body.max_students === undefined
        ? campaignMax
        : integer(body.max_students, 'Số sinh viên tối đa', 1, campaignMax);
    const topic = (
      await client.query(
        `INSERT INTO topics
          (campaign_id,department_id,supervisor_id,proposed_by_id,source,title_vi,title_en,
           description,objectives,required_skills,technologies,research_field,max_students,status)
         VALUES ($1,$2,$3,$3,'LECTURER_PROPOSED',$4,$5,$6,$7,$8,$9,$10,$11,'PENDING_APPROVAL')
         RETURNING *`,
        [
          campaign.id,
          lecturer.department_id,
          req.user!.sub,
          title,
          titleEn,
          description,
          objectives,
          requiredSkills,
          technologies,
          researchField,
          maxStudents,
        ],
      )
    ).rows[0];
    await audit(client, req, 'SUBMIT_TOPIC', 'topics', topic.id, null, topic);
    await client.query('COMMIT');
    res.status(201).json(topic);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listPendingTopics = async (req: Request, res: Response) => {
  if (!reviewerRoles.includes(req.user!.active_role)) {
    fail('Vai trò hiện tại không được xem hàng chờ duyệt', 403);
  }
  const campaignId = uuid(req.params.campaignId, 'Đợt');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM campaigns WHERE id=$1 FOR SHARE', [campaignId]);
    const campaign = await campaignAccess(req, campaignId, false, client);
    assertTopicsCampaign(campaign);
    if (req.user!.active_role === 'DEPT_HEAD' && !req.user!.scope.department_id) {
      fail('Trưởng bộ môn chưa được gán bộ môn', 403);
    }
    await assertMilestoneOpen(client, campaignId, 'TOPIC_APPROVAL');
    const departmentId = globalRole(req) ? null : req.user!.scope.department_id;
    const pending = await client.query(
      `SELECT t.id,t.campaign_id,t.department_id,d.name AS department_name,t.supervisor_id,
              s.code AS supervisor_code,s.full_name AS supervisor_name,t.proposed_by_id,
              p.code AS proposer_code,p.full_name AS proposer_name,t.title_vi,t.title_en,
              t.description,t.objectives,t.required_skills,t.technologies,t.research_field,
              t.max_students,t.status,t.created_at
       FROM topics t
       JOIN departments d ON d.id=t.department_id
       JOIN users s ON s.id=t.supervisor_id
       JOIN users p ON p.id=t.proposed_by_id
       WHERE t.campaign_id=$1 AND t.source='LECTURER_PROPOSED'
         AND t.status='PENDING_APPROVAL'
         AND ($2::uuid IS NULL OR t.department_id=$2)
         AND t.proposed_by_id<>$3
       ORDER BY t.created_at,t.id`,
      [campaign.id, departmentId, req.user!.sub],
    );
    await client.query('COMMIT');
    res.json(pending.rows);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const decideTopic = async (req: Request, res: Response) => {
  if (!reviewerRoles.includes(req.user!.active_role)) {
    fail('Vai trò hiện tại không được duyệt đề tài', 403);
  }
  const campaignId = uuid(req.params.campaignId, 'Đợt');
  const topicId = uuid(req.params.topicId, 'Đề tài');
  const body = req.body ?? {};
  if (!['APPROVED', 'REJECTED'].includes(body.decision)) {
    fail('Quyết định phải là APPROVED hoặc REJECTED');
  }
  const feedback = optionalText(body.feedback_comment, 'Nhận xét', 4000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM campaigns WHERE id=$1 FOR SHARE', [campaignId]);
    const campaign = await campaignAccess(req, campaignId, false, client);
    assertTopicsCampaign(campaign);
    const topic = (
      await client.query(
        `SELECT * FROM topics
         WHERE id=$1 AND campaign_id=$2 AND source='LECTURER_PROPOSED'
         FOR UPDATE`,
        [topicId, campaign.id],
      )
    ).rows[0];
    if (!topic) {
      fail('Không tìm thấy đề tài trong đợt này', 404);
    }
    if (topic.proposed_by_id === req.user!.sub) {
      fail('Không được tự duyệt đề tài do mình gửi', 403);
    }
    if (!globalRole(req)) {
      if (!req.user!.scope.faculty_id || req.user!.scope.faculty_id !== campaign.faculty_id) {
        fail('Đề tài ngoài phạm vi khoa được cấp', 403);
      }
      if (req.user!.scope.department_id && req.user!.scope.department_id !== topic.department_id) {
        fail('Đề tài ngoài phạm vi bộ môn được cấp', 403);
      }
      if (req.user!.active_role === 'DEPT_HEAD' && !req.user!.scope.department_id) {
        fail('Trưởng bộ môn chưa được gán bộ môn', 403);
      }
    }
    if (topic.status !== 'PENDING_APPROVAL') {
      fail('Đề tài không còn ở trạng thái chờ duyệt', 409);
    }
    await assertMilestoneOpen(client, campaignId, 'TOPIC_APPROVAL');

    const updated = (
      await client.query(
        'UPDATE topics SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *',
        [body.decision, topic.id],
      )
    ).rows[0];
    await client.query(
      `INSERT INTO topic_approval_logs
        (topic_id,reviewer_id,previous_status,new_status,feedback_comment)
       VALUES ($1,$2,$3,$4,$5)`,
      [topic.id, req.user!.sub, topic.status, body.decision, feedback],
    );
    await audit(client, req, 'REVIEW_TOPIC', 'topics', topic.id, topic, updated);
    await client.query('COMMIT');
    res.json(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listApprovedTopics = async (req: Request, res: Response) => {
  if (req.user!.active_role !== 'STUDENT') {
    fail('Chỉ sinh viên được xem danh sách đề tài', 403);
  }
  const campaignId = uuid(req.params.campaignId, 'Đợt');
  const campaign = await campaignAccess(req, campaignId);
  assertTopicsCampaign(campaign);
  const eligible = await pool.query(
    `SELECT 1
     FROM student_profiles p
     JOIN majors m ON m.id=p.major_id
     JOIN departments d ON d.id=m.department_id
     JOIN users u ON u.id=p.user_id AND u.is_active=TRUE
     JOIN campaign_eligible_students e ON e.student_id=p.user_id
       AND e.campaign_id=$1 AND e.status='ELIGIBLE'
     WHERE p.user_id=$2 AND d.faculty_id=$3
       AND ($4::uuid IS NULL OR p.major_id=$4)
       AND ($5::varchar IS NULL OR m.training_system=$5)`,
    [
      campaign.id,
      req.user!.sub,
      campaign.faculty_id,
      campaign.major_id,
      campaign.training_system,
    ],
  );
  if (!eligible.rowCount) {
    fail('Sinh viên không thuộc phạm vi hoặc chưa đủ điều kiện của đợt', 403);
  }
  const topics = await pool.query(
    `SELECT t.id,t.campaign_id,t.code,t.title_vi,t.title_en,t.description,t.objectives,
            t.required_skills,t.technologies,t.research_field,t.max_students,t.created_at,
            t.supervisor_id,u.code AS supervisor_code,u.full_name AS supervisor_name
     FROM topics t
     JOIN users u ON u.id=t.supervisor_id
     WHERE t.campaign_id=$1 AND t.source='LECTURER_PROPOSED' AND t.status='APPROVED'
     ORDER BY t.created_at DESC,t.id`,
    [campaign.id],
  );
  res.json(topics.rows);
};
