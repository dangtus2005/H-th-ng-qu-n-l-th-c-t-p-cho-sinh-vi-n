import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtUserPayload, RoleCode } from '../types/auth.types';
import { JWT_SECRET } from '../config/env';
import { pool } from '../config/db';

// 1. Middleware xác thực Token và gắn thông tin Role + Phạm vi dữ liệu vào req.user

export const authenticateJWT = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  delete req.user;
  const authHeader = req.headers.authorization;
  const token = authHeader?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ message: 'Không tìm thấy token xác thực' });
    return;
  }

  let decoded: jwt.JwtPayload;
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.code !== 'string' ||
      typeof payload.active_role !== 'string' ||
      typeof payload.jti !== 'string' ||
      typeof payload.exp !== 'number' ||
      !payload.scope ||
      typeof payload.scope !== 'object' ||
      ![
        payload.scope.faculty_id,
        payload.scope.department_id,
        payload.scope.major_id ?? null,
        payload.scope.campaign_id ?? null,
      ].every((value) => value === null || typeof value === 'string')
    ) {
      throw new Error('Invalid token payload');
    }
    decoded = payload;
  } catch (error) {
    res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
    return;
  }

  try {
    // Đối chiếu quyền hiện tại để khóa tài khoản hoặc thu hồi quyền có hiệu lực ngay.
    const { rows } = await pool.query<JwtUserPayload>(
      `SELECT u.id AS sub, u.code, s.id AS jti, r.code AS active_role,
              json_build_object('faculty_id', ur.faculty_id, 'department_id', ur.department_id,
                'major_id', ur.major_id, 'campaign_id', ur.campaign_id) AS scope
       FROM users u JOIN auth_sessions s ON s.user_id = u.id
       JOIN user_roles ur ON ur.user_id = u.id AND ur.id = s.user_role_id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.id::text = $1 AND u.is_active = TRUE AND r.code = $2
         AND s.id::text = $5 AND s.expires_at > NOW()
         AND ur.faculty_id::text IS NOT DISTINCT FROM $3
         AND ur.department_id::text IS NOT DISTINCT FROM $4
         AND ur.major_id::text IS NOT DISTINCT FROM $6
         AND ur.campaign_id::text IS NOT DISTINCT FROM $7
       LIMIT 1`,
      [
        decoded.sub,
        decoded.active_role,
        decoded.scope.faculty_id,
        decoded.scope.department_id,
        decoded.jti,
        decoded.scope.major_id ?? null,
        decoded.scope.campaign_id ?? null,
      ],
    );
    if (!rows[0]) {
      res.status(401).json({ message: 'Tài khoản hoặc quyền truy cập không còn hợp lệ' });
      return;
    }
    req.user = rows[0];
  } catch (error) {
    console.error('Authentication database error:', error);
    res.status(503).json({ message: 'Tạm thời không thể xác thực tài khoản' });
    return;
  }
  next();
};

// 2. Middleware kiểm tra quyền theo danh sách Role được phép

export const requireRoles = (allowedRoles: RoleCode[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Chưa xác thực' });
      return;
    }

    // SYSTEM_ADMIN luôn có toàn quyền
    if (req.user.active_role === 'SYSTEM_ADMIN') {
      next();
      return;
    }

    if (!allowedRoles.includes(req.user.active_role)) {
      res.status(403).json({
        message: `Vai trò hiện tại (${req.user.active_role}) không có quyền thực hiện thao tác này.`,
      });
      return;
    }

    next();
  };
};
