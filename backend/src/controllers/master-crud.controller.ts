import type { Request, Response } from 'express';
import { pool } from '../config/db';
import { audit } from '../utils/audit';
import { fail, text, uuid } from '../utils/validation';

const tables = {
  faculties: 'faculties',
  departments: 'departments',
  'academic-years': 'academic_years',
  semesters: 'semesters',
  'training-systems': 'training_systems',
} as const;

function tableFor(req: Request) {
  const key = req.path.split('/')[4] as keyof typeof tables;
  return tables[key] || fail('Danh mục không hợp lệ');
}

export const listTrainingSystems = async (_req: Request, res: Response) => {
  res.json((await pool.query('SELECT * FROM training_systems ORDER BY code')).rows);
};

export const saveMaster = async (req: Request, res: Response) => {
  const table = tableFor(req);
  const id = req.params.id ? uuid(req.params.id, 'Danh mục') : null;
  const body = req.body ?? {};
  const fields: Record<string, unknown> = {
    code: text(body.code, 'Mã', ['academic_years', 'semesters'].includes(table) ? 20 : 50),
  };
  if (table !== 'academic_years') {
    fields.name = text(body.name, 'Tên', table === 'semesters' ? 100 : 255);
  }
  if (table === 'faculties') {
    fields.description = body.description ? text(body.description, 'Mô tả', 5000) : null;
  }
  if (table === 'departments') {
    fields.faculty_id = uuid(body.faculty_id, 'Khoa');
  }
  if (table === 'academic_years') {
    if (
      !Number.isInteger(body.start_year) ||
      !Number.isInteger(body.end_year) ||
      body.start_year < 1900 ||
      body.end_year > 2200 ||
      body.end_year <= body.start_year
    ) {
      fail('Năm học không hợp lệ');
    }
    fields.start_year = body.start_year;
    fields.end_year = body.end_year;
  }
  if (table === 'semesters') {
    fields.academic_year_id = uuid(body.academic_year_id, 'Năm học');
    for (const key of ['start_date', 'end_date']) {
      const v = body[key];
      if (
        typeof v !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        !Number.isFinite(Date.parse(v)) ||
        new Date(v).toISOString().slice(0, 10) !== v
      ) {
        fail('Ngày học kỳ không hợp lệ');
      }
      fields[key] = v;
    }
    if (body.start_date > body.end_date || typeof body.is_current !== 'boolean') {
      fail('Ngày hoặc trạng thái không hợp lệ');
    }
    fields.is_current = body.is_current;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (table === 'semesters') {
      await client.query('LOCK TABLE semesters IN SHARE ROW EXCLUSIVE MODE');
    }
    const before = id
      ? (await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id])).rows[0]
      : null;
    if (id && !before) {
      fail('Không tìm thấy danh mục', 404);
    }
    const parent =
      table === 'departments' ? 'faculty_id' : table === 'semesters' ? 'academic_year_id' : null;
    if (before && parent && before[parent] !== fields[parent]) {
      fail('Không đổi đơn vị cha của danh mục đã tạo');
    }
    if (table === 'semesters' && fields.is_current) {
      const previous = await client.query(
        'UPDATE semesters SET is_current=false WHERE is_current=true AND id IS DISTINCT FROM $1::uuid RETURNING *',
        [id],
      );
      for (const row of previous.rows)
        await audit(
          client,
          req,
          'UNSET_CURRENT_SEMESTER',
          table,
          row.id,
          { ...row, is_current: true },
          row,
        );
    }
    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const result = id
      ? await client.query(
          `UPDATE ${table} SET ${columns.map((c, i) => `${c}=$${i + 1}`).join(',')} WHERE id=$${values.length + 1} RETURNING *`,
          [...values, id],
        )
      : await client.query(
          `INSERT INTO ${table} (${columns.join(',')}) VALUES (${values.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
          values,
        );
    await audit(
      client,
      req,
      id ? 'UPDATE_CATALOG' : 'CREATE_CATALOG',
      table,
      result.rows[0].id,
      before,
      result.rows[0],
    );
    await client.query('COMMIT');
    res.status(id ? 200 : 201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deleteMaster = async (req: Request, res: Response) => {
  const table = tableFor(req);
  const id = uuid(req.params.id, 'Danh mục');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = (await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id]))
      .rows[0];
    if (!before) {
      fail('Không tìm thấy danh mục', 404);
    }
    // Kiểm tra mọi khóa ngoại, kể cả ON DELETE CASCADE/SET NULL, để không mất dữ liệu nghiệp vụ.
    const references = await client.query(
      `SELECT ns.nspname AS schema_name,t.relname AS table_name,a.attname AS column_name,b.attname AS target_column
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
      JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=c.confkey[1]
      WHERE c.contype='f' AND c.confrelid=to_regclass($1)`,
      [`public.${table}`],
    );
    const quote = (s: string) => '"' + s.replace(/"/g, '""') + '"';
    for (const r of references.rows) {
      if (
        (
          await client.query(
            `SELECT 1 FROM ${quote(r.schema_name)}.${quote(r.table_name)} WHERE ${quote(r.column_name)}=$1 LIMIT 1`,
            [before[r.target_column]],
          )
        ).rowCount
      ) {
        fail('Danh mục đang được sử dụng, không thể xóa', 409);
      }
    }
    await client.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
    await audit(client, req, 'DELETE_CATALOG', table, id, before);
    await client.query('COMMIT');
    res.json({ message: 'Đã xóa danh mục chưa được sử dụng' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
