import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db';
import { audit } from '../utils/audit';
import { email, fail, password, text, uuid } from '../utils/validation';

type RoleInput = {
  role_code: string;
  faculty_id: string | null;
  department_id: string | null;
  major_id: string | null;
  campaign_id: string | null;
  is_default: boolean;
};

export async function validateRoles(client: PoolClient, input: unknown): Promise<RoleInput[]> {
  if (!Array.isArray(input) || !input.length || input.length > 20) {
    fail('Cần từ 1 đến 20 vai trò');
  }
  const result: RoleInput[] = [];
  const seen = new Set<string>();
  for (const [index, value] of input.entries()) {
    if (!value || typeof value !== 'object') {
      fail('Vai trò không hợp lệ');
    }
    const role = text(value.role_code, 'Vai trò', 40);
    if (!(await client.query('SELECT 1 FROM roles WHERE code = $1', [role])).rowCount) {
      fail('Vai trò không tồn tại');
    }
    let faculty = value.faculty_id ? uuid(value.faculty_id, 'Khoa') : null;
    let department = value.department_id ? uuid(value.department_id, 'Bộ môn') : null;
    let major = value.major_id ? uuid(value.major_id, 'Ngành') : null;
    const campaign = value.campaign_id ? uuid(value.campaign_id, 'Đợt') : null;
    if (major) {
      const row = (await client.query('SELECT department_id FROM majors WHERE id = $1', [major]))
        .rows[0];
      if (!row || (department && department !== row.department_id)) {
        fail('Ngành không thuộc bộ môn đã chọn');
      }
      department = row.department_id;
    }
    if (department) {
      const row = (
        await client.query('SELECT faculty_id FROM departments WHERE id = $1', [department])
      ).rows[0];
      if (!row || (faculty && faculty !== row.faculty_id)) {
        fail('Bộ môn không thuộc khoa đã chọn');
      }
      faculty = row.faculty_id;
    }
    if (campaign) {
      const row = (
        await client.query('SELECT faculty_id, major_id FROM campaigns WHERE id = $1', [campaign])
      ).rows[0];
      if (
        !row ||
        (faculty && faculty !== row.faculty_id) ||
        (major && row.major_id && major !== row.major_id)
      ) {
        fail('Đợt không thuộc phạm vi khoa/ngành đã chọn');
      }
      if (department && row.major_id) {
        const cm = (
          await client.query('SELECT department_id FROM majors WHERE id=$1', [row.major_id])
        ).rows[0];
        if (cm?.department_id !== department) {
          fail('Đợt không thuộc bộ môn đã chọn');
        }
      }
      faculty = row.faculty_id;
      if (!major && row.major_id) {
        major = row.major_id;
        const cm = (await client.query('SELECT department_id FROM majors WHERE id=$1', [major]))
          .rows[0];
        department = cm.department_id;
      }
    }
    if (
      faculty &&
      !(await client.query('SELECT 1 FROM faculties WHERE id=$1', [faculty])).rowCount
    ) {
      fail('Khoa không tồn tại');
    }
    if (
      ['SYSTEM_ADMIN', 'TRAINING_DEPT'].includes(role) &&
      (faculty || department || major || campaign)
    ) {
      fail('Vai trò quản trị/đào tạo phải có phạm vi toàn hệ thống');
    }
    if (role === 'FACULTY_MANAGER' && !faculty) {
      fail('Ban Chủ nhiệm Khoa cần phạm vi khoa');
    }
    if (role === 'DEPT_HEAD' && !department) {
      fail('Trưởng bộ môn cần phạm vi bộ môn');
    }
    const item = {
      role_code: role,
      faculty_id: faculty,
      department_id: department,
      major_id: major,
      campaign_id: campaign,
      is_default: index === 0,
    };
    const key = JSON.stringify([role, faculty, department, major, campaign]);
    if (seen.has(key)) {
      fail('Vai trò/phạm vi bị trùng');
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function saveRoles(client: PoolClient, userId: string, roles: RoleInput[]) {
  await client.query('DELETE FROM user_roles WHERE user_id=$1', [userId]);
  for (const r of roles)
    await client.query(
      `INSERT INTO user_roles (user_id,role_id,faculty_id,department_id,major_id,campaign_id,is_default)
    SELECT $1,id,$3,$4,$5,$6,$7 FROM roles WHERE code=$2`,
      [userId, r.role_code, r.faculty_id, r.department_id, r.major_id, r.campaign_id, r.is_default],
    );
}

export async function createAccount(
  client: PoolClient,
  input: Record<string, unknown>,
  req: Request,
) {
  const account = {
    code: text(input.code, 'Mã tài khoản', 50),
    email: email(input.email),
    full_name: text(input.full_name, 'Họ tên', 150),
  };
  const hash = await bcrypt.hash(password(input.password), 12);
  const roles = await validateRoles(client, input.roles);
  const { rows } = await client.query(
    'INSERT INTO users (code,email,full_name,password_hash,is_active) VALUES ($1,$2,$3,$4,TRUE) RETURNING id',
    [account.code, account.email, account.full_name, hash],
  );
  await saveRoles(client, rows[0].id, roles);
  await audit(client, req, 'CREATE_USER', 'users', rows[0].id, null, { ...account, roles });
  return { id: rows[0].id, ...account };
}

export const createUser = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const account = await createAccount(client, req.body ?? {}, req);
    await client.query('COMMIT');
    res.status(201).json(account);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listUsers = async (req: Request, res: Response): Promise<void> => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 150) : '';
  const page = Number(req.query.page || 1);
  if (!Number.isInteger(page) || page < 1 || page > 100000) {
    fail('Trang không hợp lệ');
  }
  const filter = `%${search}%`;
  const total = Number(
    (
      await pool.query(
        'SELECT count(*) FROM users WHERE code ILIKE $1 OR email ILIKE $1 OR full_name ILIKE $1',
        [filter],
      )
    ).rows[0].count,
  );
  const { rows } = await pool.query(
    `SELECT u.id,u.code,u.email,u.full_name,u.is_active,
    COALESCE((SELECT json_agg(json_build_object('role_code',r.code,'role_name',r.name,'faculty_id',ur.faculty_id,
      'department_id',ur.department_id,'major_id',ur.major_id,'campaign_id',ur.campaign_id) ORDER BY ur.is_default DESC,ur.id)
      FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id),'[]') AS roles
    FROM users u WHERE u.code ILIKE $1 OR u.email ILIKE $1 OR u.full_name ILIKE $1
    ORDER BY u.code LIMIT 50 OFFSET $2`,
    [filter, (page - 1) * 50],
  );
  res.json({ items: rows, total, page, pages: Math.max(1, Math.ceil(total / 50)) });
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  const id = uuid(req.params.id, 'Tài khoản');
  const { code, full_name, email: address, is_active, roles } = req.body ?? {};
  if (typeof is_active !== 'boolean') {
    fail('Trạng thái tài khoản không hợp lệ');
  }
  const values = [
    text(code, 'Mã tài khoản', 50),
    text(full_name, 'Họ tên', 150),
    email(address),
    is_active,
    id,
  ];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Hai quản trị viên không được đồng thời khóa hoặc gỡ quản trị viên cuối cùng.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('qlth-admin-management'))");
    const before = (
      await client.query(
        'SELECT id,code,email,full_name,is_active FROM users WHERE id=$1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (!before) {
      fail('Tài khoản không tồn tại', 404);
    }
    const normalized = await validateRoles(client, roles);
    await client.query(
      'UPDATE users SET code=$1,full_name=$2,email=$3,is_active=$4,updated_at=NOW() WHERE id=$5',
      values,
    );
    await saveRoles(client, id, normalized);
    if (
      !(
        await client.query(`SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
      WHERE u.is_active=TRUE AND r.code='SYSTEM_ADMIN' LIMIT 1`)
      ).rowCount
    ) {
      fail('Phải giữ ít nhất một quản trị viên đang hoạt động');
    }
    await client.query('DELETE FROM auth_sessions WHERE user_id=$1', [id]);
    await client.query('DELETE FROM password_resets WHERE user_id=$1', [id]);
    await audit(client, req, 'UPDATE_USER', 'users', id, before, {
      code,
      full_name,
      email: values[2],
      is_active,
      roles: normalized,
    });
    await client.query('COMMIT');
    res.json({ message: 'Đã cập nhật tài khoản và thu hồi các phiên cũ' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getOptions = async (_req: Request, res: Response): Promise<void> => {
  const result: Record<string, unknown> = {};
  for (const table of ['roles', 'faculties', 'departments', 'majors', 'campaigns']) {
    result[table] = (await pool.query(`SELECT * FROM ${table} ORDER BY code`)).rows;
  }
  res.json(result);
};

export const listAudit = async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query.page || 1);
  if (!Number.isInteger(page) || page < 1 || page > 100000) {
    fail('Trang không hợp lệ');
  }
  const { rows } = await pool.query(
    `SELECT a.id,a.action,a.entity_table,a.entity_id,a.created_at,a.actor_role,u.full_name AS actor_name
    FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.id DESC LIMIT 50 OFFSET $1`,
    [(page - 1) * 50],
  );
  res.json(rows);
};
