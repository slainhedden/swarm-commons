// The optional API speaks the platform contract documented in docs/API.md.
// No coding-provider credentials ever enter this app.
export const API_BASE =
  import.meta.env?.VITE_API_BASE?.replace(/\/$/, "") || "";
let token = "";
try {
  token = sessionStorage.getItem("hive-platform-token") || "";
} catch {}
export function saveToken(value) {
  token = value || "";
  try {
    if (token) sessionStorage.setItem("hive-platform-token", token);
    else sessionStorage.removeItem("hive-platform-token");
  } catch {}
}
export function hasToken() {
  return Boolean(token);
}
export async function request(
  path,
  body,
  method = body === undefined ? "GET" : "POST",
) {
  const response = await fetch(API_BASE + path, {
    method,
    signal: AbortSignal.timeout(8000),
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(
      typeof data.detail === "string"
        ? data.detail
        : "That didn’t go through. Please try again.",
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
export async function updateGoalVote(id, removing) {
  return request(`/goals/${id}/vote`, undefined, removing ? "DELETE" : "POST");
}
export async function requestThreadPages(count = 1) {
  const pages = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      request(`/threads?page=${index + 1}&limit=20`),
    ),
  );
  return {
    items: [...new Map(pages.flat().map((thread) => [thread.id, thread])).values()],
    hasMore: pages.at(-1).length === 20,
  };
}
export function goalVoteIds(goals, handle, accountVotes) {
  if (!handle) return [];
  const fallback = accountVotes[`${API_BASE}:${handle}`] || [];
  return goals
    .filter((goal) =>
      typeof goal.viewer_voted === "boolean"
        ? goal.viewer_voted
        : fallback.includes(goal.id),
    )
    .map((goal) => goal.id);
}
export function goalFromApi(goal, index = 0, tasks = []) {
  return {
    ...goal,
    short: goal.title,
    tag: "Community-built",
    stage:
      goal.status === "done"
        ? "Complete"
        : goal.progress?.claimed ||
            goal.progress?.submitted ||
            goal.progress?.done
          ? "In progress"
          : "Up next",
    agents: goal.progress?.claimed || 0,
    progressDetail: goal.progress,
    progress: goal.progress?.percent_done || 0,
    color: ["sage", "orange", "purple"][index % 3],
    icon: ["map", "sprout", "spark"][index % 3],
    tasks: tasks.filter((t) => t.goal_id === goal.id).map((t) => t.title),
  };
}
export function threadFromApi(thread) {
  return {
    ...thread,
    initials: thread.author.slice(0, 2).toUpperCase(),
    color: "sage",
    category: thread.goal_id ? "Mission conversation" : "The commons",
    replies: thread.comments || [],
    replyCount: thread.comment_count || 0,
    time: new Date(thread.created_at * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
  };
}
