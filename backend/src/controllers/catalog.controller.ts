import type { Request, Response } from 'express';
import { pool } from '../config/db';
import { fail, text, uuid } from '../utils/validation';
import { audit } from '../utils/audit';
import { integer } from '../utils/campaign-access';
const globalAccess = (req: Request) =>
  ['SYSTEM_ADMIN', 'TRAINING_DEPT'].includes(req.user!.active_role);

export const listMajors = async (req: Request, res: Response): Promise<void> => {
  const s = req.user!.scope;
  const { rows } = await pool.query(
    `SELECT m.*,d.name AS department_name,f.name AS faculty_name FROM majors m
    JOIN departments d ON d.id=m.department_id JOIN faculties f ON f.id=d.faculty_id
    WHERE $1::boolean OR (($2::uuid IS NULL OR m.id=$2) AND
      CASE WHEN $3::uuid IS NOT NULL THEN d.id=$3 ELSE f.id=$4::uuid END) ORDER BY m.code`,
    [globalAccess(req), s.major_id, s.department_id, s.faculty_id],
  );
  res.json(rows);
};

export const listSpecializations = async (req: Request, res: Response): Promise<void> => {
  const s = req.user!.scope;
  const { rows } = await pool.query(
    `SELECT sp.*,m.name AS major_name FROM specializations sp JOIN majors m ON m.id=sp.major_id
    JOIN departments d ON d.id=m.department_id WHERE $1::boolean OR (($2::uuid IS NULL OR m.id=$2)
      AND CASE WHEN $3::uuid IS NOT NULL THEN d.id=$3 ELSE d.faculty_id=$4::uuid END) ORDER BY sp.code`,
    [globalAccess(req), s.major_id, s.department_id, s.faculty_id],
  );
  res.json(rows);
};

export const listCampaigns = async (req: Request, res: Response): Promise<void> => {
  const s = req.user!.scope;
  const { rows } = await pool.query(
    `SELECT c.*,f.name AS faculty_name,m.name AS major_name,se.name AS semester_name FROM campaigns c
    JOIN faculties f ON f.id=c.faculty_id LEFT JOIN majors m ON m.id=c.major_id JOIN semesters se ON se.id=c.semester_id
    WHERE $1::boolean OR (c.faculty_id=$2::uuid AND ($3::uuid IS NULL OR c.id=$3)
      AND ($4::uuid IS NULL OR c.major_id=$4 OR c.major_id IS NULL)
      AND ($5::uuid IS NULL OR m.department_id=$5 OR c.major_id IS NULL)) ORDER BY c.created_at DESC`,
    [globalAccess(req), s.faculty_id, s.campaign_id, s.major_id, s.department_id],
  );
  res.json(rows);
};

export const saveMajor = async (req: Request, res: Response): Promise<void> => {
  const { code, name, department_id } = req.body ?? {};
  await saveCatalog(
    req,
    res,
    'majors',
    [text(code, 'Mã ngành', 50), text(name, 'Tên ngành'), uuid(department_id, 'Bộ môn')],
    'department_id',
    req.body.training_system,
  );
};

export const saveSpecialization = async (req: Request, res: Response): Promise<void> => {
  const { code, name, major_id } = req.body ?? {};
  await saveCatalog(
    req,
    res,
    'specializations',
    [text(code, 'Mã chuyên ngành', 50), text(name, 'Tên chuyên ngành'), uuid(major_id, 'Ngành')],
    'major_id',
  );
};

