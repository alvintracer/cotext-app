-- Add unique constraint on github_connections.user_id for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'github_connections_user_id_key'
  ) THEN
    ALTER TABLE public.github_connections ADD CONSTRAINT github_connections_user_id_key UNIQUE (user_id);
  END IF;
END $$;
