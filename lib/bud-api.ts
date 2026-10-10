import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type BudPermission = "read" | "write";

const env = process.env as Record<string, string | undefined>;

function suppliedToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function tokenMatches(received: string, expected: string | undefined) {
  if (!received || !expected) return false;
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

export function authorizeBud(request: NextRequest, permission: BudPermission) {
  const token = suppliedToken(request);
  const canRead = tokenMatches(token, env.BUD_READ_TOKEN) || tokenMatches(token, env.BUD_WRITE_TOKEN);
  const canWrite = tokenMatches(token, env.BUD_WRITE_TOKEN);
  const configured = Boolean(env.BUD_OWNER_ID && env.SUPABASE_SERVICE_ROLE_KEY && (env.BUD_READ_TOKEN || env.BUD_WRITE_TOKEN));

  if (!configured) return NextResponse.json({ error: "Bud integration is not configured." }, { status: 503 });
  if ((permission === "read" && !canRead) || (permission === "write" && !canWrite)) {
    return NextResponse.json({ error: "Bud token is not authorized for this operation." }, { status: 401 });
  }
  return null;
}

export function budDatabase() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function budOwnerId() {
  return env.BUD_OWNER_ID!;
}

// These values are intentionally non-secret and are returned only after a Bud
// token has been authorized. They make it possible to diagnose a mis-bound
// Worker without exposing any credential material.
export function budConnectionDetails() {
  let databaseHost: string | null = null;
  try {
    databaseHost = new URL(env.NEXT_PUBLIC_SUPABASE_URL || "").host || null;
  } catch {
    databaseHost = null;
  }
  return { ownerId: budOwnerId(), databaseHost };
}

export function budProject(project: { id: string; title: string; completion: number; status: string; target_date: string | null; client_name: string | null }) {
  return { id: project.id, title: project.title, completion: project.completion, status: project.status, targetDate: project.target_date, clientName: project.client_name };
}