async function saveCatalog(
  req: Request,
  res: Response,
  table: 'majors' | 'specializations',
  values: string[],
  parent: 'department_id' | 'major_id',
  trainingSystem?: unknown,
) {
  const id = req.params.id ? uuid(req.params.id, 'Danh mục') : null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = id
      ? (await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id])).rows[0]
      : null;
    if (id && !before) {
      fail('Không tìm thấy danh mục', 404);
    }
    if (id && before[parent] !== values[2]) {
      fail(
        'Không đổi đơn vị cha của danh mục đã tạo; tạo danh mục mới để tránh thay đổi phạm vi người dùng',
      );
    }
    const system =
      table === 'majors'
        ? text(trainingSystem ?? before?.training_system ?? 'CHINH_QUY', 'Hệ đào tạo', 50)
        : null;
    if (
      system &&
      !(await client.query('SELECT 1 FROM training_systems WHERE code=$1', [system])).rowCount
    ) {
      fail('Hệ đào tạo không tồn tại');
    }
    const { rows } = id
      ? await client.query(`UPDATE ${table} SET code=$1,name=$2 WHERE id=$3 RETURNING *`, [
          values[0],
          values[1],
          id,
        ])
      : await client.query(
          `INSERT INTO ${table} (code,name,${parent}) VALUES ($1,$2,$3) RETURNING *`,
          values,
        );
    if (system) {
      rows[0] = (
        await client.query('UPDATE majors SET training_system=$1 WHERE id=$2 RETURNING *', [
          system,
          rows[0].id,
        ])
      ).rows[0];
    }
    await audit(
      client,
      req,
      id ? 'UPDATE_CATALOG' : 'CREATE_CATALOG',
      table,
      rows[0].id,
      before,
      rows[0],
    );
    await client.query('COMMIT');
    res.status(id ? 200 : 201).json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export const deleteCatalog = async (req: Request, res: Response): Promise<void> => {
  const table = req.path.includes('/specializations/') ? 'specializations' : 'majors';
  const id = uuid(req.params.id, 'Danh mục');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`, [id]);
    if (
      table === 'majors' &&
      (
        await client.query(
          `SELECT 1 WHERE EXISTS (SELECT 1 FROM specializations WHERE major_id=$1)
      OR EXISTS (SELECT 1 FROM user_roles WHERE major_id=$1) OR EXISTS (SELECT 1 FROM campaigns WHERE major_id=$1)
      OR EXISTS (SELECT 1 FROM student_profiles WHERE major_id=$1)`,
          [id],
        )
      ).rowCount
    ) {
      fail('Ngành đang được sử dụng, không thể xóa', 409);
    }
    const { rows } = await client.query(`DELETE FROM ${table} WHERE id=$1 RETURNING *`, [id]);
    if (!rows[0]) {
      fail('Không tìm thấy danh mục', 404);
    }
    await audit(client, req, 'DELETE_CATALOG', table, id, rows[0]);
    await client.query('COMMIT');
    res.json({ message: 'Đã xóa danh mục chưa được sử dụng' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const createCampaign = async (req: Request, res: Response): Promise<void> => {
  const { code, name, faculty_id, major_id, semester_id, type } = req.body ?? {};
  const faculty = uuid(faculty_id, 'Khoa');
  const major = major_id ? uuid(major_id, 'Ngành') : null;
  const values = [
    text(code, 'Mã đợt', 50),
    text(name, 'Tên đợt'),
    faculty,
    major,
    uuid(semester_id, 'Học kỳ'),
    type,
    req.user!.sub,
  ];
  if (!['THESIS', 'INTERNSHIP', 'COMBINED'].includes(type)) {
    fail('Loại đợt không hợp lệ');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (
      major &&
      !(
        await client.query(
          `SELECT 1 FROM majors m JOIN departments d ON d.id=m.department_id WHERE m.id=$1 AND d.faculty_id=$2`,
          [major, faculty],
        )
      ).rowCount
    ) {
      fail('Ngành không thuộc khoa');
    }
    if (
      !globalAccess(req) &&
      (req.user!.active_role !== 'FACULTY_MANAGER' ||
        req.user!.scope.faculty_id !== faculty ||
        req.user!.scope.major_id ||
        req.user!.scope.department_id ||
        req.user!.scope.campaign_id)
    ) {
      fail('Không được tạo đợt ngoài phạm vi khoa', 403);
    }
    const { rows } = await client.query(
      `INSERT INTO campaigns (code,name,faculty_id,major_id,semester_id,type,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      values,
    );
    const b = req.body ?? {};
    if (
      b.training_system &&
      !(
        await client.query('SELECT 1 FROM training_systems WHERE code=$1', [
          text(b.training_system, 'Hệ đào tạo', 50),
        ])
      ).rowCount
    ) {
      fail('Hệ đào tạo không tồn tại');
    }
    if (
      b.allow_student_propose_topic !== undefined &&
      typeof b.allow_student_propose_topic !== 'boolean'
    ) {
      fail('Cờ tự đề xuất không hợp lệ');
    }
    rows[0] = (
      await client.query(
        `UPDATE campaigns SET training_system=$1,max_students_per_topic=$2,max_wish_choices=$3,allow_student_propose_topic=$4 WHERE id=$5 RETURNING *`,
        [
          b.training_system || null,
          integer(b.max_students_per_topic ?? 2, 'SV/đề tài', 1, 50),
          integer(b.max_wish_choices ?? 3, 'Nguyện vọng', 1, 5),
          b.allow_student_propose_topic ?? true,
          rows[0].id,
        ],
      )
    ).rows[0];
    await audit(client, req, 'CREATE_CAMPAIGN', 'campaigns', rows[0].id, null, rows[0]);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
