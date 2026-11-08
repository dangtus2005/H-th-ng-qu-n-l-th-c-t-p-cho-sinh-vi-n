import type { Request, Response } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../config/db';
import { email, fail, text, uuid } from '../utils/validation';
import { audit } from '../utils/audit';
import { campaignAccess, integer } from '../utils/campaign-access';

export const cvDirectory = path.resolve(__dirname, '../../uploads/cv');

const tables = {
  STUDENT: 'student_profiles',
  LECTURER: 'lecturer_profiles',
  ENTERPRISE_MENTOR: 'mentor_profiles',
} as const;

function profileTable(req: Request) {
  return (
    tables[req.user!.active_role as keyof typeof tables] ||
    fail('Chuyển sang vai trò Sinh viên, Giảng viên hoặc Mentor để cập nhật hồ sơ', 403)
  );
}

function tags(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length > 30) {
    fail(`${label}: tối đa 30 mục`);
  }
  return [...new Set((value as unknown[]).map((v) => text(v, label, 100)))];
}

const optional = (value: unknown, label: string, max = 5000) =>
  value == null || value === '' ? null : text(value, label, max);

export const getProfile = async (req: Request, res: Response) => {
  const table = profileTable(req);
  const profile =
    (await pool.query(`SELECT * FROM ${table} WHERE user_id=$1`, [req.user!.sub])).rows[0] || null;
  const company =
    table === 'mentor_profiles' && profile
      ? (await pool.query('SELECT * FROM companies WHERE id=$1', [profile.company_id])).rows[0]
      : null;
  res.json({ role: req.user!.active_role, profile, company });
};

