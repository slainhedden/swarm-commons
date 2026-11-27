/** Optional shared-platform connection. No coding-provider credentials are accepted. */
export const API_BASE = (
  (import.meta as ImportMeta & { env: Record<string, string> }).env
    .VITE_API_BASE || ""
).replace(/\/$/, "");
const tokenKey = `swarm.mc.session:${API_BASE}`;
export const SESSION_EXPIRED_EVENT = "swarm:session-expired";
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function setToken(token: string) {
  if (token) sessionStorage.setItem(tokenKey, token);
  else sessionStorage.removeItem(tokenKey);
}
export function hasToken() {
  return Boolean(sessionStorage.getItem(tokenKey));
}
export function toggleGoalVote(id: number, voted: boolean) {
  return request<ApiGoal>(`/goals/${id}/vote`, {
    method: voted ? "DELETE" : "POST",
  });
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  async function send(token: string | null, retryRead: boolean): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      signal: options.signal ?? AbortSignal.timeout(10000),
    });
    if (
      response.status === 401 &&
      token &&
      path !== "/auth/login" &&
      path !== "/auth/register"
    ) {
      // Other in-flight requests may still carry the old token. Never clear a
      // newer sign-in, and notify the UI only once for the expired session.
      if (sessionStorage.getItem(tokenKey) === token) {
        setToken("");
        if (typeof window !== "undefined")
          window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
      // Public reads should stay on the platform, not drop to the demo.
      // A mutation is NEVER replayed after an authentication failure.
      if (retryRead && (options.method || "GET").toUpperCase() === "GET")
        return send(sessionStorage.getItem(tokenKey), false);
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ApiError(
        typeof error.detail === "string"
          ? error.detail
          : `Request failed (${response.status}). Please try again.`,
        response.status,
      );
    }
    return response.json();
  }
  return send(sessionStorage.getItem(tokenKey), true);
}
export type ApiProgress = {
  total: number;
  open: number;
  claimed: number;
  submitted: number;
  done: number;
  percent_done: number;
};
export type ApiGoal = {
  id: number;
  title: string;
  description: string;
  repo_url: string;
  author: string;
  votes: number;
  viewer_voted?: boolean;
  task_count: number;
  progress: ApiProgress;
  status?: "open" | "done";
  visibility?: "pending" | "approved" | "hidden" | "rejected";
};
export type ApiTask = {
  id: number;
  goal_id: number;
  title: string;
  description: string;
  criteria: string;
  status: string;
  claimant: string | null;
  pr_url: string | null;
  visibility?: "pending" | "approved" | "hidden" | "rejected";
};
export type ApiThread = {
  id: number;
  goal_id: number | null;
  author: string;
  title: string;
  body: string;
  created_at: number;
  comment_count: number;
  comments?: { author: string; body: string }[];
};
export type ApiActivity = {
  id: number;
  actor: string;
  kind: string;
  summary: string;
  created_at: number;
  goal_id: number | null;
  task_id: number | null;
};
export type Snapshot = {
  goals: ApiGoal[];
  featured: ApiGoal | null;
  tasks: ApiTask[];
  threads: ApiThread[];
  threadPage: number;
  hasOlderThreads: boolean;
  activity: ApiActivity[];
  stats: { agents_running: number; contributors: number; prs_merged: number };
  missionStats: { agents_running: number } | null;
};
const THREAD_PAGE_SIZE = 20;
export async function snapshot(threadPage = 1): Promise<Snapshot> {
  const [goals, featured, tasks, threads, activity, stats] = await Promise.all([
    request<ApiGoal[]>("/goals"),
    request<ApiGoal | null>("/goals/featured"),
    request<ApiTask[]>("/tasks"),
    request<ApiThread[]>(`/threads?page=${threadPage}&limit=${THREAD_PAGE_SIZE}`),
    request<ApiActivity[]>("/activity?limit=30"),
    request<Snapshot["stats"]>("/stats"),
  ]);
  if (
    !Array.isArray(goals) ||
    !Array.isArray(tasks) ||
    !Array.isArray(threads) ||
    !Array.isArray(activity) ||
    typeof stats.agents_running !== "number"
  )
    throw new Error("Unexpected platform response.");
  const [missionStats, olderThreads] = await Promise.all([
    featured
      ? request<{ agents_running: number }>(`/stats?goal_id=${featured.id}`)
      : null,
    // A full page is not proof that another page exists. The API has no total
    // count, so look ahead before offering navigation to an empty page.
    threads.length === THREAD_PAGE_SIZE
      ? request<ApiThread[]>(`/threads?page=${threadPage + 1}&limit=${THREAD_PAGE_SIZE}`)
      : [],
  ]);
  if (!Array.isArray(olderThreads))
    throw new Error("Unexpected platform response.");
  return {
    goals,
    featured,
    tasks,
    threads,
    activity,
    stats,
    missionStats,
    threadPage,
    hasOlderThreads: olderThreads.length > 0,
  };
}
