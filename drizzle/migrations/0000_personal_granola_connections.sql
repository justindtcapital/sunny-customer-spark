CREATE TABLE public.personal_granola_connections (
 user_id uuid PRIMARY KEY,
 key_ciphertext text NOT NULL,
 connected_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_granola_connections TO service_role;
REVOKE ALL ON public.personal_granola_connections FROM anon, authenticated;
ALTER TABLE public.personal_granola_connections ENABLE ROW LEVEL SECURITY;