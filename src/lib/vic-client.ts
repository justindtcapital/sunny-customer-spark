import { supabase } from "@/integrations/supabase/client";

/** fetch that attaches the signed-in teammate's bearer token for /api/vic. */
export const vicFetch: typeof fetch = async (input, init) => {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init?.headers);
  if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
};

export async function createVicThread(): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to talk to Vic.");
  const { data, error } = await supabase.from("vic_threads").insert({ user_id: u.user.id }).select("id").single();
  if (error) throw error;
  return data.id;
}
