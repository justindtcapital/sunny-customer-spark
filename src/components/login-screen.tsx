import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { allowedTeamEmail } from "@/lib/team-access";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "recovery">("signin");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (window.location.hash.includes("type=recovery") || window.location.search.includes("recovery=1")) setMode("recovery"); }, []);
  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (mode !== "recovery" && !allowedTeamEmail(email)) { setError("Use your registered team email address."); return; }
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/auth?recovery=1" });
        if (error) throw error;
        setNotice("Check your email for a password reset link.");
      } else if (mode === "recovery") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setNotice("Password updated. You can sign in."); setMode("signin");
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        setNotice("Check your email to confirm your account before signing in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed."); }
    finally { setPassword(""); setBusy(false); }
  }
  async function social(provider: "google") {
    setBusy(true); setError("");
    try { const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin }); if (result.error) setError(result.error.message); }
    catch { setError("Sign-in could not start. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="flex min-h-screen items-center justify-center bg-background px-4">
    <Card className="w-full max-w-sm border-border"><CardHeader><CardTitle className="text-2xl">Venture Pulse</CardTitle></CardHeader><CardContent className="space-y-4">
      {mode === "signin" || mode === "signup" ? <div className="space-y-2">
        <Button className="w-full" variant="outline" disabled={busy} onClick={() => social("google")}>Continue with Google</Button>
      </div> : null}
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode !== "recovery" && <div className="space-y-2"><Label htmlFor="email">Team email</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>}
        {mode !== "reset" && <div className="space-y-2"><Label htmlFor="password">{mode === "recovery" ? "New password" : "Password"}</Label><Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create team account" : mode === "reset" ? "Send reset link" : mode === "recovery" ? "Save password" : "Sign in"}</Button>
      </form>
      <div className="flex flex-wrap justify-between gap-2"><Button size="sm" variant="ghost" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); setNotice(""); }}>{mode === "signup" ? "Back to sign in" : "Create account"}</Button><Button size="sm" variant="ghost" onClick={() => { setMode("reset"); setError(""); }}>Forgot password?</Button></div>
    </CardContent></Card>
  </div>;
}
