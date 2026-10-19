import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// TanStack Start expects this named export during client hydration.
export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [csrfMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
