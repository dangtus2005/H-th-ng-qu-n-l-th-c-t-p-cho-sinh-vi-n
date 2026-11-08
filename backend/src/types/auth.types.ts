export type RoleCode =
  | 'SYSTEM_ADMIN'
  | 'TRAINING_DEPT'
  | 'FACULTY_MANAGER'
  | 'DEPT_HEAD'
  | 'LECTURER'
  | 'STUDENT'
  | 'ENTERPRISE_MENTOR';

export interface RoleScopeItem {
  user_role_id: string;
  role_code: RoleCode;
  role_name: string;
  faculty_id: string | null;
  faculty_name: string | null;
  department_id: string | null;
  department_name: string | null;
  is_default: boolean;
  major_id: string | null;
  major_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
}

export interface JwtUserPayload {
  jti: string;
  sub: string; // user_id
  code: string;
  active_role: RoleCode;
  scope: {
    faculty_id: string | null;
    department_id: string | null;
    major_id: string | null;
    campaign_id: string | null;
  };
}

// Mở rộng Express Request để dùng req.user trong mọi Controller
declare global {
  namespace Express {
    interface Request {
      user?: JwtUserPayload;
    }
  }
}
