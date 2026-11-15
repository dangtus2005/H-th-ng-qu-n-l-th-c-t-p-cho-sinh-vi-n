BEGIN;
CREATE TABLE IF NOT EXISTS public.campaign_results (
  campaign_id uuid PRIMARY KEY REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  weights jsonb NOT NULL CHECK (jsonb_typeof(weights)='object'),
  published_at timestamptz,
  locked_at timestamptz
);
ALTER TABLE public.final_grades ADD COLUMN IF NOT EXISTS components jsonb;
CREATE INDEX IF NOT EXISTS notifications_recipient_time ON public.notifications(recipient_id,created_at DESC);
CREATE INDEX IF NOT EXISTS grade_appeals_grade_status ON public.grade_appeals(final_grade_id,status);
COMMIT;
