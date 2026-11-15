import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import { audit } from '../utils/audit';
import { campaignAccess, integer } from '../utils/campaign-access';
import { fail, text, uuid } from '../utils/validation';
import { thesisWrite } from '../utils/thesis-campaign';
import { gateState } from './campaigns.controller';
import { groupOffers } from './matching.controller';

type DB = Pick<PoolClient, 'query'>;

function requireRole(req: Request, role: 'STUDENT' | 'LECTURER') {
  if (req.user!.active_role !== role) {
    fail(
      role === 'STUDENT'
        ? 'Chỉ sinh viên truy cập nguyện vọng nhóm'
        : 'Chỉ giảng viên xử lý nguyện vọng',
      403,
    );
  }
}

async function groupForStudent(req: Request, campaignId: string, groupId: string, db: DB) {
  const { rows } = await db.query(
    `SELECT g.id,g.name,g.leader_id FROM student_groups g
     WHERE g.id=$1 AND g.campaign_id=$2 AND (g.leader_id=$3 OR EXISTS (
       SELECT 1 FROM group_members gm WHERE gm.group_id=g.id AND gm.student_id=$3 AND gm.confirmation_status='CONFIRMED'
     ))`,
    [groupId, campaignId, req.user!.sub],
  );
  if (!rows[0]) fail('Không tìm thấy nhóm của bạn trong đợt này', 404);
  return rows[0];
}

