import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{id:string}> }) {
  const response = NextResponse.json({ ok: false }, { status: 500 });
  const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items: {name:string;value:string;options?:any}[]) => items.forEach(i => response.cookies.set(i.name, i.value, i.options)) } });
  const { data: { user } } = await db.auth.getUser(); if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { id } = await params; const { groupIds } = (await request.json()) as { groupIds?: string[] };
  const { error: remove } = await db.from("project_group_memberships").delete().eq("project_id", id); if (remove) return NextResponse.json({ error: remove.message }, { status: 400 });
  if (groupIds?.length) { const { error } = await db.from("project_group_memberships").insert(groupIds.map((group_id:string) => ({ project_id:id, group_id }))); if (error) return NextResponse.json({ error:error.message }, { status:400 }); }
  await db.rpc("admin_log_project_edit", { target_project: id, action_name: "updated project groups" });
  return NextResponse.json({ ok:true }, { headers: response.headers });
}
