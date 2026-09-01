import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: false }, { status: 500 });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: (items: { name: string; value: string; options?: any }[]) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) }
  });
  const { ownerId } = (await request.json().catch(() => ({}))) as { ownerId?: string };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const result = ownerId && ownerId !== user.id
    ? await supabase.rpc("create_project_for_owner", { target_owner: ownerId })
    : await supabase.rpc("create_new_project");
  const { data: projectId, error } = result;
  if (error || !projectId) return NextResponse.json({ error: error?.message || "Project could not be created." }, { status: 400 });
  return NextResponse.json({ ok: true, projectId }, { headers: response.headers });
}