async function groupSize(db: DB, campaignId: string, groupId: string) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS size, count(*) FILTER (
       WHERE u.is_active AND e.status='ELIGIBLE'
         AND (NOT c.enforce_min_credits OR e.verified_credits >= c.min_credits_required)
         AND (c.prerequisite_note IS NULL OR e.verified_prerequisite=c.prerequisite_note)
         AND d.faculty_id=c.faculty_id
         AND (c.major_id IS NULL OR p.major_id=c.major_id)
         AND (c.training_system IS NULL OR m.training_system=c.training_system)
         AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
                     WHERE ur.user_id=u.id AND r.code='STUDENT')
     )::int AS eligible
     FROM group_members s JOIN campaigns c ON c.id=s.campaign_id
     JOIN users u ON u.id=s.student_id
     LEFT JOIN student_profiles p ON p.user_id=s.student_id
     LEFT JOIN majors m ON m.id=p.major_id
     LEFT JOIN departments d ON d.id=m.department_id
     LEFT JOIN campaign_eligible_students e ON e.student_id=s.student_id AND e.campaign_id=c.id
     WHERE s.group_id=$1 AND s.campaign_id=$2 AND s.confirmation_status='CONFIRMED'`,
    [groupId, campaignId],
  );
  const { size, eligible } = rows[0];
  if (!size || size !== eligible) fail('Nhóm có thành viên chưa đủ điều kiện của đợt', 409);
  return size as number;
}

async function assignmentFor(db: DB, campaignId: string, groupId: string) {
  const { rows } = await db.query(
    `SELECT a.id,a.topic_id,a.status,a.assigned_at,t.title_vi,u.full_name AS supervisor
     FROM thesis_assignments a JOIN topics t ON t.id=a.topic_id
     JOIN users u ON u.id=a.supervisor_id WHERE a.campaign_id=$1 AND a.group_id=$2`,
    [campaignId, groupId],
  );
  return rows[0] ?? null;
}

const wishLimit = (limit: number | null) => Math.min(5, Math.max(0, limit ?? 3));

export const listGroups = async (req: Request, res: Response) => {
  requireRole(req, 'STUDENT');
  const campaign = await campaignAccess(req, req.params.id);
  const { rows } = await pool.query(
    `SELECT g.id,g.name,g.leader_id=$2 AS is_leader FROM student_groups g
     WHERE g.campaign_id=$1 AND (g.leader_id=$2 OR EXISTS (
       SELECT 1 FROM group_members gm WHERE gm.group_id=g.id AND gm.student_id=$2 AND gm.confirmation_status='CONFIRMED'
     )) ORDER BY g.created_at,g.id`,
    [campaign.id, req.user!.sub],
  );
  res.json(rows);
};

export const groupResults = async (req: Request, res: Response) => {
  requireRole(req, 'STUDENT');
  const campaign = await campaignAccess(req, req.params.id);
  const group = await groupForStudent(req, campaign.id, uuid(req.params.groupId, 'Nhóm'), pool);
  const [gate, wishes, topics, assignment, offers] = await Promise.all([
    gateState(req, campaign.id, 'WISH_REGISTRATION'),
    pool.query(
      `SELECT r.id,r.topic_id,r.priority_order,r.status,r.student_note,r.lecturer_response_note,
              r.registered_at,t.title_vi
       FROM topic_registrations r JOIN topics t ON t.id=r.topic_id AND t.campaign_id=r.campaign_id
       WHERE r.campaign_id=$1 AND r.group_id=$2 ORDER BY r.priority_order`,
      [campaign.id, group.id],
    ),
    pool.query(
      `SELECT t.id,t.code,t.title_vi,t.description,t.max_students,u.full_name AS supervisor
       FROM topics t JOIN users u ON u.id=t.supervisor_id
       WHERE t.campaign_id=$1 AND t.status='APPROVED'
         AND NOT EXISTS (SELECT 1 FROM thesis_assignments a WHERE a.topic_id=t.id)
         AND NOT EXISTS (SELECT 1 FROM matching_offers o WHERE o.topic_id=t.id AND o.status='PENDING')
       ORDER BY t.title_vi,t.id`,
      [campaign.id],
    ),
    assignmentFor(pool, campaign.id, group.id),
    groupOffers(pool, campaign.id, group.id),
  ]);
  res.json({
    group: {
      id: group.id,
      name: group.name,
      is_leader: group.leader_id === req.user!.sub,
    },
    gate,
    max_wish_choices: wishLimit(campaign.max_wish_choices),
    registrations: wishes.rows,
    topics: topics.rows,
    assignment,
    offers,
  });
};

async function campaignTransaction(
  req: Request,
  run: (db: PoolClient, campaignId: string) => Promise<void>,
) {
  const id = uuid(req.params.id, 'Đợt');
  await campaignAccess(req, id);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Đồng bộ với cập nhật mốc thời gian, điều kiện và cấu hình đợt ở Sprint 2.
    await db.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [id]);
    await run(db, id);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export const registerWish = async (req: Request, res: Response) => {
  requireRole(req, 'STUDENT');
  const groupId = uuid(req.params.groupId, 'Nhóm');
  const topicId = uuid(req.body?.topic_id, 'Đề tài');
  const priority = integer(req.body?.priority_order, 'Thứ tự nguyện vọng', 1, 5);
  const note =
    req.body?.student_note == null || req.body.student_note === ''
      ? null
      : text(req.body.student_note, 'Ghi chú', 2000);
  let registration;
  let created = false;
  await campaignTransaction(req, async (db, id) => {
    const campaign = await campaignAccess(req, id, false, db);
    const group = await groupForStudent(req, id, groupId, db);
    if (group.leader_id !== req.user!.sub) fail('Chỉ trưởng nhóm được gửi nguyện vọng', 403);
    const { rows: existing } = await db.query(
      'SELECT * FROM topic_registrations WHERE group_id=$1 AND campaign_id=$2 ORDER BY priority_order',
      [groupId, id],
    );
    const sameTopic = existing.find((row) => row.topic_id === topicId.toLowerCase());
    if (sameTopic) {
      if (sameTopic.priority_order !== priority || (sameTopic.student_note ?? null) !== note) {
        fail('Nhóm đã đăng ký đề tài này', 409);
      }
      registration = sameTopic;
      return;
    }
    if (existing.some((row) => row.priority_order === priority))
      fail('Thứ tự nguyện vọng đã được dùng', 409);
    const limit = wishLimit(campaign.max_wish_choices);
    if (priority > limit || existing.length >= limit)
      fail(`Mỗi nhóm có tối đa ${limit} nguyện vọng`, 409);
    const gate = await gateState(req, id, 'WISH_REGISTRATION', db);
    if (!gate.allowed) fail(gate.reason, 403);
    if (await assignmentFor(db, id, groupId)) fail('Nhóm đã có đề tài được phân công', 409);
    const size = await groupSize(db, id, groupId);
    const topic = (
      await db.query(
        `SELECT status,max_students,supervisor_id FROM topics WHERE id=$1 AND campaign_id=$2
          AND NOT EXISTS(SELECT FROM matching_offers WHERE topic_id=$1 AND status='PENDING') FOR UPDATE`,
        [topicId, id],
      )
    ).rows[0];
    if (!topic) fail('Không tìm thấy đề tài trong đợt này', 404);
    if (topic.status !== 'APPROVED') fail('Đề tài chưa mở cho đăng ký', 409);
    if (!topic.supervisor_id) fail('Đề tài đang chờ phân công giảng viên hướng dẫn', 409);
    if (
      (await db.query('SELECT 1 FROM thesis_assignments WHERE topic_id=$1', [topicId])).rowCount
    ) {
      fail('Đề tài đã được phân công', 409);
    }
    if (
      size > Math.min(topic.max_students, campaign.max_students_per_topic ?? topic.max_students)
    ) {
      fail('Số thành viên vượt giới hạn của đề tài hoặc đợt', 409);
    }
    registration = (
      await db.query(
        `INSERT INTO topic_registrations (campaign_id,group_id,topic_id,priority_order,student_note)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [id, groupId, topicId, priority, note],
      )
    ).rows[0];
    await audit(
      db,
      req,
      'REGISTER_WISH',
      'topic_registrations',
      registration.id,
      null,
      registration,
    );
    created = true;
  });
  res.status(created ? 201 : 200).json(registration);
};

