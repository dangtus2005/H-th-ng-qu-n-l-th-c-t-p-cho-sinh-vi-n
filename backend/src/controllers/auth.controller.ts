import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';
import { JWT_SECRET } from '../config/env';
import type { JwtUserPayload, RoleScopeItem } from '../types/auth.types';
import { audit } from '../utils/audit';

async function getUserRoleScopes(
  userId: string,
  db: Pick<typeof pool, 'query'> = pool,
): Promise<RoleScopeItem[]> {
  const { rows } = await db.query<RoleScopeItem>(
    `SELECT ur.id AS user_role_id, r.code AS role_code, r.name AS role_name,
            ur.faculty_id, f.name AS faculty_name, ur.department_id,
            d.name AS department_name, ur.is_default, ur.major_id, m.name AS major_name,
            ur.campaign_id, c.name AS campaign_name
     FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     LEFT JOIN faculties f ON f.id = ur.faculty_id
     LEFT JOIN departments d ON d.id = ur.department_id
     LEFT JOIN majors m ON m.id = ur.major_id
     LEFT JOIN campaigns c ON c.id = ur.campaign_id
     WHERE ur.user_id = $1 ORDER BY ur.is_default DESC, r.code, ur.id`,
    [userId],
  );
  return rows;
}

function accessToken(
  user: { id: string; code: string },
  role: RoleScopeItem,
  sessionId: string,
  expiresAt: Date,
) {
  const payload: JwtUserPayload & { exp: number } = {
    sub: user.id,
    code: user.code,
    jti: sessionId,
    active_role: role.role_code,
    scope: {
      faculty_id: role.faculty_id,
      department_id: role.department_id,
      major_id: role.major_id,
      campaign_id: role.campaign_id,
    },
    exp: Math.floor(expiresAt.getTime() / 1000),
  };
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256' });
}

export async function createSsoSession(userId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = (
      await client.query(
        'SELECT id,code,email,full_name FROM users WHERE id=$1 AND is_active=TRUE FOR UPDATE',
        [userId],
      )
    ).rows[0];
    if (!user) {
      throw new Error('Inactive account');
    }
    const roles = await getUserRoleScopes(user.id, client);
    const role = roles[0];
    if (!role) {
      throw new Error('Missing role');
    }
    const id = randomUUID();
    const expires = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await client.query(
      'INSERT INTO auth_sessions (id,user_id,user_role_id,expires_at) VALUES ($1,$2,$3,$4)',
      [id, user.id, role.user_role_id, expires],
    );
    await client.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);
    const result = {
      access_token: accessToken(user, role, id, expires),
      user,
      active_role: role,
      available_roles: roles,
    };
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    res.status(400).json({ message: 'Email và mật khẩu là bắt buộc' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Cùng khóa với đổi mật khẩu để không tạo phiên từ mật khẩu cũ sau khi thu hồi.
    const { rows } = await client.query(
      'SELECT id, code, email, full_name, password_hash, is_active FROM users WHERE lower(email) = lower($1) FOR UPDATE',
      [email.trim()],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash || ''))) {
      await client.query('ROLLBACK');
      res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác' });
      return;
    }
    if (!user.is_active) {
      await client.query('ROLLBACK');
      res.status(403).json({ message: 'Tài khoản đã bị vô hiệu hóa' });
      return;
    }
    const roles = await getUserRoleScopes(user.id, client);
    const role = roles[0];
    if (!role) {
      await client.query('ROLLBACK');
      res.status(403).json({ message: 'Tài khoản chưa được gán vai trò' });
      return;
    }
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await client.query('DELETE FROM auth_sessions WHERE expires_at <= NOW()');
    await client.query(
      'INSERT INTO auth_sessions (id, user_id, user_role_id, expires_at) VALUES ($1,$2,$3,$4)',
      [sessionId, user.id, role.user_role_id, expiresAt],
    );
    await client.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    const token = accessToken(user, role, sessionId, expiresAt);
    await client.query('COMMIT');
    res.json({
      access_token: token,
      user: { id: user.id, code: user.code, email: user.email, full_name: user.full_name },
      active_role: role,
      available_roles: roles,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Login error:', error);
    res.status(500).json({ message: 'Không thể đăng nhập lúc này' });
  } finally {
    client.release();
  }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    'SELECT id, code, full_name, email FROM users WHERE id = $1 AND is_active = TRUE',
    [req.user!.sub],
  );
  const roles = await getUserRoleScopes(req.user!.sub);
  const { rows: sessions } = await pool.query(
    'SELECT user_role_id FROM auth_sessions WHERE id = $1 AND expires_at > NOW()',
    [req.user!.jti],
  );
  const role = roles.find((r) => r.user_role_id === sessions[0]?.user_role_id);
  if (!rows[0] || !role) {
    res.status(401).json({ message: 'Phiên đăng nhập không còn hợp lệ' });
    return;
  }
  res.json({ user: rows[0], active_role: role, available_roles: roles });
};

export const switchRole = async (req: Request, res: Response): Promise<void> => {
  const { user_role_id } = req.body ?? {};
  if (typeof user_role_id !== 'string' || !user_role_id.trim()) {
    res.status(400).json({ message: 'user_role_id là bắt buộc' });
    return;
  }
  const { rows } = await pool.query(
    'SELECT id, code, full_name, email FROM users WHERE id = $1 AND is_active = TRUE',
    [req.user!.sub],
  );
  const user = rows[0];
  if (!user) {
    res.status(401).json({ message: 'Tài khoản không còn hoạt động' });
    return;
  }
  const roles = await getUserRoleScopes(user.id);
  const role = roles.find((r) => r.user_role_id === user_role_id);
  if (!role) {
    res.status(403).json({ message: 'Bạn không sở hữu vai trò hoặc phạm vi này' });
    return;
  }
  const { rows: sessions } = await pool.query(
    'UPDATE auth_sessions SET user_role_id = $1 WHERE id = $2 AND user_id = $3 AND expires_at > NOW() RETURNING expires_at',
    [role.user_role_id, req.user!.jti, user.id],
  );
  if (!sessions[0]) {
    res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn' });
    return;
  }
  res.json({
    access_token: accessToken(user, role, req.user!.jti, sessions[0].expires_at),
    user,
    active_role: role,
    available_roles: roles,
  });
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  await pool.query('DELETE FROM auth_sessions WHERE id = $1 AND user_id = $2', [
    req.user!.jti,
    req.user!.sub,
  ]);
  res.json({ message: 'Đã đăng xuất' });
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const { old_password, new_password } = req.body ?? {};
  if (
    typeof old_password !== 'string' ||
    !old_password ||
    typeof new_password !== 'string' ||
    new_password.length < 8 ||
    Buffer.byteLength(new_password, 'utf8') > 72
  ) {
    res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 8 ký tự và không quá 72 byte' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT password_hash FROM users WHERE id = $1 AND is_active = TRUE FOR UPDATE',
      [req.user!.sub],
    );
    if (!rows[0] || !(await bcrypt.compare(old_password, rows[0].password_hash || ''))) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Mật khẩu hiện tại không chính xác' });
      return;
    }
    const hash = await bcrypt.hash(new_password, 12);
    await client.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      hash,
      req.user!.sub,
    ]);
    await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [req.user!.sub]);
    await client.query('DELETE FROM password_resets WHERE user_id = $1', [req.user!.sub]);
    await audit(client, req, 'CHANGE_PASSWORD', 'users', req.user!.sub);
    await client.query('COMMIT');
    res.json({ message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại trên tất cả thiết bị.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Không thể đổi mật khẩu lúc này' });
  } finally {
    client.release();
  }
};
