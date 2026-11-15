import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import { audit } from '../utils/audit';
import { eligibilityReason } from '../utils/eligibility';
import { thesisCampaign, thesisWrite } from '../utils/thesis-campaign';
import { fail, text, uuid } from '../utils/validation';
import { gateState, targetStudent } from './campaigns.controller';

function student(req: Request) {
  if (req.user!.active_role !== 'STUDENT') fail('Chỉ sinh viên quản lý nhóm đồ án', 403);
  return req.user!.sub;
}

async function requireDirection(req: Request, db: PoolClient, id: string) {
  const gate = await gateState(req, id, 'DIRECTION_SELECTION', db);
  if (!gate.allowed) fail(gate.reason, 403);
}

async function requireEditableGroup(db: PoolClient, id: string) {
  const { rows } = await db.query(
    `SELECT EXISTS(SELECT FROM topic_registrations WHERE group_id=$1)
      OR EXISTS(SELECT FROM thesis_assignments WHERE group_id=$1)
      OR EXISTS(SELECT FROM matching_offers WHERE group_id=$1 AND status='PENDING') AS locked`,
    [id],
  );
  if (rows[0].locked) fail('Nhóm đã gửi nguyện vọng hoặc được phân công', 409);
}

export const list = async (req: Request, res: Response) => {
  const user = student(req);
  const campaign = await thesisCampaign(req);
  const [gate, { rows }] = await Promise.all([
    gateState(req, campaign.id, 'DIRECTION_SELECTION'),
    pool.query(
      `SELECT g.id,g.name,g.leader_id,g.research_direction,u.full_name AS leader_name,
             m.confirmation_status, EXISTS(SELECT FROM topic_registrations WHERE group_id=g.id)
             OR EXISTS(SELECT FROM thesis_assignments WHERE group_id=g.id)
             OR EXISTS(SELECT FROM matching_offers WHERE group_id=g.id AND status='PENDING') AS locked,
             CASE WHEN m.confirmation_status='CONFIRMED' THEN (
               SELECT json_agg(json_build_object('code',s.code,'full_name',s.full_name,
                          'status',gm.confirmation_status) ORDER BY s.full_name,s.id)
               FROM group_members gm JOIN users s ON s.id=gm.student_id
               WHERE gm.group_id=g.id AND (g.leader_id=$2 OR gm.confirmation_status='CONFIRMED')
             ) ELSE '[]'::json END AS members
       FROM group_members m JOIN student_groups g ON g.id=m.group_id
       JOIN users u ON u.id=g.leader_id
       WHERE m.campaign_id=$1 AND m.student_id=$2 AND m.confirmation_status<>'DECLINED'
       ORDER BY g.created_at,g.id`,
      [campaign.id, user],
    ),
  ]);
  res.json({ gate, groups: rows.map((row) => ({ ...row, is_leader: row.leader_id === user })) });
};

