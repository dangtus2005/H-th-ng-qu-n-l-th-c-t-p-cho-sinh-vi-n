const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { app } = require('../dist/server');
const { pool } = require('../dist/config/db');

const prefix = 's3t_' + randomUUID().replace(/-/g, '').slice(0, 10);
const password = 'Sprint3-test!123';
const ids = {
  faculty: randomUUID(),
  department: randomUUID(),
  otherDepartment: randomUUID(),
  major: randomUUID(),
  otherMajor: randomUUID(),
  academicYear: randomUUID(),
  semester: randomUUID(),
  campaign: randomUUID(),
};
const users = [];
const topics = [];
let server;
let base;
let assertions = 0;

function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions++;
}

async function call(route, token, body, expected = 200, method) {
  const response = await fetch(`${base}/api/v1${route}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  check(response.status, expected, `${route}: ${JSON.stringify(data)}`);
  return data;
}

async function createUser(suffix, roleSpecs) {
  const id = randomUUID();
  const email = `${prefix}_${suffix}@example.invalid`;
  users.push(id);
  await pool.query(
    'INSERT INTO users (id,code,email,full_name,password_hash,is_active) VALUES ($1,$2,$3,$4,$5,true)',
    [id, `${prefix}_${suffix}`, email, `Sprint 3 ${suffix}`, await bcrypt.hash(password, 10)],
  );
  const roleIds = {};
  for (const role of roleSpecs) {
    const result = await pool.query(
      `INSERT INTO user_roles
        (user_id,role_id,faculty_id,department_id,major_id,campaign_id,is_default)
       SELECT $1,id,$3,$4,$5,$6,$7 FROM roles WHERE code=$2 RETURNING id`,
      [
        id,
        role.code,
        role.facultyId || null,
        role.departmentId || null,
        role.majorId || null,
        role.campaignId || null,
        role.isDefault,
      ],
    );
    assert.equal(result.rowCount, 1, `Missing role ${role.code}`);
    roleIds[role.code] = result.rows[0].id;
  }
  const login = await call('/auth/login', null, { email, password }, 200, 'POST');
  return { id, token: login.access_token, login, roleIds };
}

const topicBody = (title) => ({
  title_vi: title,
  title_en: 'Topic title',
  description: 'A focused proposal description.',
  objectives: 'Validate the proposed approach.',
  required_skills: ['PostgreSQL'],
  technologies: ['Node.js'],
  research_field: 'Software engineering',
  max_students: 2,
});

const topicRoute = (suffix = '') => `/topic-workflow/campaigns/${ids.campaign}/topics${suffix}`;

async function setMilestone(phase, startAt, endAt, locked = null) {
  await pool.query(
    `UPDATE campaign_milestones
     SET start_at=$1,end_at=$2,is_locked_override=$3
     WHERE campaign_id=$4 AND phase=$5`,
    [startAt, endAt, locked, ids.campaign, phase],
  );
}

async function seed() {
  await pool.query('INSERT INTO faculties (id,code,name) VALUES ($1,$2,$3)', [
    ids.faculty,
    `${prefix}_faculty`,
    'Sprint 3 test faculty',
  ]);
  await pool.query(
    `INSERT INTO departments (id,code,name,faculty_id)
     VALUES ($1,$2,$3,$4),($5,$6,$7,$4)`,
    [
      ids.department,
      `${prefix}_department`,
      'Sprint 3 test department',
      ids.faculty,
      ids.otherDepartment,
      `${prefix}_other_department`,
      'Sprint 3 other department',
    ],
  );
  await pool.query(
    `INSERT INTO majors (id,department_id,code,name)
     VALUES ($1,$2,$3,$4),($5,$6,$7,$8)`,
    [
      ids.major,
      ids.department,
      `${prefix}_major`,
      'Sprint 3 test major',
      ids.otherMajor,
      ids.otherDepartment,
      `${prefix}_other_major`,
      'Sprint 3 other major',
    ],
  );
  await pool.query(
    'INSERT INTO academic_years (id,code,start_year,end_year) VALUES ($1,$2,2092,2093)',
    [ids.academicYear, prefix],
  );
  await pool.query(
    `INSERT INTO semesters
      (id,academic_year_id,code,name,start_date,end_date,is_current)
     VALUES ($1,$2,$3,'Học kỳ 1','2092-01-01','2092-06-01',false)`,
    [ids.semester, ids.academicYear, prefix],
  );
  await pool.query(
    `INSERT INTO campaigns
      (id,semester_id,faculty_id,major_id,code,name,type,status,max_students_per_topic)
     VALUES ($1,$2,$3,$4,$5,'Sprint 3 topic campaign','THESIS','IN_PROGRESS',3)`,
    [ids.campaign, ids.semester, ids.faculty, ids.major, prefix],
  );
  const start = new Date(Date.now() - 60 * 60 * 1000);
  const end = new Date(Date.now() + 60 * 60 * 1000);
  for (const [phase, order] of [
    ['TOPIC_SUBMISSION', 0],
    ['TOPIC_APPROVAL', 1],
  ]) {
    await pool.query(
      `INSERT INTO campaign_milestones
        (campaign_id,phase,title,start_at,end_at,sequence_order)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ids.campaign, phase, phase, start, end, order],
    );
  }

  const lecturer = await createUser('_lecturer', [
    {
      code: 'LECTURER',
      facultyId: ids.faculty,
      departmentId: ids.department,
      isDefault: true,
    },
    {
      code: 'DEPT_HEAD',
      facultyId: ids.faculty,
      departmentId: ids.department,
      isDefault: false,
    },
  ]);
  await pool.query('INSERT INTO lecturer_profiles (user_id,department_id) VALUES ($1,$2)', [
    lecturer.id,
    ids.department,
  ]);

  const otherLecturer = await createUser('_other_lecturer', [
    {
      code: 'LECTURER',
      facultyId: ids.faculty,
      departmentId: ids.otherDepartment,
      isDefault: true,
    },
  ]);
  await pool.query('INSERT INTO lecturer_profiles (user_id,department_id) VALUES ($1,$2)', [
    otherLecturer.id,
    ids.otherDepartment,
  ]);

  const departmentHead = await createUser('_department_head', [
    {
      code: 'DEPT_HEAD',
      facultyId: ids.faculty,
      departmentId: ids.department,
      isDefault: true,
    },
  ]);
  const otherDepartmentHead = await createUser('_other_head', [
    {
      code: 'DEPT_HEAD',
      facultyId: ids.faculty,
      departmentId: ids.otherDepartment,
      isDefault: true,
    },
  ]);
  const facultyManager = await createUser('_faculty_manager', [
    { code: 'FACULTY_MANAGER', facultyId: ids.faculty, isDefault: true },
  ]);
  const training = await createUser('_training', [{ code: 'TRAINING_DEPT', isDefault: true }]);
  const admin = await createUser('_admin', [{ code: 'SYSTEM_ADMIN', isDefault: true }]);
  const student = await createUser('_student', [
    {
      code: 'STUDENT',
      facultyId: ids.faculty,
      departmentId: ids.department,
      majorId: ids.major,
      campaignId: ids.campaign,
      isDefault: true,
    },
  ]);
  await pool.query('INSERT INTO student_profiles (user_id,major_id) VALUES ($1,$2)', [
    student.id,
    ids.major,
  ]);
  await pool.query(
    `INSERT INTO campaign_eligible_students (campaign_id,student_id,status)
     VALUES ($1,$2,'ELIGIBLE')`,
    [ids.campaign, student.id],
  );
  const ineligibleStudent = await createUser('_ineligible_student', [
    {
      code: 'STUDENT',
      facultyId: ids.faculty,
      departmentId: ids.department,
      majorId: ids.major,
      campaignId: ids.campaign,
      isDefault: true,
    },
  ]);
  await pool.query('INSERT INTO student_profiles (user_id,major_id) VALUES ($1,$2)', [
    ineligibleStudent.id,
    ids.major,
  ]);
  await pool.query(
    `INSERT INTO campaign_eligible_students (campaign_id,student_id,status)
     VALUES ($1,$2,'INELIGIBLE')`,
    [ids.campaign, ineligibleStudent.id],
  );

  return {
    lecturer,
    otherLecturer,
    departmentHead,
    otherDepartmentHead,
    facultyManager,
    training,
    admin,
    student,
    ineligibleStudent,
  };
}

