import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import { gateState } from './campaigns.controller';
import { thesisCampaign, thesisWrite } from '../utils/thesis-campaign';
import { globalRole, timestamp } from '../utils/campaign-access';
import { audit } from '../utils/audit';
import { fail, uuid } from '../utils/validation';
import { algorithms, criteria, matchingModel, solve, summarize } from '../services/matching';
import type { Config, Input, Pair } from '../services/matching';

function manager(req: Request) {
  if (
    !globalRole(req) &&
    (req.user!.active_role !== 'FACULTY_MANAGER' ||
      req.user!.scope.department_id ||
      req.user!.scope.major_id)
  ) {
    fail('Chỉ quản lý toàn đợt hoặc Khoa được điều phối ghép cặp', 403);
  }
}

function config(body: any): Config {
  const selected = body?.criteria;
  if (
    !algorithms.includes(body?.algorithm) ||
    !Array.isArray(selected) ||
    !selected.length ||
    selected.length > criteria.length ||
    new Set(selected).size !== selected.length ||
    !selected.every((item) => criteria.includes(item))
  )
    fail('Thuật toán hoặc tiêu chí xếp hạng không hợp lệ');
  return { algorithm: body.algorithm, criteria: selected };
}

type DB = Pick<PoolClient, 'query'>;
async function snapshot(
  db: DB,
  campaign: any,
  respondingOffer: string | null = null,
): Promise<Input> {
  const id = campaign.id;
  const groupQuery = await db.query(
    `SELECT g.id,coalesce(g.name,u0.code) AS name,u0.code,count(*)::int AS size,
       bool_and(coalesce(u.is_active AND e.status='ELIGIBLE'
         AND (NOT c.enforce_min_credits OR e.verified_credits>=c.min_credits_required)
         AND (c.prerequisite_note IS NULL OR e.verified_prerequisite=c.prerequisite_note)
         AND d.faculty_id=c.faculty_id AND (c.major_id IS NULL OR p.major_id=c.major_id)
         AND (c.training_system IS NULL OR m.training_system=c.training_system)
         AND EXISTS(SELECT FROM user_roles ur JOIN roles role ON role.id=ur.role_id
                    WHERE ur.user_id=u.id AND role.code='STUDENT'),false)) AS eligible,
       avg(p.gpa)::float AS gpa,
       coalesce((SELECT array_agg(DISTINCT skill ORDER BY skill)
        FROM group_members sm JOIN student_profiles sp ON sp.user_id=sm.student_id
        CROSS JOIN LATERAL unnest(sp.skills) AS skill
        WHERE sm.group_id=g.id AND sm.confirmation_status='CONFIRMED'),'{}') AS skills
     FROM student_groups g JOIN users u0 ON u0.id=g.leader_id JOIN campaigns c ON c.id=g.campaign_id
     JOIN group_members gm ON gm.group_id=g.id AND gm.confirmation_status='CONFIRMED'
     JOIN users u ON u.id=gm.student_id LEFT JOIN student_profiles p ON p.user_id=u.id
     LEFT JOIN majors m ON m.id=p.major_id LEFT JOIN departments d ON d.id=m.department_id
     LEFT JOIN campaign_eligible_students e ON e.campaign_id=g.campaign_id AND e.student_id=u.id
     WHERE g.campaign_id=$1 AND NOT EXISTS(SELECT FROM thesis_assignments a WHERE a.group_id=g.id)
       AND NOT EXISTS(SELECT FROM matching_offers o WHERE o.group_id=g.id AND o.status IN ('PENDING','CONFIRMED') AND o.id IS DISTINCT FROM $2::uuid)
     GROUP BY g.id,u0.code ORDER BY u0.code,g.id`,
    [id, respondingOffer],
  );
  const topicQuery = await db.query(
    `SELECT t.id,t.title_vi AS title,least(t.max_students,c.max_students_per_topic) AS capacity,
       t.supervisor_id,u.full_name AS supervisor,coalesce(t.required_skills,'{}') AS skills
     FROM topics t JOIN campaigns c ON c.id=t.campaign_id JOIN users u ON u.id=t.supervisor_id
     JOIN departments d ON d.id=t.department_id
     WHERE t.campaign_id=$1 AND t.status='APPROVED' AND u.is_active AND d.faculty_id=c.faculty_id
       AND EXISTS(SELECT FROM user_roles ur JOIN roles role ON role.id=ur.role_id
                  WHERE ur.user_id=u.id AND role.code='LECTURER' AND ur.faculty_id=c.faculty_id
                    AND (ur.campaign_id IS NULL OR ur.campaign_id=c.id)
                    AND (ur.major_id IS NULL OR c.major_id IS NULL OR ur.major_id=c.major_id)
                    AND (ur.department_id IS NULL OR ur.department_id=t.department_id))
       AND NOT EXISTS(SELECT FROM thesis_assignments a WHERE a.topic_id=t.id)
       AND NOT EXISTS(SELECT FROM matching_offers o WHERE o.topic_id=t.id AND o.status IN ('PENDING','CONFIRMED') AND o.id IS DISTINCT FROM $2::uuid)
     ORDER BY t.id`,
    [id, respondingOffer],
  );
  const { rows: quota } = await db.query(
    `SELECT q.lecturer_id AS supervisor_id,q.max_students-q.current_assigned_students AS students,
       q.max_topics-(SELECT count(*)::int FROM thesis_assignments a
         WHERE a.campaign_id=$1 AND a.supervisor_id=q.lecturer_id) AS topics
     FROM lecturer_quotas q WHERE q.campaign_id=$1 ORDER BY q.lecturer_id`,
    [id],
  );
  const { rows: wishes } = await db.query(
    `SELECT group_id,topic_id,priority_order AS priority,lecturer_rank AS rank,registered_at FROM topic_registrations
     WHERE campaign_id=$1 AND status='PENDING_LECTURER' ORDER BY group_id,priority_order,id`,
    [id],
  );
  const { rows: declined } = await db.query(
    `SELECT DISTINCT group_id,topic_id FROM matching_offers WHERE campaign_id=$1 AND status IN ('DECLINED','EXPIRED')
     ORDER BY group_id,topic_id`,
    [id],
  );
  return {
    groups: groupQuery.rows,
    topics: topicQuery.rows,
    quota,
    wishes: wishes.map((row) => ({
      ...row,
      registered_at: row.registered_at?.toISOString() ?? null,
    })),
    declined,
  };
}

