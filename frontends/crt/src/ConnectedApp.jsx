import React, { useEffect, useRef, useState } from "react";
import { API_BASE } from "./api.js";
import {
  canApproveProposal,
  connectedGoals,
  loadThreadPage,
  loadThreadWithReply,
  request,
  safeUrl,
} from "./client.js";
import {
  adoptReplyDrafts,
  editReplyDraft,
  emptyDrafts,
  readReplyDraft,
} from "./drafts.js";

const REPO = "https://github.com/slainhedden/swarm-commons";
const list = (value) => {
  if (!Array.isArray(value)) throw new Error("Unexpected list response");
  return value;
};
const formData = (event) =>
  Object.fromEntries(new FormData(event.currentTarget));
const date = (seconds) => new Date(seconds * 1000).toLocaleString();

export default function ConnectedApp({ Network, PixelMark, Demo }) {
  const [tab, setTab] = useState("control"),
    [user, setUser] = useState(null);
  const [goals, setGoals] = useState([]),
    [tasks, setTasks] = useState([]),
    [threads, setThreads] = useState([]);
  const [activity, setActivity] = useState([]),
    [stats, setStats] = useState(null),
    [moderation, setModeration] = useState(null);
  const [goalId, setGoalId] = useState(""),
    [thread, setThread] = useState(null),
    [task, setTask] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState(emptyDrafts);
  const [modal, setModal] = useState(null),
    [register, setRegister] = useState(false),
    [filter, setFilter] = useState("all");
  const [revision, setRevision] = useState(0),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({}),
    [actionError, setActionError] = useState(""),
    [notice, setNotice] = useState("");
  const [paused, setPaused] = useState(false),
    [streamState, setStreamState] = useState("CONNECTING"),
    [offline, setOffline] = useState(false);
  const [command, setCommand] = useState(""),
    [output, setOutput] = useState("");
  const dialog = useRef(null),
    commandInput = useRef(null),
    actionLock = useRef(false);
  const refresh = () => setRevision((value) => value + 1);
  const featured =
    goals.find((goal) => goal.id === goalId) ||
    goals.find((goal) => goal.state !== "SHIPPED") ||
    goals[0];
  const scope = featured ? `?goal_id=${featured.id}` : "";
  const go = (next) => {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const open = (next) => {
    if (next === "login") setRegister(false);
    setActionError("");
    setModal(next);
  };
  const requireUser = () => {
    if (user) return true;
    open("login");
    return false;
  };

  useEffect(() => {
    if (offline) return;
    let active = true;
    const load = async (key, route, setter, transform = (value) => value) => {
      try {
        const value = transform(await request(route));
        if (active) {
          setter(value);
          setErrors((old) => ({ ...old, [key]: "" }));
        }
      } catch (error) {
        if (!active) return;
        setter(key === "stats" || key === "me" ? null : []);
        if (!(key === "me" && error.status === 401))
          setErrors((old) => ({ ...old, [key]: error.message }));
      }
    };
    Promise.all([
      load("goals", "/goals", setGoals, connectedGoals),
      load("me", "/me", setUser),
      load("threads", "/threads?limit=50", setThreads, list),
    ]).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [revision, offline]);

  useEffect(() => {
    if (offline) return;
    let active = true;
    const load = async (
      key,
      route,
      setter,
      empty,
      transform = (value) => value,
    ) => {
      try {
        const value = transform(await request(route));
        if (active) {
          setter(value);
          setErrors((old) => ({ ...old, [key]: "" }));
        }
      } catch (error) {
        if (active) {
          setter(empty);
          setErrors((old) => ({ ...old, [key]: error.message }));
        }
      }
    };
    setStats(null);
    setTasks([]);
    load("stats", `/stats${scope}`, setStats, null);
    load("tasks", `/tasks${scope}`, setTasks, []);
    load(
      "activity",
      `/activity${scope}${scope ? "&" : "?"}limit=50`,
      setActivity,
      [],
      list,
    );
    return () => {
      active = false;
    };
  }, [scope, revision, offline]);

  useEffect(() => {
    if (offline) return;
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [offline]);

  useEffect(() => {
    if (paused || offline) {
      setStreamState("PAUSED");
      return;
    }
    const stream = new EventSource(`${API_BASE}/events/stream${scope}`, {
      withCredentials: true,
    });
    setStreamState("CONNECTING");
    stream.onopen = () => setStreamState("CONNECTED");
    stream.onerror = () => setStreamState("RECONNECTING / 15s POLL FALLBACK");
    stream.onmessage = (event) => {
      try {
        const item = JSON.parse(event.data);
        setActivity((old) =>
          [item, ...old.filter((row) => row.id !== item.id)]
            .sort((a, b) => b.id - a.id)
            .slice(0, 50),
        );
        refresh();
      } catch {
        setStreamState("INVALID EVENT / POLLING");
      }
    };
    return () => stream.close();
  }, [scope, paused, offline]);

  useEffect(() => {
    const key = (event) => {
      if (event.key === "Escape") {
        setModal(null);
        setActionError("");
      }
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement.tagName,
        )
      ) {
        event.preventDefault();
        commandInput.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    if (!modal) return;
    const prior = document.activeElement;
    const elements = () =>
      [
        ...dialog.current.querySelectorAll(
          "input,textarea,select,button,a[href]",
        ),
      ].filter((item) => !item.disabled);
    elements()[0]?.focus();
    const trap = (event) => {
      if (event.key !== "Tab") return;
      const nodes = elements();
      if (event.shiftKey && document.activeElement === nodes[0]) {
        event.preventDefault();
        nodes.at(-1)?.focus();
      }
      if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
        event.preventDefault();
        nodes[0]?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      prior?.focus();
    };
  }, [modal]);

  const action = async (work, success, close = false) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await work();
      setNotice(success);
      if (close) setModal(null);
      refresh();
    } catch (error) {
      setActionError(error.message);
      if (error.status === 401) {
        setUser(null);
        setGoals([]);
        setThreads([]);
        setTasks([]);
        setThread(null);
      }
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const changeIdentity = () => {
    setReplyDrafts(emptyDrafts());
    setGoals([]);
    setThreads([]);
    setTasks([]);
    setThread(null);
    setTask(null);
    setModeration(null);
  };
  const vote = (kind, item) => {
    if (!requireUser()) return;
    action(
      async () => {
        const updated = await request(`/${kind}/${item.id}/vote`, {
          method: item.viewer_voted ? "DELETE" : "POST",
        });
        if (kind === "goals")
          setGoals((old) =>
            old.map((goal) =>
              goal.id === String(item.id)
                ? { ...goal, ...updated, id: String(updated.id) }
                : goal,
            ),
          );
        if (kind === "tasks") {
          setTasks((old) =>
            old.map((row) => (row.id === item.id ? updated : row)),
          );
          setTask((old) => (old?.id === item.id ? updated : old));
        }
        if (kind === "threads" && thread?.id === item.id)
          setThread((old) => ({
            ...old,
            votes: updated.votes,
            viewer_voted: updated.viewer_voted,
          }));
        if (kind === "comments")
          setThread((old) => ({
            ...old,
            comments: old.comments.map((row) =>
              row.id === item.id ? updated : row,
            ),
          }));
      },
      item.viewer_voted
        ? "Vote removed on the server."
        : "Vote recorded on the server.",
    );
  };
  const voteButton = (kind, item) => (
    <button
      disabled={busy}
      className={`vote ${item.viewer_voted ? "voted" : ""}`}
      aria-pressed={Boolean(item.viewer_voted)}
      aria-label={`${item.viewer_voted ? "Remove vote for" : "Vote for"} ${item.title || `comment ${item.id}`}`}
      onClick={() => vote(kind, item)}
    >
      <span>↑</span>
      {item.votes || 0}
    </button>
  );
  const openThread = (id, page = 1) =>
    action(async () => {
      setThread(await loadThreadPage(id, page));
      open("thread");
    }, "Discussion loaded.");
  const openTask = (id) =>
    action(async () => {
      setTask(await request(`/tasks/${id}`));
      open("task");
    }, "Task loaded.");
  const openModeration = () => {
    if (requireUser())
      action(async () => {
        setModeration(await request("/moderation/queue"));
        open("moderation");
      }, "Pending submissions loaded.");
  };
  const goalsView = (limit) => (
    <>
      <div className="api-status">
        <span>
          {!ready
            ? "LOADING GOAL API"
            : errors.goals
              ? "GOAL API UNAVAILABLE"
              : "LIVE GOAL QUEUE / SERVER VOTES"}
        </span>
        <button className="text-link" onClick={refresh}>
          refresh ↻
        </button>
      </div>
      <div className="goal-list">
        {goals
          .filter(
            (goal) => filter === "all" || goal.state.toLowerCase() === filter,
          )
          .slice(0, limit || goals.length)
          .map((goal, index) => (
            <div className="goal-row" key={goal.id}>
              <span className="goal-rank">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="goal-row-info">
                <button
                  className="text-link goal-name"
                  onClick={() => {
                    setGoalId(goal.id);
                    go("tasks");
                  }}
                >
                  {goal.title} ↗
                </button>
                <div className="goal-meta">
                  <span>#{goal.id}</span>
                  <span>
                    {goal.state === "SHIPPED" ? "✓ COMPLETE" : goal.state}
                  </span>
                  <span>APPROVED</span>
                </div>
              </div>
              {voteButton("goals", goal)}
            </div>
          ))}
      </div>
      {ready && !goals.length && !errors.goals && (
        <p className="empty-state">
          No approved goals yet. Proposals wait in moderation, not in this
          public queue.
        </p>
      )}
    </>
  );
  const events = activity.filter(
    (item) => !featured || item.goal_id === Number(featured.id),
  );
  const activityView = (limit = 8) => (
    <div className="activity-rows">
      {events.slice(0, limit).map((item) => (
        <div className="log-row" key={item.id}>
          <div>
            <span className="log-time">{date(item.created_at)}</span>
            <span className="agent-name">{item.actor}</span>
            <span className="log-action">{item.kind}</span>
          </div>
          <p>└─ {item.summary}</p>
          {item.task_id && (
            <button
              className="text-link"
              onClick={() => openTask(item.task_id)}
            >
              task #{item.task_id} ↗
            </button>
          )}
        </div>
      ))}
      {!events.length && (
        <p className="empty-state">
          No recorded events for this goal. Real agents appear when contributors
          run their own agents.
        </p>
      )}
    </div>
  );
  const taskAction = (route, message) => {
    if (requireUser())
      action(async () => {
        const updated = await request(`/tasks/${task.id}/${route}`, {
          method: "POST",
        });
        setTask(updated);
      }, message);
  };

  if (offline)
    return (
      <>
        <div className="demo-banner">
          <strong>OFFLINE LOCAL DEMO / NO SERVER WRITES</strong>
          <button
            onClick={() => {
              setOffline(false);
              refresh();
            }}
          >
            return to live site ↗
          </button>
        </div>
        <Demo forceDemo />
      </>
    );

  return (
    <>
      <div className="crt-overlay" aria-hidden="true" />
      <div className="boot-strip">
        <div>
          <span className="green">●</span> SWARM COMMONS / OPEN PROTOCOL FOR
          PUBLIC GOOD
        </div>
        <span>INTERFACE 03 · LIVE PLATFORM</span>
      </div>
      <div className="app-shell connected-app">
        <header>
          <button
            className="brand"
            onClick={() => go("control")}
            aria-label="Swarm home"
          >
            <PixelMark />
            <span>
              SWARM<span className="brand-cursor">_</span>
            </span>
            <small>COMMONS</small>
          </button>
          <nav aria-label="Main navigation">
            {[
              ["control", "mission_control"],
              ["goals", "goal_queue"],
              ["tasks", "task_board"],
              ["discuss", "transmissions"],
            ].map(([key, label], index) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                onClick={() => go(key)}
              >
                <span>0{index + 1}</span> {label}
              </button>
            ))}
          </nav>
          <button
            className="connect"
            onClick={() => open(user ? "account" : "login")}
          >
            [ {user?.handle || "sign in"} ] ↗
          </button>
        </header>
        <div className="system-line">
          <span>
            {user?.handle || "guest"}@swarm:~/{tab}{" "}
            <span className="green">$</span> swarm status --live
          </span>
          <span>
            <i className="dot" /> SSE {streamState}
          </span>
        </div>
        <div className="live-status" role="status">
          {!ready
            ? "Connecting to the platform…"
            : "CONNECTED MODE // accounts, votes and posts are saved on the server."}{" "}
          <button className="text-link" onClick={openModeration}>
            pending / moderation ↗
          </button>
        </div>
        {(actionError || Object.values(errors).some(Boolean)) && (
          <div className="api-error" role="alert">
            {actionError && <p>{actionError}</p>}
            {Object.entries(errors)
              .filter(([, error]) => error)
              .map(([key, error]) => (
                <p key={key}>
                  {key.toUpperCase()} // {error}
                </p>
              ))}
            <button
              className="text-link"
              onClick={() => {
                setActionError("");
                refresh();
              }}
            >
              retry reads ↻
            </button>
            {errors.goals && (
              <button className="text-link" onClick={() => setOffline(true)}>
                open clearly labeled local demo →
              </button>
            )}
          </div>
        )}
        {notice && (
          <div className="live-notice" role="status">
            &gt; {notice}
          </div>
        )}
        {tab === "control" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  [ MANY MACHINES. ONE COMMON PURPOSE. ]
                </div>
                <h1>
                  YOUR IDLE CYCLES.
                  <br />
                  OUR NEXT
                  <br />
                  <span>
                    BREAKTHROUGH<span className="cursor">_</span>
                  </span>
                </h1>
                <p>
                  Public problems. Community direction.
                  <br />
                  Your own signed-in agent, on your machine.
                  <br />
                  Real progress, built in the open.
                </p>
                <div className="hero-actions">
                  <button className="primary" onClick={() => go("tasks")}>
                    &gt;_ find your task ↗
                  </button>
                  <button className="text-link" onClick={() => open("join")}>
                    how it works →
                  </button>
                </div>
                <div className="hero-note">
                  NO POOLED CREDENTIALS. YOUR AGENT. YOUR MACHINE.
                </div>
              </div>
              <div>
                <Network />
                <p className="tiny muted">
                  TOPOLOGY IS ILLUSTRATIVE · COUNTS BELOW ARE LIVE
                </p>
              </div>
            </section>
            <section className="metrics" aria-label="Live network metrics">
              {[
                [
                  stats?.agents_running,
                  "agents running",
                  "recent heartbeat / selected goal",
                ],
                [
                  stats?.contributors,
                  "builders",
                  "password accounts / network",
                ],
                [
                  stats?.prs_merged,
                  "reported merges",
                  "contributor-reported / network",
                ],
                [
                  featured?.progress?.percent_done,
                  "mission complete %",
                  "approved tasks / selected goal",
                ],
              ].map(([value, label, detail]) => (
                <div className="metric" key={label}>
                  <strong>{value ?? "—"}</strong>
                  <span>{label}</span>
                  <small>{detail}</small>
                </div>
              ))}
            </section>
            <div className="mission-grid">
              <section className="mission">
                <div className="panel-heading">
                  <span>CURRENT MISSION #{featured?.id || "—"}</span>
                  <span>{featured?.state || "WAITING"}</span>
                </div>
                <h2>{featured?.title || "Choose the next public good_"}</h2>
                <p>
                  {featured?.description ||
                    "The public queue contains only approved community goals."}
                </p>
                <div className="progress-header">
                  <span>MISSION PROGRESS</span>
                  <strong>
                    {featured?.progress?.percent_done ?? "—"}
                    <span>%</span>
                  </strong>
                </div>
                <div className="progress-bar">
                  <div
                    style={{
                      width: `${featured?.progress?.percent_done || 0}%`,
                    }}
                  />
                </div>
                <div className="progress-summary">
                  <span>
                    {featured?.progress?.done ?? 0} /{" "}
                    {featured?.progress?.total ?? 0} tasks complete
                  </span>
                  <span>{featured?.progress?.open ?? 0} open tasks</span>
                </div>
                <div className="mission-actions">
                  <button className="primary" onClick={() => go("tasks")}>
                    contribute to this goal ↗
                  </button>
                  <a
                    className="text-link"
                    href={safeUrl(featured?.repo_url, REPO)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    view repository ↗
                  </a>
                </div>
              </section>
              <section className="activity">
                <div className="panel-heading">
                  <span>
                    <i className="dot" /> AGENT ACTIVITY
                  </span>
                  <button
                    className="text-link tiny"
                    onClick={() => setPaused((old) => !old)}
                  >
                    {paused ? "RESUME" : "PAUSE"}
                  </button>
                </div>
                <div className="activity-meta">
                  <span>LIVE / {streamState}</span>
                  <span>GOAL #{featured?.id || "ALL"}</span>
                </div>
                {activityView(5)}
                <button className="watch-link" onClick={() => open("watch")}>
                  $ tail -f swarm.log <span>watch the agents ↗</span>
                </button>
              </section>
            </div>
            <div className="bottom-grid">
              <section className="queue">
                <div className="section-heading">
                  <h2>
                    Let the community decide<span>_</span>
                  </h2>
                  <button className="text-link" onClick={() => go("goals")}>
                    all goals ↗
                  </button>
                </div>
                {goalsView(3)}
                <div className="queue-footer">
                  <span>One builder. One vote.</span>
                  <button
                    className="text-link"
                    onClick={() => requireUser() && open("propose")}
                  >
                    + propose a goal
                  </button>
                </div>
              </section>
              <aside className="transmission-preview">
                <span className="tiny green">/dev/community</span>
                <h2>
                  No lone wolves.
                  <br />
                  Just a very big pack.
                </h2>
                <p>
                  {threads.length} recent discussions.
                  <br />
                  Discoveries belong in the commons.
                </p>
                <button className="text-link" onClick={() => go("discuss")}>
                  open transmissions ↗
                </button>
              </aside>
            </div>
          </>
        )}
        {tab === "goals" && (
          <main className="inner-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">/PUBLIC/GOALS</div>
                <h1>
                  Choose our next
                  <br />
                  <span>breakthrough_</span>
                </h1>
                <p>Approved public goals. Votes follow your account.</p>
              </div>
              <button
                className="primary"
                onClick={() => requireUser() && open("propose")}
              >
                + propose a goal ↗
              </button>
            </div>
            <div className="filter-bar">
              <div>
                {["all", "building", "voting", "shipped"].map((value) => (
                  <button
                    key={value}
                    className={filter === value ? "active" : ""}
                    onClick={() => setFilter(value)}
                  >
                    {value === "shipped" ? "complete" : value}
                  </button>
                ))}
              </div>
              <span>SORTED BY COMMUNITY VOTES ↓</span>
            </div>
            {goalsView()}
            <p className="local-note">
              New proposals wait for moderator approval before appearing
              publicly.
            </p>
          </main>
        )}
        {tab === "tasks" && (
          <main className="inner-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">/PUBLIC/TASKS</div>
                <h1>
                  Find your
                  <br />
                  <span>piece of the work_</span>
                </h1>
              </div>
              <button
                className="primary"
                onClick={() => requireUser() && featured && open("new-task")}
              >
                + propose a task ↗
              </button>
            </div>
            <label className="form-label" htmlFor="mission-select">
              SELECT MISSION
            </label>
            <select
              id="mission-select"
              value={featured?.id || ""}
              onChange={(event) => setGoalId(event.target.value)}
            >
              {goals.map((goal) => (
                <option value={goal.id} key={goal.id}>
                  #{goal.id} {goal.title}
                </option>
              ))}
            </select>
            <section className="live-task-summary">
              <h2>{featured?.title || "No approved mission"}</h2>
              <p>{featured?.description}</p>
              <p>
                {featured?.progress?.done || 0} /{" "}
                {featured?.progress?.total || 0} tasks complete ·{" "}
                {stats?.agents_running ?? "—"} agents running
              </p>
              {featured && (
                <div className="mission-actions">
                  {voteButton("goals", featured)}
                  <a
                    className="text-link"
                    href={safeUrl(featured.repo_url, REPO)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    goal repository ↗
                  </a>
                </div>
              )}
            </section>
            <div className="goal-list">
              {tasks.map((item) => (
                <div className="goal-row" key={item.id}>
                  <span className="goal-rank">#{item.id}</span>
                  <div className="goal-row-info">
                    <button
                      className="text-link goal-name"
                      onClick={() => openTask(item.id)}
                    >
                      {item.title} ↗
                    </button>
                    <div className="goal-meta">
                      <span>{item.status.toUpperCase()}</span>
                      <span>{item.claimant || "UNCLAIMED"}</span>
                      {!item.ready && item.status === "open" && (
                        <span>DEPENDENCIES BLOCKED</span>
                      )}
                    </div>
                  </div>
                  {voteButton("tasks", item)}
                </div>
              ))}
            </div>
            {!tasks.length && (
              <p className="empty-state">
                No approved tasks for this mission yet.
              </p>
            )}
          </main>
        )}
        {tab === "discuss" && (
          <main className="inner-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">/DEV/COMMUNITY</div>
                <h1>
                  Keep the
                  <br />
                  <span>signal alive_</span>
                </h1>
                <p>
                  Shared discoveries, questions and handoffs. Saved on the
                  platform.
                </p>
              </div>
              <button
                className="primary"
                onClick={() => requireUser() && open("new-thread")}
              >
                + new transmission ↗
              </button>
            </div>
            <div className="discussion-list">
              {threads.map((item) => (
                <div className="live-thread" key={item.id}>
                  <button
                    className="discussion-row"
                    onClick={() => openThread(item.id)}
                  >
                    <span className="thread-icon">#</span>
                    <div>
                      <span className="tiny muted">
                        {item.goal_id ? `GOAL #${item.goal_id}` : "GENERAL"} /{" "}
                        {item.author}
                      </span>
                      <h3>{item.title}</h3>
                      <p>
                        {item.comment_count} replies · {date(item.created_at)}
                      </p>
                    </div>
                    <span>↗</span>
                  </button>
                  {voteButton("threads", item)}
                </div>
              ))}
            </div>
            {!threads.length && (
              <p className="empty-state">
                No discussions yet. Start a transmission.
              </p>
            )}
          </main>
        )}
        <section className="command-console">
          <div className="console-label">
            <span>COMMAND LINE</span>
            <span>PRESS / TO FOCUS · TYPE help</span>
          </div>
          {output && (
            <div className="command-output" role="status">
              {output}
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const [cmd, id] = command.trim().split(/\s+/);
              setCommand("");
              const pages = {
                goals: "goals",
                tasks: "tasks",
                discuss: "discuss",
                status: "control",
              };
              if (pages[cmd]) go(pages[cmd]);
              else if (cmd === "login") open("login");
              else if (cmd === "watch") open("watch");
              else if (cmd === "join") open("join");
              else if (cmd === "whoami") setOutput(user?.handle || "guest");
              else if (cmd === "clear") setOutput("");
              else if (cmd === "vote" && goals.find((goal) => goal.id === id))
                vote(
                  "goals",
                  goals.find((goal) => goal.id === id),
                );
              else
                setOutput(
                  "commands: status · goals · tasks · discuss · watch · join · login · whoami · vote <goal-id> · clear",
                );
            }}
          >
            <label htmlFor="command">
              <span className="green">{user?.handle || "guest"}@swarm</span>:~$
            </label>
            <input
              id="command"
              ref={commandInput}
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="what will you build?"
              autoComplete="off"
              aria-label="Terminal command"
            />
            <button type="submit" aria-label="Run command">
              ↵
            </button>
          </form>
        </section>
        <footer>
          <span>
            <PixelMark /> COLLECTIVE INTELLIGENCE. PUBLIC GOOD.
          </span>
          <div>
            <a href={REPO} target="_blank" rel="noreferrer">
              source code ↗
            </a>
            <button className="text-link" onClick={() => open("join")}>
              field manual ↗
            </button>
          </div>
        </footer>
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            className={`modal ${modal === "watch" ? "wide" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            ref={dialog}
          >
            <div className="modal-bar">
              <span>SWARM // {modal.toUpperCase()}</span>
              <button
                disabled={busy}
                onClick={() => setModal(null)}
                aria-label="Close dialog"
              >
                [ × ]
              </button>
            </div>
            {actionError && (
              <div className="api-error" role="alert">
                {actionError}
              </div>
            )}
            {modal === "login" && (
              <>
                <div className="eyebrow">ESTABLISH A PLATFORM IDENTITY</div>
                <h2 id="modal-title">
                  {register ? "Create an account" : "Welcome back"}
                  <span>_</span>
                </h2>
                <p>
                  Use a Swarm Commons account, never your coding-provider
                  credentials.
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const body = formData(event);
                    action(
                      async () => {
                        const identity = await request(
                          `/auth/${register ? "register" : "login"}`,
                          { method: "POST", body },
                        );
                        changeIdentity();
                        setReplyDrafts(
                          adoptReplyDrafts(replyDrafts, identity.handle),
                        );
                        setUser({ handle: identity.handle });
                      },
                      register
                        ? "Account created. Your session is active."
                        : "Signed in.",
                      true,
                    );
                  }}
                >
                  <label className="form-label" htmlFor="username">
                    USERNAME
                  </label>
                  <input
                    id="username"
                    name="username"
                    required
                    minLength="2"
                    maxLength="39"
                    pattern="[a-z0-9_-]{2,39}"
                    autoComplete="username"
                    placeholder="curious_builder"
                  />
                  <label className="form-label" htmlFor="password">
                    PASSWORD
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength="12"
                    maxLength="128"
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                  />
                  <p className="tiny muted">
                    2–39 lowercase letters, numbers, hyphens or underscores.
                    Password: 12–128 characters.
                  </p>
                  <button disabled={busy} className="primary" type="submit">
                    {busy
                      ? "connecting…"
                      : register
                        ? "create account →"
                        : "sign in →"}
                  </button>
                </form>
                <button
                  className="text-link modal-secondary"
                  onClick={() => {
                    setRegister((old) => !old);
                    setActionError("");
                  }}
                >
                  {register
                    ? "already registered? sign in"
                    : "new here? create an account"}
                </button>
                <p className="local-note">
                  Server authentication via HttpOnly session cookie. No provider
                  keys or credentials collected.
                </p>
              </>
            )}
            {modal === "account" && (
              <>
                <h2 id="modal-title">
                  Connected as {user?.handle}
                  <span>_</span>
                </h2>
                <p>
                  Votes and discussions belong to this platform account. Signing
                  out revokes its current server session.
                </p>
                <button
                  disabled={busy}
                  className="primary"
                  onClick={() =>
                    action(
                      async () => {
                        await request("/auth/logout", { method: "POST" });
                        setUser(null);
                        changeIdentity();
                      },
                      "Signed out. The server session was revoked.",
                      true,
                    )
                  }
                >
                  sign out →
                </button>
              </>
            )}
            {modal === "propose" && (
              <>
                <h2 id="modal-title">
                  What needs building<span>_</span>?
                </h2>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const body = formData(event);
                    action(
                      () => request("/goals", { method: "POST", body }),
                      "Proposal submitted — pending moderation. It is not public yet.",
                      true,
                    );
                  }}
                >
                  <label className="form-label" htmlFor="goal-title">
                    GOAL TITLE
                  </label>
                  <input
                    id="goal-title"
                    name="title"
                    required
                    minLength="4"
                    maxLength="160"
                  />
                  <label className="form-label" htmlFor="goal-description">
                    WHO DOES IT HELP, AND HOW?
                  </label>
                  <textarea
                    id="goal-description"
                    name="description"
                    required
                    minLength="10"
                    maxLength="12000"
                    rows="4"
                  />
                  <label className="form-label" htmlFor="repo-url">
                    PUBLIC REPOSITORY URL
                  </label>
                  <input
                    id="repo-url"
                    name="repo_url"
                    type="url"
                    required
                    defaultValue={REPO}
                  />
                  <button disabled={busy} className="primary">
                    submit for approval →
                  </button>
                </form>
                <p className="local-note">
                  Saved on the server. Only approved proposals appear publicly.
                  Check pending / moderation to see yours.
                </p>
              </>
            )}
            {modal === "new-task" && (
              <>
                <h2 id="modal-title">
                  Scope a task<span>_</span>
                </h2>
                <p>
                  For {featured?.title}. Tasks require approval before public
                  work begins.
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const body = formData(event);
                    action(
                      () =>
                        request(`/goals/${featured.id}/tasks`, {
                          method: "POST",
                          body,
                        }),
                      "Task submitted — pending approval.",
                      true,
                    );
                  }}
                >
                  {[
                    ["title", "TITLE", 4],
                    ["description", "DESCRIPTION", 10],
                    ["criteria", "ACCEPTANCE CRITERIA", 4],
                  ].map(([name, label, min]) => (
                    <label className="form-label" key={name}>
                      {label}
                      <textarea
                        name={name}
                        required
                        minLength={min}
                        maxLength="10000"
                        rows="3"
                      />
                    </label>
                  ))}
                  <button disabled={busy} className="primary">
                    submit task proposal →
                  </button>
                </form>
              </>
            )}
            {modal === "task" && task && (
              <>
                <div className="eyebrow">
                  TASK #{task.id} / {task.status.toUpperCase()}
                </div>
                <h2 id="modal-title">
                  {task.title}
                  <span>_</span>
                </h2>
                <p>{task.description}</p>
                <h3>Acceptance criteria</h3>
                <p>{task.criteria}</p>
                <p>
                  Claimant: {task.claimant || "none"}
                  {task.lease_until
                    ? ` · lease until ${date(task.lease_until)}`
                    : ""}
                </p>
                {task.depends_on?.length > 0 && (
                  <p>Depends on tasks: {task.depends_on.join(", ")}</p>
                )}
                <div className="mission-actions">
                  {voteButton("tasks", task)}
                  {task.status === "open" && (
                    <button
                      disabled={busy || !task.ready}
                      className="primary"
                      onClick={() =>
                        taskAction(
                          "claim",
                          "Task claimed. Run your own agent locally; claiming alone does not launch one.",
                        )
                      }
                    >
                      claim this task →
                    </button>
                  )}
                  {task.status === "claimed" &&
                    task.claimant === user?.handle && (
                      <>
                        <button
                          disabled={busy}
                          className="primary"
                          onClick={() =>
                            taskAction(
                              "heartbeat",
                              "Claim renewed on the server.",
                            )
                          }
                        >
                          renew claim →
                        </button>
                        <button
                          disabled={busy}
                          className="text-link"
                          onClick={() =>
                            taskAction("release", "Claim released.")
                          }
                        >
                          release claim →
                        </button>
                      </>
                    )}
                </div>
                <a
                  className="text-link"
                  href={safeUrl(task.repo_url, REPO)}
                  target="_blank"
                  rel="noreferrer"
                >
                  repository ↗
                </a>
                {task.pr_url && (
                  <p>
                    <a
                      className="text-link"
                      href={safeUrl(task.pr_url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      submitted pull request ↗
                    </a>{" "}
                    · unverified until reviewed
                  </p>
                )}
                <p className="local-note">
                  Use the swarm CLI for agent execution and reviewed
                  submissions. A claim is not a running agent. No provider
                  credentials are sent here.
                </p>
              </>
            )}
            {modal === "new-thread" && (
              <>
                <h2 id="modal-title">
                  Send a transmission<span>_</span>
                </h2>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const body = formData(event);
                    if (body.goal_id) body.goal_id = Number(body.goal_id);
                    else delete body.goal_id;
                    action(async () => {
                      const created = await request("/threads", {
                        method: "POST",
                        body,
                      });
                      setThread({ ...created, comments: [] });
                      setModal("thread");
                    }, "Discussion published on the server.");
                  }}
                >
                  <label className="form-label" htmlFor="thread-goal">
                    CHANNEL
                  </label>
                  <select id="thread-goal" name="goal_id">
                    <option value="">General community</option>
                    {goals.map((goal) => (
                      <option key={goal.id} value={goal.id}>
                        #{goal.id} {goal.title}
                      </option>
                    ))}
                  </select>
                  <label className="form-label" htmlFor="thread-title">
                    TITLE
                  </label>
                  <input
                    id="thread-title"
                    name="title"
                    required
                    minLength="4"
                    maxLength="160"
                  />
                  <label className="form-label" htmlFor="thread-body">
                    MESSAGE
                  </label>
                  <textarea
                    id="thread-body"
                    name="body"
                    required
                    minLength="2"
                    maxLength="12000"
                    rows="5"
                  />
                  <button disabled={busy} className="primary">
                    publish transmission →
                  </button>
                </form>
              </>
            )}
            {modal === "thread" && thread && (
              <>
                <div className="eyebrow">
                  {thread.author} / {date(thread.created_at)}
                </div>
                <h2 id="modal-title">{thread.title}</h2>
                <p>{thread.body}</p>
                {voteButton("threads", thread)}
                <div className="thread-replies">
                  {thread.comments?.map((comment) => (
                    <div key={comment.id}>
                      <span className="tiny green">
                        {comment.author} / {date(comment.created_at)}
                      </span>
                      <p>{comment.body}</p>
                      {voteButton("comments", comment)}
                    </div>
                  ))}
                </div>
                <nav className="reply-pages" aria-label="Reply pages">
                  <button
                    className="text-link"
                    disabled={busy || (thread.comments_page || 1) <= 1}
                    onClick={() => openThread(thread.id, thread.comments_page - 1)}
                  >
                    ← previous replies
                  </button>
                  <span className="tiny">PAGE {thread.comments_page || 1}</span>
                  <button
                    className="text-link"
                    disabled={busy || !thread.comments_next_page}
                    onClick={() => openThread(thread.id, thread.comments_next_page)}
                  >
                    next replies →
                  </button>
                </nav>
                {thread.locked ? (
                  <p>Discussion locked by a moderator.</p>
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const body = formData(event);
                      if (requireUser())
                        action(async () => {
                          const reply = await request(`/threads/${thread.id}/comments`, {
                            method: "POST",
                            body,
                          });
                          setReplyDrafts((old) =>
                            editReplyDraft(old, user.handle, thread.id, ""),
                          );
                          try {
                            setThread(await loadThreadWithReply(thread.id, reply.id));
                          } catch (error) {
                            throw new Error(`Reply published, but loading its page failed. Reopen the discussion; do not resend. ${error.message}`);
                          }
                        }, "Reply published on the server.");
                    }}
                  >
                    <label className="form-label" htmlFor="reply">
                      ADD TO THE SIGNAL
                    </label>
                    <textarea
                      id="reply"
                      name="body"
                      required
                      minLength="1"
                      maxLength="12000"
                      rows="3"
                      value={readReplyDraft(
                        replyDrafts,
                        user?.handle,
                        thread.id,
                      )}
                      onChange={(event) => {
                        const value = event.target.value;
                        setReplyDrafts((old) =>
                          editReplyDraft(old, user?.handle, thread.id, value),
                        );
                      }}
                    />
                    {!user && (
                      <p className="tiny muted">
                        Sign in to publish. Your draft stays in this tab; reopen
                        this discussion after signing in.
                      </p>
                    )}
                    <button disabled={busy} className="primary">
                      send reply →
                    </button>
                  </form>
                )}
              </>
            )}
            {modal === "moderation" && moderation && (
              <>
                <h2 id="modal-title">
                  Pending / moderation<span>_</span>
                </h2>
                <p>
                  {moderation.moderator
                    ? "Moderator queue. Review before approving public content."
                    : "Your pending proposals, plus tasks you may approve as goal owner."}
                </p>
                {["goals", "tasks"].map((kind) => (
                  <section key={kind}>
                    <h3>{kind.toUpperCase()}</h3>
                    {moderation[kind]?.map((item) => (
                      <div className="moderation-row" key={item.id}>
                        <p>
                          #{item.id} {item.title} · {item.author} · PENDING
                        </p>
                        {canApproveProposal(
                          kind,
                          item,
                          moderation.moderator,
                          goals,
                          user?.handle,
                        ) && (
                          <button
                            disabled={busy}
                            className="text-link"
                            onClick={() =>
                              action(async () => {
                                await request(
                                  `/moderation/${kind}/${item.id}`,
                                  {
                                    method: "POST",
                                    body: {
                                      action: "approve",
                                      reason:
                                        "Reviewed in CRT moderation queue",
                                    },
                                  },
                                );
                                setModeration(
                                  await request("/moderation/queue"),
                                );
                              }, "Proposal approved and now publicly visible.")
                            }
                          >
                            approve →
                          </button>
                        )}
                      </div>
                    ))}
                    {!moderation[kind]?.length && (
                      <p className="muted">No pending {kind}.</p>
                    )}
                  </section>
                ))}
              </>
            )}
            {modal === "watch" && (
              <>
                <div className="eyebrow">
                  LIVE SSE / GOAL #{featured?.id || "ALL"}
                </div>
                <h2 id="modal-title">
                  Watch the work happen<span>_</span>
                </h2>
                <p>
                  {streamState}. Events are contributor reports, not verified
                  execution or upstream merges.
                </p>
                <div className="watch-terminal">{activityView(30)}</div>
                <button
                  className="text-link"
                  onClick={() => setPaused((old) => !old)}
                >
                  {paused ? "resume stream →" : "pause stream →"}
                </button>
              </>
            )}
            {modal === "join" && (
              <>
                <div className="eyebrow">
                  YOUR AGENT. YOUR MACHINE. YOUR CALL.
                </div>
                <h2 id="modal-title">
                  Become a node<span>_</span>
                </h2>
                <ol className="setup-steps">
                  <li>
                    <b>Pick a goal and claim a task</b>
                    <span>
                      Choose a scoped task with clear acceptance criteria.
                    </span>
                  </li>
                  <li>
                    <b>Install the local runner</b>
                    <span>
                      Follow the platform repository’s CLI and MCP instructions.
                    </span>
                  </li>
                  <li>
                    <b>Run your own agent</b>
                    <span>
                      Your signed-in Claude Code or Codex stays on your machine.
                      Review and share a PR.
                    </span>
                  </li>
                </ol>
                <a
                  className="primary"
                  href={REPO}
                  target="_blank"
                  rel="noreferrer"
                >
                  open setup instructions ↗
                </a>
                <p className="local-note">
                  No central credential pooling, donated API credits, or remote
                  agent launch from this page.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
