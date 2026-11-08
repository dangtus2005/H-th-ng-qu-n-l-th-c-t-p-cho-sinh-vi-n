import type { Request, Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../config/db';
import { audit } from '../utils/audit';

export const uploadDirectory = path.resolve(__dirname, '../../uploads/templates');

const globalAccess = (req: Request) =>
  ['SYSTEM_ADMIN', 'TRAINING_DEPT'].includes(req.user!.active_role);

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

function text(value: unknown, name: string, max = 255): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    invalid(`${name} là bắt buộc, tối đa ${max} ký tự`);
  }
  return (value as string).trim();
}

function uuid(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) {
    invalid(`${name} không hợp lệ`);
  }
  return value as string;
}

export const getFaculties = async (req: Request, res: Response): Promise<void> => {
  const { scope } = req.user!;
  const { rows } = await pool.query(
    `SELECT f.* FROM faculties f WHERE $1::boolean OR f.id = $2::uuid
      OR EXISTS (SELECT 1 FROM departments d WHERE d.id = $3::uuid AND d.faculty_id = f.id)
     ORDER BY f.code`,
    [globalAccess(req), scope.faculty_id, scope.department_id],
  );
  res.json(rows);
};

export const createFaculty = async (req: Request, res: Response): Promise<void> => {
  const { code, name, description } = req.body ?? {};
  const values = [
    text(code, 'Mã khoa', 50),
    text(name, 'Tên khoa'),
    description ? text(description, 'Mô tả', 5000) : null,
  ];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO faculties (code, name, description) VALUES ($1,$2,$3) RETURNING *',
      values,
    );
    await audit(client, req, 'CREATE_FACULTY', 'faculties', rows[0].id, null, rows[0]);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getDepartments = async (req: Request, res: Response): Promise<void> => {
  const faculty = req.query.faculty_id ? uuid(req.query.faculty_id, 'Khoa') : null;
  const { scope, active_role } = req.user!;
  const { rows } = await pool.query(
    `SELECT d.*, f.name AS faculty_name FROM departments d JOIN faculties f ON f.id = d.faculty_id
     WHERE ($1::boolean OR (CASE WHEN $2::text = 'DEPT_HEAD' OR $3::uuid IS NOT NULL THEN d.id = $3 ELSE d.faculty_id = $4::uuid END))
       AND ($5::uuid IS NULL OR d.faculty_id = $5) ORDER BY d.code`,
    [globalAccess(req), active_role, scope.department_id, scope.faculty_id, faculty],
  );
  res.json(rows);
};

export const createDepartment = async (req: Request, res: Response): Promise<void> => {
  const { code, name, faculty_id } = req.body ?? {};
  const values = [uuid(faculty_id, 'Khoa'), text(code, 'Mã bộ môn', 50), text(name, 'Tên bộ môn')];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO departments (faculty_id,code,name) VALUES ($1,$2,$3) RETURNING *',
      values,
    );
    await audit(client, req, 'CREATE_DEPARTMENT', 'departments', rows[0].id, null, rows[0]);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getAcademicYears = async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query('SELECT * FROM academic_years ORDER BY start_year DESC');
  res.json(rows);
};

export const createAcademicYear = async (req: Request, res: Response): Promise<void> => {
  const { code, start_year, end_year } = req.body ?? {};
  if (
    !Number.isInteger(start_year) ||
    !Number.isInteger(end_year) ||
    start_year < 1900 ||
    end_year > 2200 ||
    end_year <= start_year
  ) {
    invalid('Năm học không hợp lệ');
  }
  const values = [text(code, 'Mã năm học', 50), start_year, end_year];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO academic_years (code,start_year,end_year) VALUES ($1,$2,$3) RETURNING *',
      values,
    );
    await audit(client, req, 'CREATE_ACADEMIC_YEAR', 'academic_years', rows[0].id, null, rows[0]);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getSemesters = async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(`SELECT s.*, a.code AS academic_year_code FROM semesters s
    JOIN academic_years a ON a.id = s.academic_year_id ORDER BY s.start_date DESC`);
  res.json(rows);
};