async function cleanup() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.query(
    'DELETE FROM audit_logs WHERE actor_id=ANY($1::uuid[]) OR entity_id=ANY($2::uuid[])',
    [users, topics],
  );
  await pool.query('DELETE FROM notifications WHERE recipient_id=ANY($1::uuid[])', [users]);
  await pool.query('DELETE FROM matching_offers WHERE campaign_id=$1', [ids.campaign]);
  await pool.query('DELETE FROM thesis_assignments WHERE campaign_id=$1', [ids.campaign]);
  await pool.query('DELETE FROM matching_runs WHERE campaign_id=$1', [ids.campaign]);
  await pool.query('DELETE FROM topic_registrations WHERE campaign_id=$1', [ids.campaign]);
  await pool.query('DELETE FROM student_groups WHERE campaign_id=$1', [ids.campaign]);
  await pool.query('DELETE FROM topics WHERE campaign_id=$1', [ids.campaign]);
  await pool.query('DELETE FROM user_roles WHERE user_id=ANY($1::uuid[])', [users]);
  await pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])', [users]);
  await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users]);
  await pool.query('DELETE FROM campaigns WHERE id=$1', [ids.campaign]);
  await pool.query('DELETE FROM semesters WHERE id=$1', [ids.semester]);
  await pool.query('DELETE FROM academic_years WHERE id=$1', [ids.academicYear]);
  await pool.query('DELETE FROM majors WHERE id=ANY($1::uuid[])', [[ids.major, ids.otherMajor]]);
  await pool.query('DELETE FROM departments WHERE id=ANY($1::uuid[])', [
    [ids.department, ids.otherDepartment],
  ]);
  await pool.query('DELETE FROM faculties WHERE id=$1', [ids.faculty]);
  await pool.end();
}

