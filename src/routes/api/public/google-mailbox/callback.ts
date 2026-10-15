import { createFileRoute } from "@tanstack/react-router";

// Google redirects here after the mailbox owner clicks Allow. The handler
// verifies the signed state and that Google's account matches the configured
// tracking mailbox before storing anything (see mailbox-oauth.server.ts).
export const Route = createFileRoute("/api/public/google-mailbox/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const back = (q: string) => Response.redirect(`${origin}/dashboard?${q}`, 302);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (url.searchParams.get("error") || !code || !state) {
          return back("mailbox=error&reason=" + encodeURIComponent("Google sign-in was cancelled."));
        }
        try {
          const { completeAuth } = await import("@/utils/mailbox-oauth.server");
          const email = await completeAuth(code, state, origin);
          return back("mailbox=connected&email=" + encodeURIComponent(email));
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Connection failed.";
          return back("mailbox=error&reason=" + encodeURIComponent(msg.slice(0, 200)));
        }
      },
    },
  },
});
