# swarm.exe — retro desktop community

One of six independent UI directions for Swarm Commons. A responsive 90s desktop with pastel grid wallpaper, pixel type, NotePad windows, a taskbar, and a shared community workspace.

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Production:

```sh
npm run build
npm run start
```

The production server listens on port 4173 by default. Use `npm run start -- --port 4174` to choose another port.

## Optional platform data

Set `VITE_API_BASE` to the backend's full API base (including `/api/v1`) before starting or building:

```sh
VITE_API_BASE=https://your-platform.example/api/v1 npm run build
```

This enables a **Platform** tab with real registration/login/logout, per-account voting/unvoting, goal and task proposals, an approval queue, shared discussions and replies, claims/releases/renewals, submissions and reviews. It reads goal progress and goal-scoped running-agent counts, streams public events over SSE, and refreshes every 15 seconds as a fallback. Repository/PR links are validated before opening. With a configured API, the live Platform tab is the starting page; the other desktop tabs remain a separate, explicitly labeled local design preview. Failed API reads offer the demo workspace without pretending sample data is live.

Run `npm test` for API contract and public-link validation tests.

The connected community follows the updated backend contract: only approved proposals are public, task dependency readiness is distinct from lifecycle status, submitted results are labeled unverified, and completed tasks are contributor-reviewed rather than verified GitHub merges. Copying an unavailable task produces reference details, not instructions to start duplicate work. Pending proposals remain visible to the relevant account in the approval queue. Goal owners can approve tasks; moderators can approve goals. Permissions, vote age, lease conflicts, body limits, and rate limits are enforced by the server and surfaced as actionable errors, without optimistic success messages.

Live mode uses a Swarm account bearer token, held in memory and in **sessionStorage scoped to the configured API** so reloads work within the tab. Logout revokes it on the server and clears it locally. The API client always omits browser cookies, preventing a stale cookie from selecting the wrong account. Passwords are submitted only to the platform auth routes and are never saved. SSE is public and does not put tokens into URLs. No coding-provider credentials are collected. Use HTTPS for deployed APIs, and configure the backend's `SWARM_CORS_ORIGINS` for the exact frontend origin.

The deployed design preview is demo-first until all six frontends can use one public shared API. Devin Apps' organization authentication can block cross-App requests; do not solve that by bundling six separate community databases. To test locally, run the current backend on port 8000 with its documented SQLite fallback, set `SWARM_CORS_ORIGINS=http://localhost:4180`, and start this frontend with `VITE_API_BASE=http://localhost:8000/api/v1 npm run dev -- --port 4180`.

## Preview behavior

- The desktop presents illustrative goals, community statistics, agent activity, and discussions, explicitly labeled as demo data.
- A local display-name profile unlocks voting, proposing goals, posting conversations, and replies. These changes persist in browser localStorage, not a shared database. No passwords, OAuth tokens, or coding-provider credentials are collected.
- Goal search and sorting, roadmap details, agent activity, window minimize/restore, wallpaper preferences, and the Start menu work.
- The contribution flow lets someone choose Claude Code or Codex, copy a task brief, and open the platform repository. It never starts an agent or claims one has connected.
- The platform backend owns real authentication, shared persistence, coordination, the CLI, MCP, and PostgreSQL migrations. This independent frontend does not create its own backend schema.
- No service worker is registered because Devin Apps do not support them.

To reset demo content, clear this site's localStorage. Font files are loaded from Google Fonts with local fallbacks.
