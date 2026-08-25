import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = NextResponse.json({ ok: false }, { status: 500 });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: (items: { name: string; value: string; options?: any }[]) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) }
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  const { id } = await params; const body = (await request.json()) as { title?: string; completion?: number; gross?: number; net?: number; actualPaid?: number; paidInFull?: boolean; targetDate?: string | null; status?: "active" | "completed"; stages?: unknown };
  const { error } = await supabase.rpc("update_project_finance_and_stages", { target_project: id, new_title: String(body.title || "Untitled project"), new_completion: Number(body.completion), new_gross: Number(body.gross || 0), new_net: Number(body.net || 0), new_actual_paid: Number(body.actualPaid || 0), new_paid_in_full: body.paidInFull === true, new_target_date: body.targetDate || null, stage_values: body.stages || null });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (body.status) {
    const { error: statusError } = await supabase.from("projects").update({ status: body.status }).eq("id", id);
    if (statusError) return NextResponse.json({ error: statusError.message }, { status: 400 });
    await supabase.rpc("admin_log_project_edit", { target_project: id, action_name: body.status === "completed" ? "marked project complete" : "reopened project" });
  }
  return NextResponse.json({ ok: true }, { headers: response.headers });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = NextResponse.json({ ok: false }, { status: 500 });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: (items: { name: string; value: string; options?: any }[]) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) }
  });
  const { id } = await params;
  const { error } = await supabase.rpc("enable_project_stages", { target_project: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: response.headers });
}
