import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url); const code = url.searchParams.get("code");
  const response = NextResponse.redirect(new URL("/dashboard", url.origin));
  if (!code) return response;
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: (items: { name: string; value: string; options?: any }[]) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) }
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/login?reason=${encodeURIComponent(error.message)}`, url.origin));
  const { data: activated } = await supabase.rpc("activate_invited_user");
  if (!activated) return NextResponse.redirect(new URL("/access-denied", url.origin));
  return response;
}
