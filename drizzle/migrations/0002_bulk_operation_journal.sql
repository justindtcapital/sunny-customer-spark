CREATE TABLE public.bulk_operations (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL,
 actor text NOT NULL,
 kind text NOT NULL,
 page text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'running',
 input jsonb NOT NULL DEFAULT '{}'::jsonb,
 outcomes jsonb NOT NULL DEFAULT '[]'::jsonb,
 attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
 summary text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bulk_operations TO service_role;
ALTER TABLE public.bulk_operations ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bulk_operation_locks (
 resource text PRIMARY KEY,
 operation_id uuid NOT NULL,
 acquired_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bulk_operation_locks TO service_role;
ALTER TABLE public.bulk_operation_locks ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.claim_bulk_operation_lock(p_resource text, p_operation_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claimed text;
BEGIN
 INSERT INTO public.bulk_operation_locks(resource, operation_id) VALUES(p_resource, p_operation_id) ON CONFLICT DO NOTHING RETURNING resource INTO claimed;
 RETURN claimed IS NOT NULL;
END; $$;
REVOKE ALL ON FUNCTION public.claim_bulk_operation_lock(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_bulk_operation_lock(text, uuid) TO service_role;
ALTER TABLE public.admin_requests ADD COLUMN operation_id uuid;
ALTER TABLE public.admin_requests ADD COLUMN activity_key text;
CREATE UNIQUE INDEX admin_request_activity_once ON public.admin_requests(activity_key) WHERE activity_key IS NOT NULL;
COMMENT ON TABLE public.bulk_operations IS 'Server-validated team bulk-operation journal; input and outcomes never public. Retry uses typed handlers, not log text.';
COMMENT ON TABLE public.bulk_operation_locks IS 'Fail-closed app-writer coordination; uncertain operations retain locks until reconciled. No lease expiry that could permit a stranded writer to overlap.';