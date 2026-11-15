DO $migration$
BEGIN
    IF to_regclass('public.topics') IS NULL THEN
        RAISE EXCEPTION 'Load backend/database/schema.sql before running migrations; it defines public.topics';
    END IF;
END
$migration$;