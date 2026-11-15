BEGIN;

CREATE TABLE IF NOT EXISTS public.matching_runs (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  round integer NOT NULL CHECK (round > 0),
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  config jsonb NOT NULL,
  input jsonb NOT NULL,
  result jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS matching_runs_campaign_time ON public.matching_runs(campaign_id,created_at DESC,id);
CREATE UNIQUE INDEX IF NOT EXISTS matching_runs_published_round ON public.matching_runs(campaign_id,round)
  WHERE published_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS matching_runs_id_campaign ON public.matching_runs(id,campaign_id);

CREATE TABLE IF NOT EXISTS public.matching_offers (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  run_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  group_id uuid NOT NULL,
  topic_id uuid NOT NULL,
  supervisor_id uuid NOT NULL REFERENCES public.users(id),
  method varchar(50) NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','DECLINED','EXPIRED')),
  responded_at timestamptz,
  responded_by uuid REFERENCES public.users(id),
  FOREIGN KEY(run_id,campaign_id) REFERENCES public.matching_runs(id,campaign_id),
  FOREIGN KEY(group_id,campaign_id) REFERENCES public.student_groups(id,campaign_id),
  FOREIGN KEY(topic_id,campaign_id) REFERENCES public.topics(id,campaign_id),
  UNIQUE(run_id,group_id),
  UNIQUE(run_id,topic_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS matching_offers_active_group ON public.matching_offers(group_id)
  WHERE status IN ('PENDING','CONFIRMED');
CREATE UNIQUE INDEX IF NOT EXISTS matching_offers_active_topic ON public.matching_offers(topic_id)
  WHERE status IN ('PENDING','CONFIRMED');
CREATE INDEX IF NOT EXISTS matching_offers_campaign_status ON public.matching_offers(campaign_id,status);

COMMIT;
