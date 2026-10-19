import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { allowedTeamEmail } from "./team-access";

interface AuthContextType {
  email: string | null;
  ready: boolean;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType>({ email: null, ready: false, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    let active = true;
    let revision = 0;
    localStorage.removeItem("vp-auth-email");
    async function refresh() {
      const current = ++revision;
      const { data } = await supabase.auth.getUser();
      if (!active || current !== revision) return;
      setEmail(data.user?.email_confirmed_at ? allowedTeamEmail(data.user.email) : null);
      setReady(true);
    }
    void refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      // Defer auth work until the auth client's callback lock is released.
      setTimeout(() => { if (!active) return; void refresh(); void router.invalidate(); if (event !== "SIGNED_OUT") void queryClient.invalidateQueries(); }, 0);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [queryClient, router]);

  async function logout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    setEmail(null);
    await router.navigate({ to: "/", replace: true });
  }
  return <AuthContext.Provider value={{ email, ready, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