export const lecturerWishes = async (req: Request, res: Response) => {
  requireRole(req, 'LECTURER');
  const campaign = await campaignAccess(req, req.params.id);
  const { rows } = await pool.query(
    `SELECT r.id,r.topic_id,r.priority_order,r.lecturer_rank,r.status,r.student_note,r.lecturer_response_note,t.title_vi,
            g.name AS group_name,u.full_name AS leader_name
     FROM topic_registrations r JOIN topics t ON t.id=r.topic_id AND t.campaign_id=r.campaign_id
     JOIN student_groups g ON g.id=r.group_id AND g.campaign_id=r.campaign_id
     JOIN users u ON u.id=g.leader_id
     WHERE r.campaign_id=$1 AND t.supervisor_id=$2 ORDER BY r.registered_at,r.id`,
    [campaign.id, req.user!.sub],
  );
  res.json(rows);
};

export const replaceWishes = async (req: Request, res: Response) => {
  requireRole(req, 'STUDENT');
  const groupId = uuid(req.params.groupId, 'Nhóm');
  const { registrations, expected } = req.body ?? {};
  if (
    !Array.isArray(registrations) ||
    registrations.length > 5 ||
    !Array.isArray(expected) ||
    expected.length > 5
  ) {
    fail('Danh sách nguyện vọng không hợp lệ');
  }
  const desired = registrations.map((row) => ({
    topic_id: uuid(row?.topic_id, 'Đề tài').toLowerCase(),
    priority_order: integer(row?.priority_order, 'Thứ tự ưu tiên', 1, 5),
    student_note:
      row?.student_note?.trim?.() === '' || row?.student_note == null
        ? null
        : text(row.student_note, 'Ghi chú', 2000),
  }));
  if (
    new Set(desired.map((r) => r.topic_id)).size !== desired.length ||
    new Set(desired.map((r) => r.priority_order)).size !== desired.length
  )
    fail('Trùng đề tài hoặc thứ tự ưu tiên', 409);
  await thesisWrite(req, async (db, campaign) => {
    const group = await groupForStudent(req, campaign.id, groupId, db);
    if (group.leader_id !== req.user!.sub) fail('Chỉ trưởng nhóm sửa nguyện vọng', 403);
    const gate = await gateState(req, campaign.id, 'WISH_REGISTRATION', db);
    if (!gate.allowed) fail(gate.reason, 403);
    if (await assignmentFor(db, campaign.id, groupId)) fail('Nhóm đã được phân công', 409);
    const { rows: before } = await db.query(
      `SELECT id,topic_id,priority_order,student_note,status FROM topic_registrations WHERE group_id=$1 ORDER BY priority_order`,
      [groupId],
    );
    const version = before.map((r) => [r.id, r.priority_order, r.student_note, r.status]);
    if (JSON.stringify(version) !== JSON.stringify(expected))
      fail('Nguyện vọng vừa thay đổi. Tải lại trang trước khi sửa.', 409);
    if (before.some((r) => r.status !== 'PENDING_LECTURER'))
      fail('Có nguyện vọng đã được xử lý', 409);
    const limit = wishLimit(campaign.max_wish_choices);
    if (desired.length > limit || desired.some((r) => r.priority_order > limit))
      fail('Vượt giới hạn nguyện vọng của đợt', 409);
    if (desired.length) {
      const size = await groupSize(db, campaign.id, groupId);
      const { rows: topics } = await db.query(
        `SELECT t.id,t.max_students FROM topics t WHERE t.campaign_id=$1 AND t.id=ANY($2::uuid[])
           AND t.status='APPROVED' AND t.supervisor_id IS NOT NULL
           AND NOT EXISTS(SELECT FROM matching_offers o WHERE o.topic_id=t.id AND o.status='PENDING')
           AND NOT EXISTS(SELECT FROM thesis_assignments a WHERE a.topic_id=t.id) FOR UPDATE`,
        [campaign.id, desired.map((r) => r.topic_id)],
      );
      if (topics.length !== desired.length)
        fail('Có đề tài khác đợt hoặc không còn mở đăng ký', 409);
      if (
        topics.some(
          (t) => size > Math.min(t.max_students, campaign.max_students_per_topic ?? t.max_students),
        )
      ) {
        fail('Số thành viên vượt sức chứa của đề tài hoặc đợt', 409);
      }
    }
    await db.query('SET CONSTRAINTS topic_registrations_group_id_priority_order_key DEFERRED');
    const removed = before.filter((r) => !desired.some((next) => next.topic_id === r.topic_id));
    await db.query('DELETE FROM topic_registrations WHERE id=ANY($1::uuid[])', [
      removed.map((r) => r.id),
    ]);
    for (const wish of desired) {
      const old = before.find((r) => r.topic_id === wish.topic_id);
      if (old) {
        await db.query(
          'UPDATE topic_registrations SET priority_order=$2,student_note=$3 WHERE id=$1',
          [old.id, wish.priority_order, wish.student_note],
        );
      } else {
        await db.query(
          `INSERT INTO topic_registrations(campaign_id,group_id,topic_id,priority_order,student_note)
          VALUES($1,$2,$3,$4,$5)`,
          [campaign.id, groupId, wish.topic_id, wish.priority_order, wish.student_note],
        );
      }
    }
    await audit(db, req, 'EDIT_WISH_LIST', 'student_groups', groupId, before, desired);
  });
  res.json({ message: 'Đã lưu danh sách nguyện vọng' });
};