export const saveProfile = async (req: Request, res: Response) => {
  const table = profileTable(req);
  const b = req.body ?? {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.user!.sub]);
    const before = (
      await client.query(`SELECT * FROM ${table} WHERE user_id=$1 FOR UPDATE`, [req.user!.sub])
    ).rows[0];
    if (table === 'student_profiles') {
      const major = before?.major_id || req.user!.scope.major_id;
      if (!major) {
        fail('Chưa được gán ngành; liên hệ quản trị viên');
      }
      if (typeof b.gpa !== 'number' || !Number.isFinite(b.gpa) || b.gpa < 0 || b.gpa > 4) {
        fail('GPA từ 0 đến 4');
      }
      if (b.portfolio_url) {
        let url: URL;
        try {
          url = new URL(text(b.portfolio_url, 'Portfolio', 1000));
        } catch {
          fail('Portfolio cần URL hợp lệ');
        }
        if (!['http:', 'https:'].includes(url!.protocol)) {
          fail('Portfolio chỉ dùng HTTP hoặc HTTPS');
        }
      }
      await client.query(
        `INSERT INTO student_profiles (user_id,major_id,gpa,skills,interests,portfolio_url) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (user_id) DO UPDATE SET gpa=EXCLUDED.gpa,skills=EXCLUDED.skills,interests=EXCLUDED.interests,portfolio_url=EXCLUDED.portfolio_url,updated_at=NOW()`,
        [
          req.user!.sub,
          major,
          b.gpa,
          tags(b.skills, 'Kỹ năng'),
          optional(b.interests, 'Lĩnh vực quan tâm'),
          optional(b.portfolio_url, 'Portfolio', 1000),
        ],
      );
    } else if (table === 'lecturer_profiles') {
      const dep = before?.department_id || req.user!.scope.department_id;
      if (!dep) {
        fail('Chưa được gán bộ môn; liên hệ quản trị viên');
      }
      await client.query(
        `INSERT INTO lecturer_profiles (user_id,department_id,academic_degree,specialization,research_directions) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (user_id) DO UPDATE SET academic_degree=EXCLUDED.academic_degree,specialization=EXCLUDED.specialization,research_directions=EXCLUDED.research_directions,updated_at=NOW()`,
        [
          req.user!.sub,
          dep,
          optional(b.academic_degree, 'Học vị', 50),
          optional(b.specialization, 'Chuyên môn'),
          tags(b.research_directions, 'Hướng nghiên cứu'),
        ],
      );
    } else {
      const name = text(b.company_name, 'Tên công ty');
      // Mỗi mentor quản lý bản thông tin công ty của mình; không sửa công ty dùng chung của người khác.
      const company = (
        await client.query(
          'INSERT INTO companies (name,address,contact_email,contact_phone,industry) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [
            name,
            optional(b.address, 'Địa chỉ'),
            b.contact_email ? email(b.contact_email) : null,
            optional(b.contact_phone, 'Số liên hệ', 20),
            optional(b.industry, 'Lĩnh vực', 150),
          ],
        )
      ).rows[0];
      await client.query(
        `INSERT INTO mentor_profiles (user_id,company_id,position,expertise_area) VALUES ($1,$2,$3,$4)
    ON CONFLICT(user_id) DO UPDATE SET company_id=EXCLUDED.company_id,position=EXCLUDED.position,expertise_area=EXCLUDED.expertise_area,updated_at=NOW()`,
        [
          req.user!.sub,
          company.id,
          optional(b.position, 'Vị trí', 100),
          optional(b.expertise_area, 'Chuyên môn', 255),
        ],
      );
    }
    const after = (await client.query(`SELECT * FROM ${table} WHERE user_id=$1`, [req.user!.sub]))
      .rows[0];
    await audit(client, req, 'UPDATE_PROFILE', table, req.user!.sub, before, after);
    await client.query('COMMIT');
    res.json({ message: 'Đã cập nhật hồ sơ' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const uploadCV = async (req: Request, res: Response) => {
  if (req.user!.active_role !== 'STUDENT') {
    fail('Chỉ sinh viên tải CV', 403);
  }
  const file = req.file;
  if (
    !file ||
    path.extname(file.originalname).toLowerCase() !== '.pdf' ||
    file.buffer.subarray(0, 5).toString() !== '%PDF-'
  ) {
    fail('CV phải là PDF, tối đa 5 MB');
  }
  const client = await pool.connect();
  const location = path.join(cvDirectory, randomUUID() + '.pdf');
  let committed = false;
  try {
    await client.query('BEGIN');
    const profile = (
      await client.query(
        'SELECT user_id,cv_file_id FROM student_profiles WHERE user_id=$1 FOR UPDATE',
        [req.user!.sub],
      )
    ).rows[0];
    if (!profile) {
      fail('Lưu hồ sơ sinh viên trước khi tải CV');
    }
    await fs.mkdir(cvDirectory, { recursive: true });
    await fs.writeFile(location, file!.buffer, { flag: 'wx' });
    const f = (
      await client.query(
        `INSERT INTO system_files (uploaded_by,original_name,file_path,file_size,mime_type,checksum) VALUES ($1,$2,$3,$4,'application/pdf',$5) RETURNING id`,
        [
          req.user!.sub,
          file!.originalname,
          location,
          file!.size,
          createHash('sha256').update(file!.buffer).digest('hex'),
        ],
      )
    ).rows[0];
    await client.query(
      'UPDATE student_profiles SET cv_file_id=$1,updated_at=NOW() WHERE user_id=$2',
      [f.id, req.user!.sub],
    );
    await audit(
      client,
      req,
      'UPLOAD_CV',
      'student_profiles',
      req.user!.sub,
      { cv_file_id: profile.cv_file_id },
      { cv_file_id: f.id },
    );
    await client.query('COMMIT');
    committed = true;
    res.json({ message: 'Đã tải CV PDF' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (!committed) {
      await fs.rm(location, { force: true });
    }
    throw error;
  } finally {
    client.release();
  }
};

export const viewCV = async (req: Request, res: Response) => {
  const file = (
    await pool.query(
      `SELECT f.file_path FROM student_profiles p JOIN system_files f ON f.id=p.cv_file_id WHERE p.user_id=$1 AND f.uploaded_by=$1`,
      [req.user!.sub],
    )
  ).rows[0];
  if (!file) {
    fail('Chưa có CV', 404);
  }
  const resolved = path.resolve(file.file_path);
  const relative = path.relative(cvDirectory, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('Đường dẫn CV không hợp lệ', 403);
  }
  res.type('application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="CV.pdf"');
  res.sendFile(resolved);
};

export const quotas = async (req: Request, res: Response) => {
  if (req.user!.active_role !== 'LECTURER') {
    fail('Chuyển sang vai trò Giảng viên', 403);
  }
  res.json(
    (
      await pool.query(
        `SELECT q.*,c.name AS campaign_name FROM lecturer_quotas q JOIN campaigns c ON c.id=q.campaign_id WHERE q.lecturer_id=$1 ORDER BY c.created_at DESC`,
        [req.user!.sub],
      )
    ).rows,
  );
};

export const saveQuota = async (req: Request, res: Response) => {
  if (req.user!.active_role !== 'LECTURER') {
    fail('Chỉ giảng viên cập nhật hạn mức của mình', 403);
  }
  const id = uuid(req.params.campaignId, 'Đợt');
  const max = integer(req.body?.max_students, 'Số sinh viên', 0, 1000);
  const topics = integer(req.body?.max_topics, 'Số đề tài', 0, 1000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.user!.sub]);
    await campaignAccess(req, id, false, client);
    const before = (
      await client.query(
        'SELECT * FROM lecturer_quotas WHERE campaign_id=$1 AND lecturer_id=$2 FOR UPDATE',
        [id, req.user!.sub],
      )
    ).rows[0];
    if (before && before.current_assigned_students > max) {
      fail('Hạn mức không được thấp hơn số sinh viên đã nhận');
    }
    await client.query(
      `INSERT INTO lecturer_quotas (campaign_id,lecturer_id,max_students,max_topics) VALUES ($1,$2,$3,$4) ON CONFLICT(campaign_id,lecturer_id) DO UPDATE SET max_students=EXCLUDED.max_students,max_topics=EXCLUDED.max_topics`,
      [id, req.user!.sub, max, topics],
    );
    await audit(client, req, 'UPDATE_QUOTA', 'campaigns', id, before, {
      max_students: max,
      max_topics: topics,
    });
    await client.query('COMMIT');
    res.json({ message: 'Đã lưu hạn mức hướng dẫn' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
