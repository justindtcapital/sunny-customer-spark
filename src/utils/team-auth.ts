import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allowedTeamEmail } from "@/lib/team-access";

const requestToken = createServerOnlyFn(() => getRequestHeader("authorization")?.replace(/^Bearer /, ""));

export const requireTeamAuth = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const token = requestToken();
    const { data, error } = await context.supabase.auth.getUser(token);
    const email = data.user?.email;
    const teamEmail = allowedTeamEmail(email);
    if (error || !data.user?.email_confirmed_at || !teamEmail || data.user.id !== context.userId) {
      throw new Error("Verified team sign-in required.");
    }
    return next({ context: { teamEmail } });
  });