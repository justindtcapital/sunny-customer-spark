CREATE TABLE public.vic_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vic_threads TO authenticated;
GRANT ALL ON public.vic_threads TO service_role;
ALTER TABLE public.vic_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own threads select" ON public.vic_threads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own threads insert" ON public.vic_threads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own threads update" ON public.vic_threads FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own threads delete" ON public.vic_threads FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX vic_threads_user_idx ON public.vic_threads (user_id, updated_at DESC);

CREATE TABLE public.vic_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.vic_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message_id text NOT NULL,
  role text NOT NULL,
  message jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, message_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vic_messages TO authenticated;
GRANT ALL ON public.vic_messages TO service_role;
ALTER TABLE public.vic_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages select" ON public.vic_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own messages insert" ON public.vic_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.vic_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()));
CREATE POLICY "own messages update" ON public.vic_messages FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own messages delete" ON public.vic_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX vic_messages_thread_idx ON public.vic_messages (thread_id, created_at);