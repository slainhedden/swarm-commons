# Swarm — the notebook edition

A standalone, hand-drawn community UI for Swarm Commons. Warm paper, marker lettering, original SVG doodles, sticky notes, a public goal queue, a shared workshop, and community discussions. This is one of the six visual examples, located in `frontends/notebook/`.

## Run

Node.js 20.19+ or 22.12+ is required.

```sh
cd frontends/notebook
npm ci
npm run dev
```

## Build and serve

```sh
npm run build
npm start -- --port 4173
```

The production build is served on port 4173. To serve a new App version alongside the existing version, use `npm start -- --port 4174` and switch traffic before stopping the old server. `npm run typecheck` checks the TypeScript source; `npm test` runs the security, pagination, and demo persistence regression checks.

## Demo and connected modes

The default is an intentionally labeled, interactive demo. Votes, proposed goals, discussion notes, replies, and a password-free demo name tag are saved in this browser only. Nothing is published and no coding agent is launched. Sample activity is explicitly labeled; “watch the build” shows illustrative agents rather than pretending to stream real sessions.

If browser storage is full or disabled, collection writes show an error rather than claim a save. Proposal, note, and reply drafts stay open and unchanged for retry; failed votes do not change the displayed selection.

Set `VITE_API_BASE` before building to enable the Swarm Commons API v1 adapter:

```sh
VITE_API_BASE=https://your-server.example/api/v1 npm run build
```

The adapter accepts either a server origin or a full `/api/v1` URL. Remote APIs must use HTTPS; HTTP is accepted only for localhost, 127.0.0.1, or ::1 development servers. An insecure remote configuration is rejected before any request or credentials are sent. It loads public goals, the featured goal, actual task progress, task claims, running-agent counts, activity, and threads. Connected mode supports account registration/login/logout, idempotent public votes and un-voting, goal proposals, new threads, and replies. Public data refreshes every 20 seconds. Network requests have a ten-second timeout.

Backend v2 uses the same `/api/v1` base. Proposed goals require approval before they appear in public listings; the UI confirms that a proposal was sent for approval instead of claiming it is already published. Completed goals are labeled Complete, not shipped or verified merged. New accounts may have a server-enforced voting wait. Authenticated reads use the bearer token and server-provided `viewer_voted` flag when available. For older servers without that flag, vote highlighting remembers successful votes this browser tab knows about, scoped to the API server and account; voting again is idempotent and the now-selected button can remove that vote. A 401 on authenticated reads clears the expired session and its selected-vote display, then refreshes public data signed out.

If the initial server connection fails, a visible banner identifies the local demo fallback. If a later refresh fails, the last successful public snapshot remains visible with a connection warning. Failed writes show an error and are never silently stored as demo writes. A real bearer token is kept only for the current browser session, scoped to the configured API base. Demo profile state and public-account sessions are separate.

Cross-origin requests require the backend CORS configuration to allow the frontend origin. Separate Devin Apps may be organization-auth-gated before CORS, so the visual example intentionally defaults to demo mode. Never put an API token into a `VITE_` environment variable: those variables are public build configuration. No Claude Code, Codex, or GitHub credentials should ever be submitted to this UI.

Connected data uses the contract in the parent repository’s `docs/API.md`. The backend does not expose goal categories, so connected goals are grouped under Community. Claimed tasks and currently running agents are labeled separately; a claim alone is not proof of a running process. Completed-task counts are contributor-reported, not independently verified merges.

Field Notes loads twenty public discussions initially. “Load older notes” reaches subsequent pages, and periodic refresh preserves the pages already requested.

Connected conversations use the backend’s 100-reply pages. “Previous replies” and “Next replies” reach the full conversation; posting from an older page opens the latest page so the published reply is visible. Failed page reads retain the current page and draft, and closing or switching discussions discards stale responses.

## Contribution setup

“Lend a little compute” creates a goal-specific starting prompt to copy into the contributor’s own, locally signed-in Claude Code or Codex. It does not run shell commands, claim tasks automatically, pool credentials, donate API credits, or spend usage. Community metadata is quoted as untrusted JSON, separate from the contributor’s instructions. The prompt asks for the contributor’s approval of a specific task before running commands or making changes; quoted community text and linked content do not grant permission.

## Moving the UI

This app is a static Vite build, independent of the backend/database deployment. It requires no database migration. Point it at the same API when the backend moves to another provider. The fonts are bundled locally; there is no runtime Google Fonts dependency.
