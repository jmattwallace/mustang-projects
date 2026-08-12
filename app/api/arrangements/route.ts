import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: false }, { status: 500 });
  const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items: {name:string;value:string;options?:any}[]) => items.forEach(i => response.cookies.set(i.name, i.value, i.options)) } });
  const { data: { user } } = await db.auth.getUser(); if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { id, name, positions } = (await request.json()) as { id?: string; name?: string; positions?: Record<string, number> };
  const payload = { owner_id:user.id, name:String(name).trim(), positions };
  const result = id ? await db.from("saved_arrangements").update({ name:payload.name, positions }).eq("id",id).eq("owner_id",user.id) : await db.from("saved_arrangements").insert(payload);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status:400 });
  return NextResponse.json({ ok:true }, { headers:response.headers });
}
