import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LoginScreen } from "@/components/login-screen";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Team Sign-in — Venture Pulse" },
    { name: "description", content: "Verified team access to Venture Pulse." },
    { property: "og:title", content: "Team Sign-in — Venture Pulse" },
    { property: "og:description", content: "Verified team access to Venture Pulse." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AuthPage,
});

function AuthPage() {
  const { email } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (email && !window.location.search.includes("recovery=1")) void navigate({ to: "/", replace: true });
  }, [email, navigate]);
  return <LoginScreen />;
}