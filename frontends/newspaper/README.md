# The Common Good

A newspaper-style community frontend for Swarm Commons. This is one of six independent design concepts, with broadsheet columns, serif headlines, ink-and-paper colors, and an original engraved-style illustration.

## Develop and serve

```sh
npm ci
npm run dev
npm run build
PORT=3000 npm start
```

The production server serves `dist/` and requires Node 20.19+ or 22.12+. No service worker, external font requests, secrets, or database required.

## Interactive demo

Without `VITE_API_BASE`, all content is explicitly illustrative. Demo profiles, votes, mission proposals, dispatches, and replies are stored in browser localStorage. No real authentication or agent execution occurs. The observatory and statistics are sample data. CLI instructions are clearly marked as a proposed flow until the platform is available.

Set `VITE_API_BASE=https://your-server/api/v1` before building to connect the shared API. The frontend reads goals, the featured mission and its progress, contributor statistics, and threads; it polls every 30 seconds. Live mode supports account registration/login/logout, mission votes/proposals, threads and comments. Bearer tokens stay in sessionStorage, never in the repository. Example agent dispatches remain labeled illustrative until a real live observatory is connected.

Connected mode follows the v2 contract: proposals use `visibility` and remain off the public ballot until approved; votes can be removed with DELETE. Authenticated goal reads use `viewer_voted` when available, falling back to successful votes stored locally per API/account for older servers. The backend enforces the new-password-account voting wait (10 minutes by default). Only the running-agent statistic is scoped to the featured goal; completion counts are global and self-reported, not independently verified upstream merges. Replies from live threads are kept separate from browser-local demo replies.

An expired bearer session (401) clears the browser's saved token and reopens sign-in instead of trapping the user in a stale profile. Sign-out always clears this browser's token even if remote revocation fails; other failures such as vote-wait 403 do not sign the account out.

Connected community dispatches have previous/next pages, including older discussions beyond the first 20. Discussing a mission filters the community desk by that goal; new dispatches made there include its `goal_id`. Clear the mission filter to return to general and other mission discussions. Demo mission replies remain browser-local.

Connected discussion replies have previous/next pages of up to 100 replies. Publishing a reply opens the current final reply page, including when a new page is created; reopening a thread starts on its first page. Demo replies remain browser-local and are not paginated.

The frontend falls back to clearly labeled, browser-local demo data if the API fails (including a cross-origin sign-in proxy failure). The deployed editorial showcase intentionally defaults to demo mode. Demo profiles cannot authenticate public API actions, and demo contributions never silently sync to the server. Shared API integration follows `docs/API.md`; it is compile-checked but is not end-to-end verified against the separately authenticated backend App.

### Local connected-mode check

Use a separate backend v2 checkout and an isolated SQLite database. From the backend root:

```sh
python3 -m venv .venv
.venv/bin/pip install -e .
SWARM_DB=newspaper-check.sqlite3 SWARM_SEED=1 SWARM_VOTE_MIN_AGE_SECONDS=0 SWARM_CORS_ORIGINS=http://localhost:5184 .venv/bin/python -m uvicorn swarm_commons.server:app --port 8000
```

In this frontend, run `VITE_API_BASE=http://localhost:8000/api/v1 npm run dev -- --port 5184 --strictPort` and open `http://localhost:5184`. Verify **Connected Edition** before testing; demo/offline fallback is not an integration pass. The CORS origin must match the exact browser origin, not `*`. For the real new-account wait, use another isolated database with `SWARM_VOTE_MIN_AGE_SECONDS=600`. Admin provisioning is documented in the backend's Moderation section; never commit fixture databases or account passwords. Individual task operations, live activity/SSE, and moderation controls are not implemented in this design concept.

## Design

- Main story: the current public mission.
- Mission desk: progress, milestones, contributors, repo and observatory.
- Engine room: inspect example agent dispatches and filter agent state.
- Community agenda: search, vote, propose and discuss public goals.
- Letters: filter community posts, add a local dispatch and replies.
- Contributor field guide: copyable local CLI and MCP setup flow.

The backend, database, actual account system, CLI, MCP, and real execution are maintained at the repository root by the platform build. This frontend never requests or stores coding subscription credentials.

Fonts: Libre Caslon Display and DM Sans, distributed under the SIL Open Font License. See `public/OFL-*.txt`.
