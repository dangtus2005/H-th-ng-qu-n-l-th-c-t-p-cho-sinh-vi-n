const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { app } = require('../dist/server');
const { pool } = require('../dist/config/db');
const { uploadDirectory } = require('../dist/controllers/master.controller');

const suffix = randomUUID().slice(0, 8);
const prefix = `it_${suffix}`;
const ids = {
  admin: randomUUID(),
  member: randomUUID(),
  noScope: randomUUID(),
  facultyA: randomUUID(),
  facultyB: randomUUID(),
  depA: randomUUID(),
  depB: randomUUID(),
};
const password = 'Sprint1-Test!47';
const email = `${prefix}@example.invalid`;
let server;
let base;
let assertions = 0;
let preview = false;
let uploaded = [];

function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions++;
}

async function call(route, token, body, expected = 200, method) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${base}/api/v1${route}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const content = response.headers.get('content-type') || '';
  const data = content.includes('application/json')
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());
  check(response.status, expected, `${route}: ${JSON.stringify(data)}`);
  return data;
}

const upload = (faculty, code, content = '%PDF-1.4\n%%EOF\n', filename = 'test.pdf') => {
  const body = new FormData();
  body.set('code', code);
  body.set('name', 'Biểu mẫu kiểm thử');
  if (faculty) {
    body.set('faculty_id', faculty);
  }
  body.set('file', new Blob([content], { type: 'application/pdf' }), filename);
  return body;
};

async function cleanup() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fixtureUsers = (
      await client.query('SELECT id FROM users WHERE left(code,length($1::text))=$1', [prefix])
    ).rows.map((r) => r.id);
    const files = await client.query(
      'SELECT id,file_path FROM system_files WHERE uploaded_by = ANY($1::uuid[])',
      [[ids.admin, ids.member, ids.noScope]],
    );
    uploaded = files.rows.map((r) => r.file_path);
    await client.query('DELETE FROM document_templates WHERE file_id = ANY($1::uuid[])', [
      files.rows.map((r) => r.id),
    ]);
    await client.query('DELETE FROM system_files WHERE id = ANY($1::uuid[])', [
      files.rows.map((r) => r.id),
    ]);
    await client.query(
      'DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR entity_id = ANY($1::uuid[])',
      [fixtureUsers],
    );
    await client.query('DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])', [fixtureUsers]);
    await client.query('DELETE FROM user_roles WHERE user_id = ANY($1::uuid[])', [fixtureUsers]);
    await client.query('DELETE FROM campaigns WHERE left(code,length($1::text))=$1', [prefix]);
    await client.query('DELETE FROM specializations WHERE left(code,length($1::text))=$1', [
      prefix,
    ]);
    await client.query('DELETE FROM majors WHERE left(code,length($1::text))=$1', [prefix]);
    await client.query(
      'DELETE FROM semesters WHERE academic_year_id IN (SELECT id FROM academic_years WHERE code = $1)',
      [prefix],
    );
    await client.query('DELETE FROM academic_years WHERE code = $1', [prefix]);
    await client.query('DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])', [
      [ids.admin, ids.member, ids.noScope],
    ]);
    await client.query('DELETE FROM user_roles WHERE user_id = ANY($1::uuid[])', [
      [ids.admin, ids.member, ids.noScope],
    ]);
    await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [fixtureUsers]);
    await client.query(
      'DELETE FROM departments WHERE faculty_id IN (SELECT id FROM faculties WHERE code = $1 OR id = ANY($2::uuid[]))',
      [prefix, [ids.facultyA, ids.facultyB]],
    );
    await client.query('DELETE FROM faculties WHERE code = $1 OR id = ANY($2::uuid[])', [
      prefix,
      [ids.facultyA, ids.facultyB],
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  for (const file of uploaded) {
    const relative = path.relative(uploadDirectory, path.resolve(file));
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative));
    await fs.rm(file, { force: true });
  }
  await pool.end();
}

