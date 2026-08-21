import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: false }, { status: 500 });
  const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items: {name:string;value:string;options?:any}[]) => items.forEach(i => response.cookies.set(i.name, i.value, i.options)) } });
  const { data: { user } } = await db.auth.getUser(); if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { id, name, positions, ownerId } = (await request.json()) as { id?: string; name?: string; positions?: Record<string, unknown>; ownerId?: string };
  const payload = { owner_id:ownerId || user.id, name:String(name).trim(), positions };
  const result = id ? await db.from("saved_arrangements").update({ name:payload.name, positions }).eq("id",id).eq("owner_id",payload.owner_id) : await db.from("saved_arrangements").insert(payload);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status:400 });
  return NextResponse.json({ ok:true }, { headers:response.headers });
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ ok: false }, { status: 500 });
  const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items: {name:string;value:string;options?:any}[]) => items.forEach(i => response.cookies.set(i.name, i.value, i.options)) } });
  const { data: { user } } = await db.auth.getUser(); if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id"); const ownerId = new URL(request.url).searchParams.get("ownerId");
  if (!id) return NextResponse.json({ error: "Saved view not found." }, { status: 400 });
  const { error } = await db.from("saved_arrangements").delete().eq("id", id).eq("owner_id", ownerId || user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: response.headers });
}
