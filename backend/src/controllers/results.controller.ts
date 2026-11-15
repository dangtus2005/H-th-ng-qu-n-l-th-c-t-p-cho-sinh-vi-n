import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import { audit } from '../utils/audit';
import { activeCampaign, reportPhases, withCampaign } from '../utils/academic';
import { campaignAccess, globalRole, integer } from '../utils/campaign-access';
import { fail, text, uuid } from '../utils/validation';
import { resultState } from '../utils/result-lock';

type DB = Pick<PoolClient, 'query'>;
const internshipSlots = ['INTERNSHIP_LECTURER', 'INTERNSHIP_MENTOR'];
function slots(type: string) {
  return [
    ...(type === 'INTERNSHIP' ? [] : reportPhases),
    ...(type === 'THESIS' ? [] : internshipSlots),
  ];
}
function manages(req: Request) {
  const { active_role, scope } = req.user!;
  return (
    globalRole(req) ||
    (active_role === 'FACULTY_MANAGER' && !scope.department_id && !scope.major_id)
  );
}
function manager(req: Request) {
  if (!manages(req)) fail('Chỉ quản lý toàn đợt được thao tác', 403);
}

async function summary(db: DB, c: any) {
  const {
    rows: [counts],
  } = await db.query(
    `SELECT (SELECT count(*)::int FROM student_groups WHERE campaign_id=$1) AS groups,
       (SELECT count(*)::int FROM thesis_assignments WHERE campaign_id=$1) AS matched,
       (SELECT count(*)::int FROM matching_offers WHERE campaign_id=$1 AND status='PENDING') AS awaiting_confirmation,
       (SELECT count(*)::int FROM internship_placements WHERE campaign_id=$1 AND status IN ('APPROVED','IN_PROGRESS','COMPLETED')) AS placements,
       (SELECT count(*)::int FROM internship_placements WHERE campaign_id=$1 AND status='PENDING_VERIFICATION') AS waiting_placements`,
    [c.id],
  );
  const { rows: reports } = await db.query(
    `WITH thesis AS (
      SELECT DISTINCT ON (s.assignment_id,s.milestone_id) s.milestone_id,s.is_late
      FROM submissions s JOIN thesis_assignments a ON a.id=s.assignment_id WHERE a.campaign_id=$1
      ORDER BY s.assignment_id,s.milestone_id,s.version_number DESC
    ), internship AS (
      SELECT DISTINCT ON (r.placement_id,r.milestone_id) r.milestone_id,r.late_minutes
      FROM internship_reports r JOIN internship_placements p ON p.id=r.placement_id
      WHERE p.campaign_id=$1 AND p.status IN ('APPROVED','IN_PROGRESS','COMPLETED')
      ORDER BY r.placement_id,r.milestone_id,r.version_number DESC
    )
    SELECT m.id,m.phase,m.title,m.end_at,m.start_at,
      (SELECT count(*)::int FROM thesis WHERE milestone_id=m.id) AS thesis_submitted,
      (SELECT count(*)::int FROM thesis WHERE milestone_id=m.id AND is_late) AS thesis_late,
      (SELECT count(*)::int FROM internship WHERE milestone_id=m.id) AS internship_submitted,
      (SELECT count(*)::int FROM internship WHERE milestone_id=m.id AND late_minutes>0) AS internship_late
    FROM campaign_milestones m WHERE m.campaign_id=$1 AND m.phase::text=ANY($2::text[])
    ORDER BY m.sequence_order,m.id`,
    [c.id, reportPhases],
  );
  return { ...counts, unmatched: counts.groups - counts.matched, reports };
}