async function run() {
  const migrations = path.join(__dirname, '../migrations');
  for (const file of (await fs.readdir(migrations))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    await pool.query(await fs.readFile(path.join(migrations, file), 'utf8'));
  }
  const hash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO faculties (id,code,name) VALUES ($1,$2,$3),($4,$5,$6)', [
      ids.facultyA,
      `${prefix}_A`,
      'Khoa kiểm thử A',
      ids.facultyB,
      `${prefix}_B`,
      'Khoa kiểm thử B',
    ]);
    await client.query(
      'INSERT INTO departments (id,faculty_id,code,name) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)',
      [
        ids.depA,
        ids.facultyA,
        `${prefix}_A`,
        'Bộ môn A',
        ids.depB,
        ids.facultyB,
        `${prefix}_B`,
        'Bộ môn B',
      ],
    );
    for (const [id, code, address, name] of [
      [ids.admin, `${prefix}_admin`, `admin_${email}`, 'Quản trị kiểm thử'],
      [ids.member, prefix, email, 'Người dùng kiểm thử'],
      [ids.noScope, `${prefix}_none`, `none_${email}`, 'Chưa gán phạm vi'],
    ]) {
      await client.query(
        'INSERT INTO users (id,code,email,full_name,password_hash,is_active) VALUES ($1,$2,$3,$4,$5,TRUE)',
        [id, code, address, name, hash],
      );
    }
    for (const [id, role, faculty, department, isDefault] of [
      [ids.admin, 'SYSTEM_ADMIN', null, null, true],
      [ids.member, 'FACULTY_MANAGER', ids.facultyA, null, true],
      [ids.member, 'DEPT_HEAD', ids.facultyB, ids.depB, false],
      [ids.noScope, 'LECTURER', null, null, true],
    ]) {
      const result = await client.query(
        `INSERT INTO user_roles (user_id,role_id,faculty_id,department_id,is_default)
        SELECT $1,id,$3,$4,$5 FROM roles WHERE code = $2 RETURNING id`,
        [id, role, faculty, department, isDefault],
      );
      assert.equal(result.rowCount, 1, `Missing role ${role}`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  check((await fetch(`${base}/health`)).status, 200, 'health');
  check((await fetch(base)).status, 200, 'frontend');
  check((await fetch(`${base}/src/app.js`)).status, 200, 'frontend JS');
  await call('/master-data/faculties', null, null, 401);
  await call('/auth/login', null, { email, password: 'wrong-password' }, 401);
  const admin = await call('/auth/login', null, { email: `admin_${email}`, password });
  let member = await call('/auth/login', null, { email, password });
  const second = await call('/auth/login', null, { email, password });
  const unscoped = await call('/auth/login', null, { email: `none_${email}`, password });
  check(
    (await call('/master-data/faculties', unscoped.access_token)).length,
    0,
    'unscoped users see no faculties',
  );
  check(
    (await call('/master-data/departments', unscoped.access_token)).length,
    0,
    'unscoped users see no departments',
  );
  check(
    (await call('/master-data/faculties', member.access_token)).map((r) => r.id),
    [ids.facultyA],
    'faculty scope',
  );
  check(
    (await call('/master-data/departments', member.access_token)).map((r) => r.id),
    [ids.depA],
    'department scope',
  );
  check(
    (await call(`/master-data/departments?faculty_id=${ids.facultyB}`, member.access_token)).length,
    0,
    'query cannot expand scope',
  );
  await call('/master-data/departments?faculty_id=bad', member.access_token, null, 400);
  await call(
    '/master-data/faculties',
    member.access_token,
    { code: prefix, name: 'Không được tạo' },
    403,
  );
  await call(
    '/auth/switch-role',
    member.access_token,
    { user_role_id: admin.active_role.user_role_id },
    403,
  );
  const previousToken = member.access_token;
  const depRole = member.available_roles.find((r) => r.role_code === 'DEPT_HEAD');
  member = await call('/auth/switch-role', member.access_token, {
    user_role_id: depRole.user_role_id,
  });
  await call('/auth/me', previousToken, null, 401);
  check(
    (await call('/master-data/departments', member.access_token)).map((r) => r.id),
    [ids.depB],
    'department head scope',
  );
  await call(
    '/master-data/document-templates',
    member.access_token,
    upload(ids.facultyB, `${prefix}_denied`),
    403,
  );
  member = await call('/auth/switch-role', member.access_token, {
    user_role_id: second.active_role.user_role_id,
  });
  await call(
    '/master-data/document-templates',
    member.access_token,
    upload(ids.facultyB, `${prefix}_cross`),
    403,
  );
  await call(
    '/master-data/document-templates',
    member.access_token,
    upload(ids.facultyA, `${prefix}_bad`, 'not a PDF'),
    400,
  );
  await call(
    '/master-data/document-templates',
    member.access_token,
    upload(ids.facultyA, `${prefix}_exe`, '%PDF-1.4', 'test.exe'),
    400,
  );
  await call(
    '/master-data/document-templates',
    member.access_token,
    upload(ids.facultyA, `${prefix}_big`, Buffer.alloc(10 * 1024 * 1024 + 1)),
    400,
  );
  const template = await call(
    '/master-data/document-templates',
    member.access_token,
    upload(ids.facultyA, prefix),
    201,
  );
  await call(
    '/master-data/document-templates',
    member.access_token,
    upload(ids.facultyA, prefix),
    409,
  );
  check(
    Number(
      (await pool.query('SELECT count(*) FROM system_files WHERE uploaded_by = $1', [ids.member]))
        .rows[0].count,
    ),
    1,
    'failed upload transaction leaves no file record',
  );
  const downloaded = await call(
    `/master-data/document-templates/${template.id}/download`,
    member.access_token,
  );
  check(downloaded.toString(), '%PDF-1.4\n%%EOF\n', 'file round trip');
  await call(
    `/master-data/document-templates/${template.id}/download`,
    unscoped.access_token,
    null,
    404,
  );
  const faculty = await call(
    '/master-data/faculties',
    admin.access_token,
    { code: prefix, name: 'Khoa mới kiểm thử' },
    201,
  );
  await call('/master-data/faculties', admin.access_token, { code: prefix, name: 'Trùng mã' }, 409);
  await call(
    '/master-data/departments',
    admin.access_token,
    { code: prefix, name: 'Bộ môn mới', faculty_id: faculty.id },
    201,
  );
  const year = await call(
    '/master-data/academic-years',
    admin.access_token,
    { code: prefix, start_year: 2098, end_year: 2099 },
    201,
  );
  await call(
    '/master-data/semesters',
    admin.access_token,
    {
      academic_year_id: year.id,
      code: prefix,
      name: 'Học kỳ kiểm thử',
      start_date: '2098-09-01',
      end_date: '2099-01-01',
      is_current: false,
    },
    201,
  );
  await call(
    '/master-data/semesters',
    admin.access_token,
    {
      academic_year_id: year.id,
      code: `${prefix}_bad`,
      name: 'Sai ngày',
      start_date: '2098-02-31',
      end_date: '2098-03-01',
      is_current: false,
    },
    400,
  );
  check(
    (await call('/master-data/semesters', admin.access_token)).some((r) => r.code === prefix),
    true,
    'semester saved',
  );
  await call(
    '/auth/change-password',
    member.access_token,
    { old_password: 'wrong', new_password: 'New-password!123' },
    400,
  );
  const expired = await call('/auth/login', null, { email, password });
  await pool.query(
    "UPDATE auth_sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1",
    [require('jsonwebtoken').decode(expired.access_token).jti],
  );
  await call('/auth/me', expired.access_token, null, 401);
  await call('/auth/me', second.access_token);
  await call('/auth/change-password', member.access_token, {
    old_password: password,
    new_password: 'New-password!123',
  });
  await call('/auth/me', member.access_token, null, 401);
  await call('/auth/me', second.access_token, null, 401);
  await call('/auth/login', null, { email, password }, 401);
  const newLogin = await call('/auth/login', null, { email, password: 'New-password!123' });
  await call('/auth/logout', newLogin.access_token, {}, 200);
  await call('/auth/me', newLogin.access_token, null, 401);
  await pool.query('UPDATE users SET is_active = FALSE WHERE id = $1', [ids.admin]);
  await call('/auth/me', admin.access_token, null, 401);
  await pool.query('UPDATE users SET is_active = TRUE WHERE id = $1', [ids.admin]);
  const active = await call('/auth/login', null, { email, password: 'New-password!123' });
  await pool.query('DELETE FROM user_roles WHERE id = $1', [active.active_role.user_role_id]);
  await call('/auth/me', active.access_token, null, 401);
  await sprint1(admin.access_token, unscoped.access_token, year.id);
  console.log(`PASS: ${assertions} assertions on real PostgreSQL and HTTP API`);
  if (process.argv.includes('--preview')) {
    // Chỉ tài khoản kiểm thử riêng; không chỉnh sửa tài khoản người dùng có sẵn.
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, ids.admin]);
    preview = true;
    console.log(`PREVIEW ${base} EMAIL admin_${email} PASSWORD ${password}`);
  }
}

