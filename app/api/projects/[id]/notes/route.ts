import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = NextResponse.json({ ok: false }, { status: 500 });
  const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items: {name:string;value:string;options?:any}[]) => items.forEach(i => response.cookies.set(i.name, i.value, i.options)) } });
  const { data: { user } } = await db.auth.getUser(); if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { id } = await params; const { stageId, body } = await request.json();
  const { error: ownerError } = await db.from("projects").select("id").eq("id", id).eq("owner_id", user.id).single();
  if (ownerError) return NextResponse.json({ error: "Only the owner can edit notes." }, { status: 403 });
  const { data: existing, error: findError } = await db.from("project_notes").select("id").eq("project_id", id).eq("stage_id", stageId ?? null).maybeSingle();
  if (findError) return NextResponse.json({ error: findError.message }, { status: 400 });
  const { error } = existing ? await db.from("project_notes").update({ body }).eq("id", existing.id) : await db.from("project_notes").insert({ project_id:id, stage_id:stageId ?? null, note_type:"General", body });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: response.headers });
}