async function previewScores(db: DB, id: string, weights: Record<string, number>) {
  const { rows } = await db.query(
    `WITH thesis_members AS (
      SELECT a.id AS assignment_id,g.student_id FROM thesis_assignments a
      JOIN group_members g ON g.group_id=a.group_id AND g.confirmation_status='CONFIRMED' WHERE a.campaign_id=$1
    ), placements AS (
      SELECT id AS placement_id,student_id FROM internship_placements WHERE campaign_id=$1
      AND status IN ('APPROVED','IN_PROGRESS','COMPLETED')
    ), expected AS (
      SELECT e.student_id FROM campaign_eligible_students e JOIN campaigns c ON c.id=e.campaign_id
      JOIN users u ON u.id=e.student_id AND u.is_active
      JOIN student_profiles st ON st.user_id=e.student_id JOIN majors m ON m.id=st.major_id
      JOIN departments d ON d.id=m.department_id AND d.faculty_id=c.faculty_id
      WHERE e.campaign_id=$1 AND e.status='ELIGIBLE'
        AND (c.major_id IS NULL OR c.major_id=st.major_id)
        AND (c.training_system IS NULL OR c.training_system=m.training_system)
        AND (NOT c.enforce_min_credits OR e.verified_credits>=c.min_credits_required)
        AND (c.prerequisite_note IS NULL OR e.verified_prerequisite=c.prerequisite_note)
      UNION SELECT student_id FROM thesis_members UNION SELECT student_id FROM placements
      UNION SELECT student_id FROM campaign_enrollments WHERE campaign_id=$1 AND NOT EXISTS (
        SELECT FROM campaign_eligible_students x WHERE x.campaign_id=$1 AND x.student_id=campaign_enrollments.student_id
          AND x.status IN ('DROPPED_OUT','DEFERRED','INELIGIBLE'))
    ), latest AS (
      SELECT DISTINCT ON (s.assignment_id,m.phase) s.id,s.assignment_id,m.phase,s.version_number
      FROM submissions s JOIN campaign_milestones m ON m.id=s.milestone_id AND m.campaign_id=$1
      JOIN thesis_assignments a ON a.id=s.assignment_id AND a.campaign_id=$1
      WHERE m.phase::text=ANY($2::text[]) ORDER BY s.assignment_id,m.phase,s.version_number DESC,s.id
    ), scores AS (
      SELECT tm.student_id,s.phase::text AS slot,g.total_score::float AS score,
        s.id AS source_id,s.version_number AS version,rt.name AS rubric
      FROM thesis_members tm JOIN latest s ON s.assignment_id=tm.assignment_id
      JOIN thesis_report_grades g ON g.submission_id=s.id AND g.student_id=tm.student_id
      JOIN rubric_templates rt ON rt.id=g.template_id
      UNION ALL
      SELECT p.student_id,g.evaluator_role,g.total_score::float,p.placement_id,NULL,rt.name
      FROM placements p JOIN internship_rubric_grades g ON g.placement_id=p.placement_id
      JOIN rubric_templates rt ON rt.id=g.template_id
    )
    SELECT u.id AS student_id,u.code,u.full_name,tm.assignment_id,p.placement_id,
      coalesce((SELECT jsonb_object_agg(s.slot,jsonb_build_object('score',s.score,'source_id',s.source_id,
        'version',s.version,'rubric',s.rubric)) FROM scores s WHERE s.student_id=u.id),'{}') AS scores
    FROM expected e JOIN users u ON u.id=e.student_id LEFT JOIN thesis_members tm ON tm.student_id=u.id
    LEFT JOIN placements p ON p.student_id=u.id ORDER BY u.code,u.id`,
    [id, reportPhases],
  );
  return rows.map((row) => {
    const { scores, ...rest } = row;
    const components = Object.entries(weights).map(([slot, weight]) => ({
      slot,
      weight,
      ...(scores[slot] ?? { score: null }),
    }));
    const complete = components.length > 0 && components.every((c) => c.score !== null);
    const score = complete
      ? Math.round(components.reduce((n, c) => n + Math.round(c.score * 100) * c.weight, 0) / 100) /
        100
      : null;
    return { ...rest, components, final_numeric_score: score };
  });
}