export const create = async (req: Request, res: Response) => {
  const user = student(req);
  const name = text(req.body?.name, 'Tên nhóm', 150);
  const direction = text(req.body?.research_direction, 'Hướng đề tài', 255);
  const group = await thesisWrite(req, async (db, campaign) => {
    await requireDirection(req, db, campaign.id);
    if (
      (
        await db.query(
          "SELECT 1 FROM group_members WHERE campaign_id=$1 AND student_id=$2 AND confirmation_status='CONFIRMED'",
          [campaign.id, user],
        )
      ).rowCount
    )
      fail('Bạn đã có nhóm xác nhận trong đợt', 409);
    const { rows } = await db.query(
      `INSERT INTO student_groups (campaign_id,name,leader_id,research_direction)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [campaign.id, name, user, direction],
    );
    await audit(db, req, 'CREATE_GROUP', 'student_groups', rows[0].id, null, rows[0]);
    return rows[0];
  });
  res.status(201).json(group);
};

export const edit = async (req: Request, res: Response) => {
  const user = student(req);
  const id = uuid(req.params.groupId, 'Nhóm');
  const direction = text(req.body?.research_direction, 'Hướng đề tài', 255);
  const group = await thesisWrite(req, async (db, campaign) => {
    await requireDirection(req, db, campaign.id);
    const previous = (
      await db.query(
        'SELECT * FROM student_groups WHERE id=$1 AND campaign_id=$2 AND leader_id=$3',
        [id, campaign.id, user],
      )
    ).rows[0];
    if (!previous) fail('Không tìm thấy nhóm bạn phụ trách', 404);
    await requireEditableGroup(db, id);
    const { rows } = await db.query(
      'UPDATE student_groups SET research_direction=$2 WHERE id=$1 RETURNING *',
      [id, direction],
    );
    await audit(db, req, 'SET_GROUP_DIRECTION', 'student_groups', id, previous, rows[0]);
    return rows[0];
  });
  res.json(group);
};

export const invite = async (req: Request, res: Response) => {
  const user = student(req);
  const id = uuid(req.params.groupId, 'Nhóm');
  const code = text(req.body?.student_code, 'Mã sinh viên', 50);
  await thesisWrite(req, async (db, campaign) => {
    await requireDirection(req, db, campaign.id);
    if (
      !(
        await db.query(
          'SELECT 1 FROM student_groups WHERE id=$1 AND campaign_id=$2 AND leader_id=$3',
          [id, campaign.id, user],
        )
      ).rowCount
    )
      fail('Không tìm thấy nhóm bạn phụ trách', 404);
    await requireEditableGroup(db, id);
    const member = (
      await db.query(
        `SELECT u.id,e.verified_credits,e.verified_prerequisite FROM users u
       JOIN campaign_eligible_students e ON e.student_id=u.id AND e.campaign_id=$2
       WHERE u.code=$1 AND e.status='ELIGIBLE'`,
        [code, campaign.id],
      )
    ).rows[0];
    if (!member || eligibilityReason(campaign, member))
      fail('Sinh viên không đủ điều kiện cho đợt này', 404);
    await targetStudent(db, campaign, member.id);
    const { rows } = await db.query(
      'SELECT group_id,confirmation_status FROM group_members WHERE campaign_id=$1 AND student_id=$2',
      [campaign.id, member.id],
    );
    if (rows.some((row) => row.group_id === id && row.confirmation_status === 'PENDING')) return;
    if (rows.some((row) => row.confirmation_status === 'CONFIRMED'))
      fail('Sinh viên đã có nhóm trong đợt', 409);
    const {
      rows: [size],
    } = await db.query(
      "SELECT count(*)::int AS n FROM group_members WHERE group_id=$1 AND confirmation_status IN ('CONFIRMED','PENDING')",
      [id],
    );
    if (size.n >= (campaign.max_students_per_topic ?? 2))
      fail('Nhóm đã đủ thành viên hoặc có lời mời đang chờ', 409);
    await db.query(
      `INSERT INTO group_members (group_id,student_id,campaign_id) VALUES ($1,$2,$3)
       ON CONFLICT (group_id,student_id) DO UPDATE SET confirmation_status='PENDING'`,
      [id, member.id, campaign.id],
    );
    await audit(db, req, 'INVITE_GROUP_MEMBER', 'student_groups', id, null, {
      student_id: member.id,
    });
  });
  res.json({ message: 'Đã gửi lời mời' });
};

export const respond = async (req: Request, res: Response) => {
  const user = student(req);
  const id = uuid(req.params.groupId, 'Nhóm');
  const decision = req.body?.decision;
  if (!['CONFIRMED', 'DECLINED'].includes(decision)) fail('Phản hồi lời mời không hợp lệ');
  await thesisWrite(req, async (db, campaign) => {
    const invite = (
      await db.query(
        'SELECT confirmation_status FROM group_members WHERE group_id=$1 AND student_id=$2 AND campaign_id=$3',
        [id, user, campaign.id],
      )
    ).rows[0];
    if (!invite) fail('Không tìm thấy lời mời', 404);
    if (invite.confirmation_status === decision) return;
    if (invite.confirmation_status !== 'PENDING') fail('Lời mời đã được xử lý', 409);
    if (decision === 'CONFIRMED') {
      await requireDirection(req, db, campaign.id);
      await requireEditableGroup(db, id);
      const {
        rows: [size],
      } = await db.query(
        "SELECT count(*)::int AS n FROM group_members WHERE group_id=$1 AND confirmation_status='CONFIRMED'",
        [id],
      );
      if (size.n >= (campaign.max_students_per_topic ?? 2)) fail('Nhóm đã đủ thành viên', 409);
      if (
        (
          await db.query(
            "SELECT 1 FROM group_members WHERE campaign_id=$1 AND student_id=$2 AND confirmation_status='CONFIRMED'",
            [campaign.id, user],
          )
        ).rowCount
      )
        fail('Bạn đã có nhóm xác nhận trong đợt', 409);
    }
    await db.query(
      'UPDATE group_members SET confirmation_status=$3 WHERE group_id=$1 AND student_id=$2',
      [id, user, decision],
    );
    await audit(db, req, 'RESPOND_GROUP_INVITE', 'student_groups', id, null, { decision });
  });
  res.json({ message: decision === 'CONFIRMED' ? 'Đã xác nhận vào nhóm' : 'Đã từ chối lời mời' });
};
