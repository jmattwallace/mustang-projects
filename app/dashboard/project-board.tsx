"use client";
import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

type S = {
  id: string;
  name: string;
  allocation: number;
  progress: number;
  color: string;
};
type G = { id: string; name: string; color: string };
type N = { id: string; stage_id: string | null; body: string };
type A = { id: string; name: string; positions: Record<string, number> };
type Person = { id: string; email: string; display_name: string | null };
type Feedback = {
  id: string;
  subject: string;
  message: string;
  status: "open" | "completed" | "deleted";
  created_at: string;
  profiles: { email: string; display_name: string | null }[];
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
  project_stages: S[];
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

export function Dashboard({
  initialProjects,
  groups,
  arrangements,
  name,
  email,
  role,
  people,
  feedback,
}: {
  initialProjects: P[];
  groups: G[];
  arrangements: A[];
  name: string;
  email: string;
  role: "standard" | "admin";
  people: Person[];
  feedback: Feedback[];
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
    [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set()),
    [sort, setSort] = useState("manual"),
    [adminOpen, setAdminOpen] = useState(false),
    [adminTab, setAdminTab] = useState<"reports" | "admin">("reports"),
    [accountOpen, setAccountOpen] = useState(false),
    [feedbackOpen, setFeedbackOpen] = useState(false);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null),
    suppressClick = useRef(false);
  const visible = useMemo(
    () =>
      projects
        .filter(
          (p) =>
            (inactive || p.status === "active") &&
            `${p.title} ${p.project_group_memberships.map((x) => x.project_groups?.name).join(" ")} ${p.project_notes.map((x) => x.body).join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "completion"
            ? b.completion - a.completion
            : sort === "gross"
              ? Number(b.projected_gross) - Number(a.projected_gross)
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
    [projects, query, inactive, sort],
  );
  async function newProject() {
    setBusy(true);
    const r = await fetch("/api/projects", { method: "POST" }),
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
    setSort("customized");
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
    const existing = arrangements[slot];
    const name =
      existing?.name ||
      prompt("Name this custom arrangement:", `Custom view ${slot + 1}`);
    if (!name) return;
    const r = await fetch("/api/arrangements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: existing?.id,
        name,
        positions: Object.fromEntries(projects.map((p, i) => [p.id, i])),
      }),
    });
    if (!r.ok) alert(await errorFrom(r));
    else location.reload();
  }
  function loadArrangement(a: A) {
    setSort("manual");
    setProjects(
      [...projects].sort(
        (x, y) => (a.positions[x.id] ?? 999999) - (a.positions[y.id] ?? 999999),
      ),
    );
  }
  return (
    <main>
      <header>
        <div className="title-row">
          <div>
            <p className="eyebrow">Mustang Projects Review</p>
            <h1>{name.split(" ")[0]}'s projects</h1>
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
            Include completed / archived
          </label>
          <label className="sort-control">
            Sort by{" "}
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="manual">Manual order</option>
              <option value="customized">Customized</option>
              <option value="completion">Completion %</option>
              <option value="gross">Projected gross</option>
              <option value="net">Projected net</option>
              <option value="groups">Groups</option>
            </select>
          </label>
          <div className="saved-views">
            {[0, 1, 2].map((i) =>
              arrangements[i] ? (
                <button
                  key={i}
                  className="view-button"
                  onClick={() => loadArrangement(arrangements[i])}
                >
                  {arrangements[i].name}
                </button>
              ) : (
                <button
                  key={i}
                  className="view-button"
                  onClick={() => saveArrangement(i)}
                >
                  + Save view {i + 1}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="actions second-row">
          <button className="ghost" onClick={() => setAccountOpen(true)}>
            Account
          </button>
          <button className="ghost" onClick={() => setManage(true)}>
            Manage groups
          </button>
          <button className="ghost" onClick={() => setFeedbackOpen(true)}>
            Feedback
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
          <button
            className="ghost"
            onClick={() => (location.href = "/auth/signout")}
          >
            Sign out
          </button>
          <button className="primary" disabled={busy} onClick={newProject}>
            {busy ? "Creating…" : "+ New project"}
          </button>
        </div>
      </header>
      <section className="board">
        {visible.map((p) => {
          const group = p.project_group_memberships.find(
              (x) => x.project_groups,
            )?.project_groups,
            color = group?.color || "#1746a4",
            overall = p.project_notes.find((x) => !x.stage_id)?.body;
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
                draggable
                onDragStart={(e) => {
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
                  if (p.mode !== "staged") return;
                  e.preventDefault();
                  e.stopPropagation();
                  setCollapsedStages((current) => {
                    const next = new Set(current);
                    next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                    return next;
                  });
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
                  if (!drag) setSelected(p);
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
                    } as CSSProperties
                  }
                >
                  <div className="project-summary">
                    <h2>
                      {p.title}
                      {p.client_name && <em> · {p.client_name}</em>}
                    </h2>
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
                  </div>
                  {p.mode === "staged" && collapsedStages.has(p.id) && (
                    <button
                      className="open-stages"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCollapsedStages((current) => {
                          const next = new Set(current);
                          next.delete(p.id);
                          return next;
                        });
                      }}
                    >
                      Open stages
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
      {manage && <GroupEdit groups={groups} close={() => setManage(false)} />}
      {feedbackOpen && <FeedbackForm close={() => setFeedbackOpen(false)} />}
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
      alert("Thank you — your feedback has been sent.");
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
    [stages, setStages] = useState(project.project_stages),
    [chosen, setChosen] = useState(
      project.project_group_memberships.map((x) => x.group_id),
    ),
    [saving, setSaving] = useState(false),
    total = stages.reduce((x, s) => x + s.allocation, 0);
  const calculatedCompletion = Math.round(
    stages.reduce((sum, stage) => sum + stage.allocation * stage.progress, 0) /
      100,
  );
  const completionMismatch =
    project.mode === "staged" && completion !== calculatedCompletion;
  async function save() {
    if (project.mode === "staged" && total !== 100)
      return alert("Stage targets must total 100%.");
    setSaving(true);
    const r = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          completion,
          gross,
          net,
          stages:
            project.mode === "staged"
              ? stages.map((s) => ({
                  id: s.id,
                  name: s.name,
                  allocation: s.allocation,
                  progress: s.progress,
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
        <div className="finance-fields">
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
        </div>
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
function GroupEdit({ groups, close }: { groups: G[]; close: () => void }) {
  const [name, setName] = useState(""),
    [color, setColor] = useState("#2763d9"),
    [editing, setEditing] = useState<G | null>(null),
    [saving, setSaving] = useState(false);
  async function add() {
    const r = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    r.ok ? location.reload() : alert(await errorFrom(r));
  }
  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    const r = await fetch("/api/groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    r.ok ? location.reload() : alert(await errorFrom(r));
    setSaving(false);
  }
  async function remove(group: G) {
    if (!confirm(`Delete the group “${group.name}”? It will be removed from its projects.`)) return;
    const r = await fetch(`/api/groups?id=${encodeURIComponent(group.id)}`, { method: "DELETE" });
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
    [reportType, setReportType] = useState("financial"),
    [includeArchived, setIncludeArchived] = useState(false),
    [reportReady, setReportReady] = useState(false),
    [showCompletedFeedback, setShowCompletedFeedback] = useState(false),
    [showDeletedFeedback, setShowDeletedFeedback] = useState(false);
  const reportProjects = projects.filter(
    (project) =>
      project.status !== "cancelled" &&
      (includeArchived || project.status === "active"),
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
      ["Project", "Completion", "Projected Gross", "Projected Net"],
      ...reportProjects.map((p) => [
        p.title,
        `${p.completion}%`,
        String(p.projected_gross),
        String(p.projected_net),
      ]),
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
            <label>
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />{" "}
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
                  <table><thead><tr><th>Project</th><th>Complete</th><th>Gross</th><th>Net</th></tr></thead><tbody>{reportProjects.map((p) => <tr key={p.id}><td>{p.title}</td><td>{p.completion}%</td><td>{cash(Number(p.projected_gross))}</td><td>{cash(Number(p.projected_net))}</td></tr>)}</tbody></table>
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
              onClick={() =>
                alert(
                  "View-as will be activated in the next secure server pass; the selected identity will be applied without changing your admin session.",
                )
              }
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
                    <small>{item.profiles[0]?.display_name || item.profiles[0]?.email || "Unknown user"} · {new Date(item.created_at).toLocaleString()} · {item.status}</small>
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