async function publishedGrades(db: DB, id: string, student: string | null = null) {
  return (
    await db.query(
      `SELECT f.id,f.student_id,u.code,u.full_name,f.components,f.final_numeric_score,f.is_final_locked,
       coalesce((SELECT json_agg(json_build_object('id',a.id,'status',a.status,'reason',a.reason,
        'old_score',a.old_score,'new_score',a.new_score,'resolution_note',a.resolution_note,'created_at',a.created_at)
        ORDER BY a.created_at DESC,a.id DESC) FROM grade_appeals a WHERE a.final_grade_id=f.id),'[]') AS appeals
     FROM final_grades f JOIN users u ON u.id=f.student_id WHERE f.campaign_id=$1 AND f.is_published
       AND ($2::uuid IS NULL OR f.student_id=$2) ORDER BY u.code,u.id`,
      [id, student],
    )
  ).rows;
}

export const list = async (req: Request, res: Response) => {
  const c = await campaignAccess(req, req.params.id);
  const state = await resultState(pool, c.id);
  if (!manages(req)) {
    if (req.user!.active_role !== 'STUDENT') fail('Không có quyền xem kết quả đợt', 403);
    return res.json({
      manager: false,
      locked: !!state?.locked_at,
      grades: await publishedGrades(pool, c.id, req.user!.sub),
    });
  }
  const weights = state?.weights ?? {};
  res.json({
    manager: true,
    slots: slots(c.type),
    state,
    weights,
    summary: await summary(pool, c),
    grades: state?.published_at
      ? await publishedGrades(pool, c.id)
      : await previewScores(pool, c.id, weights),
  });
};

export const weights = async (req: Request, res: Response) => {
  manager(req);
  const values = req.body?.weights;
  if (!values || typeof values !== 'object' || Array.isArray(values)) fail('Trọng số không hợp lệ');
  await withCampaign(req, async (db, c) => {
    const before = await resultState(db, c.id);
    if (before?.published_at || ['CLOSED', 'ARCHIVED'].includes(c.status))
      fail('Đợt đã công bố điểm hoặc đã đóng', 409);
    const entries = Object.entries(values).map(([slot, value]) => {
      if (!slots(c.type).includes(slot)) fail('Thành phần không thuộc loại đợt');
      return [slot, integer(value, 'Trọng số', 1, 100)] as const;
    });
    if (entries.reduce((n, [, w]) => n + w, 0) !== 100) fail('Tổng trọng số phải bằng 100%');
    await db.query(
      `INSERT INTO campaign_results(campaign_id,weights) VALUES($1,$2)
      ON CONFLICT(campaign_id) DO UPDATE SET weights=EXCLUDED.weights`,
      [c.id, Object.fromEntries(entries)],
    );
    await audit(
      db,
      req,
      'SET_RESULT_WEIGHTS',
      'campaigns',
      c.id,
      before?.weights ?? null,
      Object.fromEntries(entries),
    );
  });
  res.json({ message: 'Đã lưu trọng số' });
};

