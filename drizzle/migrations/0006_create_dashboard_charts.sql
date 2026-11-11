CREATE TABLE public.dashboard_charts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard text NOT NULL,
  title text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT '',
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.dashboard_charts TO authenticated;
GRANT ALL ON public.dashboard_charts TO service_role;

ALTER TABLE public.dashboard_charts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in team can read charts" ON public.dashboard_charts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in team can add own charts" ON public.dashboard_charts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can delete charts" ON public.dashboard_charts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX dashboard_charts_dashboard_idx ON public.dashboard_charts (dashboard, created_at DESC);