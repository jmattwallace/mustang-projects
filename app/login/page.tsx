"use client";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(new URLSearchParams(location.search).get("reason") || ""), []);
  async function signIn() { const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } }); if (error) location.href = `/login?reason=${encodeURIComponent(error.message)}`; }
  return <main className="login"><section><p className="eyebrow">Mustang Projects Review</p><h1>Keep every project moving.</h1><p>Private, personal project boards for the work that spans your worlds.</p>{reason&&<p className="login-error">Sign-in could not finish: {reason}</p>}<button className="google" onClick={signIn}><span>G</span> Continue with Google</button><small>Access is limited to accounts invited by an administrator.</small></section></main>;
}
