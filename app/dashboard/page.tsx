import { createClient } from "@/lib/supabase/server";
import { Dashboard } from "./project-board";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("display_name, email, role, is_active").eq("id", user.id).maybeSingle();
  if (!profile?.is_active) redirect("/access-denied");
  // The everyday board is always personal. Admin-wide access is used only in
  // the explicit Admin/Reporting flow, never merely by opening the dashboard.
  const { data: projects } = await supabase.from("projects").select("*, project_stages(*), project_notes(*), project_group_memberships(group_id, project_groups(name,color)), expenses(amount)").eq("owner_id", user.id).order("position");
  const { data: groups } = await supabase.from("project_groups").select("id,name,color").eq("creator_id", user.id).order("name");
  const { data: arrangements } = await supabase.from("saved_arrangements").select("id,name,positions").eq("owner_id", user.id).order("created_at");
  const { data: people } = profile.role === "admin" ? await supabase.from("profiles").select("id,email,display_name").eq("is_active",true).order("email") : { data: [] };
  const { data: feedback } = profile.role === "admin"
    ? await supabase.from("feedback").select("id,subject,message,status,created_at,profiles!feedback_submitted_by_fkey(email,display_name)").order("created_at", { ascending: false })
    : { data: [] };
  return <Dashboard initialProjects={projects ?? []} groups={groups ?? []} arrangements={arrangements ?? []} name={profile.display_name || profile.email} email={profile.email} role={profile.role} people={people ?? []} feedback={feedback ?? []} />;
}
