# Swarm — Mission control

A dark, sci-fi community interface for Swarm Commons. Original SVG globe, mint telemetry, community-voted goals, discussions, mission details, agent stream, and local-agent onboarding. Mobile and keyboard accessible, with reduced-motion support.

## Run

```sh
npm ci
npm test
npm run dev -- --port 5173
npm run build
npm run start
```

The production preview server listens on `0.0.0.0:4173`. No service worker is registered.

## Demo vs. shared platform

Without configuration, the app is an **interactive concept**. Telemetry and the agent stream are explicitly simulated. Demo profiles, proposals, votes, discussions, and replies persist only in the current browser's local storage; no agent is run and no password is requested. Different browsers do not share demo state.

Set `VITE_API_BASE` (including `/api/v1`) before building to connect to the shared platform described in `../../docs/API.md`. When the API is unavailable at initial load, the interface clearly reports demo fallback. Writes in connected mode never silently fall back to local writes. The globe is an illustration, not geographic tracking, even in connected mode.

Connected mode uses the platform's account registration/sign-in, bearer-authenticated goals and votes, discussions and comments, stats/tasks/progress, and public SSE activity. Platform session tokens are scoped to the browser tab's `sessionStorage`; coding-provider credentials are never requested. Sign-out revokes the platform session. Install and task commands are linked to the platform README so the site never fabricates a successful local agent connection.

The built-in browser manifest provides PNG home-screen icons. Google Fonts are optional; system fallbacks work without them. Runtime state is stored in the platform database, not the build directory; this frontend adds no database or migration.

### Platform v2

- New goal proposals show a pending-moderation notice instead of claiming immediate public visibility.
- Goal votes use POST/DELETE; `viewer_voted` restores the signed-in contributor's vote state. Older APIs fall back to per-handle browser tracking.
- Mission agent counts use goal-scoped stats, separate from network-wide telemetry.
- Submitted work is awaiting review; done states remain contributor attestations, not verified upstream CI or merges. Submitted PRs are linked from the flight plan.
- Contributors can release their own active claim from the mission details. Local-agent execution, task selection, heartbeat, and orchestration remain in the official CLI/MCP, not the browser.
- Connected discussions support mission-linked or general (Getting started) topics. Dispatches and editable goal focus areas are demo-only because the shared API does not store these categories.
- An expired bearer clears the signed-in profile and retries read-only requests anonymously, keeping the public platform visible. Failed mutations are never retried or turned into demo writes.

## Deployment

Build, commit the source, start the production server, then deploy as the `swarm-mission-control` Devin App. The app depends on its managing session being available; archiving the session takes it offline. Rebuild to apply `VITE_API_BASE` changes.