async function sprint1(adminToken, unprivileged, yearId) {
  const ExcelJS = require('exceljs');
  await call('/admin/users', unprivileged, null, 403);
  await call('/admin/options', unprivileged, null, 403);
  const m1 = await call(
    '/master-data/majors',
    adminToken,
    { code: prefix + '_M1', name: 'Test major A', department_id: ids.depA },
    201,
  );
  const m2 = await call(
    '/master-data/majors',
    adminToken,
    { code: prefix + '_M2', name: 'Test major B', department_id: ids.depB },
    201,
  );
  const sp = await call(
    '/master-data/specializations',
    adminToken,
    { code: prefix + '_SP', name: 'Test specialization', major_id: m1.id },
    201,
  );
  await call(
    '/master-data/specializations/' + sp.id,
    adminToken,
    { code: prefix + '_SP', name: 'Updated specialization', major_id: m1.id },
    200,
    'PATCH',
  );
  const semester = (
    await pool.query('SELECT id FROM semesters WHERE academic_year_id=$1', [yearId])
  ).rows[0].id;
  const campaignA = await call(
    '/master-data/campaigns',
    adminToken,
    {
      code: prefix + '_C1',
      name: 'Campaign A',
      faculty_id: ids.facultyA,
      major_id: m1.id,
      semester_id: semester,
      type: 'THESIS',
    },
    201,
  );
  const campaignB = await call(
    '/master-data/campaigns',
    adminToken,
    {
      code: prefix + '_C2',
      name: 'Campaign B',
      faculty_id: ids.facultyB,
      major_id: m2.id,
      semester_id: semester,
      type: 'INTERNSHIP',
    },
    201,
  );
  await call('/master-data/majors/' + m1.id, adminToken, null, 409, 'DELETE');
  const body = {
    code: prefix + '_scoped',
    email: `scoped_${email}`,
    full_name: 'Scoped user',
    password,
    roles: [
      { role_code: 'LECTURER', major_id: m1.id, campaign_id: campaignA.id },
      { role_code: 'STUDENT', campaign_id: campaignB.id },
    ],
  };
  await call(
    '/admin/users',
    adminToken,
    {
      ...body,
      code: prefix + '_bad',
      email: `bad_${email}`,
      roles: [{ role_code: 'LECTURER', major_id: m1.id, campaign_id: campaignB.id }],
    },
    400,
  );
  const created = await call('/admin/users', adminToken, body, 201);
  let scoped = await call('/auth/login', null, { email: body.email.toUpperCase(), password });
  check(scoped.active_role.major_id, m1.id, 'major scope assigned');
  check(scoped.active_role.campaign_id, campaignA.id, 'campaign scope assigned');
  check(
    (await call('/master-data/majors', scoped.access_token)).map((r) => r.id),
    [m1.id],
    'major isolation',
  );
  check(
    (await call('/master-data/specializations', scoped.access_token)).map((r) => r.id),
    [sp.id],
    'specialization isolation',
  );
  check(
    (await call('/master-data/campaigns', scoped.access_token)).map((r) => r.id),
    [campaignA.id],
    'campaign isolation',
  );
  check(
    (await call('/master-data/departments', scoped.access_token)).map((r) => r.id),
    [ids.depA],
    'major limits departments',
  );
  scoped = await call('/auth/switch-role', scoped.access_token, {
    user_role_id: scoped.available_roles.find((r) => r.role_code === 'STUDENT').user_role_id,
  });
  check(scoped.active_role.major_id, m2.id, 'campaign derives major');
  check(
    (await call('/master-data/campaigns', scoped.access_token)).map((r) => r.id),
    [campaignB.id],
    'switched campaign isolation',
  );
  const locked = { ...body, is_active: false };
  delete locked.password;
  await call('/admin/users/' + created.id, adminToken, locked, 200, 'PATCH');
  await call('/auth/me', scoped.access_token, null, 401);
  await call('/auth/login', null, { email: body.email, password }, 403);
  await call(
    '/admin/users/' + created.id,
    adminToken,
    { ...locked, is_active: true, full_name: 'Renamed user' },
    200,
    'PATCH',
  );
  scoped = await call('/auth/login', null, { email: body.email, password });
  const recovery = await call('/admin/users/' + created.id + '/recovery', adminToken, {});
  check(recovery.recovery_code.length, 48, 'recovery token length');
  await call(
    '/auth/reset-password',
    null,
    { email: body.email, recovery_code: '0'.repeat(48), new_password: 'Recovered!123' },
    400,
  );
  await call('/auth/reset-password', null, {
    email: body.email,
    recovery_code: recovery.recovery_code,
    new_password: 'Recovered!123',
  });
  await call('/auth/me', scoped.access_token, null, 401);
  await call(
    '/auth/reset-password',
    null,
    { email: body.email, recovery_code: recovery.recovery_code, new_password: 'Recovered!123' },
    400,
  );
  scoped = await call('/auth/login', null, { email: body.email, password: 'Recovered!123' });
  const expired = await call('/admin/users/' + created.id + '/recovery', adminToken, {});
  await pool.query(
    "UPDATE password_resets SET expires_at=NOW()-INTERVAL '1 minute' WHERE user_id=$1",
    [created.id],
  );
  await call(
    '/auth/reset-password',
    null,
    { email: body.email, recovery_code: expired.recovery_code, new_password: 'Recovered!123' },
    400,
  );
  await call('/auth/forgot-password', null, { email: 'unknown@example.invalid' }, 202);
  await verifyRecoveryEmail(body.email, created.id);
  const template = await call('/admin/users-import-template', adminToken);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const sheet = workbook.worksheets[0];
  sheet.addRow([
    prefix + '_excel',
    `excel_${email}`,
    'Excel user',
    password,
    'STUDENT',
    `${prefix}_A`,
    '',
    `${prefix}_M1`,
    `${prefix}_C1`,
  ]);
  const uploadExcel = async (book) => {
    const data = new FormData();
    data.set('file', new Blob([await book.xlsx.writeBuffer()]), 'users.xlsx');
    return data;
  };
  await call('/admin/users-import', adminToken, await uploadExcel(workbook), 201);
  const excelLogin = await call('/auth/login', null, { email: `excel_${email}`, password });
  check(excelLogin.active_role.major_id, m1.id, 'Excel role scope');
  const atomic = new ExcelJS.Workbook();
  const as = atomic.addWorksheet('Users');
  as.addRow(sheet.getRow(1).values.slice(1));
  as.addRow([prefix + '_rollback', `rollback_${email}`, 'Rollback user', password, 'STUDENT']);
  as.addRow([prefix + '_excel', `excel_${email}`, 'Duplicate user', password, 'STUDENT']);
  await call('/admin/users-import', adminToken, await uploadExcel(atomic), 400);
  check(
    Number(
      (await pool.query('SELECT count(*) FROM users WHERE code=$1', [prefix + '_rollback'])).rows[0]
        .count,
    ),
    0,
    'Excel import rolls back entire file',
  );
  const formula = new ExcelJS.Workbook();
  const formulaSheet = formula.addWorksheet('Users');
  formulaSheet.addRow(sheet.getRow(1).values.slice(1));
  formulaSheet.addRow([
    { formula: '1+1', result: 2 },
    `formula_${email}`,
    'Formula user',
    password,
    'STUDENT',
  ]);
  await call('/admin/users-import', adminToken, await uploadExcel(formula), 400);
  const wrongHeader = new ExcelJS.Workbook();
  const wrongSheet = wrongHeader.addWorksheet('Users');
  wrongSheet.addRow(['wrong']);
  wrongSheet.addRow(['invalid']);
  await call('/admin/users-import', adminToken, await uploadExcel(wrongHeader), 400);
  const oversized = new ExcelJS.Workbook();
  const oversizedSheet = oversized.addWorksheet('Users');
  oversizedSheet.addRow(sheet.getRow(1).values.slice(1));
  for (let i = 0; i < 201; i++) oversizedSheet.addRow(['too-many']);
  await call('/admin/users-import', adminToken, await uploadExcel(oversized), 400);
  const malicious = Buffer.alloc(72);
  malicious.writeUInt32LE(0x04034b50, 0);
  malicious.writeUInt32LE(0x02014b50, 4);
  malicious.writeUInt32LE(21 * 1024 * 1024, 28);
  malicious.writeUInt32LE(0x06054b50, 50);
  malicious.writeUInt16LE(1, 60);
  malicious.writeUInt32LE(4, 66);
  const compressed = new FormData();
  compressed.set('file', new Blob([malicious]), 'large-expanded.xlsx');
  await call('/admin/users-import', adminToken, compressed, 400);
  const listed = await call('/admin/users?search=' + encodeURIComponent(prefix), adminToken);
  check(
    listed.items.some((u) => u.id === created.id),
    true,
    'users visible to admin',
  );
  check(JSON.stringify(listed).includes('password_hash'), false, 'no password hash in users API');
  const logs = await call('/admin/audit', adminToken);
  check(
    logs.some((r) => r.action === 'UPDATE_USER' && r.entity_id === created.id),
    true,
    'account audit',
  );
  const allActions = (
    await pool.query('SELECT DISTINCT action FROM audit_logs WHERE actor_id=$1', [ids.admin])
  ).rows.map((r) => r.action);
  for (const action of [
    'CREATE_FACULTY',
    'CREATE_DEPARTMENT',
    'CREATE_ACADEMIC_YEAR',
    'CREATE_SEMESTER',
    'CREATE_USER',
    'CREATE_CAMPAIGN',
    'CREATE_CATALOG',
  ]) {
    check(allActions.includes(action), true, 'audit event ' + action);
  }
  await call('/master-data/specializations/' + sp.id, adminToken, null, 200, 'DELETE');
}

