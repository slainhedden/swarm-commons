import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight, RefreshCw, Copy, Globe, Github } from "lucide-react";
import {
  API_BASE,
  fetchJson,
  fetchPublicWorkspace,
  safeRepoUrl,
  taskPresentation,
  buildTaskBrief,
} from "./api";
import "./platform.css";

const SESSION_KEY = `swarm-retro-platform:${API_BASE}`;
function storedSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return s?.token && s?.handle ? s : null;
  } catch {
    return null;
  }
}
function PlatformForm({
  title,
  fields,
  submit = "Save",
  onSubmit,
  busy,
  onCancel,
}) {
  return (
    <form
      className="platform-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const ok = await onSubmit(Object.fromEntries(new FormData(form)));
        if (ok) form.reset();
      }}
    >
      <h3>{title}</h3>
      {fields.map(({ name, label, textarea, options, ...props }) => (
        <label key={name}>
          {label}
          {textarea ? (
            <textarea
              name={name}
              required
              rows={3}
              maxLength={5000}
              {...props}
            />
          ) : options ? (
            <select name={name} {...props}>
              {options.map(([value, text]) => (
                <option value={value} key={value}>
                  {text}
                </option>
              ))}
            </select>
          ) : (
            <input name={name} required {...props} />
          )}
        </label>
      ))}
      <div className="platform-actions">
        <button className="retro-button primary" disabled={busy}>
          {busy ? "Saving…" : submit}
        </button>
        {onCancel && (
          <button type="button" className="retro-button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
const titleField = { name: "title", label: "Title", maxLength: 140 };
const bodyField = { name: "body", label: "Message", textarea: true };
const descriptionField = {
  name: "description",
  label: "Description",
  textarea: true,
};
const criteriaField = {
  name: "criteria",
  label: "Acceptance criteria",
  textarea: true,
};

export default function PlatformBrowser({ onDemo, notify }) {
  const [session, setSession] = useState(storedSession);
  const [authMode, setAuthMode] = useState("login");
  const [workspace, setWorkspace] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [goalId, setGoalId] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [taskError, setTaskError] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(null);
  const [threadId, setThreadId] = useState(null);
  const [threadPage, setThreadPage] = useState(1);
  const [replyPage, setReplyPage] = useState(1);
  const [thread, setThread] = useState(null);
  const [threadError, setThreadError] = useState("");
  const [queue, setQueue] = useState(null);
  const [queueError, setQueueError] = useState("");
  const [streamStatus, setStreamStatus] = useState("Connecting…");
  const [updatedAt, setUpdatedAt] = useState(null);
  const token = session?.token;
  const goal = workspace?.goals.find((g) => g.id === goalId);
  const accountRef = useRef(token);
  accountRef.current = token;
  const refresh = () => setRevision((r) => r + 1);
  const expireSession = () => {
    setSession(null);
    setActionError(
      "Your platform session expired. Log in again; public browsing is still available.",
    );
  };
  const showError = (e) => {
    if (e.status === 401 && token) expireSession();
    else
      setActionError(
        e.name === "TimeoutError"
          ? "The platform took too long to respond. Refresh before retrying a write."
          : e.message || "The platform could not be reached.",
      );
  };

  useEffect(() => {
    try {
      if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* Memory-only if browser storage is disabled. */
    }
    setWorkspace(null);
    setTasks(null);
    setThread(null);
    setQueue(null);
    setForm(null);
  }, [token]);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetchJson(API_BASE, "/me", { token, signal: controller.signal }).catch(
      (e) => {
        if (!controller.signal.aborted) {
          if (e.status === 401) expireSession();
          else
            setActionError(
              "Could not verify your account. Refresh before posting.",
            );
        }
      },
    );
    return () => controller.abort();
  }, [token]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 12000);
    setLoading(true);
    setError("");
    fetchPublicWorkspace(API_BASE, {
      token,
      goalId,
      threadPage,
      signal: controller.signal,
    })
      .then((value) => {
        if (active) {
          setWorkspace(value);
          setUpdatedAt(new Date());
        }
      })
      .catch((e) => {
        if (active) {
          if (e.status === 401 && token) expireSession();
          setError(
            controller.signal.aborted
              ? "The platform took too long to respond. Try again or explore the demo."
              : `${e.message} The demo workspace is still available.`,
          );
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [revision, token, goalId, threadPage]);
  useEffect(() => {
    if (!goalId) {
      setTasks(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 12000);
    setTaskError("");
    fetchJson(API_BASE, `/tasks?goal_id=${goalId}`, {
      token,
      signal: controller.signal,
    })
      .then((value) => {
        if (
          !Array.isArray(value) ||
          !value.every(
            (t) =>
              t &&
              Number.isInteger(t.id) &&
              typeof t.title === "string" &&
              (t.depends_on == null || Array.isArray(t.depends_on)),
          )
        )
          throw new Error("The platform returned an incompatible task board.");
        if (active) setTasks(value);
      })
      .catch((e) => {
        if (active) {
          if (e.status === 401 && token) expireSession();
          setTaskError(
            `${e.message || "Task board could not load."} Try this goal again.`,
          );
        }
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [goalId, token, revision]);
  useEffect(() => {
    if (!threadId) {
      setThread(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setThreadError("");
    fetchJson(API_BASE, `/threads/${threadId}?page=${replyPage}`, {
      token,
      signal: controller.signal,
    })
      .then((value) => {
        if (!Array.isArray(value?.comments))
          throw new Error("The platform returned incompatible comments.");
        if (active) setThread(value);
      })
      .catch((e) => {
        if (active) {
          if (e.status === 401 && token) expireSession();
          setThreadError(e.message);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [threadId, replyPage, token, revision]);
  useEffect(() => {
    if (!token) {
      setQueue(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setQueueError("");
    fetchJson(API_BASE, "/moderation/queue", {
      token,
      signal: controller.signal,
    })
      .then((value) => {
        if (active) setQueue(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setQueueError(e.message);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [token, revision]);
  useEffect(() => {
    let timer;
    let stream;
    setStreamStatus("Connecting…");
    if (typeof EventSource !== "undefined") {
      stream = new EventSource(
        `${API_BASE}/events/stream${goalId ? `?goal_id=${goalId}` : ""}`,
      );
      stream.onopen = () => setStreamStatus("Live updates connected");
      stream.onmessage = () => {
        clearTimeout(timer);
        timer = setTimeout(() => setRevision((r) => r + 1), 400);
      };
      stream.onerror = () =>
        setStreamStatus("Live connection reconnecting · refreshing every 15s");
    } else setStreamStatus("Refreshing every 15s");
    const poll = setInterval(() => setRevision((r) => r + 1), 15000);
    return () => {
      stream?.close();
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, [goalId]);

  async function mutate(
    path,
    body,
    { method = "POST", message = "Saved to the shared platform." } = {},
  ) {
    if (busy) return null;
    if (!token) {
      setActionError("Log in to your platform account first.");
      return null;
    }
    const requestToken = token;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const result = await fetchJson(API_BASE, path, { token, method, body });
      if (accountRef.current !== requestToken) return null;
      setNotice(message);
      refresh();
      return result;
    } catch (e) {
      if (accountRef.current === requestToken) showError(e);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function authenticate(data) {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const identity = await fetchJson(API_BASE, `/auth/${authMode}`, {
        method: "POST",
        body: data,
      });
      if (!identity.token || !identity.handle)
        throw new Error("The platform returned an invalid account session.");
      setSession(identity);
      setNotice(
        `Signed in as ${identity.handle}. This is your shared platform account.`,
      );
      return true;
    } catch (e) {
      showError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    const result = await mutate("/auth/logout", undefined, {
      message: "Logged out of the shared platform.",
    });
    if (result) setSession(null);
  }
  async function vote(kind, item) {
    await mutate(`/${kind}/${item.id}/vote`, undefined, {
      method: item.viewer_voted ? "DELETE" : "POST",
      message: item.viewer_voted ? "Vote removed." : "Vote recorded.",
    });
  }
  function Vote({ kind, item }) {
    return (
      <button
        className={`retro-button ${item.viewer_voted ? "voted" : ""}`}
        disabled={busy || !session}
        onClick={() => vote(kind, item)}
        aria-pressed={Boolean(item.viewer_voted)}
        title={!session ? "Log in to vote" : undefined}
      >
        {item.viewer_voted ? "Unvote" : "Vote"} · {item.votes ?? 0}
      </button>
    );
  }
  const chooseGoal = (id) => {
    if (goalId === id) {
      refresh();
      return;
    }
    setGoalId(id);
    setThreadPage(1);
    setTasks(null);
    setThreadId(null);
    setForm(null);
  };
  const openThread = (id) => {
    setThreadId(id);
    setReplyPage(1);
    setThread(null);
    refresh();
  };
  const chooseReplyPage = (page) => {
    setReplyPage(page);
    setThread(null);
  };
  const copyTask = async (task) => {
    try {
      await navigator.clipboard.writeText(
        buildTaskBrief(goal, task, session?.handle),
      );
      notify(
        task.status === "claimed" && session?.handle === task.claimant
          ? "Your claimed task brief was copied. Renew the claim while working."
          : taskPresentation(task).available
            ? "Task brief copied. Claim it here or with the swarm CLI before starting."
            : "Task details copied for reference, not new work.",
      );
    } catch {
      notify("Clipboard unavailable. Select the task details to copy them.");
    }
  };
  const finishForm = async (path, body, options) => {
    const value = await mutate(path, body, options);
    if (value) setForm(null);
    return Boolean(value);
  };
  const pendingCount =
    (queue?.goals?.length || 0) + (queue?.tasks?.length || 0);

  return (
    <section className="window full-window platform-browser">
      <header className="window-bar">
        <span>
          <Globe size={12} /> connected_community.exe
        </span>
        <button
          className="close-modal"
          onClick={onDemo}
          aria-label="Return to demo workspace"
        >
          ×
        </button>
      </header>
      <div className="platform-intro">
        <div>
          <span className="tag green">SHARED PLATFORM · REAL COMMUNITY</span>
          <h2>Good things. Happening for real.</h2>
          <p>
            Vote on the next useful thing. Build it with your own local agent.
            Meet the people making it happen.
          </p>
        </div>
        <button className="retro-button" disabled={loading} onClick={refresh}>
          <RefreshCw size={14} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      <div className="platform-origin">
        API: {API_BASE}
        <br />
        <span role="status">
          {streamStatus}
          {updatedAt && ` · Last read ${updatedAt.toLocaleTimeString()}`}
        </span>
      </div>
      {actionError && (
        <div className="platform-error" role="alert">
          {actionError}
        </div>
      )}
      {notice && (
        <div className="platform-notice" role="status">
          {notice}
        </div>
      )}
      <section className="platform-account" id="platform-account">
        {session ? (
          <>
            <h3>Welcome, {session.handle}.</h3>
            <p>
              Your platform session survives reloads in this tab. The design
              demo’s display-name profile is separate.
            </p>
            <button className="retro-button" disabled={busy} onClick={logout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <div className="platform-actions">
              <button
                className="retro-button"
                aria-pressed={authMode === "login"}
                onClick={() => setAuthMode("login")}
              >
                Log in
              </button>
              <button
                className="retro-button"
                aria-pressed={authMode === "register"}
                onClick={() => setAuthMode("register")}
              >
                Create account
              </button>
            </div>
            <PlatformForm
              key={authMode}
              title={
                authMode === "login"
                  ? "Log in to the platform"
                  : "Create a platform account"
              }
              busy={busy}
              submit={authMode === "login" ? "Sign in" : "Register"}
              onSubmit={authenticate}
              fields={[
                {
                  name: "username",
                  label: "Username",
                  autoComplete: "username",
                  pattern: "[a-z0-9][a-z0-9_-]{1,38}",
                  minLength: 2,
                  maxLength: 39,
                },
                {
                  name: "password",
                  label: "Password (12–128 characters)",
                  type: "password",
                  minLength: 12,
                  maxLength: 128,
                  autoComplete:
                    authMode === "login" ? "current-password" : "new-password",
                },
              ]}
            />
            <p>
              Use a new community password, never your Claude Code, Codex, or
              GitHub credentials. New accounts may need to wait ten minutes
              before voting.
            </p>
          </>
        )}
      </section>
      {error && (
        <div className="platform-error" role="alert">
          {error}
          {workspace && (
            <p>Showing the last successful snapshot. Refresh before acting.</p>
          )}
          <button className="retro-button" onClick={onDemo}>
            Use demo workspace <ArrowUpRight size={13} />
          </button>
        </div>
      )}
      {workspace && (
        <>
          <div className="platform-stats">
            <span>
              <b>{workspace.stats.contributors}</b> contributors, platform-wide
            </span>
            <span>
              <b>{workspace.stats.agents_running}</b> active agents{" "}
              {goal ? "on this goal" : "across all goals"}
            </span>
            <span>
              <b>{workspace.stats.prs_merged}</b> reported completions with PRs*
            </span>
          </div>
          <small className="platform-footnote">
            *Contributor attestations, not independently verified GitHub merges.
            Active agents require a recent heartbeat on a valid claim. Public
            goal/task lists contain approved proposals only.
          </small>
          <div className="platform-actions platform-pad">
            <button
              className="retro-button primary"
              disabled={!session || busy}
              onClick={() => setForm({ kind: "goal" })}
            >
              Propose a goal
            </button>
            <button className="retro-button" onClick={() => chooseGoal(null)}>
              All goals & general community
            </button>
            {goal && <span className="tag green">FOCUS: {goal.title}</span>}
          </div>
          {form?.kind === "goal" && (
            <PlatformForm
              title="Propose a community goal"
              submit="Submit for approval"
              busy={busy}
              onCancel={() => setForm(null)}
              fields={[
                titleField,
                descriptionField,
                {
                  name: "repo_url",
                  label: "GitHub repository URL",
                  type: "url",
                  placeholder: "https://github.com/owner/repo",
                  maxLength: 250,
                },
              ]}
              onSubmit={(data) =>
                finishForm("/goals", data, {
                  message:
                    "Goal submitted. It is pending approval, not yet in the public queue.",
                })
              }
            />
          )}
          <div className="platform-search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search platform goals"
              placeholder="Find a shared goal…"
            />
          </div>
          <div className="goals-grid">
            {workspace.goals
              .filter((g) =>
                g.title.toLowerCase().includes(query.toLowerCase()),
              )
              .map((g) => (
                <article className="goal-card" key={g.id}>
                  <div className="platform-goal-meta">
                    <span className="tag green">{g.votes} COMMUNITY VOTES</span>
                    <span className="tag yellow">
                      {g.status === "done" ? "GOAL COMPLETE" : "OPEN GOAL"}
                    </span>
                  </div>
                  <button
                    className="plain-goal"
                    onClick={() => chooseGoal(g.id)}
                  >
                    <h2>{g.title}</h2>
                  </button>
                  <p>{g.description}</p>
                  <div className="platform-progress">
                    <div className="segmented-progress">
                      <div
                        style={{
                          width: `${Math.max(0, Math.min(100, g.progress?.percent_done || 0))}%`,
                        }}
                      />
                    </div>
                    <small>
                      {g.progress?.done || 0} of {g.progress?.total || 0} tasks
                      done
                    </small>
                  </div>
                  <footer>
                    <button
                      className="retro-button primary"
                      onClick={() => chooseGoal(g.id)}
                    >
                      Explore tasks <ArrowUpRight size={14} />
                    </button>
                    <Vote kind="goals" item={g} />
                    {safeRepoUrl(g.repo_url) && (
                      <a
                        href={safeRepoUrl(g.repo_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-link"
                      >
                        <Github size={16} /> Source
                      </a>
                    )}
                  </footer>
                </article>
              ))}
          </div>
          {!workspace.goals.length && (
            <p className="platform-pad">
              No approved goals yet. Propose the community’s first useful idea.
            </p>
          )}
          {goal && (
            <section className="platform-detail">
              <header>
                <h3>{goal.title} / task board</h3>
                <button className="text-link" onClick={() => chooseGoal(null)}>
                  Close ×
                </button>
              </header>
              <div className="platform-actions">
                <button
                  className="retro-button"
                  disabled={!session || busy}
                  onClick={() => setForm({ kind: "task" })}
                >
                  Propose a task
                </button>
              </div>
              {form?.kind === "task" && (
                <PlatformForm
                  title="Propose a task"
                  submit="Submit for approval"
                  fields={[
                    titleField,
                    descriptionField,
                    criteriaField,
                    {
                      name: "dependencies",
                      label: "Dependency task IDs (comma separated, optional)",
                      required: false,
                      pattern: "[0-9, ]*",
                    },
                  ]}
                  busy={busy}
                  onCancel={() => setForm(null)}
                  onSubmit={({ dependencies, ...data }) =>
                    finishForm(
                      `/goals/${goal.id}/tasks`,
                      {
                        ...data,
                        depends_on: dependencies
                          ? dependencies.split(",").map((v) => Number(v.trim()))
                          : [],
                      },
                      {
                        message:
                          "Task proposed. Check the approval queue; pending work is not publicly claimable.",
                      },
                    )
                  }
                />
              )}
              {taskError ? (
                <p role="alert">{taskError}</p>
              ) : tasks === null ? (
                <p>Loading task board…</p>
              ) : !tasks.length ? (
                <p>No approved tasks yet.</p>
              ) : (
                tasks.map((t) => (
                  <article key={t.id}>
                    <span className="tag yellow">
                      {taskPresentation(t, session?.handle).label}
                    </span>
                    <h4>
                      #{t.id} · {t.title}
                    </h4>
                    <p>{t.description}</p>
                    <p>
                      <b>Acceptance:</b> {t.criteria}
                    </p>
                    <p>{taskPresentation(t, session?.handle).description}</p>
                    {t.depends_on?.length > 0 && (
                      <small>
                        Depends on task IDs: {t.depends_on.join(", ")}
                      </small>
                    )}
                    {t.claimant && (
                      <small>
                        Claimed by {t.claimant}
                        {t.lease_until
                          ? ` · Lease expires ${new Date(t.lease_until * 1000).toLocaleString()}`
                          : ""}
                      </small>
                    )}
                    <div className="platform-actions">
                      <Vote kind="tasks" item={t} />
                      <button
                        className="retro-button"
                        onClick={() => copyTask(t)}
                      >
                        <Copy size={14} />
                        {taskPresentation(t).available ||
                        (t.status === "claimed" &&
                          session?.handle === t.claimant)
                          ? "Copy task brief"
                          : "Copy task details"}
                      </button>
                      {session && taskPresentation(t).available && (
                        <button
                          className="retro-button primary"
                          disabled={busy}
                          onClick={() =>
                            mutate(`/tasks/${t.id}/claim`, undefined, {
                              message:
                                "Task claimed. Run your own signed-in agent locally; this page does not start one.",
                            })
                          }
                        >
                          Claim task
                        </button>
                      )}
                      {session?.handle === t.claimant &&
                        t.status === "claimed" && (
                          <>
                            <button
                              className="retro-button"
                              disabled={busy}
                              onClick={() =>
                                mutate(`/tasks/${t.id}/heartbeat`, undefined, {
                                  message:
                                    "Claim renewed. A heartbeat is not proof that a coding agent is running.",
                                })
                              }
                            >
                              Renew claim
                            </button>
                            <button
                              className="retro-button"
                              disabled={busy}
                              onClick={() =>
                                mutate(`/tasks/${t.id}/release`, undefined, {
                                  message:
                                    "Claim released. The task is open again.",
                                })
                              }
                            >
                              Release claim
                            </button>
                            <button
                              className="retro-button primary"
                              onClick={() =>
                                setForm({ kind: "submit", taskId: t.id })
                              }
                            >
                              Submit result
                            </button>
                          </>
                        )}
                      {safeRepoUrl(t.pr_url) && (
                        <a
                          href={safeRepoUrl(t.pr_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-link"
                        >
                          View pull request <ArrowUpRight size={13} />
                        </a>
                      )}
                    </div>
                    {t.summary && (
                      <p>
                        <b>Submission:</b> {t.summary}
                      </p>
                    )}
                    {Array.isArray(t.handoff?.tests) &&
                      t.handoff.tests.map((test, i) => (
                        <small key={i}>
                          {test.command}: {test.outcome} (contributor-reported)
                        </small>
                      ))}
                    {t.status === "submitted" && (
                      <>
                        <small>
                          {t.reviews?.filter((r) => r.approved).length || 0}{" "}
                          approvals / {t.review_quorum ?? "required"} review
                          quorum
                        </small>
                        <div className="platform-actions">
                          {session && session.handle !== t.claimant && (
                            <button
                              className="retro-button"
                              disabled={busy || !t.submission_id}
                              onClick={() =>
                                setForm({
                                  kind: "review",
                                  taskId: t.id,
                                  submissionId: t.submission_id,
                                })
                              }
                            >
                              Review submission
                            </button>
                          )}
                          {session &&
                            (session.handle === t.author ||
                              session.handle === goal.author) && (
                              <button
                                className="retro-button"
                                disabled={busy}
                                onClick={() =>
                                  mutate(`/tasks/${t.id}/done`, undefined, {
                                    message:
                                      "Task marked done with contributor attestations. Upstream merge is not independently verified.",
                                  })
                                }
                              >
                                Mark done
                              </button>
                            )}
                        </div>
                      </>
                    )}
                    {form?.kind === "submit" && form.taskId === t.id && (
                      <PlatformForm
                        title="Submit your reviewed work"
                        submit="Submit unverified result"
                        busy={busy}
                        onCancel={() => setForm(null)}
                        fields={[
                          {
                            name: "pr_url",
                            label: "Pull request URL",
                            type: "url",
                            maxLength: 300,
                          },
                          {
                            name: "summary",
                            label: "Result summary",
                            textarea: true,
                          },
                          {
                            name: "test_command",
                            label: "Test command",
                            maxLength: 500,
                          },
                          {
                            name: "test_outcome",
                            label: "Test outcome",
                            options: [
                              ["passed", "Passed"],
                              ["failed", "Failed"],
                              ["not_run", "Not run"],
                            ],
                          },
                          {
                            name: "files",
                            label: "Changed files (comma separated, optional)",
                            required: false,
                            maxLength: 1000,
                          },
                        ]}
                        onSubmit={({
                          test_command,
                          test_outcome,
                          files,
                          ...data
                        }) =>
                          finishForm(
                            `/tasks/${t.id}/submit`,
                            {
                              ...data,
                              handoff: {
                                tests: [
                                  {
                                    command: test_command,
                                    outcome: test_outcome,
                                  },
                                ],
                                files: files
                                  ? files
                                      .split(",")
                                      .map((f) => f.trim())
                                      .filter(Boolean)
                                  : [],
                              },
                            },
                            {
                              message:
                                "Result submitted as unverified. Independent review is still required.",
                            },
                          )
                        }
                      />
                    )}
                    {form?.kind === "review" && form.taskId === t.id && (
                      <PlatformForm
                        title="Independent contributor review"
                        submit="Send review"
                        busy={busy}
                        onCancel={() => setForm(null)}
                        fields={[
                          {
                            name: "summary",
                            label: "What did you independently check?",
                            textarea: true,
                          },
                          {
                            name: "approved",
                            label: "Review verdict",
                            options: [
                              ["true", "Approve"],
                              ["false", "Request changes"],
                            ],
                          },
                        ]}
                        onSubmit={({ approved, ...data }) =>
                          finishForm(
                            `/tasks/${t.id}/reviews`,
                            {
                              ...data,
                              submission_id: form.submissionId,
                              approved: approved === "true",
                            },
                            {
                              message:
                                "Contributor review saved. This is an attestation, not verified upstream CI.",
                            },
                          )
                        }
                      />
                    )}
                  </article>
                ))
              )}
            </section>
          )}
          <div className="platform-columns">
            <section>
              <h3>
                {goal ? "This goal’s town square" : "From the town square"}
              </h3>
              <button
                className="retro-button primary"
                disabled={!session || busy}
                onClick={() => setForm({ kind: "thread" })}
              >
                Start a discussion
              </button>
              {form?.kind === "thread" && (
                <PlatformForm
                  title="Start a shared discussion"
                  submit="Post discussion"
                  busy={busy}
                  onCancel={() => setForm(null)}
                  fields={[titleField, bodyField]}
                  onSubmit={async (data) => {
                    const saved = await finishForm(
                      "/threads",
                      { ...data, ...(goalId ? { goal_id: goalId } : {}) },
                      { message: "Discussion posted to the shared platform." },
                    );
                    if (saved) setThreadPage(1);
                    return saved;
                  }}
                />
              )}
              {workspace.threads.map((t) => (
                <article key={t.id}>
                  <button
                    className="plain-goal"
                    onClick={() => openThread(t.id)}
                  >
                    <h4>{t.title}</h4>
                  </button>
                  <p>{t.body}</p>
                  <small>
                    {t.author} · {t.comment_count} replies
                  </small>
                  <div className="platform-actions">
                    <Vote kind="threads" item={t} />
                    <button
                      className="retro-button"
                      onClick={() => openThread(t.id)}
                    >
                      Read & reply
                    </button>
                  </div>
                </article>
              ))}
              {!workspace.threads.length && (
                <p>
                  {threadPage === 1
                    ? "No conversations yet."
                    : "No more conversations on this page."}
                </p>
              )}
              <nav className="platform-actions" aria-label="Discussion pages">
                <button
                  className="retro-button"
                  disabled={loading || threadPage === 1}
                  onClick={() => {
                    setThreadPage((page) => page - 1);
                    setThreadId(null);
                  }}
                >
                  Newer discussions
                </button>
                <span aria-live="polite">Page {threadPage}</span>
                <button
                  className="retro-button"
                  disabled={loading || workspace.threads.length < 20}
                  onClick={() => {
                    setThreadPage((page) => page + 1);
                    setThreadId(null);
                  }}
                >
                  Older discussions
                </button>
              </nav>
            </section>
            <section>
              <h3>Recent platform activity</h3>
              <p>
                Reported by contributors’ local agents. No simulated events in
                this window.
              </p>
              {workspace.activity
                .filter((a) => !goalId || a.goal_id === goalId)
                .map((a) => (
                  <article key={a.id}>
                    <span className="tag green">{a.kind}</span>
                    <p>{a.summary}</p>
                    <small>
                      {a.actor} ·{" "}
                      {new Date(a.created_at * 1000).toLocaleString()}
                      {a.run_id && ` · Run ${a.run_id}`}
                    </small>
                  </article>
                ))}
              {!workspace.activity.filter(
                (a) => !goalId || a.goal_id === goalId,
              ).length && <p>No activity reported yet.</p>}
            </section>
          </div>
          {threadId && (
            <section className="platform-detail">
              <header>
                <h3>{thread?.title || "Opening discussion…"}</h3>
                <button className="text-link" onClick={() => setThreadId(null)}>
                  Close ×
                </button>
              </header>
              {threadError ? (
                <p role="alert">{threadError}</p>
              ) : (
                thread && (
                  <>
                    <p>{thread.body}</p>
                    <small>By {thread.author}</small>
                    <Vote kind="threads" item={thread} />
                    {thread.comments.map((c) => (
                      <article key={c.id}>
                        <p>{c.body}</p>
                        <small>{c.author}</small>
                        <Vote kind="comments" item={c} />
                      </article>
                    ))}
                    {!thread.comments.length && <p>No replies yet.</p>}
                    <nav className="platform-actions" aria-label="Reply pages">
                      <button
                        className="retro-button"
                        disabled={busy || replyPage === 1}
                        onClick={() => chooseReplyPage(replyPage - 1)}
                      >
                        Earlier replies
                      </button>
                      <span aria-live="polite">Replies page {thread.comments_page ?? replyPage}</span>
                      <button
                        className="retro-button"
                        disabled={busy || !thread.comments_next_page}
                        onClick={() => chooseReplyPage(thread.comments_next_page)}
                      >
                        Later replies
                      </button>
                    </nav>
                    {session ? (
                      <PlatformForm
                        key={`${thread.id}:${session.handle}`}
                        title="Reply to this discussion"
                        submit="Post reply"
                        fields={[bodyField]}
                        busy={busy}
                        onSubmit={async (data) =>
                          Boolean(
                            await mutate(
                              `/threads/${thread.id}/comments`,
                              data,
                              { message: "Reply posted. Use Later replies to browse newer messages in a long discussion." },
                            ),
                          )
                        }
                      />
                    ) : (
                      <p>Log in above to reply.</p>
                    )}
                  </>
                )
              )}
            </section>
          )}
        </>
      )}
      {session && (
        <section className="platform-detail">
          <h3>Approval queue{queue ? ` · ${pendingCount}` : ""}</h3>
          <p>
            Pending proposals are not in the public lists. Goal owners can
            approve tasks; moderators approve community goals.
          </p>
          {queueError && <p role="alert">{queueError}</p>}
          {queue &&
            ["goals", "tasks"].map((kind) => (
              <div key={kind}>
                {queue[kind]?.map((item) => (
                  <article key={`${kind}:${item.id}`}>
                    <span className="tag yellow">
                      PENDING {kind === "goals" ? "GOAL" : "TASK"}
                    </span>
                    <h4>{item.title}</h4>
                    <small>Proposed by {item.author}</small>
                    {(queue.moderator ||
                      (kind === "tasks" &&
                        workspace?.goals.some(
                          (g) =>
                            g.id === item.goal_id &&
                            g.author === session.handle,
                        ))) && (
                      <div className="platform-actions">
                        <button
                          className="retro-button primary"
                          disabled={busy}
                          onClick={() =>
                            mutate(
                              `/moderation/${kind}/${item.id}`,
                              {
                                action: "approve",
                                reason: "Approved after community review.",
                              },
                              { message: "Proposal approved and now public." },
                            )
                          }
                        >
                          Approve
                        </button>
                        <button
                          className="retro-button"
                          disabled={busy}
                          onClick={() =>
                            mutate(
                              `/moderation/${kind}/${item.id}`,
                              {
                                action: "reject",
                                reason: "Not approved for this project.",
                              },
                              { message: "Proposal rejected." },
                            )
                          }
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ))}
          {queue && pendingCount === 0 && (
            <p>No pending proposals visible to this account.</p>
          )}
        </section>
      )}
      <div className="platform-readme">
        All actions in this window use the real shared platform. The other
        desktop tabs are a separate local design demo. Your platform token stays
        in this tab’s session storage and is sent only to the configured API;
        passwords are never saved. Coding-provider credentials stay on your
        computer. Claims and heartbeats do not start or watch an agent; use the
        swarm CLI to run your own signed-in Claude Code or Codex.
      </div>
    </section>
  );
}
