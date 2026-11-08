import type { Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { pool } from '../config/db';
import { audit } from '../utils/audit';
import { email, fail, password, uuid } from '../utils/validation';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

async function issueCode(userId: string, req?: Request) {
  const code = randomBytes(24).toString('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = (
      await client.query('SELECT id,email,is_active FROM users WHERE id=$1 FOR UPDATE', [userId])
    ).rows[0];
    if (!user?.is_active) {
      fail('Tài khoản không hoạt động', 400);
    }
    await client.query(
      `INSERT INTO password_resets (user_id,token_hash,expires_at) VALUES ($1,$2,NOW()+INTERVAL '15 minutes')
      ON CONFLICT (user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,created_at=NOW()`,
      [userId, digest(code)],
    );
    if (req) {
      await audit(client, req, 'ISSUE_PASSWORD_RECOVERY', 'users', userId);
    }
    await client.query('COMMIT');
    return { code, email: user.email };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export const issueRecovery = async (req: Request, res: Response): Promise<void> => {
  const result = await issueCode(uuid(req.params.id, 'Tài khoản'), req);
  res.json({
    recovery_code: result.code,
    expires_in_minutes: 15,
    message: 'Chỉ cung cấp mã này sau khi xác minh đúng chủ tài khoản. Mã chỉ dùng một lần.',
  });
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const address = email(req.body?.email);
  const smtp = process.env.SMTP_HOST && process.env.SMTP_FROM;
  if (smtp) {
    const user = (
      await pool.query(
        `SELECT u.id FROM users u LEFT JOIN password_resets p ON p.user_id=u.id
      WHERE lower(u.email)=$1 AND u.is_active=TRUE AND (p.created_at IS NULL OR p.created_at < NOW()-INTERVAL '1 minute')`,
        [address],
      )
    ).rows[0];
    if (user) {
      try {
        const result = await issueCode(user.id);
        const transport = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === 'true',
          connectionTimeout: 10000,
          socketTimeout: 10000,
          ...(process.env.SMTP_USER
            ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
            : {}),
        });
        await transport.sendMail({
          from: process.env.SMTP_FROM,
          to: result.email,
          subject: 'QLTH — Khôi phục mật khẩu',
          text: `Mã khôi phục mật khẩu của bạn: ${result.code}\nMã hết hạn sau 15 phút và chỉ được sử dụng một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
        });
      } catch {
        console.error('Password recovery email could not be delivered');
      }
    }
  }
  res.status(202).json({
    message: smtp
      ? 'Nếu email hợp lệ, mã khôi phục sẽ được gửi tới hộp thư. Nếu chưa nhận được, liên hệ quản trị viên.'
      : 'Hệ thống chưa bật gửi email. Vui lòng liên hệ quản trị viên để xác minh danh tính và nhận mã khôi phục một lần.',
  });
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const address = email(req.body?.email);
  const newPassword = password(req.body?.new_password);
  const code = req.body?.recovery_code;
  if (typeof code !== 'string' || !/^[a-f0-9]{48}$/.test(code)) {
    fail('Mã khôi phục không hợp lệ hoặc đã hết hạn');
  }
  const hash = await bcrypt.hash(newPassword, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (
      await client.query(
        `SELECT u.id FROM users u JOIN password_resets p ON p.user_id=u.id
      WHERE lower(u.email)=$1 AND u.is_active=TRUE AND p.token_hash=$2 AND p.expires_at>NOW() FOR UPDATE OF u,p`,
        [address, digest(code)],
      )
    ).rows[0];
    if (!row) {
      fail('Mã khôi phục không hợp lệ hoặc đã hết hạn');
    }
    await client.query('UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2', [
      hash,
      row.id,
    ]);
    await client.query('DELETE FROM auth_sessions WHERE user_id=$1', [row.id]);
    await client.query('DELETE FROM password_resets WHERE user_id=$1', [row.id]);
    await audit(client, req, 'RESET_PASSWORD', 'users', row.id, null, null, row.id);
    await client.query('COMMIT');
    res.json({ message: 'Đã đặt lại mật khẩu và đăng xuất mọi thiết bị. Vui lòng đăng nhập lại.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
