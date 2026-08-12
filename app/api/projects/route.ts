import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: false }, { status: 500 });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: (items: { name: string; value: string; options?: any }[]) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) }
  });
  const { data: projectId, error } = await supabase.rpc("create_new_project");
  if (error || !projectId) return NextResponse.json({ error: error?.message || "Project could not be created." }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: response.headers });
}
