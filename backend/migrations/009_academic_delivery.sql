BEGIN;

CREATE TABLE IF NOT EXISTS public.rubric_templates (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  faculty_id uuid NOT NULL REFERENCES public.faculties(id),
  name varchar(150) NOT NULL,
  target text NOT NULL CHECK (target IN ('THESIS_SUPERVISOR','INTERNSHIP_LECTURER','INTERNSHIP_MENTOR')),
  criteria jsonb NOT NULL CHECK (jsonb_typeof(criteria)='array'),
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.campaign_rubric_templates (
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
  slot text NOT NULL CHECK (slot IN ('OUTLINE_SUBMISSION','MIDTERM_REPORT_1','MIDTERM_REPORT_2','FINAL_SUBMISSION',
    'INTERNSHIP_LECTURER','INTERNSHIP_MENTOR')),
  template_id uuid NOT NULL REFERENCES public.rubric_templates(id),
  PRIMARY KEY (campaign_id,slot)
);

-- File bytes are committed together with metadata, feedback and grades in PostgreSQL.
CREATE TABLE IF NOT EXISTS public.thesis_report_files (
  submission_id uuid PRIMARY KEY REFERENCES public.submissions(id) ON DELETE CASCADE,
  original_name varchar(255) NOT NULL,
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 5 AND 5242880)
);
CREATE TABLE IF NOT EXISTS public.thesis_report_grades (
  submission_id uuid NOT NULL REFERENCES public.submissions(id),
  student_id uuid NOT NULL REFERENCES public.users(id),
  template_id uuid NOT NULL REFERENCES public.rubric_templates(id),
  evaluator_id uuid NOT NULL REFERENCES public.users(id),
  scores jsonb NOT NULL CHECK (jsonb_typeof(scores)='array'),
  total_score numeric(4,2) NOT NULL CHECK (total_score BETWEEN 0 AND 10),
  comment text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id,student_id)
);

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS managing_faculty_id uuid REFERENCES public.faculties(id);
CREATE TABLE IF NOT EXISTS public.internship_company_mentors (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  mentor_id uuid NOT NULL REFERENCES public.users(id),
  PRIMARY KEY (company_id,mentor_id)
);
CREATE TABLE IF NOT EXISTS public.internship_application_files (
  placement_id uuid PRIMARY KEY REFERENCES public.internship_placements(id) ON DELETE CASCADE,
  original_name varchar(255) NOT NULL,
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 5 AND 5242880)
);
CREATE TABLE IF NOT EXISTS public.internship_reports (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  placement_id uuid NOT NULL REFERENCES public.internship_placements(id),
  milestone_id uuid NOT NULL REFERENCES public.campaign_milestones(id),
  version_number integer NOT NULL CHECK (version_number>0),
  original_name varchar(255) NOT NULL,
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 5 AND 5242880),
  description text,
  late_minutes integer NOT NULL DEFAULT 0 CHECK (late_minutes>=0),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(placement_id,milestone_id,version_number)
);
CREATE TABLE IF NOT EXISTS public.internship_rubric_grades (
  placement_id uuid NOT NULL REFERENCES public.internship_placements(id),
  evaluator_role text NOT NULL CHECK (evaluator_role IN ('INTERNSHIP_MENTOR','INTERNSHIP_LECTURER')),
  template_id uuid NOT NULL REFERENCES public.rubric_templates(id),
  evaluator_id uuid NOT NULL REFERENCES public.users(id),
  scores jsonb NOT NULL CHECK (jsonb_typeof(scores)='array'),
  total_score numeric(4,2) NOT NULL CHECK (total_score BETWEEN 0 AND 10),
  comment text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (placement_id,evaluator_role)
);

COMMIT;
