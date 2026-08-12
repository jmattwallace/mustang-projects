import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function PUT(request: NextRequest) {
  const response = NextResponse.json({ ok: false }, { status: 500 });
  const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items: {name:string;value:string;options?:any}[]) => items.forEach(i => response.cookies.set(i.name, i.value, i.options)) } });
  const { data: { user } } = await db.auth.getUser(); if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { ids } = await request.json();
  if (!Array.isArray(ids)) return NextResponse.json({ error: "Invalid project order." }, { status: 400 });
  const { data: owned } = await db.from("projects").select("id").eq("owner_id", user.id).in("id", ids);
  if (owned?.length !== ids.length) return NextResponse.json({ error: "You can only reorder your own projects." }, { status: 403 });
  const results = await Promise.all(ids.map((id:string, position:number) => db.from("projects").update({ position }).eq("id", id).eq("owner_id", user.id)));
  const failed = results.find(r => r.error); if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: response.headers });
}