async function verifyRecoveryEmail(address, userId) {
  const net = require('node:net');
  let message = '';
  const smtp = net.createServer((socket) => {
    let buffer = '';
    let receiving = false;
    socket.setTimeout(10000, () => socket.destroy());
    socket.write('220 localhost ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.length) {
        if (receiving) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) {
            return;
          }
          message = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          receiving = false;
          socket.write('250 accepted\r\n');
          continue;
        }
        const end = buffer.indexOf('\r\n');
        if (end < 0) {
          return;
        }
        const command = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (command.startsWith('DATA')) {
          receiving = true;
          socket.write('354 send message\r\n');
        } else if (command.startsWith('QUIT')) {
          socket.end('221 goodbye\r\n');
        } else {
          socket.write('250 localhost\r\n');
        }
      }
    });
  });
  smtp.listen(0, '127.0.0.1');
  await new Promise((resolve) => smtp.once('listening', resolve));
  const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASS'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, {
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp.address().port),
      SMTP_SECURE: 'false',
      SMTP_FROM: 'noreply@example.invalid',
    });
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    await pool.query('DELETE FROM password_resets WHERE user_id=$1', [userId]);
    await call('/auth/forgot-password', null, { email: address }, 202);
    check(message.includes(address), true, 'recovery email delivered to local SMTP fixture');
    const code = message.replace(/=\r\n/g, '').match(/[a-f0-9]{48}/)?.[0];
    assert.ok(code, 'Email contains the recovery code');
    const stored = (
      await pool.query('SELECT token_hash FROM password_resets WHERE user_id=$1', [userId])
    ).rows[0];
    check(
      stored.token_hash,
      require('node:crypto').createHash('sha256').update(code).digest('hex'),
      'only hash stored',
    );
    await call('/auth/reset-password', null, {
      email: address,
      recovery_code: code,
      new_password: 'Email-recovered!123',
    });
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
    await new Promise((resolve) => smtp.close(resolve));
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!preview) {
      await cleanup();
    } else {
      let stopping = false;
      const stop = async () => {
        if (stopping) {
          return;
        }
        stopping = true;
        await cleanup();
        process.exit();
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (text) => {
        if (text.trim() === 'stop') {
          void stop();
        }
      });
      process.stdin.resume();
    }
  });
