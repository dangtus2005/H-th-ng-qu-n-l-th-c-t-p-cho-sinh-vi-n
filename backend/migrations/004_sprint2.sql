BEGIN;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS training_system varchar(50) REFERENCES public.training_systems(code) ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS campaign_phase_unique ON public.campaign_milestones(campaign_id,phase);
CREATE TABLE IF NOT EXISTS public.campaign_enrollments (
 id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
 student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 registered_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(campaign_id,student_id)
);
CREATE INDEX IF NOT EXISTS eligibility_student_campaign ON public.campaign_eligible_students(student_id,campaign_id);
COMMIT;