export const rankApplicant = async (req: Request, res: Response) => {
  requireRole(req, 'LECTURER');
  const id = uuid(req.params.registrationId, 'Nguyện vọng');
  const rank = req.body?.rank === null ? null : integer(req.body?.rank, 'Thứ hạng', 1, 10000);
  await thesisWrite(req, async (db, campaign) => {
    const gate = await gateState(req, campaign.id, 'MATCHING', db);
    if (!gate.allowed) fail(gate.reason, 403);
    const {
      rows: [wish],
    } = await db.query(
      `SELECT r.id,r.topic_id,r.lecturer_rank,r.status FROM topic_registrations r JOIN topics t ON t.id=r.topic_id
       WHERE r.campaign_id=$1 AND r.id=$2 AND t.supervisor_id=$3`,
      [campaign.id, id, req.user!.sub],
    );
    if (!wish) fail('Không tìm thấy ứng viên cho đề tài của bạn', 404);
    if (wish.status !== 'PENDING_LECTURER') fail('Nguyện vọng đã được xử lý', 409);
    if (
      rank !== null &&
      (
        await db.query(
          'SELECT 1 FROM topic_registrations WHERE topic_id=$1 AND lecturer_rank=$2 AND id<>$3',
          [wish.topic_id, rank, id],
        )
      ).rowCount
    )
      fail('Thứ hạng đã được dùng. Bỏ thứ hạng cũ trước khi đổi.', 409);
    await db.query('UPDATE topic_registrations SET lecturer_rank=$2 WHERE id=$1', [id, rank]);
    await audit(
      db,
      req,
      'RANK_APPLICANT',
      'topic_registrations',
      id,
      { rank: wish.lecturer_rank },
      { rank },
    );
  });
  res.json({ message: 'Đã lưu thứ hạng' });
};
