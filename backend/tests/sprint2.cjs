const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const { app } = require('../dist/server');
const { pool } = require('../dist/config/db');
const prefix = 's2_' + randomUUID().slice(0, 8);
const password = 'Sprint2-test!123';
const ids = {
  f: randomUUID(),
  f2: randomUUID(),
  dep: randomUUID(),
  major: randomUUID(),
  year: randomUUID(),
  sem: randomUUID(),
};
let server;
let base;
let count = 0;
const users = [];

function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  count++;
}

async function call(route, token, body, status = 200, method) {
  const r = await fetch(base + '/api/v1' + route, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = r.headers.get('content-type')?.includes('json')
    ? await r.json()
    : Buffer.from(await r.arrayBuffer());
  check(r.status, status, route + ': ' + JSON.stringify(data));
  return data;
}

async function user(suffix, role, faculty, dep, major) {
  const id = randomUUID();
  users.push(id);
  await pool.query(
    'INSERT INTO users (id,code,email,full_name,password_hash,is_active) VALUES ($1,$2,$3,$4,$5,true)',
    [
      id,
      prefix + suffix,
      prefix + suffix + '@example.invalid',
      'Sprint2 test',
      await bcrypt.hash(password, 10),
    ],
  );
  await pool.query(
    'INSERT INTO user_roles (user_id,role_id,faculty_id,department_id,major_id,is_default) SELECT $1,id,$3,$4,$5,true FROM roles WHERE code=$2',
    [id, role, faculty || null, dep || null, major || null],
  );
  return {
    id,
    token: (
      await call('/auth/login', null, { email: prefix + suffix + '@example.invalid', password })
    ).access_token,
  };
}

async function excel(headers, rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Data');
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  const body = new FormData();
  body.set('file', new Blob([await book.xlsx.writeBuffer()]), 'data.xlsx');
  return body;
}

function pdf(content = '%PDF-1.4\n%%EOF\n', filename = 'cv.pdf') {
  const body = new FormData();
  body.set('file', new Blob([content], { type: 'application/pdf' }), filename);
  return body;
}

async function run() {
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_FROM;
  await pool.query('INSERT INTO faculties (id,code,name) VALUES ($1,$2,$3),($4,$5,$6)', [
    ids.f,
    prefix,
    'Khoa test',
    ids.f2,
    prefix + '_other',
    'Khoa khác',
  ]);
  await pool.query('INSERT INTO departments (id,code,name,faculty_id) VALUES ($1,$2,$3,$4)', [
    ids.dep,
    prefix,
    'Bộ môn test',
    ids.f,
  ]);
  await pool.query('INSERT INTO majors (id,code,name,department_id) VALUES ($1,$2,$3,$4)', [
    ids.major,
    prefix,
    'Ngành test',
    ids.dep,
  ]);
  await pool.query(
    'INSERT INTO academic_years (id,code,start_year,end_year) VALUES ($1,$2,2090,2091)',
    [ids.year, prefix],
  );
  await pool.query(
    "INSERT INTO semesters (id,academic_year_id,code,name,start_date,end_date,is_current) VALUES ($1,$2,$3,'Test','2090-01-01','2090-06-01',false)",
    [ids.sem, ids.year, prefix],
  );
  const admin = await user('_admin', 'SYSTEM_ADMIN');
  const faculty = await user('_faculty', 'FACULTY_MANAGER', ids.f);
  const other = await user('_other', 'FACULTY_MANAGER', ids.f2);
  const student = await user('_sv', 'STUDENT', ids.f, ids.dep, ids.major);
  const lecturer = await user('_gv', 'LECTURER', ids.f, ids.dep);
  const mentor = await user('_mentor', 'ENTERPRISE_MENTOR');
  await call('/admin/bulk/students/template', admin.token);
  await call('/admin/bulk/lecturers/template', admin.token);
  await call('/admin/bulk/mentors/template', admin.token);
  await call('/admin/bulk/students/template', student.token, null, 403);
  const headers = ['code', 'email', 'full_name', 'password', 'major_code', 'cohort', 'class_name'];
  let result = await call(
    '/admin/bulk/students',
    admin.token,
    await excel(headers, [
      [
        prefix + '_new',
        prefix + '_new@example.invalid',
        'New student',
        password,
        prefix,
        '2026',
        'A',
      ],
      [prefix + '_bad', 'invalid-email', 'Bad', password, prefix, '', ''],
      [prefix + '_new', prefix + '_dup@example.invalid', 'Dup', password, prefix, '', ''],
      [prefix + '_formula', { formula: '1+1' }, 'Formula', password, prefix, '', ''],
    ]),
  );
  check(result.created, 1);
  check(result.failed, 3);
  check(result.results[0].email_status, 'not_configured');
  check(result.results[2].message, 'Trùng mã hoặc email');
  result = await call(
    '/admin/bulk/lecturers',
    admin.token,
    await excel(
      [
        'code',
        'email',
        'full_name',
        'password',
        'department_code',
        'academic_degree',
        'specialization',
      ],
      [
        [
          prefix + '_newgv',
          prefix + '_newgv@example.invalid',
          'New lecturer',
          password,
          prefix,
          'TS',
          'Data',
        ],
      ],
    ),
  );
  check(result.created, 1);
  result = await call(
    '/admin/bulk/mentors',
    admin.token,
    await excel(
      ['code', 'email', 'full_name', 'password', 'company_name', 'position', 'contact_phone'],
      [
        [
          prefix + '_newmentor',
          prefix + '_newmentor@example.invalid',
          'New mentor',
          password,
          prefix + '_company',
          'Leader',
          '0123456789',
        ],
      ],
    ),
  );
  check(result.created, 1);
  await call('/profiles/me', student.token);
  await call('/profiles/me', admin.token, null, 403);
  await call('/profiles/me', student.token, { gpa: 5, skills: [], interests: '' }, 400, 'PUT');
  await call(
    '/profiles/me',
    student.token,
    { gpa: 3, skills: [], portfolio_url: 'javascript:alert(1)' },
    400,
    'PUT',
  );
  await call(
    '/profiles/me',
    student.token,
    {
      gpa: 3.4,
      skills: ['SQL', 'SQL', 'JS'],
      interests: 'Web',
      portfolio_url: 'https://example.invalid',
    },
    200,
    'PUT',
  );
  result = await call('/profiles/me', student.token);
  check(result.profile.skills, ['SQL', 'JS']);
  await call('/profiles/me/cv', student.token, pdf('not PDF'), 400);
  await call('/profiles/me/cv', student.token, pdf());
  result = await call('/profiles/me/cv', student.token);
  check(result.subarray(0, 5).toString(), '%PDF-');
  await call('/profiles/me/cv', lecturer.token, null, 404);
  await call('/profiles/me/cv', lecturer.token, pdf(), 403);
  await call(
    '/profiles/me',
    lecturer.token,
    { academic_degree: 'TS', specialization: 'Software', research_directions: ['AI', 'Web'] },
    200,
    'PUT',
  );
  await call(
    '/profiles/me',
    mentor.token,
    {
      company_name: prefix + '_mentor-company',
      position: 'Mentor',
      expertise_area: 'Web',
      contact_email: prefix + '@example.invalid',
      contact_phone: '0123',
      industry: 'IT',
      address: 'Test',
    },
    200,
    'PUT',
  );
  result = await call('/profiles/me', mentor.token);
  check(result.company.name, prefix + '_mentor-company');
  await call(
    '/profiles/me',
    mentor.token,
    { company_name: 'Test', contact_email: 'invalid' },
    400,
    'PUT',
  );
  const body = {
    code: prefix,
    name: 'Đợt test',
    faculty_id: ids.f,
    major_id: ids.major,
    semester_id: ids.sem,
    type: 'THESIS',
    training_system: 'CHINH_QUY',
    max_students_per_topic: 2,
    max_wish_choices: 3,
    allow_student_propose_topic: false,
  };
  const campaign = await call('/master-data/campaigns', faculty.token, body, 201);
  const id = campaign.id;
  await call('/master-data/campaigns', other.token, { ...body, code: prefix + '_bad' }, 403);
  await call(
    '/master-data/campaigns/' + id,
    other.token,
    { ...body, status: 'OPEN' },
    403,
    'PATCH',
  );
  await call(
    '/master-data/campaigns/' + id,
    faculty.token,
    { ...body, status: 'OPEN' },
    200,
    'PATCH',
  );
  await call(
    '/master-data/campaigns/' + id,
    faculty.token,
    { ...body, status: 'OPEN', max_wish_choices: 6 },
    400,
    'PATCH',
  );
  await call(
    '/profiles/me/quotas/' + id,
    lecturer.token,
    { max_students: 10, max_topics: 5 },
    200,
    'PUT',
  );
  await pool.query(
    'UPDATE lecturer_quotas SET current_assigned_students=4 WHERE campaign_id=$1 AND lecturer_id=$2',
    [id, lecturer.id],
  );
  await call(
    '/profiles/me/quotas/' + id,
    lecturer.token,
    { max_students: 3, max_topics: 5 },
    400,
    'PUT',
  );
  await call(
    '/profiles/me/quotas/' + id,
    student.token,
    { max_students: 10, max_topics: 5 },
    403,
    'PUT',
  );
  let gate = await call('/campaigns/' + id + '/gate', student.token);
  check(gate.allowed, false);
  await call('/campaigns/' + id + '/enroll', student.token, {}, 403);
  const eligibilityHeaders = ['student_code', 'status', 'reason'];
  result = await call(
    '/campaigns/' + id + '/eligibility',
    faculty.token,
    await excel(eligibilityHeaders, [
      [prefix + '_sv', 'ELIGIBLE', ''],
      [prefix + '_none', 'ELIGIBLE', ''],
      [prefix + '_sv', 'ELIGIBLE', 'duplicate'],
    ]),
  );
  check(result.saved, 1);
  check(result.results.filter((r) => r.status === 'error').length, 2);
  await call('/campaigns/' + id + '/eligibility', other.token, null, 403);
  const now = Date.now();
  const milestone = {
    phase: 'WISH_REGISTRATION',
    title: 'Đăng ký test',
    start_at: new Date(now + 60000).toISOString(),
    end_at: new Date(now + 3600000).toISOString(),
    is_locked: false,
  };
  let m = await call('/campaigns/' + id + '/timeline', faculty.token, milestone, 200, 'PUT');
  gate = await call('/campaigns/' + id + '/gate', student.token);
  check(gate.allowed, false);
  check(gate.reason, 'Chưa tới thời gian mở đăng ký');
  await call('/campaigns/' + id + '/enroll', student.token, {}, 403);
  await call('/campaigns/' + id + '/timeline', student.token, milestone, 403, 'PUT');
  await call('/campaigns/' + id + '/timeline', other.token, milestone, 403, 'PUT');
  await call(
    '/campaigns/' + id + '/timeline',
    faculty.token,
    {
      ...milestone,
      start_at: new Date(now - 3600000).toISOString(),
      end_at: new Date(now - 60000).toISOString(),
    },
    200,
    'PUT',
  );
  gate = await call('/campaigns/' + id + '/gate', student.token);
  check(gate.allowed, false);
  check(gate.reason, 'Đã hết hạn');
  await call('/campaigns/' + id + '/enroll', student.token, {}, 403);
  const override = await call('/campaigns/' + id + '/overrides', faculty.token, {
    milestone_id: m.id,
    student_id: student.id,
    extended_until: new Date(now + 3600000).toISOString(),
    reason: 'Test exception',
  });
  gate = await call('/campaigns/' + id + '/gate', student.token);
  check(gate.allowed, true);
  await call('/campaigns/' + id + '/enroll', student.token, {});
  await call('/campaigns/' + id + '/enroll', student.token, {});
  check(
    Number(
      (await pool.query('SELECT count(*) FROM campaign_enrollments WHERE campaign_id=$1', [id]))
        .rows[0].count,
    ),
    1,
  );
  await call(
    '/campaigns/' + id + '/eligibility',
    faculty.token,
    await excel(eligibilityHeaders, [[prefix + '_sv', 'INELIGIBLE', 'Revoked']]),
  );
  gate = await call('/campaigns/' + id + '/gate', student.token);
  check(gate.allowed, false);
  await call('/campaigns/' + id + '/enroll', student.token, {}, 403);
  await call(
    '/campaigns/' + id + '/eligibility',
    faculty.token,
    await excel(eligibilityHeaders, [[prefix + '_sv', 'ELIGIBLE', 'Re-enabled']]),
  );
  await call(
    '/campaigns/' + id + '/overrides',
    student.token,
    {
      milestone_id: m.id,
      student_id: student.id,
      extended_until: new Date(now + 3600000).toISOString(),
      reason: 'Attack',
    },
    403,
  );
  await call(
    '/campaigns/' + id + '/overrides',
    other.token,
    {
      milestone_id: m.id,
      student_id: student.id,
      extended_until: new Date(now + 3600000).toISOString(),
      reason: 'Attack',
    },
    403,
  );
  await call(
    '/campaigns/' + id + '/timeline',
    faculty.token,
    { ...milestone, start_at: new Date(now - 3600000).toISOString(), is_locked: true },
    200,
    'PUT',
  );
  gate = await call('/campaigns/' + id + '/gate', student.token);
  check(gate.allowed, false);
  check(gate.reason, 'Giai đoạn đã được Khoa khóa thủ công');
  await call('/campaigns/' + id + '/enroll', student.token, {}, 403);
  await call('/campaigns/' + id + '/overrides/' + override.id, faculty.token, null, 200, 'DELETE');
  await call(
    '/master-data/campaigns/' + id,
    faculty.token,
    { ...body, status: 'CLOSED' },
    200,
    'PATCH',
  );
  gate = await call('/campaigns/' + id + '/gate', student.token);
  check(gate.allowed, false);
  await call('/master-data/campaigns/' + id, faculty.token, null, 409, 'DELETE');
  const draft = await call(
    '/master-data/campaigns',
    admin.token,
    { ...body, code: prefix + '_draft' },
    201,
  );
  await call('/master-data/campaigns/' + draft.id, admin.token, null, 200, 'DELETE');
  await welcomeEmailTest(admin.token);
  console.log(`PASS: ${count} Sprint 2 assertions on PostgreSQL and HTTP`);
}

async function welcomeEmailTest(token) {
  const net = require('node:net');
  let message = '';
  const smtp = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.write('220 fixture ESMTP\r\n');
    let buffer = '';
    let data = false;
    socket.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\r\n')) {
        const p = buffer.indexOf('\r\n');
        const line = buffer.slice(0, p);
        buffer = buffer.slice(p + 2);
        if (data) {
          if (line === '.') {
            data = false;
            socket.write('250 OK\r\n');
          } else {
            message += line + '\n';
          }
        } else if (/^EHLO/.test(line)) {
          socket.write('250-fixture\r\n250 OK\r\n');
        } else if (/^DATA/.test(line)) {
          data = true;
          socket.write('354 Go\r\n');
        } else if (/^QUIT/.test(line)) {
          socket.end('221 bye\r\n');
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });
  });
  smtp.listen(0, '127.0.0.1');
  await new Promise((r) => smtp.once('listening', r));
  Object.assign(process.env, {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(smtp.address().port),
    SMTP_FROM: 'noreply@example.invalid',
    SMTP_SECURE: 'false',
  });
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  try {
    const result = await call(
      '/admin/bulk/students',
      token,
      await excel(
        ['code', 'email', 'full_name', 'password', 'major_code', 'cohort', 'class_name'],
        [
          [
            prefix + '_mail',
            prefix + '_mail@example.invalid',
            'Mail test',
            password,
            prefix,
            '',
            '',
          ],
        ],
      ),
    );
    check(result.results[0].email_status, 'sent');
    check(message.includes(prefix + '_mail@example.invalid'), true);
    check(message.includes(password), false, 'No plaintext password email');
  } finally {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    await new Promise((r) => smtp.close(r));
  }
}

