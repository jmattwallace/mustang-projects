"use client";
import { useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import helpReference from "./help-reference.png";

type S = {
  id: string;
  name: string;
  allocation: number;
  progress: number;
  color: string;
  target_date?: string | null;
};
type G = { id: string; name: string; color: string };
type N = { id: string; stage_id: string | null; body: string };
type A = { id: string; name: string; positions: Record<string, unknown> };
type Person = { id: string; email: string; display_name: string | null };
type Feedback = {
  id: string;
  subject: string;
  message: string;
  status: "open" | "completed" | "deleted";
  created_at: string;
  sender: { email: string; display_name: string | null } | null;
};
type P = {
  id: string;
  title: string;
  client_name: string | null;
  completion: number;
  status: "active" | "completed" | "cancelled" | "archived";
  mode?: "simple" | "staged";
  projected_net: number;
  projected_gross: number;
  actual_paid: number;
  paid_in_full: boolean;
  project_stages: S[];
  target_date?: string | null;
  project_notes: N[];
  project_group_memberships: {
    group_id: string;
    project_groups: { name: string; color: string } | null;
  }[];
};
const order = ["Pre-Production", "Production", "Post-production", "Confirm"],
  cash = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n || 0);
const targetDateFor = (project: P) =>
  project.target_date ||
  project.project_stages
    .map((stage) => stage.target_date)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1) ||
  null;
const isOverdue = (date: string) => date < new Date().toLocaleDateString("en-CA");
const displayDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );
const shade = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  const r = n >> 16,
    g = (n >> 8) & 255,
    b = n & 255,
    gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Keep only a subtle (30%) group-color tint, then darken it strongly.
  return `rgb(${Math.round((r * 0.3 + gray * 0.7) * 0.42)},${Math.round((g * 0.3 + gray * 0.7) * 0.42)},${Math.round((b * 0.3 + gray * 0.7) * 0.42)})`;
};
async function errorFrom(response: Response) {
  const body = (await response.json()) as { error?: string };
  return body.error || "Something went wrong.";
}
function savedPositions(
  projects: P[],
  collapsed: Set<string>,
  hidden: Set<string>,
  state: { query: string; inactive: boolean; sort: string },
) {
  return {
    ...Object.fromEntries(projects.map((project, index) => [project.id, index])),
    ...Object.fromEntries(
      projects
        .filter((project) => project.mode === "staged")
        .map((project) => [`__stage_state__${project.id}`, collapsed.has(project.id)]),
    ),
    ...Object.fromEntries([...hidden].map((id) => [`__hidden__${id}`, true])),
    __view_query__: state.query,
    __view_inactive__: state.inactive,
    __view_sort__: state.sort,
  };
}
function savedPosition(positions: Record<string, unknown>, id: string) {
  const value = positions[id];
  return typeof value === "number" ? value : 999999;
}

