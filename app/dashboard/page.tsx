import { createClient } from "@/lib/supabase/server";
import { Dashboard } from "./project-board";
import { redirect } from "next/navigation";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ viewAs?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("display_name, email, role, is_active").eq("id", user.id).maybeSingle();
  if (!profile?.is_active) redirect("/access-denied");
  const requestedViewAs = (await searchParams).viewAs;
  const { data: viewedProfile } = profile.role === "admin" && requestedViewAs
    ? await supabase.from("profiles").select("id,email,display_name,is_active").eq("id", requestedViewAs).maybeSingle()
    : { data: null };
  const viewingAs = viewedProfile?.is_active ? viewedProfile : null;
  const boardOwnerId = viewingAs?.id || user.id;
  const { data: projects } = await supabase.from("projects").select("*, project_stages(*), project_notes(*), project_group_memberships(group_id, project_groups(name,color)), expenses(amount)").eq("owner_id", boardOwnerId).order("position");
  const { data: groups } = await supabase.from("project_groups").select("id,name,color").eq("creator_id", user.id).order("name");
  const { data: arrangements } = await supabase.from("saved_arrangements").select("id,name,positions").eq("owner_id", user.id).order("created_at");
  const { data: people } = profile.role === "admin" ? await supabase.from("profiles").select("id,email,display_name").eq("is_active",true).order("email") : { data: [] };
  const { data: feedbackRows } = profile.role === "admin"
    ? await supabase.from("feedback").select("id,submitted_by,subject,message,status,created_at").order("created_at", { ascending: false })
    : { data: [] };
  const senderIds = (feedbackRows ?? []).map((item) => item.submitted_by);
  const { data: senders } = profile.role === "admin" && senderIds.length
    ? await supabase.from("profiles").select("id,email,display_name").in("id", senderIds)
    : { data: [] };
  const senderById = new Map((senders ?? []).map((sender) => [sender.id, sender]));
  const feedback = (feedbackRows ?? []).map((item) => ({ ...item, sender: senderById.get(item.submitted_by) || null }));
  return <Dashboard initialProjects={projects ?? []} groups={groups ?? []} arrangements={arrangements ?? []} name={viewingAs?.display_name || viewingAs?.email || profile.display_name || profile.email} email={viewingAs?.email || profile.email} role={profile.role} people={people ?? []} feedback={feedback} viewAs={viewingAs ? { name: viewingAs.display_name || viewingAs.email, email: viewingAs.email } : null} />;
}
