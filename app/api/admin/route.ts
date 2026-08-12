import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type InviteRequest = {
  email?: string;
  role?: "standard" | "admin";
};

function createClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items: { name: string; value: string; options?: any }[]) =>
          items.forEach((item) =>
            response.cookies.set(item.name, item.value, item.options),
          ),
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: false }, { status: 500 });
  const db = createClient(request, response);
  const body = (await request.json()) as InviteRequest;
  const email = String(body.email || "").trim();
  const role = body.role === "admin" ? "admin" : "standard";

  if (!email)
    return NextResponse.json({ error: "An email address is required." }, { status: 400 });

  const { error } = await db.rpc("admin_invite_user", {
    invited_email: email,
    invited_role: role,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true }, { headers: response.headers });
}
