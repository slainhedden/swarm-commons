import { API_BASE, normalizeGoals } from "./api.js";

export class ApiError extends Error {
  constructor(status, detail) {
    const advice = {
      401: "Sign in again to continue.",
      403: "The server has not allowed this action.",
      409: "The item changed or conflicts with an existing action. Refresh and try again.",
      413: "Your submission is too large. Shorten it and try again.",
      429: "Retry when the server's limit resets.",
    }[status];
    super(
      `HTTP ${status} // ${detail || advice || "Request failed."}${detail && advice ? ` ${advice}` : ""}`,
    );
    this.status = status;
  }
}

export async function request(route, { method = "GET", body, signal } = {}) {
  const response = await fetch(`${API_BASE}${route}`, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal || AbortSignal.timeout(12000),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      "The service returned an unreadable response; it may require proxy sign-in.",
    );
  }
  if (!response.ok) {
    const detail = Array.isArray(payload?.detail)
      ? payload.detail
          .map(
            (item) => `${item.loc?.slice(1).join(".") || "input"}: ${item.msg}`,
          )
          .join("; ")
      : payload?.detail;
    throw new ApiError(
      response.status,
      typeof detail === "string" ? detail : "Request failed.",
    );
  }
  return payload;
}

export function connectedGoals(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : (payload?.goals ?? payload?.items);
  return normalizeGoals(payload).map((goal) => ({
    ...rows.find((row) => String(row?.id) === goal.id),
    ...goal,
  }));
}

export function canApproveProposal(kind, item, moderator, goals, handle) {
  if (moderator) return true;
  return (
    Boolean(handle) &&
    kind === "tasks" &&
    goals.some(
      (goal) =>
        String(goal.id) === String(item.goal_id) && goal.author === handle,
    )
  );
}

export function safeUrl(value, fallback = "#") {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : fallback;
  } catch {
    return fallback;
  }
}