export function Dashboard({
  initialProjects,
  groups,
  arrangements,
  boardOwnerId,
  name,
  email,
  role,
  people,
  feedback,
  viewAs,
}: {
  initialProjects: P[];
  groups: G[];
  arrangements: A[];
  boardOwnerId: string;
  name: string;
  email: string;
  role: "standard" | "admin";
  people: Person[];
  feedback: Feedback[];
  viewAs: { name: string; email: string } | null;
}) {
  const [projects, setProjects] = useState(initialProjects),
    [query, setQuery] = useState(""),
    [inactive, setInactive] = useState(false),
    [selected, setSelected] = useState<P | null>(null),
    [note, setNote] = useState<{ p: P; s?: S } | null>(null),
    [manage, setManage] = useState(false),
    [busy, setBusy] = useState(false),
    [drag, setDrag] = useState<string | null>(null),
    [drop, setDrop] = useState<string | null>(null),
    dragRef = useRef<string | null>(null),
    [collapsedStages, setCollapsedStages] = useState<Set<string>>(
      () => new Set(initialProjects.filter((project) => project.mode === "staged").map((project) => project.id)),
    ),
    [hiddenProjects, setHiddenProjects] = useState<Set<string>>(new Set()),
    [sort, setSort] = useState("manual"),
    [adminOpen, setAdminOpen] = useState(false),
    [adminTab, setAdminTab] = useState<"reports" | "admin">("reports"),
    [accountOpen, setAccountOpen] = useState(false),
    [feedbackOpen, setFeedbackOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [savedViewMenu, setSavedViewMenu] = useState<A | null>(null),
    [pickThree, setPickThree] = useState<A | null>(null),
    [notePreview, setNotePreview] = useState<{ body: string; left: number; top: number } | null>(null);
  const readOnly = false;
  const regularArrangements = arrangements.filter((arrangement) => arrangement.positions.__view_kind__ !== "pick3" && arrangement.name !== "Pick 3 projects");
  const pickThreeView = arrangements.find((arrangement) => arrangement.positions.__view_kind__ === "pick3" || arrangement.name === "Pick 3 projects");
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null),
    suppressClick = useRef(false),
    notePreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    mobileRefreshPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  function refreshMobileLayout() {
    window.dispatchEvent(new Event("resize"));
    const refreshedUrl = new URL(window.location.href);
    refreshedUrl.searchParams.set("mobileRefresh", String(Date.now()));
    window.location.assign(refreshedUrl.toString());
  }
  function beginMobileRefresh() {
    if (mobileRefreshPress.current) clearTimeout(mobileRefreshPress.current);
    mobileRefreshPress.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(35);
      refreshMobileLayout();
    }, 850);
  }
  function cancelMobileRefresh() {
    if (mobileRefreshPress.current) clearTimeout(mobileRefreshPress.current);
    mobileRefreshPress.current = null;
  }
  function startNotePreview(event: MouseEvent<HTMLButtonElement>, body?: string) {
    if (!body) return;
    if (notePreviewTimer.current) clearTimeout(notePreviewTimer.current);
    const left = Math.max(16, Math.min(event.clientX, window.innerWidth - 440));
    const top = Math.max(16, Math.min(event.clientY + 14, window.innerHeight - 220));
    notePreviewTimer.current = setTimeout(() => setNotePreview({ body, left, top }), 600);
  }
  function stopNotePreview() {
    if (notePreviewTimer.current) clearTimeout(notePreviewTimer.current);
    notePreviewTimer.current = null;
    setNotePreview(null);
  }
  const visible = useMemo(
    () =>
      projects
        .filter(
          (p) =>
            !hiddenProjects.has(p.id) &&
            (inactive || p.status === "active") &&
            (sort !== "deadline" || Boolean(targetDateFor(p))) &&
            `${p.title} ${p.project_group_memberships.map((x) => x.project_groups?.name).join(" ")} ${p.project_notes.map((x) => x.body).join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "completion"
            ? b.completion - a.completion
            : sort === "deadline"
              ? String(targetDateFor(a)).localeCompare(String(targetDateFor(b)))
            : sort === "gross"
              ? Number(b.actual_paid) - Number(a.actual_paid) ||
                Number(b.projected_gross) - Number(a.projected_gross)
              : sort === "net"
                ? Number(b.projected_net) - Number(a.projected_net)
                : sort === "groups"
                  ? (
                      a.project_group_memberships[0]?.project_groups?.name || ""
                    ).localeCompare(
                      b.project_group_memberships[0]?.project_groups?.name ||
                        "",
                    )
                  : 0,
        ),
    [projects, query, inactive, sort, hiddenProjects],
  );
  async function newProject() {
    setBusy(true);
    const r = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: boardOwnerId }) }),
      b = (await r.json()) as { ok?: boolean; error?: string };
    b.ok ? location.reload() : alert(b.error);
    setBusy(false);
  }
  async function reorder(
    target: { id: string; after: boolean } | null,
    draggedFromEvent?: string,
  ) {
    const draggedId = draggedFromEvent || dragRef.current || drag;
    if (!draggedId) return;
    const next = [...projects];
    const sourceIndex = next.findIndex((x) => x.id === draggedId);
    if (sourceIndex < 0) return;
    const [moved] = next.splice(sourceIndex, 1);
    const targetIndex = target
      ? next.findIndex((x) => x.id === target.id)
      : next.length;
    const insertAt = target
      ? target.after
        ? targetIndex + 1
        : targetIndex
      : next.length;
    next.splice(Math.max(0, insertAt), 0, moved);
    setProjects(next);
    setSort("manual");
    setDrag(null);
    dragRef.current = null;
    setDrop(null);
    const r = await fetch("/api/projects/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((x) => x.id) }),
    });
    if (!r.ok) {
      alert(await errorFrom(r));
      location.reload();
    }
  }
  async function saveArrangement(slot: number) {
    const existing = regularArrangements[slot];
    const name =
      existing?.name ||
      prompt("Name this custom arrangement:", `Custom view ${slot + 1}`);
    if (!name) return;
    const r = await fetch("/api/arrangements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: existing?.id,
          ownerId: boardOwnerId,
          name,
        positions: savedPositions(projects, collapsedStages, hiddenProjects, { query, inactive, sort }),
      }),
    });
    if (!r.ok) alert(await errorFrom(r));
    else location.reload();
  }
  function loadArrangement(a: A) {
    if (a.positions.__view_kind__ === "pick3" || a.name === "Pick 3 projects") {
      const picks = new Set(
        Object.keys(a.positions)
          .filter((key) => key.startsWith("__pick__"))
          .map((key) => key.replace("__pick__", ""))
          .filter((id) => projects.some((project) => project.id === id && project.status === "active")),
      );
      if (picks.size !== 3) { setPickThree(a); return; }
      setHiddenProjects(new Set(projects.filter((project) => !picks.has(project.id)).map((project) => project.id)));
      setQuery(""); setInactive(true); setSort("manual");
    } else {
    const savedSort = typeof a.positions.__view_sort__ === "string" ? a.positions.__view_sort__ : "manual";
    setSort(savedSort);
    setQuery(typeof a.positions.__view_query__ === "string" ? a.positions.__view_query__ : "");
    setInactive(a.positions.__view_inactive__ === true);
    setProjects(
      [...projects].sort(
        (x, y) =>
          savedPosition(a.positions, x.id) - savedPosition(a.positions, y.id),
      ),
    );
    setCollapsedStages(
      new Set(
        projects
          .filter((project) => project.mode === "staged")
          .filter((project) => a.positions[`__stage_state__${project.id}`] !== false)
          .map((project) => project.id),
      ),
    );
    setHiddenProjects(new Set(Object.keys(a.positions).filter((key) => key.startsWith("__hidden__")).map((key) => key.replace("__hidden__", ""))));
    }
  }
  function toggleAllStages() {
    const stagedIds = projects.filter((project) => project.mode === "staged").map((project) => project.id);
    const allCollapsed = stagedIds.length > 0 && stagedIds.every((id) => collapsedStages.has(id));
    setCollapsedStages(allCollapsed ? new Set() : new Set(stagedIds));
  }
  function applySort(nextSort: string) {
    // A standard sort always takes precedence over a saved view's filters.
    setSort(nextSort);
    setQuery("");
    setInactive(false);
    setHiddenProjects(new Set());
  }
  function showPickedProjects(picks: string[]) {
    const activePicks = new Set(
      projects
        .filter((project) => project.status === "active" && picks.includes(project.id))
        .map((project) => project.id),
    );
    setHiddenProjects(new Set(projects.filter((project) => !activePicks.has(project.id)).map((project) => project.id)));
    setQuery("");
    setInactive(true);
    setSort("manual");
    setPickThree(null);
  }
  return (
    <main>
      <header>
        <div className="title-row">
          <div>
            <p
              className="eyebrow mobile-refresh-title"
              title="Press and hold to refresh this phone view"
              onPointerDown={(event) => {
                if (event.pointerType !== "touch") return;
                event.preventDefault();
                beginMobileRefresh();
              }}
              onPointerUp={cancelMobileRefresh}
              onPointerCancel={cancelMobileRefresh}
              onPointerLeave={cancelMobileRefresh}
              onContextMenu={(event) => event.preventDefault()}
            >
              Mustang Projects Review
            </p>
            <h1>{name.split(" ")[0]}'s projects</h1>
            {viewAs && <p className="viewing-as">Viewing as {viewAs.name} ({viewAs.email})</p>}
          </div>
          <input
            className="header-search"
            placeholder="Search projects, groups, notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
            <label className="check header-check">
            <input
              type="checkbox"
              checked={inactive}
              onChange={(e) => setInactive(e.target.checked)}
            />{" "}
            Include completed
          </label>
          <label className="sort-control">
            Sort by{" "}
            <select value={sort} onChange={(e) => applySort(e.target.value)}>
              <option value="manual">Custom order</option>
              <option value="completion">Completion %</option>
              <option value="deadline">Next date</option>
              <option value="gross">Projected gross</option>
              <option value="groups">Groups</option>
            </select>
          </label>
          <div className="saved-views">
            {[0, 1].map((i) =>
              regularArrangements[i] ? (
                <button
                  key={i}
                  className="view-button"
                  onClick={() => loadArrangement(regularArrangements[i])}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (!readOnly) setSavedViewMenu(regularArrangements[i]);
                  }}
                >
                  {regularArrangements[i].name}
                </button>
              ) : (
                <button
                  key={i}
                  className="view-button"
                  onClick={() => saveArrangement(i)}
                >
                  {`+ Save view ${i + 1}`}
                </button>
              ),
            )}
            <button className="view-button" onClick={() => pickThreeView ? loadArrangement(pickThreeView) : setPickThree({ id: "", name: "Pick 3 projects", positions: {} })} onContextMenu={(event) => { event.preventDefault(); if (!readOnly) setPickThree(pickThreeView || ({ id: "", name: "Pick 3 projects", positions: {} } as A)); }}>
              Pick 3
            </button>
          </div>
        </div>
        <div className="actions second-row">
          {hiddenProjects.size > 0 && <button className="ghost" onClick={() => setHiddenProjects(new Set())}>Un-Hide All</button>}
          <button className="ghost title-signout" onClick={() => (location.href = viewAs ? "/dashboard" : "/auth/signout")}>
            {viewAs ? "Close View As" : "Sign out"}
          </button>
          {!viewAs && <button className="ghost" onClick={() => setAccountOpen(true)}>
            Account
          </button>}
          <button className="ghost" onClick={toggleAllStages}>
            {projects.some((project) => project.mode === "staged") && projects.filter((project) => project.mode === "staged").every((project) => collapsedStages.has(project.id)) ? "Expand all" : "Collapse all"}
          </button>
          <button className="ghost" onClick={() => setManage(true)}>
            Manage groups
          </button>
          <button className="ghost" onClick={() => setFeedbackOpen(true)}>
            Feedback
          </button>
          <button className="ghost" onClick={() => setHelpOpen(true)}>
            Help
          </button>
          <button
            className="ghost"
            onClick={() => {
              setAdminTab("reports");
              setAdminOpen(true);
            }}
          >
            Reports
          </button>
          {role === "admin" && (
            <button
              className="ghost"
              onClick={() => {
                setAdminTab("admin");
                setAdminOpen(true);
              }}
            >
              Admin
            </button>
          )}
          <button className="primary" disabled={busy} onClick={newProject}>
            {busy ? "Creating…" : "+ New project"}
          </button>
        </div>
      </header>
      <section className="board">
        {visible.map((p) => {
          const groupColors = p.project_group_memberships
              .map((membership) => membership.project_groups?.color)
              .filter((groupColor): groupColor is string => Boolean(groupColor)),
            group = p.project_group_memberships.find(
              (x) => x.project_groups,
            )?.project_groups,
            color = group?.color || "#1746a4",
            overall = p.project_notes.find((x) => !x.stage_id)?.body,
            targetDate = targetDateFor(p);
          return (
            <div
              key={p.id}
              className="drop-wrap"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const rect = e.currentTarget.getBoundingClientRect();
                setDrop(`${e.clientY < rect.top + rect.height / 2 ? "before" : "after"}:${p.id}`);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                void reorder(
                  { id: p.id, after: e.clientY >= rect.top + rect.height / 2 },
                  e.dataTransfer.getData("text/plain"),
                );
              }}
            >
              {drop === `before:${p.id}` && drag !== p.id && (
                <div className="drop-indicator">Drop above this project</div>
              )}
              <article
                className={`project ${drag === p.id ? "dragging" : ""}`}
                draggable={!readOnly}
                onDragStart={(e) => {
                  if (readOnly) return;
                  setDrag(p.id);
                  dragRef.current = p.id;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", p.id);
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setDrop(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!readOnly && confirm(`Temporarily hide “${p.title}” from this board?`)) {
                    setHiddenProjects((current) => new Set([...current, p.id]));
                  }
                }}
                onTouchStart={() => {
                  if (p.mode !== "staged") return;
                  longPress.current = setTimeout(() => {
                    suppressClick.current = true;
                    setCollapsedStages((current) => {
                      const next = new Set(current);
                      next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                      return next;
                    });
                  }, 600);
                }}
                onTouchEnd={() => {
                  if (longPress.current) clearTimeout(longPress.current);
                  longPress.current = null;
                }}
                onTouchMove={() => {
                  if (longPress.current) clearTimeout(longPress.current);
                  longPress.current = null;
                }}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  if (!drag && !readOnly) setSelected(p);
                }}
              >
                {p.mode === "staged" && !collapsedStages.has(p.id) ? (
                  <div className="stages">
                    {p.project_stages
                      .sort(
                        (a, b) => order.indexOf(a.name) - order.indexOf(b.name),
                      )
                      .map((s) => {
                        const text = p.project_notes.find(
                          (n) => n.stage_id === s.id,
                        )?.body;
                        return (
                          <div
                            className="stage"
                            key={s.id}
                            style={
                              {
                                width: `${s.allocation}%`,
                                ["--stage-progress" as string]: `${s.progress}%`,
                              } as CSSProperties
                            }
                          >
                            {s.allocation >= 14 && <span>{s.name}</span>}
                            <small>
                              {s.progress}%
                              {s.allocation >= 14 ? " complete" : ""}
                            </small>
                            <button
                              className="note-preview"
                              onMouseEnter={(event) => startNotePreview(event, text)}
                              onMouseLeave={stopNotePreview}
                              onClick={(e) => {
                                e.stopPropagation();
                                setNote({ p, s });
                              }}
                            >
                              {text || "Add note"}
                            </button>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div
                    className="simple-progress"
                    style={{ background: shade(color) }}
                  >
                    <span
                      style={{ width: `${p.completion}%`, background: color }}
                    />
                    <button
                      className="note-preview overall"
                      onMouseEnter={(event) => startNotePreview(event, overall)}
                      onMouseLeave={stopNotePreview}
                      onClick={(e) => {
                        e.stopPropagation();
                        setNote({ p });
                      }}
                    >
                      {overall || "Add note"}
                    </button>
                  </div>
                )}
                <div
                  className="project-info"
                  style={
                    {
                      background: shade(color),
                      ["--project-progress" as string]: `${p.completion}%`,
                      ["--project-color" as string]: color,
                      ["--group-gradient" as string]: `linear-gradient(90deg, ${groupColors.join(", ") || color})`,
                    } as CSSProperties
                  }
                >
{groupColors.length > 1 && <div className="group-hover-gradient" aria-hidden="true" />}
                  <div className="project-summary">
                    <h2>
                      {p.title}
                      {p.client_name && <em> · {p.client_name}</em>}
                    </h2>
                    {targetDate && (
                      <span className={`target-date ${isOverdue(targetDate) ? "overdue" : ""}`}>
                        {isOverdue(targetDate) ? "Overdue" : "Next date"}: {displayDate(targetDate)}
                      </span>
                    )}
                    <div className="group-list">
                      {p.project_group_memberships.map(
                        (x, i) =>
                          x.project_groups && (
                            <span
                              key={i}
                              style={{ color: x.project_groups.color }}
                            >
                              {x.project_groups.name}
                            </span>
                          ),
                      )}
                    </div>
                    {Number(p.projected_gross) > 0 && (
                      <span className="finance-pill">
                        {cash(Number(p.projected_gross))} Gross
                      </span>
                    )}
                    {Number(p.projected_net) > 0 && (
                      <span className="finance-pill">
                        {cash(Number(p.projected_net))} Net
                      </span>
                    )}
                    {Number(p.actual_paid) > 0 && (
                      <span className="finance-pill paid-pill">
                        {cash(Number(p.actual_paid))} Paid
                      </span>
                    )}
                    {p.paid_in_full && <span className="finance-pill paid-full-pill">Paid in full</span>}
                  </div>
                  {p.mode === "staged" && (
                    <button
                      className="open-stages"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCollapsedStages((current) => {
                          const next = new Set(current);
                          next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                          return next;
                        });
                      }}
                    >
                      {collapsedStages.has(p.id) ? "Open stages" : "Close stages"}
                    </button>
                  )}
                  <strong>{p.completion}%</strong>
                </div>
              </article>
              {drop === `after:${p.id}` && drag !== p.id && (
                <div className="drop-indicator">Drop below this project</div>
              )}
            </div>
          );
        })}
        {visible.length > 0 && (
          <div
            className={`drop-end ${drop === "__end__" ? "active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrop("__end__");
            }}
            onDrop={(e) => {
              e.preventDefault();
              void reorder(null, e.dataTransfer.getData("text/plain"));
            }}
          >
            Drop at end
          </div>
        )}
      </section>
      {!visible.length && (
        <div className="empty">
          <h2>No projects yet</h2>
          <p>Create your first project to begin.</p>
        </div>
      )}
      {selected && (
        <ProjectEdit
          project={selected}
          groups={groups}
          close={() => setSelected(null)}
        />
      )}{" "}
      {note && <NoteEdit target={note} close={() => setNote(null)} />}{" "}
      {notePreview && (
        <div className="note-hover-preview" style={{ left: notePreview.left, top: notePreview.top }}>
          {notePreview.body}
        </div>
      )}
      {manage && <GroupEdit groups={groups} ownerId={boardOwnerId} close={() => setManage(false)} />}
      {feedbackOpen && <FeedbackForm close={() => setFeedbackOpen(false)} />}
      {helpOpen && (
        <HelpGuide
          role={role}
          close={() => setHelpOpen(false)}
          openFeedback={() => {
            setHelpOpen(false);
            setFeedbackOpen(true);
          }}
        />
      )}
      {savedViewMenu && <SavedViewMenu view={savedViewMenu} projects={projects} ownerId={boardOwnerId} collapsedStages={collapsedStages} hiddenProjects={hiddenProjects} query={query} inactive={inactive} sort={sort} close={() => setSavedViewMenu(null)} />}
      {pickThree && <PickThree view={pickThree} projects={projects} ownerId={boardOwnerId} showPickedProjects={showPickedProjects} close={() => setPickThree(null)} />}
      {accountOpen && (
        <AccountEdit
          currentName={name}
          email={email}
          close={() => setAccountOpen(false)}
        />
      )}
      {adminOpen && (
        <AdminReports
          initialTab={adminTab}
          role={role}
          people={people}
          projects={projects}
          feedback={feedback}
          close={() => setAdminOpen(false)}
        />
      )}
    </main>
  );
}
function AccountEdit({
  currentName,
  email,
  close,
}: {
  currentName: string;
  email: string;
  close: () => void;
}) {
  const [displayName, setDisplayName] = useState(currentName),
    [saving, setSaving] = useState(false);
  async function save() {
    const value = displayName.trim();
    if (!value) return alert("Please enter the name you want to use.");
    setSaving(true);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: value }),
    });
    if (response.ok) location.reload();
    else alert((await errorFrom(response)) || "Could not save your name.");
    setSaving(false);
  }
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section className="modal account-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close" onClick={close}>×</button>
        <p className="eyebrow">Account</p>
        <h2>Your display name</h2>
        <p className="muted">{email}</p>
        <label>
          Name shown in Mustang Projects
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </label>
        <div className="modal-actions">
          <button className="ghost" onClick={close}>Cancel</button>
          <button className="primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save name"}
          </button>
        </div>
      </section>
    </div>
  );
}
function NoteEdit({
  target,
  close,
}: {
  target: { p: P; s?: S };
  close: () => void;
}) {
  const [body, setBody] = useState(
      target.p.project_notes.find((n) => n.stage_id === (target.s?.id ?? null))
        ?.body || "",
    ),
    [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const r = await fetch(`/api/projects/${target.p.id}/notes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId: target.s?.id ?? null, body }),
    });
    r.ok ? location.reload() : alert(await errorFrom(r));
    setSaving(false);
  }
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section
        className="modal compact"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="close" onClick={close}>
          ×
        </button>
        <p className="eyebrow">
          {target.s ? `${target.s.name} stage note` : "Project note"}
        </p>
        <textarea
          className="note-editor"
          value={body}
          placeholder="Add a note…"
          onChange={(e) => setBody(e.target.value)}
        />
        <button className="primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save note"}
        </button>
      </section>
    </div>
  );
}
function FeedbackForm({ close }: { close: () => void }) {
  const [subject, setSubject] = useState(""),
    [message, setMessage] = useState(""),
    [sending, setSending] = useState(false);
  async function send() {
    setSending(true);
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, message }),
    });
    if (response.ok) {
      close();
    } else alert(await errorFrom(response));
    setSending(false);
  }
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section className="modal compact" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" onClick={close}>×</button>
        <p className="eyebrow">Feedback</p>
        <h2>Send feedback</h2>
        <label>Subject (optional)<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Short summary" /></label>
        <label>Message<textarea className="note-editor" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What would make Mustang Projects better?" /></label>
        <button className="primary" disabled={sending} onClick={() => void send()}>{sending ? "Sending…" : "Send feedback"}</button>
      </section>
    </div>
  );
}
function HelpGuide({ role, close, openFeedback }: { role: "standard" | "admin"; close: () => void; openFeedback: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section className="modal help-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" onClick={close}>×</button>
        <p className="eyebrow">Mustang Projects Review</p>
        <h2>Help and guide</h2>
        <p className="help-intro">A personal project board for keeping projects moving across all the different areas of your work. Use it to see what is next, what needs attention, and where each project stands.</p>

        <details>
          <summary>Getting started</summary>
          <ol>
            <li>Create a project. New projects begin as <b>Simple</b>, with one overall completion percentage.</li>
            <li>Use <b>Manage groups</b> to make colored tags such as a client, organization, or area of work; then assign one or more groups in the project editor.</li>
            <li>Add a target date and any useful note. Choose <b>Add stage plan</b> when a project needs more detailed tracking.</li>
            <li>Use Search, Sort by, or a saved view to focus the board on the work you need right now.</li>
          </ol>
        </details>

        <details>
          <summary>Projects, progress, and stages</summary>
          <p><b>Simple project:</b> a compact project with one overall completion percentage. Example: “Update website — 65% complete.”</p>
          <p><b>Staged project:</b> a project broken into Pre-Production, Production, Post-production, and Confirm. Each stage has a target percentage, a completion percentage, an optional target date, and its own note.</p>
          <p><b>Overall completion:</b> your subjective view of how complete the project is. For staged projects, the system shows the weighted stage calculation and lets you use it or retain your manual estimate.</p>
          <p><b>Open stages / Close stages:</b> shows or hides stage detail. Staged projects normally start closed; a saved Custom view can intentionally remember an open project.</p>
          <p><b>Stage names are customizable:</b> you can rename every stage in the project editor. Their order remains fixed so the board stays consistent.</p>
        </details>

        <details>
          <summary>Dates, notes, groups, and money</summary>
          <p><b>Target date:</b> a date-only planning target. A Simple project has one project target date. A Staged project derives its project target from the latest date entered on any stage.</p>
          <p><b>Next date:</b> the earliest relevant target date used by the Next date sort. Projects without a target date are intentionally hidden in that sorted view. Past dates are marked <b>Overdue</b>.</p>
          <p><b>Notes:</b> short, editable text reminders. Click a note to edit it; pause over an existing note to read it in a larger preview.</p>
          <p><b>Groups:</b> your personal colored labels. They are private to their creator and can be applied to more than one project.</p>
          <p><b>Projected Gross / Net:</b> optional expected USD amounts. Gross is the expected total income; Net is the expected amount after costs. Zero-dollar values are kept out of project cards and financial reports.</p>
        </details>

        <details>
          <summary>Finding, arranging, and saving views</summary>
          <p><b>Search:</b> searches project titles, groups, and notes. Selecting a project opens its full editor.</p>
          <p><b>Sort by:</b> choose Custom order, Completion %, Next date, Projected gross, or Groups. Next date shows only dated projects, with overdue work first.</p>
          <p><b>Custom order:</b> drag project cards above or below another card to set your own order.</p>
          <p><b>Custom views:</b> save a useful board state, including the order, visible projects, search/filter state, and whether each staged project is open or closed. Right-click a saved view to update it or clear it.</p>
          <p><b>Pick 3:</b> creates a focused saved view that shows exactly three chosen projects. Right-click Pick 3 to change its selections.</p>
          <p><b>Hide / Un-Hide All:</b> right-click any project to temporarily hide it. Un-Hide All restores projects, while selecting another saved view restores that view’s saved visibility.</p>
        </details>

        <details>
          <summary>Things you can customize</summary>
          <ul>
            <li><b>Project names and client names</b> — use clear names that make scanning easy.</li>
            <li><b>Simple or staged tracking</b> — begin simple; add the stage plan only when the detail is useful.</li>
            <li><b>Stage names, target allocations, completion, dates, and notes</b> — keep target allocations totaling 100%.</li>
            <li><b>Overall completion</b> — preserve your judgment or accept the automatic stage calculation.</li>
            <li><b>Groups and colors</b> — make groups reflect your real worlds of work; use distinct, readable colors.</li>
            <li><b>Projected gross and net</b> — leave them blank/zero when money is not relevant.</li>
            <li><b>Custom views and Pick 3</b> — save a weekly review, client-focused view, or today’s three priorities.</li>
          </ul>
        </details>

        <details>
          <summary>Menu buttons</summary>
          <ul>
            <li><b>Account:</b> update the name shown in the project-board title.</li>
            <li><b>Expand all / Collapse all:</b> opens or closes all staged projects at once.</li>
            <li><b>Manage groups:</b> create, rename, recolor, or remove your personal groups.</li>
            <li><b>Feedback:</b> send a question, issue, or idea to the administrator.</li>
            <li><b>Help:</b> opens this guide.</li>
            <li><b>Reports:</b> build an online, printable, or CSV project report.</li>
            <li><b>New project:</b> creates a Simple project; use Add stage plan later if needed.</li>
          </ul>
        </details>

        <details>
          <summary>Reference screenshot</summary>
          <p className="muted">Click the image to view a full-size example of the project board.</p>
          <a href={helpReference.src} target="_blank" rel="noreferrer"><img className="help-screenshot" src={helpReference.src} alt="Example Mustang Projects board" /></a>
        </details>

        {role === "admin" && (
          <details className="admin-help">
            <summary>Administrator-only capabilities</summary>
            <p><b>Admin</b> is available only to administrator accounts. Administrators can invite people by their Google email address, choose their role, and see feedback with the submitting user and time.</p>
            <p><b>View as:</b> lets an administrator work in another active user’s project board without changing the administrator’s own session. Project work remains available, while the selected person’s Account profile stays protected. Use Close View As to return.</p>
            <p><b>Feedback management:</b> mark feedback Completed or Deleted. Completed items are hidden by default but remain available through the status toggles.</p>
            <p><b>Reporting:</b> administrators can build reports across accessible projects and can include completed/archived work when needed.</p>
          </details>
        )}
        <div className="help-actions">
          <button className="ghost" onClick={openFeedback}>Send feedback</button>
          <button className="primary" onClick={close}>Close help</button>
        </div>
      </section>
    </div>
  );
}
function SavedViewMenu({ view, projects, ownerId, collapsedStages, hiddenProjects, query, inactive, sort, close }: { view: A; projects: P[]; ownerId: string; collapsedStages: Set<string>; hiddenProjects: Set<string>; query: string; inactive: boolean; sort: string; close: () => void }) {
  async function update() {
    const response = await fetch("/api/arrangements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: view.id, ownerId, name: view.name, positions: savedPositions(projects, collapsedStages, hiddenProjects, { query, inactive, sort }) }),
    });
    // The current board already reflects the exact state just saved. Keeping it
    // in place avoids briefly reopening every staged project after an update.
    response.ok ? close() : alert(await errorFrom(response));
  }
  async function clear() {
    if (!confirm(`Clear the saved view “${view.name}”?`)) return;
    const response = await fetch(`/api/arrangements?id=${encodeURIComponent(view.id)}&ownerId=${encodeURIComponent(ownerId)}`, { method: "DELETE" });
    response.ok ? location.reload() : alert(await errorFrom(response));
  }
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section className="modal compact saved-view-menu" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" onClick={close}>×</button>
        <p className="eyebrow">Saved view</p>
        <h2>{view.name}</h2>
        <p className="muted">Save the current manual project order to this view, or clear this saved slot.</p>
        <button className="primary" onClick={() => void update()}>Update this view</button>
        <button className="ghost danger" onClick={() => void clear()}>Clear this view</button>
      </section>
    </div>
  );
}
function PickThree({ view, projects, ownerId, showPickedProjects, close }: { view: A; projects: P[]; ownerId: string; showPickedProjects: (picks: string[]) => void; close: () => void }) {
  const activeProjects = projects.filter((project) => project.status === "active");
  const existing = Object.keys(view.positions)
    .filter((key) => key.startsWith("__pick__"))
    .map((key) => key.replace("__pick__", ""))
    .filter((id) => activeProjects.some((project) => project.id === id));
  const [picked, setPicked] = useState<string[]>(existing);
  async function save() {
    if (picked.length !== 3) return alert("Please choose exactly three projects.");
    const positions: Record<string, unknown> = {
      ...Object.fromEntries(projects.map((project, index) => [project.id, index])),
      ...Object.fromEntries(picked.map((id) => [`__pick__${id}`, true])),
      __view_kind__: "pick3",
    };
    const response = await fetch("/api/arrangements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: view.id || undefined, ownerId, name: "Pick 3 projects", positions }) });
    response.ok ? showPickedProjects(picked) : alert(await errorFrom(response));
  }
  return <div className="modal-backdrop" onMouseDown={close}><section className="modal compact" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={close}>×</button><p className="eyebrow">Pick 3 projects</p><h2>Show only three active projects</h2><p className="muted">Choose exactly three active projects for this saved view.</p><div className="pick-three-list">{activeProjects.map((project) => <label key={project.id}><input type="checkbox" checked={picked.includes(project.id)} onChange={(event) => setPicked((current) => event.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id))} disabled={!picked.includes(project.id) && picked.length === 3} /> {project.title}</label>)}</div><button className="primary" onClick={() => void save()}>Save Pick 3 view</button></section></div>;
}
function ProjectEdit({
  project,
  groups,
  close,
}: {
  project: P;
  groups: G[];
  close: () => void;
}) {
  const [title, setTitle] = useState(project.title),
    [completion, setCompletion] = useState(project.completion),
    [gross, setGross] = useState(project.projected_gross),
    [net, setNet] = useState(project.projected_net),
    [actualPaid, setActualPaid] = useState(project.actual_paid || 0),
    [paidInFull, setPaidInFull] = useState(project.paid_in_full || false),
    [targetDate, setTargetDate] = useState(project.target_date || ""),
    [stages, setStages] = useState(project.project_stages),
    [chosen, setChosen] = useState(
      project.project_group_memberships.map((x) => x.group_id),
    ),
    [saving, setSaving] = useState(false),
    total = stages.reduce((x, s) => x + s.allocation, 0);
  const derivedTargetDate = stages.map((stage) => stage.target_date).filter((date): date is string => Boolean(date)).sort().at(-1) || "";
  const calculatedCompletion = Math.round(
    stages.reduce((sum, stage) => sum + stage.allocation * stage.progress, 0) /
      100,
  );
  const completionMismatch =
    project.mode === "staged" && completion !== calculatedCompletion;
  async function save() {
    if (project.mode === "staged" && total !== 100)
      return alert("Stage targets must total 100%.");
    let status: "active" | "completed" | undefined;
    if (completion === 100 && project.status !== "completed") {
      if (confirm(`Mark “${title || project.title}” as complete? It will be hidden from the normal board and shown only when Include completed is turned on.`)) status = "completed";
    } else if (completion < 100 && project.status === "completed") {
      status = "active";
    }
    setSaving(true);
    const r = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          completion,
          gross,
          net,
          actualPaid,
          paidInFull,
          status,
          targetDate: project.mode === "simple" ? targetDate || null : null,
          stages:
            project.mode === "staged"
              ? stages.map((s) => ({
                  id: s.id,
                  name: s.name,
                  allocation: s.allocation,
                  progress: s.progress,
                  target_date: s.target_date || null,
                }))
              : null,
        }),
      }),
      g = await fetch(`/api/projects/${project.id}/groups`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: chosen }),
      });
    r.ok && g.ok
      ? location.reload()
      : alert(!r.ok ? await errorFrom(r) : await errorFrom(g));
    setSaving(false);
  }
  async function enable() {
    const r = await fetch(`/api/projects/${project.id}`, { method: "POST" });
    r.ok ? location.reload() : alert(await errorFrom(r));
  }
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close" onClick={close}>
          ×
        </button>
        <p className="eyebrow">
          Project editor · {project.mode === "staged" ? "Staged" : "Simple"}
        </p>
        <label>
          Project title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="project-details-grid">
          <div className="project-financials">
            <label>
              Overall completion
              <input
                type="number"
                min="0"
                max="100"
                value={completion}
                onChange={(e) => setCompletion(Number(e.target.value))}
              />
            </label>
            <label>
              Projected gross
              <input
                type="number"
                min="0"
                value={gross}
                onChange={(e) => setGross(Number(e.target.value))}
              />
            </label>
            <label>
              Projected net
              <input
                type="number"
                min="0"
                value={net}
                onChange={(e) => setNet(Number(e.target.value))}
              />
            </label>
            <label>
              Actual paid so far
              <input
                type="number"
                min="0"
                value={actualPaid}
                onChange={(e) => setActualPaid(Number(e.target.value))}
              />
            </label>
            <label className="check paid-full-control">
              <input
                type="checkbox"
                checked={paidInFull}
                onChange={(e) => setPaidInFull(e.target.checked)}
              />
              Paid in full
            </label>
            {project.mode === "simple" && (
              <label>
                Target date
                <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              </label>
            )}
          </div>
          <div className="project-groups-column">
            <h3>Groups</h3>
            <div className="group-picker">
              {groups.map((g) => (
                <label key={g.id}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(g.id)}
                    onChange={(e) =>
                      setChosen(
                        e.target.checked
                          ? [...chosen, g.id]
                          : chosen.filter((x) => x !== g.id),
                      )
                    }
                  />
                  <span style={{ background: g.color }}>{g.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        {project.mode === "staged" ? (
          <>
            <h3>
              Stages{" "}
              <small
                className={total === 100 ? "stage-total" : "stage-total error"}
              >
                Targets: {total}% / 100%
              </small>
            </h3>
            <p className="derived-date">Project target date: {derivedTargetDate ? displayDate(derivedTargetDate) : "Not set"}</p>
            {stages.map((s) => (
              <div className="stage-edit" key={s.id}>
                <span style={{ background: s.color }} />
                <b>{s.name}</b>
                <label className="stage-name">
                  Stage name
                  <input
                    value={s.name}
                    onChange={(e) =>
                      setStages((x) =>
                        x.map((a) =>
                          a.id === s.id ? { ...a, name: e.target.value } : a,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Target %
                  <input
                    type="number"
                    value={s.allocation}
                    onChange={(e) =>
                      setStages((x) =>
                        x.map((a) =>
                          a.id === s.id
                            ? { ...a, allocation: Number(e.target.value) }
                            : a,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Complete %
                  <input
                    type="number"
                    value={s.progress}
                    onChange={(e) =>
                      setStages((x) =>
                        x.map((a) =>
                          a.id === s.id
                            ? { ...a, progress: Number(e.target.value) }
                            : a,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Target date
                  <input
                    type="date"
                    value={s.target_date || ""}
                    onChange={(e) =>
                      setStages((x) =>
                        x.map((a) => a.id === s.id ? { ...a, target_date: e.target.value || null } : a),
                      )
                    }
                  />
                </label>
              </div>
            ))}
            {completionMismatch && (
              <div className="completion-choice">
                <b>Overall completion is {completion}%.</b>
                <span>
                  The weighted stage calculation is {calculatedCompletion}%.
                </span>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => setCompletion(calculatedCompletion)}
                >
                  Use {calculatedCompletion}% from stages
                </button>
                <span className="muted">Or leave the manual overall percentage as entered.</span>
              </div>
            )}
          </>
        ) : (
          <button className="ghost" onClick={enable}>
            Add stage plan
          </button>
        )}
        <button className="primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save project"}
        </button>
      </section>
    </div>
  );
}
function GroupEdit({ groups, ownerId, close }: { groups: G[]; ownerId: string; close: () => void }) {
  const [name, setName] = useState(""),
    [color, setColor] = useState("#2763d9"),
    [editing, setEditing] = useState<G | null>(null),
    [saving, setSaving] = useState(false);
  async function add() {
    const r = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color, ownerId }),
    });
    r.ok ? location.reload() : alert(await errorFrom(r));
  }
  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    const r = await fetch("/api/groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editing, ownerId }),
    });
    r.ok ? location.reload() : alert(await errorFrom(r));
    setSaving(false);
  }
  async function remove(group: G) {
    if (!confirm(`Delete the group “${group.name}”? It will be removed from its projects.`)) return;
    const r = await fetch(`/api/groups?id=${encodeURIComponent(group.id)}&ownerId=${encodeURIComponent(ownerId)}`, { method: "DELETE" });
    r.ok ? location.reload() : alert(await errorFrom(r));
  }
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section
        className="modal compact"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="close" onClick={close}>
          ×
        </button>
        <p className="eyebrow">Your private groups</p>
        <div className="group-catalog group-editor-list">
          {groups.map((g) => (
            <div className="group-editor-row" key={g.id}>
              <span style={{ background: g.color }}>{g.name}</span>
              <button className="ghost" onClick={() => setEditing({ ...g })}>Edit</button>
              <button className="ghost danger" onClick={() => void remove(g)}>Delete</button>
            </div>
          ))}
        </div>
        {editing && (
          <div className="group-edit-form">
            <h3>Edit group</h3>
            <label>
              Group name
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label>
              Group color
              <div className="color-control">
                <input className="color-input" type="color" value={editing.color} onChange={(e) => { setEditing({ ...editing, color: e.target.value }); e.currentTarget.blur(); }} />
                <span className="color-swatch" style={{ background: editing.color }}>{editing.color}</span>
              </div>
            </label>
            <button className="primary" disabled={saving} onClick={() => void saveEdit()}>Save group</button>
            <button className="ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        )}
        <label>
          New group name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Group color
          <div className="color-control">
            <input className="color-input" type="color" value={color} onChange={(e) => { setColor(e.target.value); e.currentTarget.blur(); }} />
            <span className="color-swatch" style={{ background: color }}>{color}</span>
          </div>
        </label>
        <button className="primary" onClick={add}>
          Create group
        </button>
      </section>
    </div>
  );
}

function AdminReports({
  initialTab,
  role,
  people,
  projects,
  feedback,
  close,
}: {
  initialTab: "reports" | "admin";
  role: "standard" | "admin";
  people: Person[];
  projects: P[];
  feedback: Feedback[];
  close: () => void;
}) {
  const [email, setEmail] = useState(""),
    [inviteRole, setInviteRole] = useState("standard"),
    [viewAs, setViewAs] = useState(""),
    [reportType, setReportType] = useState("all"),
    [includeArchived, setIncludeArchived] = useState(false),
    [reportReady, setReportReady] = useState(false),
    [showCompletedFeedback, setShowCompletedFeedback] = useState(false),
    [showDeletedFeedback, setShowDeletedFeedback] = useState(false);
  const reportProjects = projects.filter(
    (project) =>
      project.status !== "cancelled" &&
      (includeArchived || project.status === "active"),
  );
  const financialProjects = reportProjects.filter(
    (project) => Number(project.projected_gross) > 0 || Number(project.projected_net) > 0 || Number(project.actual_paid) > 0,
  );
  const totalGross = financialProjects.reduce(
    (total, project) => total + Number(project.projected_gross || 0),
    0,
  );
  const totalNet = financialProjects.reduce(
    (total, project) => total + Number(project.projected_net || 0),
    0,
  );
  const totalPaid = financialProjects.reduce(
    (total, project) => total + Number(project.actual_paid || 0),
    0,
  );
  const reportTitle =
    reportType === "all"
      ? "All project information"
      : reportType === "financial"
      ? "Financial summary"
      : reportType === "dates"
        ? "Project notes timeline"
        : "Travel notes";
  const notesFor = (travelOnly = false) =>
    reportProjects.flatMap((p) =>
      p.project_notes
        .filter((n) => !travelOnly || /travel/i.test(n.body))
        .map((n) => ({ project: p.title, body: n.body })),
    );
  async function invite() {
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: inviteRole }),
    });
    r.ok
      ? (setEmail(""), alert("Invitation added."))
      : alert(await errorFrom(r));
  }
  async function updateFeedback(id: string, status: Feedback["status"]) {
    const response = await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    response.ok ? location.reload() : alert(await errorFrom(response));
  }
  function download() {
    const rows = [
      ["Project", "Completion", "Projected Gross", "Projected Net", "Actual Paid", "Paid in Full"],
      ...financialProjects.map((p) => [
        p.title,
        `${p.completion}%`,
        String(p.projected_gross),
        String(p.projected_net),
        String(p.actual_paid),
        p.paid_in_full ? "Yes" : "No",
      ]),
      ["Totals", "", String(totalGross), String(totalNet), String(totalPaid), ""],
    ];
    const blob = new Blob(
      [
        rows
          .map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(","))
          .join("\n"),
      ],
      { type: "text/csv" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mustang-project-report.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function printReport() {
    const report = document.getElementById("report-preview");
    if (!report) return;
    const printWindow = window.open("", "mustang-project-report", "width=900,height=700");
    if (!printWindow) return alert("Please allow pop-ups to print this report.");
    printWindow.document.write(`<!doctype html><html><head><title>${reportTitle}</title><style>body{font-family:Arial;padding:32px;color:#172033}table{border-collapse:collapse;width:100%}th,td{padding:9px;border-bottom:1px solid #ccd}th{text-align:left}h1{margin-bottom:4px}.muted{color:#667}</style></head><body>${report.outerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section
        className="modal admin-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="close" onClick={close}>
          ×
        </button>
        <p className="eyebrow">{initialTab === "admin" ? "Administration" : "Reports"}</p>
        {initialTab === "reports" ? (
          <>
            <h2>Build a report</h2>
            <label>
              Report type
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                <option value="all">All project information</option>
                <option value="financial">Financial summary</option>
                <option value="dates">Dates timeline</option>
                <option value="travel">Travel notes</option>
              </select>
            </label>
            <label className="check report-check">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
              Include completed / archived
            </label>
            <button className="primary" onClick={() => setReportReady(true)}>
              Build report
            </button>
            <button className="ghost" onClick={download}>
              Download CSV
            </button>
            <button className="ghost" disabled={!reportReady} onClick={printReport}>
              Print report
            </button>
            {reportReady && (
              <section className="report-preview" id="report-preview">
                <p className="eyebrow">Mustang Projects Review</p>
                <h2>{reportTitle}</h2>
                <p className="muted">{reportProjects.length} projects · generated {new Date().toLocaleDateString()}</p>
                {(reportType === "all" || reportType === "financial") && <>
                  {reportType === "all" && <h3>Financial summary</h3>}
                  <table><thead><tr><th>Project</th><th>Complete</th><th>Gross</th><th>Net</th><th>Paid</th><th>Paid in full</th></tr></thead><tbody>{financialProjects.map((p) => <tr key={p.id}><td>{p.title}</td><td>{p.completion}%</td><td>{cash(Number(p.projected_gross))}</td><td>{cash(Number(p.projected_net))}</td><td>{cash(Number(p.actual_paid))}</td><td>{p.paid_in_full ? "Yes" : "No"}</td></tr>)}</tbody><tfoot><tr><th>Totals</th><th></th><th>{cash(totalGross)}</th><th>{cash(totalNet)}</th><th>{cash(totalPaid)}</th><th></th></tr></tfoot></table>
                </>}
                {(reportType === "all" || reportType === "dates") && <section className="report-notes"><h3>{reportType === "all" ? "Notes timeline" : "Project notes"}</h3><ul>{notesFor().map((n, i) => <li key={`${n.project}-${i}`}><b>{n.project}:</b> {n.body}</li>)}</ul></section>}
                {(reportType === "all" || reportType === "travel") && <section className="report-notes"><h3>Travel notes</h3><ul>{notesFor(true).map((n, i) => <li key={`${n.project}-${i}`}><b>{n.project}:</b> {n.body}</li>)}</ul></section>}
              </section>
            )}
          </>
        ) : (
          <>
            <h2>Invite or view as</h2>
            <label>
              Invite Google email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="person@gmail.com"
              />
            </label>
            <label>
              Role
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="standard">Standard</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <button className="primary" onClick={invite}>
              Add invitation
            </button>
            <h3>View as user</h3>
            <select value={viewAs} onChange={(e) => setViewAs(e.target.value)}>
              <option value="">Choose a user</option>
              {people.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.display_name ? `${p.display_name} — ${p.email}` : p.email}
                </option>
              ))}
            </select>
            <button
              className="ghost"
              disabled={!viewAs}
              onClick={() => (location.href = `/dashboard?viewAs=${encodeURIComponent(viewAs)}`)}
            >
              View as selected user
            </button>
            <section className="feedback-admin">
              <h3>Feedback queue</h3>
              <label className="check"><input type="checkbox" checked={showCompletedFeedback} onChange={(event) => setShowCompletedFeedback(event.target.checked)} /> Show completed</label>
              <label className="check"><input type="checkbox" checked={showDeletedFeedback} onChange={(event) => setShowDeletedFeedback(event.target.checked)} /> Show deleted</label>
              {feedback
                .filter((item) => item.status === "open" || (item.status === "completed" && showCompletedFeedback) || (item.status === "deleted" && showDeletedFeedback))
                .map((item) => (
                  <article className="feedback-item" key={item.id}>
                    <b>{item.subject || "Feedback"}</b>
                    <p>{item.message}</p>
                    <small>{item.sender?.display_name || item.sender?.email || "User record unavailable"} · {new Date(item.created_at).toLocaleString()} · {item.status}</small>
                    {item.status !== "completed" && <button className="ghost" onClick={() => void updateFeedback(item.id, "completed")}>Complete</button>}
                    {item.status !== "deleted" && <button className="ghost danger" onClick={() => void updateFeedback(item.id, "deleted")}>Delete</button>}
                    {item.status !== "open" && <button className="ghost" onClick={() => void updateFeedback(item.id, "open")}>Reopen</button>}
                  </article>
                ))}
              {!feedback.some((item) => item.status === "open" || (item.status === "completed" && showCompletedFeedback) || (item.status === "deleted" && showDeletedFeedback)) && <p className="muted">No feedback matches these filters.</p>}
            </section>
          </>
        )}
      </section>
    </div>
  );
}
