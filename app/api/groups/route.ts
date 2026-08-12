import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function client(request: NextRequest, response: NextResponse) {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items: {name:string;value:string;options?:any}[]) => items.forEach(i => response.cookies.set(i.name, i.value, i.options)) } });
}
export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: false }, { status: 500 }); const db = client(request, response);
  const { data: { user } } = await db.auth.getUser(); if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = (await request.json()) as { name?: string; color?: string }; const { error } = await db.from("project_groups").insert({ creator_id: user.id, name: String(body.name).trim(), color: body.color || "#2763d9" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ ok: true }, { headers: response.headers });
}
