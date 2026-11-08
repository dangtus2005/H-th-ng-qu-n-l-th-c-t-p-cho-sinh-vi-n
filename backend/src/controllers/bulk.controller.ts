import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { pool } from '../config/db';
import { createAccount } from './accounts.controller';
import { readExcel, template } from '../utils/excel';
import { fail, text } from '../utils/validation';
const common = ['code', 'email', 'full_name', 'password'];
const types = {
  students: { role: 'STUDENT', headers: [...common, 'major_code', 'cohort', 'class_name'] },
  lecturers: {
    role: 'LECTURER',
    headers: [...common, 'department_code', 'academic_degree', 'specialization'],
  },
  mentors: {
    role: 'ENTERPRISE_MENTOR',
    headers: [...common, 'company_name', 'position', 'contact_phone'],
  },
};

function kind(req: Request) {
  const value = req.params.kind as keyof typeof types;
  if (!types[value]) {
    fail('Chọn students, lecturers hoặc mentors');
  }
  return value;
}

export const bulkTemplate = async (req: Request, res: Response) => {
  const k = kind(req);
  await template(res, types[k].headers, k + '-template');
};

export const bulkImport = async (req: Request, res: Response) => {
  const k = kind(req);
  const rows = await readExcel(req, types[k].headers);
  const client = await pool.connect();
  const results: {
    row: number;
    code: string;
    status: string;
    message: string;
    email_status?: string;
  }[] = [];
  const accounts: { id: string; email: string; row: number }[] = [];
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      await client.query('SAVEPOINT import_row');
      try {
        if (row.error) {
          fail(row.error);
        }
        const v = row.values;
        let department: any;
        let major: any;
        if (k === 'students') {
          major = (
            await client.query('SELECT id,department_id FROM majors WHERE code=$1', [v.major_code])
          ).rows[0];
          if (!major) {
            fail('Mã ngành không tồn tại');
          }
        }
        if (k === 'lecturers' || major) {
          department = (
            await client.query(
              'SELECT id,faculty_id FROM departments WHERE ' + (major ? 'id' : 'code') + '=$1',
              [major ? major.department_id : v.department_code],
            )
          ).rows[0];
          if (!department) {
            fail('Mã bộ môn không tồn tại');
          }
        }
        if (k === 'mentors') {
          text(v.company_name, 'Tên công ty');
        }
        const account = await createAccount(
          client,
          {
            ...v,
            password: v.password || randomBytes(24).toString('base64url'),
            roles: [
              {
                role_code: types[k].role,
                faculty_id: department?.faculty_id,
                department_id: department?.id,
                major_id: major?.id,
              },
            ],
          },
          req,
        );
        if (k === 'students') {
          await client.query(
            'INSERT INTO student_profiles (user_id,major_id,cohort,class_name) VALUES ($1,$2,$3,$4)',
            [account.id, major.id, v.cohort || null, v.class_name || null],
          );
        }
        if (k === 'lecturers') {
          await client.query(
            'INSERT INTO lecturer_profiles (user_id,department_id,academic_degree,specialization) VALUES ($1,$2,$3,$4)',
            [account.id, department.id, v.academic_degree || null, v.specialization || null],
          );
        }
        if (k === 'mentors') {
          const company = (
            await client.query(
              'INSERT INTO companies (name,contact_email,contact_phone) VALUES ($1,$2,$3) RETURNING id',
              [v.company_name, account.email, v.contact_phone || null],
            )
          ).rows[0];
          await client.query(
            'INSERT INTO mentor_profiles (user_id,company_id,position) VALUES ($1,$2,$3)',
            [account.id, company.id, v.position || null],
          );
        }
        await client.query(
          `INSERT INTO notifications (recipient_id,title,content,type) VALUES ($1,'Tài khoản mới','Tài khoản đã được tạo. Dùng chức năng Quên mật khẩu để thiết lập mật khẩu nếu chưa được cấp.','ACCOUNT_CREATED')`,
          [account.id],
        );
        accounts.push({ id: account.id, email: account.email, row: row.row });
        results.push({
          row: row.row,
          code: v.code!,
          status: 'created',
          message: 'Đã tạo tài khoản và hồ sơ',
        });
        await client.query('RELEASE SAVEPOINT import_row');
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT import_row');
        const e = error as any;
        results.push({
          row: row.row,
          code: row.values.code || '',
          status: 'error',
          message:
            e.code === '23505'
              ? 'Trùng mã hoặc email'
              : e.status === 400
                ? e.message
                : 'Dữ liệu hồ sơ không hợp lệ',
        });
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const smtp = process.env.SMTP_HOST && process.env.SMTP_FROM;
  const transport = smtp
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        connectionTimeout: 5000,
        socketTimeout: 5000,
        ...(process.env.SMTP_USER
          ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
          : {}),
      })
    : null;
  for (const a of accounts) {
    const result = results.find((r) => r.row === a.row)!;
    result.email_status = transport ? 'failed' : 'not_configured';
    if (transport) {
      try {
        await transport.sendMail({
          from: process.env.SMTP_FROM,
          to: a.email,
          subject: 'QLTH — Tài khoản mới',
          text: `Tài khoản QLTH của bạn đã được tạo: ${a.email}. Đăng nhập tại ${process.env.APP_URL || 'http://localhost:8000'}. Nếu chưa được cấp mật khẩu, chọn Quên mật khẩu để nhận mã thiết lập. Không chia sẻ mật khẩu hoặc mã khôi phục.`,
        });
        result.email_status = 'sent';
        await pool.query(
          `UPDATE notifications SET is_email_sent=true WHERE recipient_id=$1 AND type='ACCOUNT_CREATED'`,
          [a.id],
        );
      } catch {
        /* Tài khoản đã commit; báo lỗi gửi email từng dòng để quản trị xử lý. */
      }
    }
  }
  res.json({
    created: accounts.length,
    failed: results.filter((r) => r.status === 'error').length,
    results,
  });
};
