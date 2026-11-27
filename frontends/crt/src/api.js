// Set VITE_API_BASE to the platform's API root, for example https://host/api/v1.
// An unconfigured or unreachable API leaves the clearly labeled local demo intact.
export const API_BASE = (import.meta.env?.VITE_API_BASE || "").replace(
  /\/$/,
  "",
);
export async function loadPublicGoals(base = API_BASE) {
  if (!base) return null;
  const response = await fetch(`${base.replace(/\/$/, "")}/goals`, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Goal service returned ${response.status}`);
  return normalizeGoals(await response.json());
}

export function normalizeGoals(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : (payload?.goals ?? payload?.items);
  if (!Array.isArray(rows)) throw new Error("Unexpected goal response");
  const validRows = rows.filter(
    (g) => g && g.id != null && typeof g.title === "string",
  );
  // A real empty queue (or one containing only moderated goals) is valid.
  // A nonempty list with no goal records is an unexpected API response.
  if (rows.length && !validRows.length)
    throw new Error("Unexpected goal response");
  return validRows
    .filter((g) => g.visibility == null || g.visibility === "approved")
    .map((g) => ({
      id: String(g.id),
      title: g.title,
      description: g.description || "",
      tags:
        Array.isArray(g.tags) && g.tags.length
          ? g.tags.slice(0, 3).map(String)
          : ["COMMUNITY", "PUBLIC GOOD"],
      votes: Number(g.vote_count ?? g.votes ?? 0) || 0,
      state:
        g.status === "done"
          ? "SHIPPED"
          : Number(g.progress?.total || 0) > 0 ||
              ["active", "in_progress", "building"].includes(
                String(g.status || g.state).toLowerCase(),
              )
            ? "BUILDING"
            : "VOTING",
    }));
}
