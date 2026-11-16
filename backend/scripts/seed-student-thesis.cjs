const assert = require('node:assert/strict');
const { id, pdf, insert } = require('./seed-demo.cjs');
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const day = 86400000;
const now = Date.now();
const at = (offset) => new Date(now + offset * day).toISOString();

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('qlth-student-thesis-demo'))");
    const campaign = (
      await client.query(
        "SELECT c.*,m.department_id FROM campaigns c JOIN majors m ON m.id=c.major_id WHERE c.code='DEMO_S3_KTPM' FOR UPDATE OF c",
      )
    ).rows[0];
    assert.ok(campaign, 'Missing DEMO_S3_KTPM campaign');
    assert.ok(['OPEN', 'IN_PROGRESS'].includes(campaign.status), 'Sample campaign must be open');
    const result = (
      await client.query('SELECT published_at FROM campaign_results WHERE campaign_id=$1', [
        campaign.id,
      ])
    ).rows[0];
    assert.ok(!result?.published_at, 'Sample campaign results are already published');
    const accounts = Object.fromEntries(
      (
        await client.query(
          `SELECT u.id,u.code,u.full_name,r.code AS role,ur.faculty_id,ur.department_id,p.major_id
       FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
       LEFT JOIN student_profiles p ON p.user_id=u.id WHERE u.is_active=true AND (
       (u.code IN ('SV001','SV_DEMO01') AND r.code='STUDENT') OR
       (u.code IN ('GV001','GV_DEMO01') AND r.code='LECTURER') OR
       (u.code='ADMIN01' AND r.code='SYSTEM_ADMIN'))`,
        )
      ).rows.map((row) => [row.code, row]),
    );
    for (const code of ['SV001', 'SV_DEMO01', 'GV001', 'GV_DEMO01', 'ADMIN01'])
      assert.ok(accounts[code], `Missing active account ${code}`);
    for (const code of ['SV001', 'SV_DEMO01', 'GV001', 'GV_DEMO01']) {
      assert.equal(accounts[code].faculty_id, campaign.faculty_id, `${code}: faculty mismatch`);
      assert.equal(
        accounts[code].department_id,
        campaign.department_id,
        `${code}: department mismatch`,
      );
    }
    for (const code of ['SV001', 'SV_DEMO01'])
      assert.equal(accounts[code].major_id, campaign.major_id, `${code}: major mismatch`);
    const phases = [
      ['DIRECTION_SELECTION', 'Chọn hướng và lập nhóm đồ án (mẫu)', 2],
      ['OUTLINE_SUBMISSION', 'Nộp đề cương đồ án (mẫu)', 6],
      ['MIDTERM_REPORT_1', 'Báo cáo giữa kỳ lần 1 (mẫu)', 7],
      ['MIDTERM_REPORT_2', 'Báo cáo giữa kỳ lần 2 (mẫu)', 8],
      ['FINAL_SUBMISSION', 'Nộp báo cáo cuối kỳ (mẫu)', 9],
    ];
    const milestones = {};
    for (const [phase, title, order] of phases) {
      const existing = (
        await client.query('SELECT id FROM campaign_milestones WHERE campaign_id=$1 AND phase=$2', [
          campaign.id,
          phase,
        ])
      ).rows[0];
      if (!existing)
        await insert(client, 'campaign_milestones', {
          id: id('student_thesis_milestone', phase),
          campaign_id: campaign.id,
          phase,
          title,
          start_at: at(-10),
          end_at: at(30),
          hard_deadline_at: at(35),
          sequence_order: order,
        });
      milestones[phase] = existing?.id || id('student_thesis_milestone', phase);
    }
    const summary = [];
    for (const [code, teacherCode, title] of [
      ['SV001', 'GV001', 'Hệ thống quản lý học tập và tiến độ đồ án (mẫu)'],
      ['SV_DEMO01', 'GV_DEMO01', 'Ứng dụng quản lý thư viện trực tuyến (mẫu)'],
    ]) {
      const student = accounts[code];
      const teacher = accounts[teacherCode];
      const groupId = id('student_thesis_group', code);
      const topicId = id('student_thesis_topic', code);
      const assignmentId = id('student_thesis_assignment', code);
      const group = (
        await client.query(
          "SELECT group_id FROM group_members WHERE campaign_id=$1 AND student_id=$2 AND confirmation_status='CONFIRMED'",
          [campaign.id, student.id],
        )
      ).rows[0];
      assert.ok(
        !group || group.group_id === groupId,
        `${code} already has another group; no data changed`,
      );
      await insert(client, 'student_groups', {
        id: groupId,
        campaign_id: campaign.id,
        leader_id: student.id,
        name: `Nhóm đồ án ${code} (mẫu)`,
        research_direction: 'Phát triển phần mềm',
        created_at: at(-7),
      });
      await insert(client, 'topics', {
        id: topicId,
        campaign_id: campaign.id,
        department_id: campaign.department_id,
        supervisor_id: teacher.id,
        proposed_by_id: student.id,
        source: 'STUDENT_PROPOSED',
        code: `DEMO_REPORT_${code}`,
        title_vi: title,
        description:
          'Dữ liệu mẫu để xem nhóm, đề tài được phân công và các phiên bản báo cáo đồ án.',
        objectives: 'Phân tích yêu cầu, xây dựng ứng dụng Web, kiểm thử và đánh giá sản phẩm.',
        required_skills: ['JavaScript', 'SQL'],
        technologies: ['Node.js', 'PostgreSQL'],
        research_field: 'Phát triển phần mềm',
        max_students: 1,
        status: 'ASSIGNED',
        supervisor_endorsed_at: at(-5),
        created_at: at(-7),
        updated_at: at(-4),
      });
      await insert(client, 'topic_approval_logs', {
        id: id('student_thesis_approval', code),
        topic_id: topicId,
        reviewer_id: teacher.id,
        previous_status: 'PENDING_APPROVAL',
        new_status: 'APPROVED',
        feedback_comment:
          'Dữ liệu mẫu: đồng ý đề cương và phân công hướng dẫn để thử báo cáo đồ án.',
        created_at: at(-5),
      });
      if (
        !(
          await client.query(
            'SELECT id FROM lecturer_quotas WHERE campaign_id=$1 AND lecturer_id=$2',
            [campaign.id, teacher.id],
          )
        ).rowCount
      ) {
        await insert(client, 'lecturer_quotas', {
          id: id('student_thesis_quota', teacherCode),
          campaign_id: campaign.id,
          lecturer_id: teacher.id,
          max_students: 10,
          max_topics: 5,
          current_assigned_students: 0,
        });
      }
      if (
        !(await client.query('SELECT id FROM thesis_assignments WHERE id=$1', [assignmentId]))
          .rowCount
      ) {
        const quota = await client.query(
          `UPDATE lecturer_quotas SET current_assigned_students=current_assigned_students+1
           WHERE campaign_id=$1 AND lecturer_id=$2 AND current_assigned_students<max_students
           AND (SELECT count(*) FROM thesis_assignments WHERE campaign_id=$1 AND supervisor_id=$2)<max_topics`,
          [campaign.id, teacher.id],
        );
        assert.equal(quota.rowCount, 1, `${teacherCode}: insufficient quota`);
        await insert(client, 'thesis_assignments', {
          id: assignmentId,
          campaign_id: campaign.id,
          group_id: groupId,
          topic_id: topicId,
          supervisor_id: teacher.id,
          assignment_method: 'MANUAL_MATCH',
          status: 'IN_PROGRESS',
          assigned_by: accounts.ADMIN01.id,
          assigned_at: at(-4),
        });
      }
      for (const [phase, version, days, note, feedback, approved] of [
        [
          'OUTLINE_SUBMISSION',
          1,
          -3,
          'Đề cương bản đầu: yêu cầu và phạm vi đề tài.',
          'Dữ liệu mẫu: cần bổ sung sơ đồ dữ liệu và kế hoạch kiểm thử.',
          false,
        ],
        [
          'OUTLINE_SUBMISSION',
          2,
          -2,
          'Đề cương đã bổ sung sơ đồ dữ liệu và kế hoạch kiểm thử.',
          'Dữ liệu mẫu: đề cương đã đáp ứng yêu cầu, tiếp tục triển khai.',
          true,
        ],
        [
          'MIDTERM_REPORT_1',
          1,
          -1,
          'Báo cáo giữa kỳ: đã hoàn thành phân tích và các chức năng cơ bản.',
          'Dữ liệu mẫu: tiếp tục hoàn thiện chức năng và bổ sung kết quả kiểm thử.',
          null,
        ],
      ]) {
        const key = `${code}:${phase}:${version}`;
        const submissionId = id('student_thesis_submission', key);
        await insert(client, 'submissions', {
          id: submissionId,
          assignment_id: assignmentId,
          milestone_id: milestones[phase],
          submitted_by: student.id,
          version_number: version,
          description: 'Dữ liệu mẫu: ' + note,
          is_late: false,
          late_minutes: 0,
          submitted_at: at(days),
        });
        const bytes = pdf(`${code} - ${phase} - version ${version}`);
        await client.query(
          'INSERT INTO thesis_report_files(submission_id,original_name,content) VALUES ($1,$2,$3) ON CONFLICT(submission_id) DO NOTHING',
          [submissionId, `DEMO-${code}-${phase}-v${version}.pdf`, bytes],
        );
        await insert(client, 'submission_feedbacks', {
          id: id('student_thesis_feedback', key),
          submission_id: submissionId,
          author_id: teacher.id,
          content: feedback,
          is_approved_milestone: approved,
          created_at: at(days + 0.25),
        });
      }
      const member = (
        await client.query(
          'SELECT confirmation_status FROM group_members WHERE group_id=$1 AND student_id=$2',
          [groupId, student.id],
        )
      ).rows[0];
      assert.equal(
        member?.confirmation_status,
        'CONFIRMED',
        'Group leader must be a confirmed member',
      );
      const reports = (
        await client.query(
          'SELECT count(*)::int AS n FROM submissions s JOIN thesis_report_files f ON f.submission_id=s.id WHERE s.assignment_id=$1 AND s.id=ANY($2::uuid[])',
          [
            assignmentId,
            ['OUTLINE_SUBMISSION:1', 'OUTLINE_SUBMISSION:2', 'MIDTERM_REPORT_1:1'].map((key) =>
              id('student_thesis_submission', `${code}:${key}`),
            ),
          ],
        )
      ).rows[0];
      assert.equal(reports.n, 3, 'Each sample assignment needs three downloadable reports');
      summary.push({
        student: code,
        teacher: teacherCode,
        group: `Nhóm đồ án ${code} (mẫu)`,
        reports: reports.n,
      });
    }
    await client.query('COMMIT');
    console.table(summary);
    console.log(
      'Ready in DEMO_S3_KTPM. Existing passwords, roles and previous proposals preserved. Re-running does not reset reports or decisions.',
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