async function run() {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const fixtures = await seed();
  const {
    lecturer,
    otherLecturer,
    departmentHead,
    otherDepartmentHead,
    facultyManager,
    training,
    admin,
    student,
    ineligibleStudent,
  } = fixtures;

  await call(topicRoute(), null, null, 401);
  await call(topicRoute(), student.token, topicBody('Student proposal'), 403);
  await pool.query('UPDATE campaigns SET allow_student_propose_topic=false WHERE id=$1', [
    ids.campaign,
  ]);
  await call(
    `/campaigns/${ids.campaign}/topics`,
    student.token,
    {
      ...topicBody('Student proposal'),
      required_skills: 'PostgreSQL',
      technologies: 'Node.js',
      supervisor_id: lecturer.id,
    },
    403,
  );
  check(
    (await call(`/campaigns/${ids.campaign}/gate?phase=TOPIC_SUBMISSION`, student.token, null))
      .allowed,
    false,
    'Students cannot submit when the campaign disables proposals',
  );
  await pool.query('UPDATE campaigns SET allow_student_propose_topic=true WHERE id=$1', [
    ids.campaign,
  ]);
  await call(topicRoute(), otherLecturer.token, topicBody('Out-of-scope proposal'), 403);
  await call(topicRoute(), lecturer.token, { ...topicBody('Invalid proposal'), title_vi: '' }, 400);

  const future = new Date(Date.now() + 60 * 60 * 1000);
  const later = new Date(Date.now() + 2 * 60 * 60 * 1000);
  await setMilestone('TOPIC_SUBMISSION', future, later);
  await call(topicRoute(), lecturer.token, topicBody('Submission is closed'), 403);
  const start = new Date(Date.now() - 60 * 1000);
  const end = new Date(Date.now() + 60 * 60 * 1000);
  await setMilestone('TOPIC_SUBMISSION', start, end);

  const first = await call(topicRoute(), lecturer.token, topicBody('Đề tài được duyệt'), 201);
  topics.push(first.id);
  check(first.status, 'PENDING_APPROVAL');
  check(first.source, 'LECTURER_PROPOSED');
  check(first.supervisor_id, lecturer.id);
  const second = await call(topicRoute(), lecturer.token, topicBody('Đề tài bị từ chối'), 201);
  topics.push(second.id);
  const third = await call(topicRoute(), lecturer.token, topicBody('Đề tài phòng đào tạo'), 201);
  topics.push(third.id);
  const fourth = await call(topicRoute(), lecturer.token, topicBody('Đề tài quản trị'), 201);
  topics.push(fourth.id);
  const fifth = await call(
    topicRoute(),
    lecturer.token,
    topicBody('Đề tài ngoài cửa sổ duyệt'),
    201,
  );
  topics.push(fifth.id);

  const pendingForHead = await call(topicRoute('/pending'), departmentHead.token, null);
  check(
    pendingForHead.map((topic) => topic.id).sort(),
    [first.id, second.id, third.id, fourth.id, fifth.id].sort(),
  );
  await call(topicRoute('/pending'), student.token, null, 403);
  await call(topicRoute('/pending'), otherDepartmentHead.token, null, 403);
  check(await call(topicRoute(), student.token, null), []);
  await call(topicRoute(), ineligibleStudent.token, null, 403);
  await call(
    topicRoute(`/${first.id}/decision`),
    lecturer.token,
    { decision: 'APPROVED' },
    403,
    'PATCH',
  );
  const headRole = lecturer.login.available_roles.find((role) => role.role_code === 'DEPT_HEAD');
  const switched = await call(
    '/auth/switch-role',
    lecturer.token,
    { user_role_id: headRole.user_role_id },
    200,
  );
  check(
    (await call(topicRoute('/pending'), switched.access_token, null))
      .map((topic) => topic.id)
      .sort(),
    [],
    'Authors do not see their own submissions in the review queue',
  );
  await call(
    topicRoute(`/${first.id}/decision`),
    switched.access_token,
    { decision: 'APPROVED' },
    403,
    'PATCH',
  );
  await call(
    topicRoute(`/${first.id}/decision`),
    otherDepartmentHead.token,
    { decision: 'APPROVED' },
    403,
    'PATCH',
  );
  await call(
    topicRoute(`/${second.id}/decision`),
    facultyManager.token,
    { decision: 'INVALID' },
    400,
    'PATCH',
  );

  const approved = await call(
    topicRoute(`/${first.id}/decision`),
    departmentHead.token,
    { decision: 'APPROVED' },
    200,
    'PATCH',
  );
  check(approved.status, 'APPROVED');
  const rejected = await call(
    topicRoute(`/${second.id}/decision`),
    facultyManager.token,
    { decision: 'REJECTED', feedback_comment: 'Cần thu hẹp phạm vi đề tài.' },
    200,
    'PATCH',
  );
  check(rejected.status, 'REJECTED');

  await setMilestone('TOPIC_APPROVAL', future, later);
  await call(topicRoute('/pending'), training.token, null, 403);
  await call(
    topicRoute(`/${third.id}/decision`),
    training.token,
    { decision: 'APPROVED' },
    403,
    'PATCH',
  );
  await setMilestone('TOPIC_APPROVAL', start, end);
  await setMilestone('TOPIC_APPROVAL', start, end, true);
  await call(topicRoute('/pending'), training.token, null, 403);
  await call(
    topicRoute(`/${third.id}/decision`),
    training.token,
    { decision: 'APPROVED' },
    403,
    'PATCH',
  );
  await setMilestone('TOPIC_APPROVAL', start, end);

  await call(
    topicRoute(`/${third.id}/decision`),
    training.token,
    { decision: 'APPROVED' },
    200,
    'PATCH',
  );
  await call(
    topicRoute(`/${fourth.id}/decision`),
    admin.token,
    { decision: 'APPROVED' },
    200,
    'PATCH',
  );
  await call(
    topicRoute(`/${first.id}/decision`),
    departmentHead.token,
    { decision: 'APPROVED' },
    409,
    'PATCH',
  );

  const visible = await call(topicRoute(), student.token, null);
  check(
    visible.map((topic) => topic.id).sort(),
    [first.id, third.id, fourth.id].sort(),
    'Only approved proposals in this campaign are visible',
  );
  check(
    (await call(`/campaigns/${ids.campaign}/topics`, student.token, null)).topics
      .map((topic) => topic.id)
      .sort(),
    [first.id, third.id, fourth.id].sort(),
    'The legacy topic page only shows approved proposals to students',
  );
  check(
    (await call(topicRoute('/pending'), training.token, null)).map((topic) => topic.id),
    [fifth.id],
    'Review queue contains only pending proposals',
  );
  await call(`/topic-workflow/campaigns/${randomUUID()}/topics`, student.token, null, 404);
  const history = await pool.query(
    'SELECT previous_status,new_status,feedback_comment FROM topic_approval_logs WHERE topic_id=$1',
    [second.id],
  );
  check(history.rows.length, 1);
  check(history.rows[0].previous_status, 'PENDING_APPROVAL');
  check(history.rows[0].new_status, 'REJECTED');
  check(history.rows[0].feedback_comment, 'Cần thu hẹp phạm vi đề tài.');
  check(
    (
      await pool.query(
        'SELECT count(*)::int AS count FROM topic_approval_logs WHERE topic_id=ANY($1::uuid[])',
        [[first.id, third.id, fourth.id]],
      )
    ).rows[0].count,
    3,
    'Each approval is logged',
  );
  lecturer.token = (
    await call('/auth/switch-role', switched.access_token, {
      user_role_id: lecturer.roleIds.LECTURER,
    })
  ).access_token;
  await completeWorkflow(fixtures);
  if (process.argv.includes('--browser')) {
    await require('./sprint3-ui.cjs')({ base, campaignId: ids.campaign, student, lecturer });
  }
  console.log(`Sprint 3 topic workflow: ${assertions} assertions passed`);
}

