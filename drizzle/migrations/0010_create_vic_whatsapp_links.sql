CREATE TABLE public.vic_whatsapp_links (
  user_id uuid PRIMARY KEY,
  team_email text NOT NULL,
  phone_e164 text NOT NULL UNIQUE,
  thread_id uuid REFERENCES public.vic_threads(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vic_whatsapp_links TO authenticated;
GRANT ALL ON public.vic_whatsapp_links TO service_role;

ALTER TABLE public.vic_whatsapp_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own WhatsApp link"
  ON public.vic_whatsapp_links FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own WhatsApp link"
  ON public.vic_whatsapp_links FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own WhatsApp link"
  ON public.vic_whatsapp_links FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own WhatsApp link"
  ON public.vic_whatsapp_links FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);