export const createSemester = async (req: Request, res: Response): Promise<void> => {
  const { academic_year_id, code, name, start_date, end_date, is_current = false } = req.body ?? {};
  const validDate = (v: unknown): v is string =>
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  if (
    !validDate(start_date) ||
    !validDate(end_date) ||
    start_date > end_date ||
    typeof is_current !== 'boolean'
  ) {
    invalid('Ngày học kỳ hoặc cờ hiện tại không hợp lệ');
  }
  const values = [
    uuid(academic_year_id, 'Năm học'),
    text(code, 'Mã học kỳ', 50),
    text(name, 'Tên học kỳ'),
    start_date,
    end_date,
    is_current,
  ];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Ngăn hai yêu cầu đồng thời tạo hai học kỳ hiện tại.
    await client.query('LOCK TABLE semesters IN SHARE ROW EXCLUSIVE MODE');
    if (is_current) {
      const previous = await client.query(
        'UPDATE semesters SET is_current = FALSE WHERE is_current = TRUE RETURNING *',
      );
      for (const semester of previous.rows)
        await audit(
          client,
          req,
          'UNSET_CURRENT_SEMESTER',
          'semesters',
          semester.id,
          { ...semester, is_current: true },
          semester,
        );
    }
    const { rows } = await client.query(
      `INSERT INTO semesters (academic_year_id,code,name,start_date,end_date,is_current)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      values,
    );
    await audit(client, req, 'CREATE_SEMESTER', 'semesters', rows[0].id, null, rows[0]);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getDocumentTemplates = async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    `SELECT t.*, f.name AS faculty_name, sf.original_name, sf.file_size FROM document_templates t
     JOIN system_files sf ON sf.id = t.file_id LEFT JOIN faculties f ON f.id = t.faculty_id
     WHERE $1::boolean OR t.faculty_id IS NULL OR t.faculty_id = $2::uuid
       OR EXISTS (SELECT 1 FROM departments d WHERE d.id = $3::uuid AND d.faculty_id = t.faculty_id)
     ORDER BY t.created_at DESC`,
    [globalAccess(req), req.user!.scope.faculty_id, req.user!.scope.department_id],
  );
  res.json(rows);
};

export const uploadDocumentTemplate = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    invalid('Vui lòng đính kèm biểu mẫu PDF, DOC hoặc DOCX');
  }
  const file = req.file!;
  const { code, name, faculty_id } = req.body ?? {};
  const templateCode = text(code, 'Mã biểu mẫu', 50);
  const templateName = text(name, 'Tên biểu mẫu');
  const faculty = faculty_id ? uuid(faculty_id, 'Khoa') : req.user!.scope.faculty_id;
  if (
    !globalAccess(req) &&
    (!req.user!.scope.faculty_id || faculty !== req.user!.scope.faculty_id)
  ) {
    res.status(403).json({ message: 'Chỉ được tải biểu mẫu cho khoa của bạn' });
    return;
  }
  const ext = path.extname(file.originalname).toLowerCase();
  const header = file.buffer.subarray(0, 8);
  const valid =
    (ext === '.pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-') ||
    (ext === '.doc' && header.toString('hex') === 'd0cf11e0a1b11ae1') ||
    (ext === '.docx' &&
      header.subarray(0, 4).toString('hex') === '504b0304' &&
      file.buffer.includes(Buffer.from('[Content_Types].xml')) &&
      file.buffer.includes(Buffer.from('word/document.xml')));
  if (!valid) {
    invalid('Nội dung file không khớp định dạng PDF, DOC hoặc DOCX');
  }
  const filename = `${randomUUID()}${ext}`;
  const filePath = path.join(uploadDirectory, filename);
  const mime =
    ext === '.pdf'
      ? 'application/pdf'
      : ext === '.doc'
        ? 'application/msword'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    await fs.mkdir(uploadDirectory, { recursive: true });
    await fs.writeFile(filePath, file.buffer, { flag: 'wx' });
    const { rows: files } = await client.query(
      `INSERT INTO system_files (uploaded_by,original_name,file_path,file_size,mime_type,checksum)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        req.user!.sub,
        file.originalname,
        filePath,
        file.size,
        mime,
        createHash('sha256').update(file.buffer).digest('hex'),
      ],
    );
    const { rows } = await client.query(
      `INSERT INTO document_templates (faculty_id,code,name,file_id,is_active)
      VALUES ($1,$2,$3,$4,TRUE) RETURNING *`,
      [faculty, templateCode, templateName, files[0].id],
    );
    await audit(client, req, 'UPLOAD_TEMPLATE', 'document_templates', rows[0].id, null, rows[0]);
    await client.query('COMMIT');
    committed = true;
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    if (!committed) {
      await fs.rm(filePath, { force: true });
    }
    throw error;
  } finally {
    client.release();
  }
};

export const downloadDocumentTemplate = async (req: Request, res: Response): Promise<void> => {
  const id = uuid(req.params.id, 'Biểu mẫu');
  const { rows } = await pool.query(
    `SELECT sf.file_path, sf.original_name FROM document_templates t
    JOIN system_files sf ON sf.id = t.file_id WHERE t.id = $1 AND t.is_active = TRUE
    AND ($2::boolean OR t.faculty_id IS NULL OR t.faculty_id = $3::uuid
      OR EXISTS (SELECT 1 FROM departments d WHERE d.id = $4::uuid AND d.faculty_id = t.faculty_id))`,
    [id, globalAccess(req), req.user!.scope.faculty_id, req.user!.scope.department_id],
  );
  if (!rows[0]) {
    res.status(404).json({ message: 'Không tìm thấy biểu mẫu trong phạm vi của bạn' });
    return;
  }
  const resolved = path.resolve(rows[0].file_path);
  const relative = path.relative(uploadDirectory, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid stored file path');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(resolved, rows[0].original_name);
};
