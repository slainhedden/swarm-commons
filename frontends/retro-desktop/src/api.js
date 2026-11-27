// The base includes /api/v1. Leave unset for the standalone design preview.
export const API_BASE = (import.meta.env?.VITE_API_BASE || "").replace(
  /\/$/,
  "",
);

export function safeRepoUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

// Visibility (moderation) and lifecycle status are separate API fields.
export function taskPresentation(task, handle) {
  if (task.visibility && task.visibility !== "approved") {
    return {
      label: "Awaiting approval",
      available: false,
      description:
        "This task is not approved for public work. Review it in the platform before proceeding.",
    };
  }
  if (task.status === "submitted") {
    return {
      label: "Submitted · unverified",
      available: false,
      description:
        "A contributor submitted this result. Reviews and test reports are attestations, not proof of upstream CI, PR authorship, or merge.",
    };
  }
  if (task.status === "done") {
    return {
      label: "Done · contributor-reviewed",
      available: false,
      description:
        "Marked done after reported passing tests and the required reviews. An upstream merge is not independently verified.",
    };
  }
  if (task.status === "claimed") {
    if (handle && task.claimant === handle) {
      return {
        label: "Claimed by you",
        available: false,
        description:
          "You hold this claim. Run your own signed-in agent locally, renew your claim while working, and submit a pull request with test results when ready. This page does not start an agent.",
      };
    }
    return {
      label: "Claimed",
      available: false,
      description:
        "A contributor is working on this task. Do not duplicate their work; claims can be released through the platform.",
    };
  }
  if (task.status === "open" && task.ready === false) {
    return {
      label: "Blocked on dependencies",
      available: false,
      description:
        "This task is open but cannot be claimed until its dependencies are complete.",
    };
  }
  if (task.status === "open") {
    return {
      label: "Open for contribution",
      available: true,
      description:
        "Claim this task through the platform before starting; availability may change after this snapshot.",
    };
  }
  return {
    label: "Status unavailable",
    available: false,
    description:
      "Check the current task status in the platform before starting work.",
  };
}

export function buildTaskBrief(goal, task, handle) {
  const state = taskPresentation(task, handle);
  const instructions =
    task.status === "claimed" && handle && task.claimant === handle
      ? "You hold this task claim. Run your own signed-in Claude Code or Codex locally, keep the claim renewed with the swarm CLI, review changes, and submit a pull request with test results. This page does not start an agent."
      : state.available
        ? "Run your own signed-in Claude Code or Codex locally. Claim this task with the swarm CLI before starting, review changes, and submit a pull request with test results. Copying this brief does not claim the task."
        : "Reference only: this task is not currently available for new work. Do not start duplicate work; check the platform for its current status.";
  return `Goal: ${goal.title}\nTask: ${task.title}\nStatus: ${state.label}\n\n${task.description || "No description provided."}\n\nAcceptance criteria: ${task.criteria || "See platform task details."}\n\nRepository: ${safeRepoUrl(task.repo_url || goal.repo_url) || "See platform documentation"}\n\n${state.description}\n\n${instructions}`;
}

export class ApiError extends Error {
  constructor(status, detail, retryAfter) {
    const hint = {
      401: "Log in again to continue.",
      403: "Your account may not be eligible yet, or this action needs additional permission.",
      409: "The item changed or this action conflicts with its current state. Refresh and try again.",
      413: "This request is too large. Shorten the content.",
      429: "Too many requests. Wait before retrying.",
    }[status];
    super(
      `${detail || `Platform returned ${status}.`}${hint ? ` ${hint}` : ""}${retryAfter ? ` Retry after ${retryAfter} seconds.` : ""}`,
    );
    this.status = status;
  }
}

export async function fetchJson(
  base,
  path,
  { signal, fetcher = fetch, token, method = "GET", body } = {},
) {
  const response = await fetcher(`${base.replace(/\/$/, "")}${path}`, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(12000)])
      : AbortSignal.timeout(12000),
    method,
    credentials: "omit",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let value;
  try {
    value = await response.json();
  } catch {
    if (response.ok) throw new Error("The platform returned invalid JSON.");
  }
  if (!response.ok) {
    const detail =
      typeof value?.detail === "string"
        ? value.detail
        : Array.isArray(value?.detail)
          ? value.detail
              .map((d) => `${d.loc?.slice(1).join(".") || "Input"}: ${d.msg}`)
              .join("; ")
          : "";
    throw new ApiError(
      response.status,
      detail,
      response.headers?.get("Retry-After"),
    );
  }
  return value;
}

export async function fetchPublicWorkspace(base, options) {
  const threadPage = options?.threadPage ?? 1;
  const [goals, stats, threads, activity] = await Promise.all([
    fetchJson(base, "/goals", options),
    fetchJson(
      base,
      options?.goalId ? `/stats?goal_id=${options.goalId}` : "/stats",
      options,
    ),
    fetchJson(
      base,
      options?.goalId
        ? `/threads?goal_id=${options.goalId}&page=${threadPage}&limit=20`
        : `/threads?page=${threadPage}&limit=20`,
      options,
    ),
    fetchJson(base, "/activity?limit=12", options),
  ]);
  if (
    !Array.isArray(goals) ||
    !goals.every(
      (g) => g && Number.isInteger(g.id) && typeof g.title === "string",
    ) ||
    !stats ||
    !Number.isFinite(stats.agents_running) ||
    !Number.isFinite(stats.contributors) ||
    !Number.isFinite(stats.prs_merged) ||
    !Array.isArray(threads) ||
    !threads.every(
      (t) =>
        t &&
        Number.isInteger(t.id) &&
        typeof t.title === "string" &&
        typeof t.body === "string",
    ) ||
    !Array.isArray(activity) ||
    !activity.every(
      (a) =>
        a &&
        Number.isInteger(a.id) &&
        typeof a.summary === "string" &&
        Number.isFinite(a.created_at),
    )
  ) {
    throw new Error("The platform response did not match API v1.");
  }
  return { goals, stats, threads, activity };
}
