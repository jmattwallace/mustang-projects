import { NextRequest, NextResponse } from "next/server";
import { authorizeBud, budConnectionDetails, budDatabase, budOwnerId, budProject } from "@/lib/bud-api";

const projectColumns = "id,title,completion,status,target_date,client_name";

export async function GET(request: NextRequest) {
  const denied = authorizeBud(request, "read");
  if (denied) return denied;
  const limitValue = Number(request.nextUrl.searchParams.get("limit") || "50");
  const cursorValue = Number(request.nextUrl.searchParams.get("cursor") || "0");
  const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 100) : 50;
  const cursor = Number.isInteger(cursorValue) && cursorValue >= 0 ? cursorValue : 0;
  const { data, error } = await budDatabase().from("projects").select(projectColumns).eq("owner_id", budOwnerId()).order("position").range(cursor, cursor + limit - 1);
  if (error) return NextResponse.json({ error: "Could not read projects." }, { status: 500 });
  const projects = (data || []).map(budProject);
  return NextResponse.json({
    projects,
    nextCursor: projects.length === limit ? cursor + limit : null,
    connection: budConnectionDetails(),
  });
}

export async function POST(request: NextRequest) {
  const denied = authorizeBud(request, "write");
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { title?: unknown; completion?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const completion = body?.completion === undefined ? 0 : Number(body.completion);
  if (!title || title.length > 180) return NextResponse.json({ error: "title is required and must be 180 characters or fewer." }, { status: 400 });
  if (!Number.isInteger(completion) || completion < 0 || completion > 100) return NextResponse.json({ error: "completion must be a whole number from 0 to 100." }, { status: 400 });
  const { data, error } = await budDatabase().from("projects").insert({ owner_id: budOwnerId(), title, completion, mode: "simple", status: "active" }).select(projectColumns).single();
  if (error || !data) return NextResponse.json({ error: "Could not create the project." }, { status: 500 });
  return NextResponse.json({ project: budProject(data) }, { status: 201 });
}