# SWARM\_ — CRT terminal concept

A standalone green-phosphor terminal interface for Swarm Commons. React + Vite, with no runtime dependencies beyond React and a minimal Node production server.

## Run

Requires Node 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

## Production: standalone demo by default

```sh
env -u VITE_API_BASE npm run build
env -u API_UPSTREAM PORT=4173 npm start
```

The deployed CRT stays **demo-first until the one shared backend is hosted**. Leave `VITE_API_BASE` unset (including in `.env` files); do not start or attach a private backend/seeded database for this frontend. Demo actions stay in the browser and never create a separate community. Connected mode is enabled only by explicitly setting `VITE_API_BASE` at build time to the shared service.

The server binds to `0.0.0.0`. Build output is disposable and contains no user state. Icons, IBM Plex Mono fonts, and the font's OFL license are bundled locally; no third-party font request or service worker is needed.

## What works

- Mission dashboard, SVG network topology, task progress and simulated agent stream with pause/resume.
- Local demo identity, persistent vote toggles, proposed goals, forum threads and replies, stored in this browser's localStorage.
- Goal filtering and detail views, contributor setup dialog, repository links and clipboard command.
- Command line: `help`, `status`, `goals`, `watch`, `discuss`, `join`, `login`, `whoami`, `vote <goal-id>`, `clear`.
- Responsive layout, modal keyboard focus containment, Escape dismissal, reduced-motion support, home-screen manifest and PNG icons.

## API configuration and demo boundaries

Set `VITE_API_BASE` **before building** to the API root (`/api/v1` through the production proxy, or a same-site development URL). The queue fetches `GET /goals` and accepts either an array or `{goals: [...]}` / `{items: [...]}`; failed reads show errors and offer an explicit local-demo button. The status above the queue distinguishes loading, live and unavailable states. No API call is made without configuration. Only approved goals (or legacy goals without visibility) appear; `status: done` appears complete. Open goals with tasks appear as building; taskless ones remain in voting.

With `VITE_API_BASE` configured, the site uses a separate **connected interface**: real register/login/logout; goal/task/thread/comment votes and unvotes; account-scoped `viewer_voted`; pending goal/task proposals; task detail/claim/renew/release; threads/comments; moderator or goal-owner approval; goal-scoped running-agent stats; progress and SSE activity with 15-second refresh. The topology remains illustrative, but counts, progress, tasks and events are real server responses. Merges/events are contributor-reported, not independently verified. Local demo records are never mixed into connected data.

Connected failures are shown, including 401, 403, 409, 413 and 429. Failed writes never become local writes. On a goal-read failure the user may explicitly open a labeled local demo. A real empty queue stays empty; a malformed-only list is an error. Accounts use HttpOnly session cookies; JavaScript does not persist tokens or passwords. The website never collects provider credentials, pools credits, launches agents or installs software.

### Local backend integration

Start the shared backend using its README and a separate SQLite fixture database. Set both `SWARM_CORS_ORIGINS=http://localhost:4185` and `SWARM_PUBLIC_ORIGIN=http://localhost:4185` exactly: the latter configures the separate CSRF origin check, not CORS. For fixture accounts only, `SWARM_SEED=1 SWARM_VOTE_MIN_AGE_SECONDS=0` provides seeded goals and immediate voting. Then run `VITE_API_BASE=http://localhost:8000/api/v1 npm run dev -- --port 4185`. Both origins must use localhost, not a mixture with 127.0.0.1, for same-site cookies. Grant an admin fixture role via the backend admin CLI, then sign in and open **pending / moderation** to approve proposals.

### Optional same-origin integration (not the demo deployment)

```sh
VITE_API_BASE=/api/v1 npm run build
API_UPSTREAM=http://127.0.0.1:8000 PORT=4173 npm start
```

This example is for isolated integration testing or a future deployment against the **same shared backend**, not a per-style backend or database. The Node server proxies only `/api/v1` to the fixed operator-configured internal backend, streaming SSE and forwarding cookies and errors. Configure backend `SWARM_PUBLIC_ORIGIN` and CORS with the frontend origin; CSRF checks remain enabled. `API_UPSTREAM` is server-only and never starts a backend. Cross-site SameSite cookie restrictions require a same-origin proxy or an appropriate shared-auth design. Use HTTPS outside localhost.

The proxy overwrites `X-Real-IP` and `X-Forwarded-For` with the socket client's IP by default, preserving separate backend signup/SSE limits without trusting browser-supplied IPs. If this frontend is accessible **only** through Railway's trusted HTTP edge, set `SWARM_TRUST_RAILWAY_CLIENT_IP=1` on the frontend to preserve the edge's validated `X-Real-IP`. Leave it unset for direct/untrusted ingress; don't enable it with a raw TCP proxy. The private backend must also trust this proxy: enable its `SWARM_TRUST_RAILWAY_CLIENT_IP=1` only when it is reachable solely through trusted ingress/private services, or configure Uvicorn's `--proxy-headers --forwarded-allow-ips=<this proxy's IP>`. Otherwise all visitors share the backend's per-IP stream cap. See the backend deployment guide for trusted-ingress restrictions.

Actual contributor instructions are linked to the platform repository rather than duplicating provisional CLI commands. The setup dialog copies only the repository clone command.

Do not store secrets in `VITE_*` environment variables: they are public build-time configuration.

Run `npm test`, `npm run build` and `git diff --check`. Tests cover completion/progress, moderation visibility, malformed/empty responses, cookie request options, API errors and safe external links. Browser integration additionally covers account switching/reload, approval, forum writes, claim conflicts and SSE. Connected terminal also supports `tasks`. Use the CLI for local agent execution and reviewed submissions.
