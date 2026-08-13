import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function client(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: (items: { name: string; value: string; options?: any }[]) => items.forEach((item) => response.cookies.set(item.name, item.value, item.options)) } },
  );
}

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: false }, { status: 500 });
  const db = client(request, response);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = (await request.json()) as { subject?: string; message?: string };
  if (!String(body.message || "").trim()) return NextResponse.json({ error: "Please enter feedback before sending." }, { status: 400 });
  const { error } = await db.from("feedback").insert({ submitted_by: user.id, subject: String(body.subject || "").trim(), message: String(body.message).trim() });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: response.headers });
}

export async function PATCH(request: NextRequest) {
  const response = NextResponse.json({ ok: false }, { status: 500 });
  const db = client(request, response);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = (await request.json()) as { id?: string; status?: "open" | "completed" | "deleted" };
  if (!body.id || !["open", "completed", "deleted"].includes(body.status || "")) return NextResponse.json({ error: "Invalid feedback update." }, { status: 400 });
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Only an administrator can update feedback." }, { status: 403 });
  const { error } = await db.from("feedback").update({ status: body.status }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: response.headers });
}
