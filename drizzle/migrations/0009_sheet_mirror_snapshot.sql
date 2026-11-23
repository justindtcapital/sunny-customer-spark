ALTER TABLE public.sheet_mirror_tabs ADD COLUMN IF NOT EXISTS snapshot jsonb;

CREATE OR REPLACE FUNCTION public.mirror_read_tab(p_sheet text, p_tab text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.sheet_mirror_tabs%ROWTYPE; snap jsonb;
BEGIN
  SELECT * INTO t FROM public.sheet_mirror_tabs WHERE spreadsheet_id = p_sheet AND tab = p_tab;
  IF NOT FOUND THEN RETURN NULL; END IF;
  snap := t.snapshot;
  IF snap IS NULL THEN
    SELECT coalesce(jsonb_agg(coalesce(r.cells, '[]'::jsonb) ORDER BY g), '[]'::jsonb) INTO snap
    FROM generate_series(1, t.row_count) g
    LEFT JOIN public.sheet_mirror_rows r ON r.spreadsheet_id = p_sheet AND r.tab = p_tab AND r.row_no = g;
    UPDATE public.sheet_mirror_tabs SET snapshot = snap
      WHERE spreadsheet_id = p_sheet AND tab = p_tab AND patched_at IS NOT DISTINCT FROM t.patched_at AND snapshot IS NULL;
  END IF;
  RETURN jsonb_build_object('rows', snap, 'synced_at', t.synced_at, 'stale', t.stale, 'dirty', t.dirty);
END $$;

CREATE OR REPLACE FUNCTION public.mirror_replace_tab(p_sheet text, p_tab text, p_rows jsonb, p_hash text, p_started_at timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.sheet_mirror_tabs%ROWTYPE;
BEGIN
  INSERT INTO public.sheet_mirror_tabs (spreadsheet_id, tab) VALUES (p_sheet, p_tab) ON CONFLICT DO NOTHING;
  SELECT * INTO t FROM public.sheet_mirror_tabs WHERE spreadsheet_id = p_sheet AND tab = p_tab FOR UPDATE;
  IF t.patched_at IS NOT NULL AND t.patched_at > p_started_at - interval '2 seconds' THEN
    UPDATE public.sheet_mirror_tabs SET dirty = true WHERE spreadsheet_id = p_sheet AND tab = p_tab;
    RETURN 'skipped';
  END IF;
  IF t.content_hash = p_hash AND t.synced_at IS NOT NULL AND NOT t.dirty AND NOT t.stale THEN
    UPDATE public.sheet_mirror_tabs SET synced_at = now() WHERE spreadsheet_id = p_sheet AND tab = p_tab;
    RETURN 'unchanged';
  END IF;
  DELETE FROM public.sheet_mirror_rows WHERE spreadsheet_id = p_sheet AND tab = p_tab;
  INSERT INTO public.sheet_mirror_rows (spreadsheet_id, tab, row_no, cells)
    SELECT p_sheet, p_tab, e.ord::integer, e.val
    FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) WITH ORDINALITY AS e(val, ord)
    WHERE jsonb_typeof(e.val) = 'array' AND jsonb_array_length(e.val) > 0;
  UPDATE public.sheet_mirror_tabs
    SET row_count = jsonb_array_length(coalesce(p_rows, '[]'::jsonb)), content_hash = p_hash,
        synced_at = now(), stale = false, dirty = false, snapshot = coalesce(p_rows, '[]'::jsonb)
    WHERE spreadsheet_id = p_sheet AND tab = p_tab;
  RETURN 'replaced';
END $$;

CREATE OR REPLACE FUNCTION public.mirror_put_rows(p_sheet text, p_tab text, p_start_row integer, p_col integer, p_rows jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.sheet_mirror_tabs%ROWTYPE; e record; rn integer; old_cells jsonb;
BEGIN
  SELECT * INTO t FROM public.sheet_mirror_tabs WHERE spreadsheet_id = p_sheet AND tab = p_tab FOR UPDATE;
  IF NOT FOUND OR t.stale THEN RETURN false; END IF;
  FOR e IN SELECT val, ord FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) WITH ORDINALITY AS x(val, ord) LOOP
    rn := p_start_row + e.ord::integer - 1;
    SELECT cells INTO old_cells FROM public.sheet_mirror_rows WHERE spreadsheet_id = p_sheet AND tab = p_tab AND row_no = rn;
    INSERT INTO public.sheet_mirror_rows (spreadsheet_id, tab, row_no, cells)
      VALUES (p_sheet, p_tab, rn, public.mirror_splice(coalesce(old_cells, '[]'::jsonb), p_col, e.val))
      ON CONFLICT (spreadsheet_id, tab, row_no) DO UPDATE SET cells = EXCLUDED.cells;
  END LOOP;
  UPDATE public.sheet_mirror_tabs
    SET row_count = greatest(row_count, p_start_row + jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) - 1),
        patched_at = clock_timestamp(), dirty = true, snapshot = NULL
    WHERE spreadsheet_id = p_sheet AND tab = p_tab;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.mirror_patch_cells(p_sheet text, p_tab text, p_cells jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.sheet_mirror_tabs%ROWTYPE; cell jsonb; rn integer; cn integer; old_cells jsonb; max_row integer := 0;
BEGIN
  SELECT * INTO t FROM public.sheet_mirror_tabs WHERE spreadsheet_id = p_sheet AND tab = p_tab FOR UPDATE;
  IF NOT FOUND OR t.stale THEN RETURN false; END IF;
  FOR cell IN SELECT * FROM jsonb_array_elements(coalesce(p_cells, '[]'::jsonb)) LOOP
    rn := (cell ->> 'r')::integer; cn := (cell ->> 'c')::integer;
    max_row := greatest(max_row, rn);
    SELECT cells INTO old_cells FROM public.sheet_mirror_rows WHERE spreadsheet_id = p_sheet AND tab = p_tab AND row_no = rn;
    INSERT INTO public.sheet_mirror_rows (spreadsheet_id, tab, row_no, cells)
      VALUES (p_sheet, p_tab, rn, public.mirror_splice(coalesce(old_cells, '[]'::jsonb), cn, jsonb_build_array(cell -> 'v')))
      ON CONFLICT (spreadsheet_id, tab, row_no) DO UPDATE SET cells = EXCLUDED.cells;
  END LOOP;
  UPDATE public.sheet_mirror_tabs SET row_count = greatest(row_count, max_row), patched_at = clock_timestamp(), dirty = true, snapshot = NULL
    WHERE spreadsheet_id = p_sheet AND tab = p_tab;
  RETURN true;
END $$;

UPDATE public.sheet_mirror_tabs SET snapshot = NULL;

REVOKE EXECUTE ON FUNCTION public.mirror_read_tab(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mirror_replace_tab(text, text, jsonb, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mirror_put_rows(text, text, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mirror_patch_cells(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_read_tab(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_replace_tab(text, text, jsonb, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_put_rows(text, text, integer, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_patch_cells(text, text, jsonb) TO service_role;