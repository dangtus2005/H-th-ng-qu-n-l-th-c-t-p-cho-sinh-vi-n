BEGIN;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS major_id uuid REFERENCES public.majors(id);
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id);
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_id_faculty_id_department_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_scope_unique ON public.user_roles
  (user_id,role_id,faculty_id,department_id,major_id,campaign_id) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON public.users (lower(email));
CREATE TABLE IF NOT EXISTS public.specializations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  major_id uuid NOT NULL REFERENCES public.majors(id),
  code varchar(50) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.password_resets (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
