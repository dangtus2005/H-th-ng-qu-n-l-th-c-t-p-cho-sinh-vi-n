const assert = require('node:assert/strict');
const { randomUUID, generateKeyPairSync } = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { app } = require('../dist/server');
const { pool } = require('../dist/config/db');
const prefix = `completion_${randomUUID().slice(0, 8)}`;
let server;
let base;
let assertions = 0;
const created = {
  users: [],
  faculties: [],
  departments: [],
  years: [],
  semesters: [],
  systems: [],
  majors: [],
};
const nativeFetch = global.fetch;
const password = 'Completion-test!123';

async function call(route, token, body, status = 200, method) {
  const r = await nativeFetch(base + '/api/v1' + route, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const data = await r.json();
  assert.equal(r.status, status, route + ': ' + JSON.stringify(data));
  assertions++;
  return data;
}

async function run() {
  const userId = randomUUID();
  created.users.push(userId);
  await pool.query(
    'INSERT INTO users (id,code,email,full_name,password_hash,is_active) VALUES ($1,$2,$3,$4,$5,true)',
    [
      userId,
      prefix,
      prefix + '@example.invalid',
      'Completion test',
      await bcrypt.hash(password, 10),
    ],
  );
  await pool.query(
    "INSERT INTO user_roles (user_id,role_id,is_default) SELECT $1,id,true FROM roles WHERE code='SYSTEM_ADMIN'",
    [userId],
  );
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
  const token = (await call('/auth/login', null, { email: prefix + '@example.invalid', password }))
    .access_token;
  const faculty = await call(
    '/master-data/faculties',
    token,
    { code: prefix, name: 'Khoa test' },
    201,
  );
  created.faculties.push(faculty.id);
  await call(
    '/master-data/faculties/' + faculty.id,
    token,
    { code: prefix, name: 'Đã sửa', description: 'Test' },
    200,
    'PATCH',
  );
  await call(
    '/master-data/faculties/' + faculty.id,
    token,
    { code: prefix, name: '' },
    400,
    'PATCH',
  );
  const dep = await call(
    '/master-data/departments',
    token,
    { faculty_id: faculty.id, code: prefix, name: 'Bộ môn test' },
    201,
  );
  created.departments.push(dep.id);
  await call('/master-data/faculties/' + faculty.id, token, null, 409, 'DELETE');
  await call(
    '/master-data/departments/' + dep.id,
    token,
    { faculty_id: faculty.id, code: prefix, name: 'Bộ môn sửa' },
    200,
    'PATCH',
  );
  const system = await call(
    '/master-data/training-systems',
    token,
    { code: prefix, name: 'Hệ test' },
    201,
  );
  created.systems.push(system.id);
  await call(
    '/master-data/training-systems/' + system.id,
    token,
    { code: prefix + '_edit', name: 'Hệ sửa' },
    200,
    'PATCH',
  );
  const major = await call(
    '/master-data/majors',
    token,
    { code: prefix, name: 'Ngành test', department_id: dep.id, training_system: prefix + '_edit' },
    201,
  );
  created.majors.push(major.id);
  assert.equal(major.training_system, prefix + '_edit');
  assertions++;
  await call('/master-data/training-systems/' + system.id, token, null, 409, 'DELETE');
  await call('/master-data/departments/' + dep.id, token, null, 409, 'DELETE');
  const year = await call(
    '/master-data/academic-years',
    token,
    { code: prefix, start_year: 2090, end_year: 2091 },
    201,
  );
  created.years.push(year.id);
  await call(
    '/master-data/academic-years/' + year.id,
    token,
    { code: prefix, start_year: 2091, end_year: 2090 },
    400,
    'PATCH',
  );
  await call(
    '/master-data/academic-years/' + year.id,
    token,
    { code: prefix, start_year: 2091, end_year: 2092 },
    200,
    'PATCH',
  );
  const semester = await call(
    '/master-data/semesters',
    token,
    {
      code: prefix,
      name: 'Học kỳ test',
      academic_year_id: year.id,
      start_date: '2091-01-01',
      end_date: '2091-06-01',
      is_current: false,
    },
    201,
  );
  created.semesters.push(semester.id);
  await call('/master-data/academic-years/' + year.id, token, null, 409, 'DELETE');
  await call(
    '/master-data/semesters/' + semester.id,
    token,
    {
      code: prefix,
      name: 'Học kỳ sửa',
      academic_year_id: year.id,
      start_date: '2091-02-30',
      end_date: '2091-06-01',
      is_current: false,
    },
    400,
    'PATCH',
  );
  await call(
    '/master-data/semesters/' + semester.id,
    token,
    {
      code: prefix,
      name: 'Học kỳ sửa',
      academic_year_id: year.id,
      start_date: '2091-02-01',
      end_date: '2091-06-01',
      is_current: false,
    },
    200,
    'PATCH',
  );
  await call('/master-data/semesters/' + randomUUID(), token, null, 404, 'DELETE');
  await call(
    '/master-data/faculties/' + faculty.id,
    null,
    { code: prefix, name: 'Unauthorized' },
    401,
    'PATCH',
  );
  await ssoTests(userId, token);
  for (const [route, id] of [
    ['semesters', semester.id],
    ['academic-years', year.id],
    ['majors', major.id],
    ['departments', dep.id],
    ['faculties', faculty.id],
    ['training-systems', system.id],
  ])
    await call('/master-data/' + route + '/' + id, token, null, 200, 'DELETE');
  console.log(`${assertions} Sprint 1 completion assertions passed`);
}

async function ssoTests(userId, token) {
  Object.assign(process.env, {
    APP_URL: base,
    GOOGLE_CLIENT_ID: 'fake-client',
    GOOGLE_CLIENT_SECRET: 'fake-secret',
    GOOGLE_HOSTED_DOMAIN: 'school.example.invalid',
  });
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  Object.assign(jwk, { kid: 'fixture', alg: 'RS256', use: 'sig' });
  let nonce;
  let wrongNonce = false;
  let subject = 'fixture-subject';
  const issuer = 'https://accounts.google.com';
  global.fetch = async (input, options) => {
    const url = String(input instanceof Request ? input.url : input);
    const json = (data) =>
      new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    if (url.startsWith(issuer + '/.well-known/')) {
      return json({
        issuer,
        authorization_endpoint: issuer + '/auth',
        token_endpoint: issuer + '/token',
        jwks_uri: issuer + '/jwks',
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (url === issuer + '/jwks') {
      return json({ keys: [jwk] });
    }
    if (url === issuer + '/token') {
      return json({
        access_token: 'fixture-access',
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: jwt.sign(
          {
            sub: subject,
            hd: process.env.GOOGLE_HOSTED_DOMAIN,
            email_verified: true,
            nonce: wrongNonce ? 'bad-nonce' : nonce,
          },
          privateKey,
          { algorithm: 'RS256', keyid: 'fixture', issuer, audience: 'fake-client', expiresIn: 300 },
        ),
      });
    }
    return nativeFetch(input, options);
  };
  const enabled = await call('/auth/sso/providers');
  assert.ok(enabled.includes('google'));
  assertions++;
  await call('/auth/sso/link', token, { provider: 'google', password: 'wrong' }, 400);
  async function flow(link = false) {
    const r = await nativeFetch(base + '/api/v1/auth/sso/' + (link ? 'link' : 'google'), {
      method: link ? 'POST' : 'GET',
      headers: link ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } : {},
      body: link ? JSON.stringify({ provider: 'google', password }) : undefined,
      redirect: 'manual',
    });
    assert.equal(r.status, link ? 200 : 302);
    assertions++;
    const url = new URL(link ? (await r.json()).url : r.headers.get('location'));
    nonce = url.searchParams.get('nonce');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assertions++;
    return {
      state: url.searchParams.get('state'),
      cookie: r.headers.get('set-cookie').split(';')[0],
    };
  }
  async function callback(flow, cookie = flow.cookie) {
    return nativeFetch(
      base + '/api/v1/auth/sso/google/callback?code=fixture-code&state=' + flow.state,
      { headers: { Cookie: cookie }, redirect: 'manual' },
    );
  }
  let f = await flow(true);
  let r = await callback(f);
  assert.equal(r.headers.get('location'), base + '/#sso-linked');
  assertions++;
  assert.equal(
    (await pool.query('SELECT sso_id FROM users WHERE id=$1', [userId])).rows[0].sso_id,
    subject,
  );
  assertions++;
  f = await flow();
  r = await callback(f);
  const ticket = new URL(r.headers.get('location')).hash.slice(5);
  assert.ok(ticket);
  assertions++;
  async function exchange(cookie, value, status) {
    const r = await nativeFetch(base + '/api/v1/auth/sso/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ ticket: value }),
    });
    const data = await r.json();
    assert.equal(r.status, status, JSON.stringify(data));
    assertions++;
    return data;
  }
  await exchange('qlth_sso=' + 'A'.repeat(43), ticket, 400);
  const session = await exchange(f.cookie, ticket, 200);
  assert.equal(session.user.id, userId);
  assertions++;
  await exchange(f.cookie, ticket, 400);
  r = await callback(f);
  assert.equal(r.headers.get('location'), base + '/#sso-error');
  assertions++;
  f = await flow();
  wrongNonce = true;
  r = await callback(f);
  wrongNonce = false;
  assert.equal(r.headers.get('location'), base + '/#sso-error');
  assertions++;
  f = await flow();
  r = await callback(f, 'qlth_sso=' + 'B'.repeat(43));
  assert.equal(r.headers.get('location'), base + '/#sso-error');
  assertions++;
  subject = 'unlinked-identity';
  f = await flow();
  r = await callback(f);
  assert.equal(r.headers.get('location'), base + '/#sso-error');
  assertions++;
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    global.fetch = nativeFetch;
    if (server) {
      await new Promise((r) => server.close(r));
    }
    await pool.query('DELETE FROM audit_logs WHERE actor_id=ANY($1::uuid[])', [created.users]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [created.users]);
    for (const [table, key] of [
      ['majors', 'majors'],
      ['semesters', 'semesters'],
      ['academic_years', 'years'],
      ['departments', 'departments'],
      ['faculties', 'faculties'],
      ['training_systems', 'systems'],
    ])
      await pool.query(`DELETE FROM ${table} WHERE id=ANY($1::uuid[])`, [created[key]]);
    await pool.end();
  });