export const publish = async (req: Request, res: Response) => {
  manager(req);
  await withCampaign(req, async (db, c) => {
    const state = await resultState(db, c.id);
    if (state?.published_at) return;
    if (!activeCampaign(c.status) || !state) fail('Đợt cần mở và đã cấu hình trọng số', 409);
    if (
      (
        await db.query(
          `SELECT 1 FROM matching_offers WHERE campaign_id=$1 AND status='PENDING'
      UNION ALL SELECT 1 FROM internship_placements WHERE campaign_id=$1 AND status='PENDING_VERIFICATION' LIMIT 1`,
          [c.id],
        )
      ).rowCount
    )
      fail('Còn hồ sơ thực tập hoặc kết quả ghép đang chờ xử lý', 409);
    const rows = await previewScores(db, c.id, state.weights);
    if (!rows.length || rows.some((row) => row.final_numeric_score === null))
      fail('Còn sinh viên thiếu điểm thành phần. Xem bảng tổng kết để kiểm tra.', 409);
    if (
      (
        await db.query(
          'SELECT 1 FROM final_grades WHERE campaign_id=$1 AND (is_published OR is_final_locked) LIMIT 1',
          [c.id],
        )
      ).rowCount
    )
      fail('Đợt có điểm cũ đã công bố hoặc khóa. Cần kiểm tra dữ liệu trước khi công bố lại.', 409);
    const saved = rows.map((row) => ({
      student_id: row.student_id,
      assignment_id: row.assignment_id,
      placement_id: row.placement_id,
      components: row.components,
      score: row.final_numeric_score,
    }));
    await db.query(
      `INSERT INTO final_grades(campaign_id,student_id,assignment_id,placement_id,components,final_numeric_score,is_published,is_final_locked)
       SELECT $1,student_id,assignment_id,placement_id,components,score,true,false
       FROM jsonb_to_recordset($2::jsonb) AS x(student_id uuid,assignment_id uuid,placement_id uuid,components jsonb,score numeric)
       ON CONFLICT(campaign_id,student_id) DO UPDATE SET assignment_id=EXCLUDED.assignment_id,placement_id=EXCLUDED.placement_id,
        components=EXCLUDED.components,final_numeric_score=EXCLUDED.final_numeric_score,is_published=true,updated_at=now()`,
      [c.id, JSON.stringify(saved)],
    );
    await db.query('UPDATE campaign_results SET published_at=now() WHERE campaign_id=$1', [c.id]);
    await db.query(
      `INSERT INTO notifications(recipient_id,title,content,type,reference_type,reference_id,action_url)
      SELECT student_id,'Đã công bố điểm cuối đợt',$2,'FINAL_GRADE','final_grades',id,'#results'
      FROM final_grades WHERE campaign_id=$1 AND is_published`,
      [c.id, `Xem điểm và các thành phần của đợt ${c.name}.`],
    );
    await audit(db, req, 'PUBLISH_FINAL_GRADES', 'campaigns', c.id, null, {
      count: saved.length,
      weights: state.weights,
    });
  });
  res.json({ message: 'Đã công bố điểm' });
};

export const appeal = async (req: Request, res: Response) => {
  if (req.user!.active_role !== 'STUDENT') fail('Chỉ sinh viên gửi phúc khảo', 403);
  const reason = text(req.body?.reason, 'Lý do phúc khảo', 2000);
  await withCampaign(req, async (db, c) => {
    const state = await resultState(db, c.id);
    if (!state?.published_at || state.locked_at || !activeCampaign(c.status))
      fail('Đợt chưa nhận hoặc đã khóa phúc khảo', 409);
    const {
      rows: [grade],
    } = await db.query(
      'SELECT id,final_numeric_score FROM final_grades WHERE campaign_id=$1 AND student_id=$2 AND is_published AND NOT is_final_locked',
      [c.id, req.user!.sub],
    );
    if (!grade) fail('Không tìm thấy điểm đã công bố', 404);
    if (
      (
        await db.query("SELECT FROM grade_appeals WHERE final_grade_id=$1 AND status='PENDING'", [
          grade.id,
        ])
      ).rowCount
    )
      fail('Bạn đang có phúc khảo chờ xử lý', 409);
    const {
      rows: [saved],
    } = await db.query(
      'INSERT INTO grade_appeals(final_grade_id,student_id,reason,old_score) VALUES($1,$2,$3,$4) RETURNING *',
      [grade.id, req.user!.sub, reason, grade.final_numeric_score],
    );
    await audit(db, req, 'SUBMIT_GRADE_APPEAL', 'grade_appeals', saved.id, null, {
      final_grade_id: grade.id,
      old_score: grade.final_numeric_score,
    });
  });
  res.status(201).json({ message: 'Đã gửi phúc khảo' });
};

