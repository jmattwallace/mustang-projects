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
  return `rgb(${Math.max(0, (n >> 16) - 55)},${Math.max(0, ((n >> 8) & 255) - 55)},${Math.max(0, (n & 255) - 55)})`;
};

export function Dashboard({
  initialProjects,
  groups,
  arrangements,
  name,
  email,
  role,
  people,
}: {
  initialProjects: P[];
  groups: G[];
  arrangements: A[];
  name: string;
  email: string;
  role: "standard" | "admin";
  people: Person[];
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
    [sort, setSort] = useState("manual"),
    [adminOpen, setAdminOpen] = useState(false),
    [adminTab, setAdminTab] = useState<"reports" | "admin">("reports"),
    [accountOpen, setAccountOpen] = useState(false);
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
      b = await r.json();
    b.ok ? location.reload() : alert(b.error);
    setBusy(false);
  }
  async function reorder(target: string | null) {
    const draggedId = dragRef.current || drag;
    if (!draggedId) return;
    const a = projects.findIndex((x) => x.id === draggedId),
      b =
        target === null
          ? projects.length
          : projects.findIndex((x) => x.id === target),
      next = [...projects],
      [m] = next.splice(a, 1);
    next.splice(a < b ? b - 1 : b, 0, m);
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
      alert((await r.json()).error);
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
    if (!r.ok) alert((await r.json()).error);
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
            <div key={p.id} className="drop-wrap">
              {drop === p.id && drag !== p.id && (
                <div className="drop-indicator">Drop here</div>
              )}
              <article
                className={`project ${drag === p.id ? "dragging" : ""}`}
                draggable
                onDragStart={(e) => {
                  setDrag(p.id);
                  dragRef.current = p.id;
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrop(p.id);
                }}
                onDrop={() => reorder(p.id)}
                onDragEnd={() => {
                  setDrag(null);
                  setDrop(null);
                }}
                onClick={() => !drag && setSelected(p)}
              >
                {p.mode === "staged" ? (
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
                    <span className="finance-pill">
                      {cash(Number(p.projected_gross))} Gross
                    </span>
                    <span className="finance-pill">
                      {cash(Number(p.projected_net))} Net
                    </span>
                  </div>
                  <strong>{p.completion}%</strong>
                </div>
              </article>
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
            onDrop={() => reorder(null)}
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
    else alert((await response.json()).error || "Could not save your name.");
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
    r.ok ? location.reload() : alert((await r.json()).error);
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
      : alert(!r.ok ? (await r.json()).error : (await g.json()).error);
    setSaving(false);
  }
  async function enable() {
    const r = await fetch(`/api/projects/${project.id}`, { method: "POST" });
    r.ok ? location.reload() : alert((await r.json()).error);
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
    [color, setColor] = useState("#2763d9");
  async function add() {
    const r = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    r.ok ? location.reload() : alert((await r.json()).error);
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
        <div className="group-catalog">
          {groups.map((g) => (
            <span key={g.id} style={{ background: g.color }}>
              {g.name}
            </span>
          ))}
        </div>
        <label>
          New group name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Group color
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
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
  close,
}: {
  initialTab: "reports" | "admin";
  role: "standard" | "admin";
  people: Person[];
  projects: P[];
  close: () => void;
}) {
  const [tab, setTab] = useState<"reports" | "admin">(initialTab),
    [email, setEmail] = useState(""),
    [inviteRole, setInviteRole] = useState("standard"),
    [viewAs, setViewAs] = useState(""),
    [reportType, setReportType] = useState("financial"),
    [includeArchived, setIncludeArchived] = useState(false);
  async function invite() {
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: inviteRole }),
    });
    r.ok
      ? (setEmail(""), alert("Invitation added."))
      : alert((await r.json()).error);
  }
  function download() {
    const rows = [
      ["Project", "Completion", "Projected Gross", "Projected Net"],
      ...projects.map((p) => [
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
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section
        className="modal admin-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="close" onClick={close}>
          ×
        </button>
        <p className="eyebrow">
          {role === "admin" ? "Administration & reporting" : "Reporting"}
        </p>
        <div className="tabs">
          <button onClick={() => setTab("reports")}>Reports</button>
          {role === "admin" && (
            <button onClick={() => setTab("admin")}>Admin</button>
          )}
        </div>
        {tab === "reports" ? (
          <>
            <h2>Build a report</h2>
            <label>
              Report type
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
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
            {role === "admin" && (
              <label>
                Scope
                <select>
                  <option>My projects</option>
                  <option>All users</option>
                  <option>Specific user</option>
                </select>
              </label>
            )}
            <p className="hint">
              Parameters are selected before the report is created. Current data
              export includes project financials; date and travel sections will
              populate as those notes are entered.
            </p>
            <button className="primary" onClick={download}>
              Download CSV
            </button>
            <button className="ghost" onClick={() => print()}>
              Print report
            </button>
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
          </>
        )}
      </section>
    </div>
  );
}
