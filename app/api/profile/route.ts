import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function client(request: NextRequest, response: NextResponse) {
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

export async function PATCH(request: NextRequest) {
  const response = NextResponse.json({ ok: false }, { status: 500 });
  const db = client(request, response);
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { displayName } = (await request.json()) as { displayName?: string };
  const name = String(displayName || "").trim().slice(0, 100);
  if (!name)
    return NextResponse.json({ error: "A display name is required." }, { status: 400 });

  const { error } = await db
    .from("profiles")
    .update({ display_name: name })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: response.headers });
}
