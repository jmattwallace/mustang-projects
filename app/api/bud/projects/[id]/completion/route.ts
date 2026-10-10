import { NextRequest, NextResponse } from "next/server";
import { authorizeBud, budDatabase, budOwnerId, budProject } from "@/lib/bud-api";

const projectColumns = "id,title,completion,status,target_date,client_name";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorizeBud(request, "write");
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { completion?: unknown } | null;
  const completion = Number(body?.completion);
  if (!Number.isInteger(completion) || completion < 0 || completion > 100) return NextResponse.json({ error: "completion must be a whole number from 0 to 100." }, { status: 400 });
  const { id } = await params;
  const { data, error } = await budDatabase().from("projects").update({ completion, updated_at: new Date().toISOString() }).eq("id", id).eq("owner_id", budOwnerId()).select(projectColumns).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not update project completion." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ project: budProject(data) });
}