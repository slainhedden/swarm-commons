import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent, Goal, Note } from "./data";
import { apiRequestUrl } from "./safety";

const configuredBase = (import.meta.env.VITE_API_BASE || "")
  .trim()
  .replace(/\/+$/, "");
export const API_BASE = configuredBase
  ? configuredBase.endsWith("/api/v1")
    ? configuredBase
    : `${configuredBase}/api/v1`
  : "";
export type Session = { handle: string; token: string };
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
type ApiGoal = {
  id: number;
  title: string;
  description: string;
  repo_url: string;
  votes: number;
  task_count: number;
  status?: "open" | "done";
  visibility?: string;
  viewer_voted?: boolean;
  progress: {
    total: number;
    claimed: number;
    done: number;
    percent_done: number;
  };
};
type ApiThread = {
  id: number;
  goal_id: number | null;
  author: string;
  title: string;
  body: string;
  created_at: number;
  comment_count: number;
};
type ApiTask = {
  id: number;
  goal_id: number;
  title: string;
  claimant: string | null;
  status: string;
  lease_until: number | null;
  pr_url: string | null;
};
export type Activity = {
  id: number;
  actor: string;
  kind: string;
  summary: string;
  created_at: number;
};
type Snapshot = {
  viewer?: string;
  goals: Goal[];
  featured: Goal | null;
  notes: Note[];
  agents: Agent[];
  activity: Activity[];
  stats: { agents_running: number; contributors: number; prs_merged: number };
};

export function timeAgo(timestamp: number) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp * 1000) / 60000),
  );
  return minutes < 1
    ? "Just now"
    : minutes < 60
      ? `${minutes} min ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} hours ago`
        : `${Math.floor(minutes / 1440)} days ago`;
}
function mapGoal(goal: ApiGoal): Goal {
  return {
    id: String(goal.id),
    title: goal.title,
    description: goal.description,
    category: "Community",
    votes: goal.votes,
    status:
      goal.visibility === "pending"
        ? "Awaiting approval"
        : goal.status === "done" || goal.progress.percent_done === 100
          ? "Complete"
          : goal.progress.total
            ? "Building"
            : "Up next",
    progress: goal.progress.percent_done,
    agents: goal.progress.claimed,
    total: goal.progress.total,
    done: goal.progress.done,
    repoUrl: safeLink(goal.repo_url) || undefined,
    live: true,
    viewerVoted: goal.viewer_voted,
  };
}
export function safeLink(url: string) {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}
export async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  if (!API_BASE) throw new Error("No API server configured.");
  const url = apiRequestUrl(API_BASE, path, location.origin);
  const response = await fetch(url, {
    method: options.method || "GET",
    signal: options.signal || AbortSignal.timeout(10000),
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      if (typeof payload.detail === "string") detail = payload.detail;
    } catch {
      /* Non-JSON gateway errors keep the generic message. */
    }
    throw new ApiError(
      detail ||
        (response.status === 401
          ? "Please sign in again to continue."
          : `The server could not complete this request (${response.status}).`),
      response.status,
    );
  }
  return response.json() as Promise<T>;
}
export function getSession(): Session | null {
  try {
    const value = sessionStorage.getItem(`swarm-notebook:session:${API_BASE}`);
    const session: Session | null = value ? JSON.parse(value) : null;
    return session &&
      typeof session.handle === "string" &&
      typeof session.token === "string"
      ? session
      : null;
  } catch {
    return null;
  }
}
export function saveSession(session: Session | null) {
  try {
    if (session)
      sessionStorage.setItem(
        `swarm-notebook:session:${API_BASE}`,
        JSON.stringify(session),
      );
    else sessionStorage.removeItem(`swarm-notebook:session:${API_BASE}`);
  } catch {
    /* Session can still be held in memory. */
  }
}

