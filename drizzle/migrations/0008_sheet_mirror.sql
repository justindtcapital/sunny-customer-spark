CREATE TABLE public.sheet_mirror_tabs (
  spreadsheet_id text NOT NULL,
  tab text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  content_hash text NOT NULL DEFAULT '',
  stale boolean NOT NULL DEFAULT true,
  dirty boolean NOT NULL DEFAULT false,
  synced_at timestamptz,
  patched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (spreadsheet_id, tab)
);
CREATE TABLE public.sheet_mirror_rows (
  spreadsheet_id text NOT NULL,
  tab text NOT NULL,
  row_no integer NOT NULL,
  cells jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (spreadsheet_id, tab, row_no),
  FOREIGN KEY (spreadsheet_id, tab) REFERENCES public.sheet_mirror_tabs (spreadsheet_id, tab) ON DELETE CASCADE
);
CREATE TABLE public.sheet_mirror_state (
  spreadsheet_id text PRIMARY KEY,
  drive_modified_at text NOT NULL DEFAULT '',
  checked_at timestamptz,
  synced_at timestamptz,
  last_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text NOT NULL DEFAULT ''
);

GRANT ALL ON public.sheet_mirror_tabs TO service_role;
GRANT ALL ON public.sheet_mirror_rows TO service_role;
GRANT ALL ON public.sheet_mirror_state TO service_role;
REVOKE ALL ON public.sheet_mirror_tabs FROM anon, authenticated;
REVOKE ALL ON public.sheet_mirror_rows FROM anon, authenticated;
REVOKE ALL ON public.sheet_mirror_state FROM anon, authenticated;

ALTER TABLE public.sheet_mirror_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_mirror_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_mirror_state ENABLE ROW LEVEL SECURITY;

-- Overwrite cells [col, col+len(vals)) of a row, keeping cells before and after.
CREATE OR REPLACE FUNCTION public.mirror_splice(p_old jsonb, p_col integer, p_vals jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  out_arr jsonb := '[]'::jsonb;
  n integer := jsonb_array_length(coalesce(p_old, '[]'::jsonb));
  m integer := jsonb_array_length(coalesce(p_vals, '[]'::jsonb));
  i integer;
BEGIN
  FOR i IN 0 .. p_col - 1 LOOP
    out_arr := out_arr || jsonb_build_array(coalesce(p_old -> i, '""'::jsonb));
  END LOOP;
  out_arr := out_arr || coalesce(p_vals, '[]'::jsonb);
  FOR i IN p_col + m .. n - 1 LOOP
    out_arr := out_arr || jsonb_build_array(p_old -> i);
  END LOOP;
  RETURN out_arr;
END $$;

CREATE OR REPLACE FUNCTION public.mirror_read_tab(p_sheet text, p_tab text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'rows', coalesce((
      SELECT jsonb_agg(coalesce(r.cells, '[]'::jsonb) ORDER BY g)
      FROM generate_series(1, t.row_count) g
      LEFT JOIN public.sheet_mirror_rows r
        ON r.spreadsheet_id = t.spreadsheet_id AND r.tab = t.tab AND r.row_no = g
    ), '[]'::jsonb),
    'synced_at', t.synced_at,
    'stale', t.stale,
    'dirty', t.dirty
  )
  FROM public.sheet_mirror_tabs t
  WHERE t.spreadsheet_id = p_sheet AND t.tab = p_tab
$$;

-- Replace a tab with a full copy read from Sheets at p_started_at. Skips when the
-- app patched the copy after that read began (the read may predate the patch).
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
        synced_at = now(), stale = false, dirty = false
    WHERE spreadsheet_id = p_sheet AND tab = p_tab;
  RETURN 'replaced';
END $$;

-- Apply a block write (rows starting at p_start_row, columns from p_col) the app
-- just saved to Sheets. No-op unless the tab has a current copy.
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
        patched_at = now(), dirty = true
    WHERE spreadsheet_id = p_sheet AND tab = p_tab;
  RETURN true;
END $$;

-- Apply many single-cell writes: p_cells = [{"r": row (1-based), "c": col (0-based), "v": value}].
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
  UPDATE public.sheet_mirror_tabs SET row_count = greatest(row_count, max_row), patched_at = now(), dirty = true
    WHERE spreadsheet_id = p_sheet AND tab = p_tab;
  RETURN true;
END $$;

-- Apply an append Sheets placed at p_start_row. If Sheets inserted inside the
-- copied rows (shifting them), the copy is marked stale and re-read instead.
CREATE OR REPLACE FUNCTION public.mirror_append_rows(p_sheet text, p_tab text, p_start_row integer, p_rows jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.sheet_mirror_tabs%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.sheet_mirror_tabs WHERE spreadsheet_id = p_sheet AND tab = p_tab FOR UPDATE;
  IF NOT FOUND OR t.stale THEN RETURN false; END IF;
  IF p_start_row IS NULL OR p_start_row <= t.row_count THEN
    UPDATE public.sheet_mirror_tabs SET stale = true WHERE spreadsheet_id = p_sheet AND tab = p_tab;
    RETURN false;
  END IF;
  RETURN public.mirror_put_rows(p_sheet, p_tab, p_start_row, 0, p_rows);
END $$;

-- Force the next read of a tab (or of every tab in a spreadsheet when p_tab is null) to go to Sheets.
CREATE OR REPLACE FUNCTION public.mirror_mark_stale(p_sheet text, p_tab text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.sheet_mirror_tabs SET stale = true
  WHERE spreadsheet_id = p_sheet AND (p_tab IS NULL OR tab = p_tab)
$$;

-- Scheduled check found no change in Google: confirm current copies are up to date.
CREATE OR REPLACE FUNCTION public.mirror_confirm_current(p_sheet text, p_checked_at timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.sheet_mirror_tabs SET synced_at = now()
  WHERE spreadsheet_id = p_sheet AND NOT stale AND NOT dirty AND synced_at IS NOT NULL
    AND (patched_at IS NULL OR patched_at < p_checked_at);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.mirror_splice(jsonb, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mirror_read_tab(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mirror_replace_tab(text, text, jsonb, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mirror_put_rows(text, text, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mirror_patch_cells(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mirror_append_rows(text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mirror_mark_stale(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mirror_confirm_current(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_splice(jsonb, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_read_tab(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_replace_tab(text, text, jsonb, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_put_rows(text, text, integer, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_patch_cells(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_append_rows(text, text, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_mark_stale(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_confirm_current(text, timestamptz) TO service_role;