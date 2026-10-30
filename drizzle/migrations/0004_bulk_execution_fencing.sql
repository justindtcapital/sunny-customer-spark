ALTER TABLE public.bulk_operations ADD COLUMN execution_token uuid;
ALTER TABLE public.bulk_operations ADD COLUMN reconciliation jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.begin_bulk_attempt(p_id uuid,p_token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 PERFORM 1 FROM public.bulk_operation_locks WHERE resource='shared-bulk-writes' AND operation_id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.bulk_operations SET execution_token=p_token,status='running',updated_at=now() WHERE id=p_id AND execution_token IS NULL AND status NOT IN ('running','uncertain');
 RETURN FOUND;
END; $$;
CREATE OR REPLACE FUNCTION public.checkpoint_bulk_attempt(p_id uuid,p_token uuid,p_outcomes jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE public.bulk_operations SET outcomes=p_outcomes,updated_at=now() WHERE id=p_id AND execution_token=p_token AND status='running'; RETURN FOUND;
END; $$;
CREATE OR REPLACE FUNCTION public.finish_bulk_attempt(p_id uuid,p_token uuid,p_status text,p_summary text,p_outcomes jsonb,p_attempt jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE public.bulk_operations SET status=p_status,summary=p_summary,outcomes=p_outcomes,attempts=attempts || jsonb_build_array(p_attempt),execution_token=NULL,updated_at=now() WHERE id=p_id AND execution_token=p_token AND status='running';
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_status <> 'uncertain' THEN DELETE FROM public.bulk_operation_locks WHERE resource='shared-bulk-writes' AND operation_id=p_id; END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.begin_bulk_attempt(uuid,uuid),public.checkpoint_bulk_attempt(uuid,uuid,jsonb),public.finish_bulk_attempt(uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_bulk_attempt(uuid,uuid),public.checkpoint_bulk_attempt(uuid,uuid,jsonb),public.finish_bulk_attempt(uuid,uuid,text,text,jsonb,jsonb) TO service_role;