async function completeWorkflow({ lecturer, student, ineligibleStudent: second, admin }) {
  const root = `/campaigns/${ids.campaign}`;
  const topicPath = root + '/topics';
  const start = new Date(Date.now() - 3600000);
  const end = new Date(Date.now() + 3600000);
  await setMilestone('TOPIC_APPROVAL', start, end);
  for (const phase of ['DIRECTION_SELECTION', 'WISH_REGISTRATION', 'MATCHING']) {
    await pool.query(
      'INSERT INTO campaign_milestones(campaign_id,phase,title,start_at,end_at,sequence_order) VALUES ($1,$2::milestone_phase_enum,$2::text,$3,$4,3)',
      [ids.campaign, phase, start, end],
    );
  }
  const colleague = await createUser('_colleague', [
    { code: 'LECTURER', facultyId: ids.faculty, departmentId: ids.department, isDefault: true },
  ]);
  const proposal = (title) => ({
    title_vi: title,
    description: 'Phần mềm quản lý sách và mượn trả.',
    research_field: 'Thư viện',
    max_students: 2,
    required_skills: 'SQL',
    technologies: 'Node.js',
    supervisor_id: lecturer.id,
  });
  await call(topicPath, second.token, proposal('Chưa đủ điều kiện'), 403);
  await pool.query(
    "UPDATE campaign_eligible_students SET status='ELIGIBLE' WHERE campaign_id=$1 AND student_id=$2",
    [ids.campaign, second.id],
  );
  const first = await call(topicPath, student.token, proposal('Ứng dụng thư viện thông minh'), 201);
  const duplicate = await call(
    topicPath,
    second.token,
    proposal('UNG DUNG THU VIEN THONG MINH'),
    201,
  );
  const backup = await call(
    topicPath,
    student.token,
    proposal('Phân loại cây trồng bằng ảnh'),
    201,
  );
  topics.push(first.id, duplicate.id, backup.id);
  const review = (id) => `${topicPath}/${id}/review`;
  const queue = await call(topicPath, lecturer.token);
  check(
    queue.topics.find((t) => t.id === first.id).can_review,
    true,
    'Lecturer has final approval in the UI',
  );
  await call(review(first.id), colleague.token, { decision: 'approve' }, 403);
  await call(review(first.id), student.token, { decision: 'approve' }, 403);
  const similarity = await call(`${topicPath}/${first.id}/similar`, lecturer.token);
  check(similarity.find((t) => t.id === duplicate.id).score, 100);
  await call(review(first.id), lecturer.token, { decision: 'reject', feedback: ' ' }, 400);
  await call(review(first.id), lecturer.token, {
    decision: 'revise',
    feedback: 'Bổ sung mục tiêu kiểm thử.',
  });
  const feedback = (await call(topicPath, student.token)).topics.find((t) => t.id === first.id);
  check(feedback.feedback, 'Bổ sung mục tiêu kiểm thử.');
  check(feedback.can_edit, true);
  await call(
    `${topicPath}/${first.id}`,
    student.token,
    { ...proposal(first.title_vi), objectives: 'Kiểm thử các chức năng mượn trả.' },
    200,
    'PATCH',
  );
  await setMilestone('TOPIC_APPROVAL', start, end, true);
  await call(review(first.id), lecturer.token, { decision: 'approve' }, 403);
  await setMilestone('TOPIC_APPROVAL', start, end);
  await call(review(first.id), lecturer.token, { decision: 'approve' });
  await call(
    review(first.id),
    lecturer.token,
    { decision: 'reject', feedback: 'Không được duyệt lại' },
    409,
  );
  await call(`${topicPath}/${first.id}`, student.token, proposal(first.title_vi), 409, 'PATCH');
  await pool.query('UPDATE topics SET co_supervisor_id=$2 WHERE id=$1', [
    duplicate.id,
    colleague.id,
  ]);
  check(
    (await call(topicPath, colleague.token)).topics.find((t) => t.id === duplicate.id).can_review,
    true,
    'Co-supervisor can approve assigned proposals',
  );
  await call(review(duplicate.id), colleague.token, { decision: 'approve' });
  await call(review(backup.id), admin.token, { decision: 'approve' });
  const own = await call(topicPath, lecturer.token, proposal('Đề tài giảng viên tự đề xuất'), 201);
  topics.push(own.id);
  check(
    (await call(topicPath, lecturer.token)).topics.find((t) => t.id === own.id).can_review,
    false,
  );
  await call(review(own.id), lecturer.token, { decision: 'approve' }, 403);
  await call(review(own.id), admin.token, { decision: 'reject', feedback: 'Bản ghi kiểm thử.' });
  const archive = await call(
    '/topic-archive?year=2092&direction=' + encodeURIComponent('Thư viện'),
    student.token,
  );
  check(
    archive.some((t) => t.id === first.id),
    true,
  );
  check(
    archive.some((t) => t.id === own.id),
    false,
  );
  const campaigns = await call('/master-data/campaigns', student.token);
  const campaign = campaigns.find((c) => c.id === ids.campaign);
  check(campaign.academic_year_start, 2092);
  check(campaign.academic_year_end, 2093);
  const { campaignLabel } = await import(
    'data:text/javascript;base64,' +
      require('node:fs')
        .readFileSync(require('node:path').join(__dirname, '../../frontend/src/ui.js'))
        .toString('base64')
  );
  check(campaignLabel(campaign).includes('2092–2093'), true);
  check(
    campaignLabel({
      name: 'Đồ án',
      semester_name: 'Học kỳ 1 (2026–2027)',
      academic_year_start: 2026,
      academic_year_end: 2027,
    }),
    'Học kỳ 1 (2026–2027) · Đồ án',
  );
  const groupA = await call(
    root + '/groups',
    student.token,
    { name: 'Nhóm A', research_direction: 'Thư viện' },
    201,
  );
  const groupB = await call(
    root + '/groups',
    second.token,
    { name: 'Nhóm B', research_direction: 'Thư viện' },
    201,
  );
  const groupPath = (group) => `${root}/wish-groups/${group.id}`;
  const wish = (group, actor, topic, priority) =>
    call(
      groupPath(group) + '/registrations',
      actor.token,
      { topic_id: topic.id, priority_order: priority },
      201,
    );
  const wishA = await wish(groupA, student, first, 1);
  await wish(groupA, student, backup, 2);
  const wishB = await wish(groupB, second, first, 1);
  await wish(groupB, second, duplicate, 2);
  await call(groupPath(groupA), second.token, null, 404);
  await call(
    groupPath(groupA) + '/registrations',
    student.token,
    { topic_id: duplicate.id, priority_order: 1 },
    409,
  );
  const current = await call(groupPath(groupA), student.token);
  const expected = current.registrations.map((r) => [
    r.id,
    r.priority_order,
    r.student_note,
    r.status,
  ]);
  await call(
    groupPath(groupA) + '/registrations',
    student.token,
    {
      expected,
      registrations: current.registrations.map((r) => ({
        topic_id: r.topic_id,
        priority_order: r.priority_order,
        student_note: r.student_note,
      })),
    },
    200,
    'PUT',
  );
  await pool.query(
    'INSERT INTO lecturer_quotas(campaign_id,lecturer_id,max_students,max_topics) VALUES ($1,$2,2,2)',
    [ids.campaign, lecturer.id],
  );
  const settings = { algorithm: 'GALE_SHAPLEY_GROUP', criteria: ['LECTURER_RANK', 'CODE'] };
  await call(root + '/matching-runs', admin.token, settings, 403);
  await setMilestone(
    'WISH_REGISTRATION',
    new Date(Date.now() - 7200000),
    new Date(Date.now() - 1000),
  );
  await call(
    groupPath(groupA) + '/registrations',
    student.token,
    { topic_id: duplicate.id, priority_order: 3 },
    403,
  );
  await call(`${root}/lecturer-wishes/${wishA.id}/rank`, lecturer.token, { rank: 2 }, 200, 'PUT');
  await call(`${root}/lecturer-wishes/${wishB.id}/rank`, lecturer.token, { rank: 1 }, 200, 'PUT');
  await call(root + '/matching-runs', student.token, settings, 403);
  const run = await call(root + '/matching-runs', admin.token, settings, 201);
  check(run.result.pairs.length, 2);
  check(run.result.pairs.find((p) => p.group_id === groupB.id).topic_id, first.id);
  const confirmUntil = new Date(Date.now() + 3600000).toISOString();
  await call(`${root}/matching-runs/${run.id}/publish`, admin.token, {
    confirm_until: confirmUntil,
  });
  const offersA = (await call(groupPath(groupA), student.token)).offers;
  const offersB = (await call(groupPath(groupB), second.token)).offers;
  check(offersA.length, 1);
  check(offersB.length, 1);
  const offerPath = (id) => `${root}/matching-offers/${id}`;
  await call(offerPath(offersA[0].id), second.token, { decision: 'CONFIRMED' }, 404, 'PATCH');
  await call(offerPath(offersA[0].id), student.token, { decision: 'CONFIRMED' }, 200, 'PATCH');
  await call(offerPath(offersA[0].id), student.token, { decision: 'CONFIRMED' }, 200, 'PATCH');
  await call(offerPath(offersB[0].id), second.token, { decision: 'DECLINED' }, 200, 'PATCH');
  const assigned = (await call(groupPath(groupA), student.token)).assignment;
  check(assigned.topic_id, backup.id);
  const assignments = (
    await pool.query('SELECT supervisor_id FROM thesis_assignments WHERE group_id=$1', [groupA.id])
  ).rows;
  check(assignments.length, 1);
  check(assignments[0].supervisor_id, lecturer.id);
  check(
    (
      await pool.query(
        'SELECT current_assigned_students FROM lecturer_quotas WHERE campaign_id=$1 AND lecturer_id=$2',
        [ids.campaign, lecturer.id],
      )
    ).rows[0].current_assigned_students,
    1,
  );
  const round2 = await call(root + '/matching-runs', admin.token, settings, 201);
  check(round2.round, 2);
  check(round2.result.pairs.length, 1);
  check(round2.result.pairs[0].topic_id, duplicate.id);
  await call(`${root}/matching-runs/${round2.id}/publish`, admin.token, {
    confirm_until: confirmUntil,
  });
  const finalOffer = (await call(groupPath(groupB), second.token)).offers.find(
    (o) => o.status === 'PENDING',
  );
  await call(offerPath(finalOffer.id), second.token, { decision: 'CONFIRMED' }, 200, 'PATCH');
  check((await call(groupPath(groupB), second.token)).assignment.topic_id, duplicate.id);
  check(
    (
      await pool.query(
        'SELECT current_assigned_students FROM lecturer_quotas WHERE campaign_id=$1 AND lecturer_id=$2',
        [ids.campaign, lecturer.id],
      )
    ).rows[0].current_assigned_students,
    2,
  );
  console.log(
    'Complete Sprint 3 HTTP flow passed: proposal, lecturer approval, archive, wishes, matching, publication, confirmation/refusal and second round.',
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });
