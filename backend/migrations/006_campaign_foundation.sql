BEGIN;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS enforce_min_credits boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prerequisite_note text;
ALTER TABLE public.campaign_eligible_students
  ADD COLUMN IF NOT EXISTS verified_credits integer,
  ADD COLUMN IF NOT EXISTS verified_prerequisite text;

ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS confirmation_status text NOT NULL DEFAULT 'CONFIRMED';

UPDATE public.group_members gm SET campaign_id=g.campaign_id
FROM public.student_groups g WHERE g.id=gm.group_id AND gm.campaign_id IS NULL;
INSERT INTO public.group_members (group_id,student_id,campaign_id,confirmation_status)
SELECT id,leader_id,campaign_id,'CONFIRMED' FROM public.student_groups
ON CONFLICT (group_id,student_id) DO NOTHING;

ALTER TABLE public.group_members
  ALTER COLUMN campaign_id SET NOT NULL,
  ALTER COLUMN confirmation_status SET DEFAULT 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS groups_id_campaign_key ON public.student_groups(id,campaign_id);
CREATE UNIQUE INDEX IF NOT EXISTS topics_id_campaign_key ON public.topics(id,campaign_id);
CREATE UNIQUE INDEX IF NOT EXISTS group_members_confirmed_per_campaign
  ON public.group_members(campaign_id,student_id) WHERE confirmation_status='CONFIRMED';

ALTER TABLE public.topics ALTER COLUMN supervisor_id DROP NOT NULL;

-- The migration runner reapplies every SQL file. Add constraints only on the first run.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.group_members'::regclass
                 AND conname='group_members_group_campaign_fk') THEN
    ALTER TABLE public.group_members
      ADD CONSTRAINT group_members_confirmation_check CHECK (confirmation_status IN ('PENDING','CONFIRMED','DECLINED')),
      ADD CONSTRAINT group_members_group_campaign_fk FOREIGN KEY (group_id,campaign_id)
        REFERENCES public.student_groups(id,campaign_id) ON DELETE CASCADE;
    ALTER TABLE public.student_groups ADD CONSTRAINT groups_leader_membership_fk
      FOREIGN KEY (id,leader_id) REFERENCES public.group_members(group_id,student_id)
      DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE public.topic_registrations
      ADD CONSTRAINT registrations_group_campaign_fk FOREIGN KEY (group_id,campaign_id)
        REFERENCES public.student_groups(id,campaign_id) ON DELETE CASCADE,
      ADD CONSTRAINT registrations_topic_campaign_fk FOREIGN KEY (topic_id,campaign_id)
        REFERENCES public.topics(id,campaign_id) ON DELETE CASCADE;
    ALTER TABLE public.thesis_assignments
      ADD CONSTRAINT assignments_group_campaign_fk FOREIGN KEY (group_id,campaign_id)
        REFERENCES public.student_groups(id,campaign_id) ON DELETE RESTRICT,
      ADD CONSTRAINT assignments_topic_campaign_fk FOREIGN KEY (topic_id,campaign_id)
        REFERENCES public.topics(id,campaign_id) ON DELETE RESTRICT;
    ALTER TABLE public.topics
      ADD CONSTRAINT topics_supervisor_required_check CHECK (
        supervisor_id IS NOT NULL OR (source='STUDENT_PROPOSED' AND status IS DISTINCT FROM 'ASSIGNED')
      ),
      ADD CONSTRAINT topics_positive_capacity_check CHECK (max_students > 0);
    ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_required_credits_check
      CHECK (NOT enforce_min_credits OR (min_credits_required IS NOT NULL AND min_credits_required BETWEEN 0 AND 1000));
    ALTER TABLE public.campaign_eligible_students ADD CONSTRAINT eligibility_verified_credits_check
      CHECK (verified_credits BETWEEN 0 AND 1000);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.prepare_group_member() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  group_campaign uuid;
  group_leader uuid;
BEGIN
  SELECT campaign_id,leader_id INTO group_campaign,group_leader
  FROM public.student_groups WHERE id=NEW.group_id FOR NO KEY UPDATE;
  IF NEW.campaign_id IS NULL THEN NEW.campaign_id := group_campaign; END IF;
  IF NEW.student_id=group_leader AND NEW.confirmation_status IS DISTINCT FROM 'CONFIRMED' THEN
    RAISE EXCEPTION 'Truong nhom phai la thanh vien da xac nhan' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_group_leader() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.group_members (group_id,student_id,campaign_id,confirmation_status)
  VALUES (NEW.id,NEW.leader_id,NEW.campaign_id,'CONFIRMED')
  ON CONFLICT (group_id,student_id) DO UPDATE SET confirmation_status='CONFIRMED';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS prepare_group_member ON public.group_members;
CREATE TRIGGER prepare_group_member BEFORE INSERT OR UPDATE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.prepare_group_member();
DROP TRIGGER IF EXISTS confirm_group_leader ON public.student_groups;
CREATE TRIGGER confirm_group_leader AFTER INSERT OR UPDATE OF leader_id ON public.student_groups
FOR EACH ROW EXECUTE FUNCTION public.confirm_group_leader();

COMMIT;