async function cleanup() {
  if (server) {
    await new Promise((r) => server.close(r));
  }
  const u = (
    await pool.query('SELECT id FROM users WHERE left(code,length($1))=$1', [prefix])
  ).rows.map((r) => r.id);
  const files = (
    await pool.query('SELECT id,file_path FROM system_files WHERE uploaded_by=ANY($1::uuid[])', [u])
  ).rows;
  await pool.query('DELETE FROM audit_logs WHERE actor_id=ANY($1::uuid[])', [u]);
  await pool.query('DELETE FROM campaign_enrollments WHERE student_id=ANY($1::uuid[])', [u]);
  await pool.query('DELETE FROM campaigns WHERE left(code,length($1))=$1', [prefix]);
  await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [u]);
  for (const f of files) {
    await pool.query('DELETE FROM system_files WHERE id=$1', [f.id]);
    const directory = path.resolve(__dirname, '../uploads/cv');
    const relative = path.relative(directory, path.resolve(f.file_path));
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative));
    await fs.rm(f.file_path, { force: true });
  }
  await pool.query('DELETE FROM companies WHERE left(name,length($1))=$1', [prefix]);
  await pool.query('DELETE FROM semesters WHERE id=$1', [ids.sem]);
  await pool.query('DELETE FROM academic_years WHERE id=$1', [ids.year]);
  await pool.query('DELETE FROM majors WHERE id=$1', [ids.major]);
  await pool.query('DELETE FROM departments WHERE id=$1', [ids.dep]);
  await pool.query('DELETE FROM faculties WHERE id=ANY($1::uuid[])', [[ids.f, ids.f2]]);
  await pool.end();
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.argv.includes('--preview') && !process.exitCode) {
      console.log(
        `QA fixtures: ${prefix}; accounts ${prefix}_admin@example.invalid, ${prefix}_sv@example.invalid, ${prefix}_gv@example.invalid, ${prefix}_mentor@example.invalid; password ${password}`,
      );
      process.once('SIGINT', async () => {
        await cleanup();
        process.exit();
      });
    } else {
      await cleanup();
    }
  });
