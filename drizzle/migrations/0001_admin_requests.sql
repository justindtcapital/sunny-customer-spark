CREATE TABLE public.admin_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'fix',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  lovable_prompt text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'medium',
  effort text NOT NULL DEFAULT 'medium',
  page text NOT NULL DEFAULT '',
  requested_by text NOT NULL DEFAULT '',
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_requests TO authenticated;
GRANT ALL ON public.admin_requests TO service_role;
ALTER TABLE public.admin_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in team can read requests" ON public.admin_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in team can add own requests" ON public.admin_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Signed-in team can update requests" ON public.admin_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Owners can delete requests" ON public.admin_requests FOR DELETE TO authenticated USING (auth.uid() = user_id);