async function latest(db: DB, id: string) {
  return (
    await db.query(
      'SELECT * FROM matching_runs WHERE campaign_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',
      [id],
    )
  ).rows[0];
}

function equivalent(a: any, b: any): boolean {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => Object.hasOwn(b, k) && equivalent(a[k], b[k]))
  );
}

async function openMatching(req: Request, db: PoolClient, campaign: any) {
  const gate = await gateState(req, campaign.id, 'MATCHING', db);
  if (!gate.allowed) fail(gate.reason, 403);
  if (
    (
      await db.query("SELECT FROM matching_offers WHERE campaign_id=$1 AND status='PENDING'", [
        campaign.id,
      ])
    ).rowCount
  ) {
    fail('Cần xử lý các lời mời đang chờ của vòng trước', 409);
  }
}

async function saveRun(
  db: PoolClient,
  req: Request,
  id: string,
  round: number,
  settings: Config,
  input: Input,
  pairs: Pair[],
) {
  const result = { pairs, stats: summarize(input, settings, pairs) };
  const {
    rows: [run],
  } = await db.query(
    `INSERT INTO matching_runs(campaign_id,round,created_by,config,input,result)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [id, round, req.user!.sub, settings, input, result],
  );
  await audit(db, req, 'SAVE_MATCH_PREVIEW', 'matching_runs', run.id, null, {
    round,
    config: settings,
    stats: result.stats,
  });
  return run;
}

export const list = async (req: Request, res: Response) => {
  manager(req);
  const campaign = await thesisCampaign(req);
  const gate = await gateState(req, campaign.id, 'MATCHING');
  const { rows: history } = await pool.query(
    `SELECT id,round,created_at,published_at,config,result->'stats' AS stats
     FROM matching_runs WHERE campaign_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,
    [campaign.id],
  );
  const { rows: offers } = await pool.query(
    `SELECT o.id,o.run_id,o.status,o.group_id,o.topic_id,c.round,g.name AS group_name,t.title_vi AS title,
            (c.config->>'confirm_until')::timestamptz AS confirm_until
     FROM matching_offers o JOIN matching_runs c ON c.id=o.run_id JOIN student_groups g ON g.id=o.group_id
     JOIN topics t ON t.id=o.topic_id WHERE o.campaign_id=$1 ORDER BY c.round DESC,g.name,o.id`,
    [campaign.id],
  );
  res.json({ gate, history, active: (await latest(pool, campaign.id)) ?? null, offers });
};