// Fallback for older servers without viewer_voted: keep only votes this tab
// knows about, keyed to the server and account (never to the demo profile).
export function getAccountVotes(handle?: string): string[] {
  if (!handle) return [];
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(`swarm-notebook:votes:${API_BASE}:${handle}`) || "[]",
    );
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}
export function saveAccountVotes(handle: string, votes: string[]) {
  try {
    sessionStorage.setItem(
      `swarm-notebook:votes:${API_BASE}:${handle}`,
      JSON.stringify(votes),
    );
  } catch {
    /* Voting still works when browser storage is unavailable. */
  }
}

async function fetchCommunity(token?: string) {
  const options = { token };
  return Promise.all([
    request<ApiGoal[]>("/goals", options),
    request<ApiGoal | null>("/goals/featured", options),
    request<ApiThread[]>("/threads", options),
    request<ApiTask[]>("/tasks", options),
    request<Snapshot["stats"]>("/stats", options),
    request<Activity[]>("/activity?limit=4", options),
  ]);
}

export function useCommunity(
  session: Session | null,
  onSessionExpired: () => void,
) {
  const token = session?.token;
  const handle = session?.handle;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(API_BASE));
  const mounted = useRef(true);
  const activeToken = useRef(token);
  const generation = useRef(0);
  activeToken.current = token;
  const refresh = useCallback(async () => {
    if (!API_BASE) return;
    const requestId = ++generation.current;
    const isCurrent = () =>
      mounted.current &&
      activeToken.current === token &&
      generation.current === requestId;
    try {
      const [rawGoals, rawFeatured, threads, tasks, stats, activity] =
        await fetchCommunity(token);
      const goals = rawGoals.map(mapGoal);
      const next: Snapshot = {
        viewer: handle,
        goals,
        featured: rawFeatured ? mapGoal(rawFeatured) : null,
        stats,
        activity,
        notes: threads.map((thread) => ({
          id: String(thread.id),
          name: thread.author,
          initials: thread.author.slice(0, 2).toUpperCase(),
          color: "green",
          type: "Discussion",
          title: thread.title,
          body: thread.body,
          replies: thread.comment_count,
          time: timeAgo(thread.created_at),
          category: String(thread.goal_id || "community"),
        })),
        agents: tasks
          .filter(
            (task) =>
              task.status === "claimed" &&
              task.claimant &&
              task.lease_until &&
              task.lease_until > Date.now() / 1000,
          )
          .map((task) => ({
            name: `${task.claimant}’s agent`,
            initials: task.claimant!.slice(0, 2).toUpperCase(),
            color: "green",
            task: task.title,
            tool: "Local agent",
            state: "Claimed",
            branch: `Task #${task.id}`,
            taskId: task.id,
            prUrl: task.pr_url ? safeLink(task.pr_url) : undefined,
          })),
      };
      if (isCurrent()) {
        setSnapshot(next);
        setError("");
      }
    } catch (cause) {
      if (isCurrent()) {
        if (token && cause instanceof ApiError && cause.status === 401) {
          // Clearing auth triggers a public refresh; never keep another
          // viewer's cached flags selected after their session has ended.
          onSessionExpired();
          setError("");
        } else {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to reach the community server.",
          );
        }
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [token, handle, onSessionExpired]);
  const updateVote = useCallback(
    (id: string, votes: number, viewerVoted: boolean) => {
      setSnapshot((current) => {
        if (!current) return current;
        const update = (goal: Goal): Goal => ({
          ...goal,
          viewerVoted: current.viewer === handle ? goal.viewerVoted : undefined,
          ...(goal.id === id ? { votes, viewerVoted } : {}),
        });
        return {
          ...current,
          viewer: handle,
          goals: current.goals.map(update),
          featured: current.featured ? update(current.featured) : null,
        };
      });
    },
    [handle],
  );
  useEffect(() => {
    mounted.current = true;
    setLoading(Boolean(API_BASE));
    void refresh();
    const timer = API_BASE
      ? setInterval(() => void refresh(), 20000)
      : undefined;
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh]);
  return {
    snapshot, error, loading, refresh, updateVote, live: Boolean(snapshot),
  };
}