export const resolve = async (req: Request, res: Response) => {
  manager(req);
  const id = uuid(req.params.appealId, 'Phúc khảo');
  const decision = req.body?.decision;
  const score = req.body?.score;
  if (!['approve', 'reject'].includes(decision)) fail('Quyết định không hợp lệ');
  if (
    decision === 'approve' &&
    (typeof score !== 'number' ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 10 ||
      Math.abs(score * 100 - Math.round(score * 100)) > 1e-7)
  )
    fail('Điểm điều chỉnh từ 0 đến 10, tối đa hai số lẻ');
  const note = text(req.body?.note, 'Lý do xử lý', 2000);
  await withCampaign(req, async (db, c) => {
    const state = await resultState(db, c.id);
    if (!state?.published_at || state.locked_at || !activeCampaign(c.status))
      fail('Đợt chưa công bố hoặc đã khóa', 409);
    const {
      rows: [before],
    } = await db.query(
      `SELECT a.*,f.final_numeric_score FROM grade_appeals a JOIN final_grades f ON f.id=a.final_grade_id
       WHERE a.id=$1 AND f.campaign_id=$2 AND f.is_published AND NOT f.is_final_locked`,
      [id, c.id],
    );
    if (!before) fail('Không tìm thấy phúc khảo trong đợt', 404);
    if (before.status !== 'PENDING') fail('Phúc khảo đã xử lý', 409);
    const next = decision === 'approve' ? score : null;
    if (next !== null)
      await db.query(
        'UPDATE final_grades SET final_numeric_score=$2,updated_at=now() WHERE id=$1',
        [before.final_grade_id, next],
      );
    await db.query(
      `UPDATE grade_appeals SET status=$2,new_score=$3,resolution_note=$4,handled_by=$5,resolved_at=now()
      WHERE id=$1`,
      [id, decision === 'approve' ? 'APPROVED_FINAL' : 'REJECTED', next, note, req.user!.sub],
    );
    await db.query(
      `INSERT INTO notifications(recipient_id,title,content,type,reference_type,reference_id,action_url)
      VALUES($1,'Đã xử lý phúc khảo',$2,'GRADE_APPEAL','grade_appeals',$3,'#results')`,
      [before.student_id, note, id],
    );
    await audit(db, req, 'RESOLVE_GRADE_APPEAL', 'grade_appeals', id, before, {
      decision,
      new_score: next,
      note,
    });
  });
  res.json({ message: 'Đã xử lý phúc khảo' });
};

export const lock = async (req: Request, res: Response) => {
  manager(req);
  await withCampaign(req, async (db, c) => {
    const state = await resultState(db, c.id);
    if (state?.locked_at) return;
    if (!state?.published_at) fail('Cần công bố điểm trước khi chốt đợt', 409);
    if (
      (
        await db.query(
          `SELECT FROM grade_appeals a JOIN final_grades f ON f.id=a.final_grade_id
      WHERE f.campaign_id=$1 AND a.status='PENDING'`,
          [c.id],
        )
      ).rowCount
    )
      fail('Còn phúc khảo chờ xử lý', 409);
    await db.query(
      'UPDATE final_grades SET is_final_locked=true,updated_at=now() WHERE campaign_id=$1 AND is_published',
      [c.id],
    );
    await db.query("UPDATE campaigns SET status='CLOSED',updated_at=now() WHERE id=$1", [c.id]);
    await db.query('UPDATE campaign_results SET locked_at=now() WHERE campaign_id=$1', [c.id]);
    await audit(
      db,
      req,
      'LOCK_CAMPAIGN_RESULTS',
      'campaigns',
      c.id,
      { status: c.status },
      { status: 'CLOSED' },
    );
  });
  res.json({ message: 'Đã khóa điểm và đóng đợt' });
};

