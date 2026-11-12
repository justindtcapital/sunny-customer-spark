-- Shared team tables (admin request queue, saved dashboard charts) are readable only by
-- confirmed accounts on the DTC team roster, never by any signed-in account.
-- Keep this list in step with TEAM_MEMBER_EMAILS in src/lib/user-ownership.ts.
CREATE OR REPLACE FUNCTION public.is_team_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
      AND lower(u.email) = ANY (ARRAY[
        'justin.adorante@dell.com',
        'chris.falloon@dell.com', 'chrisf@dt-capital.net', 'chris.falloon@del.com', 'chris.falloon@dt-capital.net',
        'julia.beech@dell.com', 'julia@dt-capital.net', 'juliab@dt-capital.net',
        'chris.hillock@dell.com', 'chrish@dt-capital.net',
        'shane.earley@dell.com', 'shane@dt-capital.net', 'shane@dt-capital.com'
      ])
  )
$$;

REVOKE ALL ON FUNCTION public.is_team_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_member() TO authenticated, service_role;

DROP POLICY IF EXISTS "Signed-in team can read requests" ON public.admin_requests;
DROP POLICY IF EXISTS "Signed-in team can update requests" ON public.admin_requests;
CREATE POLICY "Team members can read requests" ON public.admin_requests
  FOR SELECT TO authenticated USING (public.is_team_member());
CREATE POLICY "Team members can update requests" ON public.admin_requests
  FOR UPDATE TO authenticated USING (public.is_team_member()) WITH CHECK (public.is_team_member());

DROP POLICY IF EXISTS "Signed-in team can read charts" ON public.dashboard_charts;
CREATE POLICY "Team members can read charts" ON public.dashboard_charts
  FOR SELECT TO authenticated USING (public.is_team_member());