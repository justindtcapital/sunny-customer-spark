import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { lovable } from "@/integrations/lovable/index";

export function LoginScreen() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function google() {
    setBusy(true); setError("");
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin, extraParams: { hd: "dt-capital.net", prompt: "select_account" } });
      if (result.error) setError(result.error.message);
    } catch { setError("Sign-in could not start. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="flex min-h-screen items-center justify-center bg-background px-4">
    <Card className="w-full max-w-sm border-border"><CardHeader><CardTitle className="text-2xl">Venture Pulse</CardTitle></CardHeader><CardContent className="space-y-4">
      <Button className="w-full" disabled={busy} onClick={google}>{busy ? "Please wait…" : "Sign in with Google"}</Button>
      <p className="text-sm text-muted-foreground">Use your dt-capital.net team account.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent></Card>
  </div>;
}
