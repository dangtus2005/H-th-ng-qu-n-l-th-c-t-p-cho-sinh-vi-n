BEGIN;
CREATE TABLE IF NOT EXISTS public.training_systems (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  code varchar(50) NOT NULL UNIQUE,
  name varchar(255) NOT NULL
);
INSERT INTO public.training_systems (code,name) VALUES ('CHINH_QUY','Chính quy') ON CONFLICT (code) DO NOTHING;
INSERT INTO public.training_systems (code,name)
SELECT DISTINCT training_system, training_system FROM public.majors WHERE training_system IS NOT NULL
ON CONFLICT (code) DO NOTHING;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='majors_training_system_fkey' AND conrelid='public.majors'::regclass) THEN
    ALTER TABLE public.majors ADD CONSTRAINT majors_training_system_fkey FOREIGN KEY (training_system)
      REFERENCES public.training_systems(code) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS users_sso_identity_unique ON public.users (sso_provider,sso_id)
WHERE sso_provider IS NOT NULL AND sso_id IS NOT NULL;
COMMIT;