export const detail = async (req: Request, res: Response) => {
  manager(req);
  const campaign = await thesisCampaign(req);
  const {
    rows: [run],
  } = await pool.query('SELECT * FROM matching_runs WHERE campaign_id=$1 AND id=$2', [
    campaign.id,
    uuid(req.params.runId, 'Lần chạy'),
  ]);
  if (!run) fail('Không tìm thấy lần chạy', 404);
  res.json(run);
};

export const preview = async (req: Request, res: Response) => {
  manager(req);
  const settings = config(req.body);
  const run = await thesisWrite(req, async (db, campaign) => {
    await openMatching(req, db, campaign);
    const previous = await latest(db, campaign.id);
    const round = (previous?.round ?? 1) + (previous?.published_at ? 1 : 0);
    const input = await snapshot(db, campaign);
    if (!input.groups.length) fail('Không còn nhóm chưa được ghép trong đợt', 409);
    const locked: Pair[] =
      previous && !previous.published_at ? previous.result.pairs.filter((p: Pair) => p.locked) : [];
    return saveRun(db, req, campaign.id, round, settings, input, solve(input, settings, locked));
  });
  res.status(201).json(run);
};

async function draft(db: PoolClient, campaign: any, runId: string) {
  const head = await latest(db, campaign.id);
  if (!head || head.id !== runId || head.published_at)
    fail('Chỉ chỉnh hoặc công bố bản nháp mới nhất', 409);
  return head;
}

export const adjust = async (req: Request, res: Response) => {
  manager(req);
  const runId = uuid(req.params.runId, 'Lần chạy');
  const action = req.body?.action;
  const group = uuid(req.body?.group_id, 'Nhóm').toLowerCase();
  const topic = action === 'assign' ? uuid(req.body?.topic_id, 'Đề tài').toLowerCase() : null;
  if (!['assign', 'remove', 'lock', 'unlock'].includes(action)) fail('Thao tác không hợp lệ');
  const run = await thesisWrite(req, async (db, campaign) => {
    await openMatching(req, db, campaign);
    const head = await draft(db, campaign, runId);
    const input = await snapshot(db, campaign);
    let pairs: Pair[] = head.result.pairs;
    const old = pairs.find((p) => p.group_id === group);
    if (action === 'assign') {
      if (pairs.some((p) => p.locked && (p.group_id === group || p.topic_id === topic)))
        fail('Bỏ khóa cặp trước khi thay', 409);
      if (pairs.some((p) => p.topic_id === topic && p.group_id !== group))
        fail('Đề tài đang thuộc một cặp nháp khác. Bỏ cặp đó trước khi đổi.', 409);
      pairs = [
        ...pairs.filter((p) => p.group_id !== group),
        { group_id: group, topic_id: topic!, manual: true, locked: false },
      ];
    } else {
      if (!old) fail('Nhóm chưa có cặp', 404);
      if (action === 'remove' && old.locked) fail('Bỏ khóa cặp trước khi xóa', 409);
      pairs =
        action === 'remove'
          ? pairs.filter((p) => p !== old)
          : pairs.map((p) => (p === old ? { ...p, locked: action === 'lock' } : p));
    }
    // Allow releasing stale pairs when eligibility changed since the preceding run.
    if (['assign', 'lock'].includes(action) && !matchingModel(input, head.config).fits(pairs)) {
      fail('Cặp không hợp lệ hoặc vượt sức chứa / hạn mức hướng dẫn', 409);
    }
    return saveRun(db, req, campaign.id, head.round, head.config, input, pairs);
  });
  res.status(201).json(run);
};