function csvCell(value: unknown) {
  const s = String(value ?? '');
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s) ? "'" + s : s;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export const exportCsv = async (req: Request, res: Response) => {
  manager(req);
  const c = await campaignAccess(req, req.params.id);
  if (req.query.report === 'progress') {
    const progress = await summary(pool, c);
    const rows = [
      ['Đợt', c.name],
      ['Đã có phân công', progress.matched],
      ['Chưa có phân công', progress.unmatched],
      ['Đang chờ xác nhận ghép', progress.awaiting_confirmation],
      ['Hồ sơ thực tập đã duyệt', progress.placements],
      ['Hồ sơ chờ duyệt', progress.waiting_placements],
      [],
      ['Mốc', 'Đồ án đã nộp', 'Đồ án nộp trễ', 'Thực tập đã nộp', 'Thực tập nộp trễ'],
      ...progress.reports.map((r: any) => [
        r.title,
        r.thesis_submitted,
        r.thesis_late,
        r.internship_submitted,
        r.internship_late,
      ]),
    ];
    return sendCsv(res, 'tien-do.csv', rows);
  }
  const state = await resultState(pool, c.id);
  const rows = state?.published_at
    ? await publishedGrades(pool, c.id)
    : await previewScores(pool, c.id, state?.weights ?? {});
  const keys = slots(c.type);
  const output = [
    [
      'Mã SV',
      'Họ tên',
      ...keys.flatMap((k) => [k + ' điểm', k + ' trọng số (%)']),
      'Điểm cuối',
      'Lý do điều chỉnh',
      'Trạng thái',
    ],
    ...rows.map((r) => [
      r.code,
      r.full_name,
      ...keys.flatMap((key) => {
        const cell = r.components?.find((c: any) => c.slot === key);
        return [cell?.score, cell?.weight];
      }),
      r.final_numeric_score,
      r.appeals?.find((a: any) => a.status === 'APPROVED_FINAL')?.resolution_note,
      state?.locked_at ? 'Đã khóa' : state?.published_at ? 'Đã công bố' : 'Dự kiến',
    ]),
  ];
  sendCsv(res, 'bang-diem.csv', output);
};

function sendCsv(res: Response, name: string, rows: unknown[][]) {
  res
    .attachment(name)
    .type('text/csv; charset=utf-8')
    .send('\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'));
}

export const activity = async (req: Request, res: Response) => {
  manager(req);
  const c = await campaignAccess(req, req.params.id);
  const { rows } = await pool.query(
    `SELECT a.action,a.created_at,u.full_name AS actor,a.entity_table,a.entity_id
     FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE
       (a.entity_table='campaigns' AND a.entity_id=$1 AND a.action IN ('SET_RESULT_WEIGHTS','PUBLISH_FINAL_GRADES','LOCK_CAMPAIGN_RESULTS'))
       OR (a.entity_table='matching_runs' AND EXISTS(SELECT FROM matching_runs r WHERE r.id=a.entity_id AND r.campaign_id=$1))
       OR (a.entity_table='matching_offers' AND EXISTS(SELECT FROM matching_offers o WHERE o.id=a.entity_id AND o.campaign_id=$1))
       OR (a.entity_table='thesis_assignments' AND EXISTS(SELECT FROM thesis_assignments t WHERE t.id=a.entity_id AND t.campaign_id=$1))
       OR (a.action='GRADE_THESIS_REPORT' AND EXISTS(SELECT FROM submissions s JOIN thesis_assignments t ON t.id=s.assignment_id
         WHERE s.id=a.entity_id AND t.campaign_id=$1))
       OR (a.action='GRADE_INTERNSHIP' AND EXISTS(SELECT FROM internship_placements p WHERE p.id=a.entity_id AND p.campaign_id=$1))
       OR (a.entity_table='grade_appeals' AND EXISTS(SELECT FROM grade_appeals q JOIN final_grades f ON f.id=q.final_grade_id
         WHERE q.id=a.entity_id AND f.campaign_id=$1))
     ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,
    [c.id],
  );
  res.json(rows);
};
