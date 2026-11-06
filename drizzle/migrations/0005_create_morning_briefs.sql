CREATE TABLE public.morning_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  brief_date date NOT NULL,
  source_message_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'building',
  cowork_text text NOT NULL DEFAULT '',
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text NOT NULL DEFAULT '',
  email_status text NOT NULL DEFAULT 'pending',
  email_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_email, brief_date)
);
GRANT SELECT ON public.morning_briefs TO authenticated;
GRANT ALL ON public.morning_briefs TO service_role;
ALTER TABLE public.morning_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their briefs" ON public.morning_briefs FOR SELECT TO authenticated
  USING (lower(owner_email) = lower(coalesce(auth.jwt()->>'email', '')));