export const publish = async (req: Request, res: Response) => {
  manager(req);
  const id = uuid(req.params.runId, 'Lần chạy');
  const until = timestamp(req.body?.confirm_until, 'Hạn xác nhận');
  await thesisWrite(req, async (db, campaign) => {
    const existing = (
      await db.query(
        'SELECT published_at,config FROM matching_runs WHERE id=$1 AND campaign_id=$2',
        [id, campaign.id],
      )
    ).rows[0];
    if (existing?.published_at && existing.config.confirm_until === until) return;
    await openMatching(req, db, campaign);
    if (Date.parse(until) <= Date.now()) fail('Hạn xác nhận phải ở tương lai');
    const head = await draft(db, campaign, id);
    const input = await snapshot(db, campaign);
    if (!equivalent(input, head.input))
      fail('Dữ liệu đã đổi. Hãy chạy lại hoặc lưu điều chỉnh trước khi công bố.', 409);
    const pairs: Pair[] = head.result.pairs;
    const model = matchingModel(input, head.config);
    if (!pairs.length || !model.fits(pairs)) fail('Bản nháp chưa có cặp hợp lệ để công bố', 409);
    for (const p of pairs) {
      const supervisor = model.edge(p.group_id, p.topic_id)!.topic.supervisor_id;
      await db.query(
        `INSERT INTO matching_offers(run_id,campaign_id,group_id,topic_id,supervisor_id,method)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [
          id,
          campaign.id,
          p.group_id,
          p.topic_id,
          supervisor,
          p.manual ? 'MANUAL_MATCH' : head.config.algorithm,
        ],
      );
    }
    await db.query(
      `UPDATE matching_runs SET published_at=now(),config=config||jsonb_build_object('confirm_until',$2::text)
      WHERE id=$1`,
      [id, until],
    );
    await audit(db, req, 'PUBLISH_MATCH_RESULTS', 'matching_runs', id, null, {
      round: head.round,
      confirm_until: until,
      pairs: pairs.length,
    });
    await db.query(
      `INSERT INTO notifications(recipient_id,title,content,type,reference_type,reference_id,action_url)
       SELECT DISTINCT m.student_id,'Đã công bố kết quả ghép',$2,'MATCH_RESULT','matching_runs',$1::uuid,'#wishes'
       FROM matching_offers o JOIN group_members m ON m.group_id=o.group_id AND m.confirmation_status='CONFIRMED'
       WHERE o.run_id=$1`,
      [id, `Xem kết quả ghép vòng ${head.round} của đợt ${campaign.name}.`],
    );
  });
  res.json({ message: 'Đã công bố kết quả' });
};

export async function groupOffers(db: DB, id: string, group: string) {
  return (
    await db.query(
      `SELECT o.id,o.status,t.title_vi,u.full_name AS supervisor,r.round,r.published_at,
            r.config->>'confirm_until' AS confirm_until
     FROM matching_offers o JOIN matching_runs r ON r.id=o.run_id JOIN topics t ON t.id=o.topic_id
     JOIN users u ON u.id=o.supervisor_id WHERE o.campaign_id=$1 AND o.group_id=$2 AND r.published_at IS NOT NULL
     ORDER BY r.round DESC`,
      [id, group],
    )
  ).rows;
}

export const respond = async (req: Request, res: Response) => {
  if (req.user!.active_role !== 'STUDENT') fail('Chỉ trưởng nhóm được phản hồi', 403);
  const id = uuid(req.params.offerId, 'Kết quả');
  const decision = req.body?.decision;
  if (!['CONFIRMED', 'DECLINED'].includes(decision)) fail('Phản hồi không hợp lệ');
  await thesisWrite(req, async (db, campaign) => {
    const {
      rows: [offer],
    } = await db.query(
      `SELECT o.*,r.config->>'confirm_until' AS confirm_until FROM matching_offers o
       JOIN matching_runs r ON r.id=o.run_id JOIN student_groups g ON g.id=o.group_id
       WHERE o.campaign_id=$1 AND o.id=$2 AND g.leader_id=$3 AND r.published_at IS NOT NULL FOR UPDATE OF o`,
      [campaign.id, id, req.user!.sub],
    );
    if (!offer) fail('Không tìm thấy kết quả của nhóm bạn', 404);
    if (offer.status === decision) return;
    if (offer.status !== 'PENDING') fail('Kết quả đã được xử lý', 409);
    if (
      !['OPEN', 'IN_PROGRESS'].includes(campaign.status) ||
      Date.parse(offer.confirm_until) <= Date.now()
    ) {
      fail('Đã hết hạn xác nhận hoặc đợt đã đóng', 403);
    }
    if (decision === 'CONFIRMED') {
      // Include this offer while keeping other live offers reserved.
      const {
        rows: [reserved],
      } = await db.query(
        `SELECT count(DISTINCT o.id)::int AS topics,count(m.student_id)::int AS students FROM matching_offers o
         LEFT JOIN group_members m ON m.group_id=o.group_id AND m.confirmation_status='CONFIRMED'
         WHERE o.campaign_id=$1 AND o.supervisor_id=$2 AND o.status='PENDING' AND o.id<>$3`,
        [campaign.id, offer.supervisor_id, id],
      );
      const input = await snapshot(db, campaign, id);
      const candidate = matchingModel(input, { algorithm: 'SERIAL', criteria: ['CODE'] }).edge(
        offer.group_id,
        offer.topic_id,
      );
      if (!candidate || candidate.topic.supervisor_id !== offer.supervisor_id)
        fail('Nhóm hoặc đề tài không còn đủ điều kiện phân công', 409);
      const quota = await db.query(
        `UPDATE lecturer_quotas q SET current_assigned_students=current_assigned_students+$3
         WHERE q.campaign_id=$1 AND q.lecturer_id=$2 AND current_assigned_students+$3+$4<=max_students
           AND (SELECT count(*) FROM thesis_assignments a WHERE a.campaign_id=$1 AND a.supervisor_id=$2)+$5<max_topics`,
        [
          campaign.id,
          offer.supervisor_id,
          candidate.group.size,
          reserved.students,
          reserved.topics,
        ],
      );
      if (!quota.rowCount) fail('Không còn đủ hạn mức hướng dẫn', 409);
      const {
        rows: [assignment],
      } = await db.query(
        `INSERT INTO thesis_assignments(campaign_id,group_id,topic_id,supervisor_id,assignment_method,assigned_by)
         SELECT $1,$2,$3,$4,$5,created_by FROM matching_runs WHERE id=$6 RETURNING *`,
        [
          campaign.id,
          offer.group_id,
          offer.topic_id,
          offer.supervisor_id,
          offer.method,
          offer.run_id,
        ],
      );
      await db.query("UPDATE topics SET status='ASSIGNED',updated_at=now() WHERE id=$1", [
        offer.topic_id,
      ]);
      await db.query(
        `UPDATE topic_registrations SET status=CASE WHEN topic_id=$2 THEN 'AUTO_ASSIGNED'::registration_status_enum
          ELSE 'CANCELLED'::registration_status_enum END,responded_at=now()
         WHERE group_id=$1 AND status='PENDING_LECTURER'`,
        [offer.group_id, offer.topic_id],
      );
      await audit(
        db,
        req,
        'CONFIRM_THESIS_ASSIGNMENT',
        'thesis_assignments',
        assignment.id,
        null,
        assignment,
      );
    }
    await db.query(
      `UPDATE matching_offers SET status=$2,responded_at=now(),responded_by=$3 WHERE id=$1`,
      [id, decision, req.user!.sub],
    );
    await audit(
      db,
      req,
      'RESPOND_MATCH_RESULT',
      'matching_offers',
      id,
      { status: offer.status },
      { status: decision },
    );
  });
  res.json({ message: decision === 'CONFIRMED' ? 'Đã xác nhận đề tài' : 'Đã từ chối kết quả' });
};

export const expire = async (req: Request, res: Response) => {
  manager(req);
  const count = await thesisWrite(req, async (db, campaign) => {
    const { rowCount } = await db.query(
      `UPDATE matching_offers o SET status='EXPIRED',responded_at=now(),responded_by=$2
       FROM matching_runs r WHERE r.id=o.run_id AND o.campaign_id=$1 AND o.status='PENDING'
         AND (r.config->>'confirm_until')::timestamptz<=clock_timestamp()`,
      [campaign.id, req.user!.sub],
    );
    if (rowCount)
      await audit(db, req, 'EXPIRE_MATCH_RESULTS', 'campaigns', campaign.id, null, {
        expired: rowCount,
      });
    return rowCount;
  });
  res.json({ expired: count });
};
