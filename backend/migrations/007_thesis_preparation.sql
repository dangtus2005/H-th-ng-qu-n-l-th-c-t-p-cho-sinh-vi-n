BEGIN;
ALTER TABLE public.student_groups ADD COLUMN IF NOT EXISTS research_direction varchar(255);
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS supervisor_endorsed_at timestamptz;
CREATE TABLE IF NOT EXISTS public.topic_documents (
  topic_id uuid PRIMARY KEY REFERENCES public.topics(id) ON DELETE CASCADE,
  original_name varchar(255) NOT NULL,
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 5 AND 5242880)
);
ALTER TABLE public.topic_registrations ADD COLUMN IF NOT EXISTS lecturer_rank integer CHECK (lecturer_rank > 0);
CREATE UNIQUE INDEX IF NOT EXISTS registrations_lecturer_rank_key
  ON public.topic_registrations(topic_id,lecturer_rank) WHERE lecturer_rank IS NOT NULL;

-- Reordering can swap two occupied priority positions in one transaction.
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_constraint WHERE conrelid='public.topic_registrations'::regclass
      AND conname='topic_registrations_group_id_priority_order_key' AND NOT condeferrable
  ) THEN
    ALTER TABLE public.topic_registrations DROP CONSTRAINT topic_registrations_group_id_priority_order_key;
    ALTER TABLE public.topic_registrations ADD CONSTRAINT topic_registrations_group_id_priority_order_key
      UNIQUE(group_id,priority_order) DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;
COMMIT;
