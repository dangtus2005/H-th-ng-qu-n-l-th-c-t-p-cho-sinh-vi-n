const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-bytes';
const jwt = require('jsonwebtoken');
const { pool } = require('../dist/config/db');
const { authenticateJWT, requireRoles } = require('../dist/middlewares/rbac.middleware');
const { login, switchRole, changePassword } = require('../dist/controllers/auth.controller');
const originalQuery = pool.query;
after(async () => {
  pool.query = originalQuery;
  await pool.end();
});

const user = {
  sub: 'user-1',
  jti: 'session-1',
  code: 'U1',
  active_role: 'STUDENT',
  scope: { faculty_id: null, department_id: null },
};
const sign = (payload = user, secret = process.env.JWT_SECRET, options = {}) =>
  jwt.sign(payload, secret, { expiresIn: '1h', ...options });
const response = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test('rejects absent, malformed, forged, expired and incomplete tokens before querying DB', async () => {
  pool.query = async () => {
    assert.fail('must not query DB');
  };
  for (const header of [
    undefined,
    'Basic abc',
    'Bearer a b',
    'Bearer bad',
    `Bearer ${sign(user, 'wrong-secret')}`,
    `Bearer ${sign(user, undefined, { expiresIn: -1 })}`,
    `Bearer ${sign({ sub: 'user-1' })}`,
    `Bearer ${jwt.sign(user, process.env.JWT_SECRET)}`,
  ]) {
    const req = { headers: { authorization: header }, user };
    const res = response();
    await authenticateJWT(req, res, () => assert.fail('must not continue'));
    assert.equal(res.statusCode, 401);
    assert.equal(req.user, undefined);
  }
});

test('uses current DB identity; denies locked accounts and revoked scopes; DB errors fail closed', async () => {
  const req = { headers: { authorization: `Bearer ${sign()}` } };
  pool.query = async (_sql, params) => {
    assert.deepEqual(params, ['user-1', 'STUDENT', null, null, 'session-1', null, null]);
    return { rows: [{ ...user, code: 'current-code' }] };
  };
  let calls = 0;
  await authenticateJWT(req, response(), () => calls++);
  assert.equal(calls, 1);
  assert.equal(req.user.code, 'current-code');
  pool.query = async () => ({ rows: [] });
  const denied = response();
  await authenticateJWT(req, denied, () => assert.fail('revoked access'));
  assert.equal(denied.statusCode, 401);
  pool.query = async () => {
    throw new Error('database unavailable');
  };
  const unavailable = response();
  await authenticateJWT(req, unavailable, () => assert.fail('DB failure'));
  assert.equal(unavailable.statusCode, 503);
});

test('role guard rejects missing identity and unauthorized role; permits allowed role and admin', () => {
  for (const [identity, expected] of [
    [undefined, 401],
    [user, 403],
    [{ ...user, active_role: 'TRAINING_DEPT' }, 200],
    [{ ...user, active_role: 'SYSTEM_ADMIN' }, 200],
  ]) {
    const res = response();
    let called = false;
    requireRoles(['TRAINING_DEPT'])({ user: identity }, res, () => {
      called = true;
    });
    assert.equal(res.statusCode, expected);
    assert.equal(called, expected === 200);
  }
});

test('invalid login, role and password inputs return 400 without DB writes', async () => {
  pool.query = async () => {
    assert.fail('invalid input must not query DB');
  };
  for (const [handler, body] of [
    [login, undefined],
    [login, { email: [], password: 'x' }],
    [switchRole, {}],
    [changePassword, { old_password: 'old', new_password: '' }],
    [changePassword, { old_password: 'old', new_password: 'a'.repeat(73) }],
  ]) {
    const res = response();
    await handler({ body, user }, res);
    assert.equal(res.statusCode, 400);
  }
});

test('switching roles after the account is disabled returns 401', async () => {
  pool.query = async () => ({ rows: [] });
  const res = response();
  await switchRole({ body: { user_role_id: 'role-1' }, user }, res);
  assert.equal(res.statusCode, 401);
});

test('updating the last active administrator rolls back the entire change', async (t) => {
  const { updateUser } = require('../dist/controllers/accounts.controller');
  const queries = [];
  let released = false;
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.startsWith('SELECT id,code,email')) {
        return {
          rows: [{ id: '11111111-1111-1111-1111-111111111111', is_active: true }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM users u JOIN user_roles')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {
      released = true;
    },
  };
  t.mock.method(pool, 'connect', async () => client);
  await assert.rejects(
    updateUser(
      {
        params: { id: '11111111-1111-1111-1111-111111111111' },
        user,
        body: {
          code: 'ADMIN',
          full_name: 'Administrator',
          email: 'admin@example.invalid',
          is_active: false,
          roles: [{ role_code: 'STUDENT' }],
        },
      },
      response(),
    ),
    { status: 400 },
  );
  assert.ok(queries.includes('ROLLBACK'));
  assert.ok(!queries.includes('COMMIT'));
  assert.ok(released);
});
