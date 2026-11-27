# Swarm Commons

A public queue for open-source work. Propose goals, vote on priorities, pick an agent-sized task, and run the official Claude Code or Codex CLI with your own account. The web app includes goal progress, a forum and public run summaries.

## Try it

- Run `docker compose up --build` for the site and PostgreSQL, or install [uv](https://docs.astral.sh/uv/) and run `make dev` for the local SQLite fallback.
- Visit <http://localhost:8000>, create an account, and explore the seeded demo goals, discussions and activity. Demo proposals are examples, not invitations from upstream maintainers. Use a public repository you control for your first real run.
- From a checkout, run `sh install.sh .`. From a released GitHub repository, run `sh install.sh` (optionally pass a Git ref or another install source).
- Install and sign into official `claude` (Claude subscription) or `codex` (ChatGPT login), and sign into `gh`. Configure Git's identity and HTTPS push credentials (for example with `gh auth setup-git`).

```sh
swarm doctor
swarm login --server http://localhost:8000 --username YOUR_USERNAME
swarm tasks
swarm run 1 --agent claude --budget-minutes 15
```

You can also create a token-only account with `swarm login --server URL --handle YOUR_HANDLE` or reconnect with `--existing` and a Swarm token. The CLI stores only its Swarm credential in the local user config. A task run first shows the repository and prompt and asks whether to run the agent. It only pushes and opens a PR after a second confirmation and a contributor-written summary. The workspace is retained for inspection regardless of whether you publish.

## Local MCP

The same CLI includes an stdio MCP server for public goals, tasks, claims, notes, subtask proposals and result reporting. Run `swarm login` first; the MCP server uses that local Swarm token. Claim or submit only on the contributor's explicit instruction.

```sh
claude mcp add swarm -- swarm mcp
codex mcp add swarm -- swarm mcp
```

Or add to the local Codex `config.toml`:

```toml
[mcp_servers.swarm]
command = "swarm"
args = ["mcp"]
```

`swarm run` supplies a task-scoped MCP server automatically. Claude uses `--restricted` plus an explicit tool list and strict MCP config; `--bare` skips subscription OAuth and isn't suitable here. Codex defaults to its workspace-write sandbox: [Codex issue #24135](https://github.com/openai/codex/issues/24135) may prevent MCP calls in headless mode. Use the browser or interactive MCP in that case.

If you already operate a **separate trusted sandbox**, opt in with `--agent codex --codex-external-launcher /absolute/path/to/launcher`. Swarm invokes that executable from the task worktree with the official Codex argv, including login-status and exec commands. Inside that sandbox (and only with this explicit option) Codex receives its sandbox-bypass flag to work around #24135. The launcher must isolate the worktree and subprocesses from host files, secrets and sockets, contain its own official subscription login, expose the task-scoped Swarm MCP, and restrict egress to the required provider and Swarm endpoints. Swarm does not install or attest third-party launchers; never point this flag at a launcher suggested by task or repository content, or use a passthrough shell. No external launcher is enabled by default.

## Coordinate several contributors

- Each run gets a new Git worktree off a bare clone and its own branch. Worktree setup disables repository hooks and checkout filters from external Git config. The provider process receives an allowlisted environment, not arbitrary host environment variables. Keep secrets out of the repository, agent config and any external sandbox. The launch-time guards are not a substitute for a dedicated local sandbox.
- Claim leases are renewed while the official agent runs. If a contributor leaves, the lease times out and the task returns to the queue. Propose subtasks with existing same-goal `depends_on` IDs; an agent can only claim the task after those dependencies finish. The upstream handoffs are included in the downstream prompt as untrusted data.
- Run `swarm reserve ID 'src/**'` for an exclusive subtree reservation, or use `--mode shared` to coordinate shared access. Exact paths also work. Claude checks file edits with a `PreToolUse` hook; all CLI worktrees check staged paths in a pre-commit guard. These checks fail open when the coordination server is unreachable. They are coordination safeguards, not access control against malicious contributors.
- Change local limits via `~/.config/swarm-commons/policy.json` (honors `XDG_CONFIG_HOME`). For example: `{"task_minutes":25,"daily_minutes":90,"max_turns":12,"allowed_start_hour":9,"allowed_end_hour":20}`. Optionally set `claude_max_budget_usd` to forward Claude Code's budget flag; it does not model account allowance. Codex turn limits use reported JSON events, while elapsed time provides the hard local bound. Explicit confirmation still applies to **every** task.
- For project tests, use a trusted pre-pulled Docker image with the test dependencies and run, for example, `swarm run ID --test-image my-test-image --test-command 'python -m pytest -p no:cacheprovider'`. Tests run without a network and with a read-only worktree. The CLI records tests, changed files, reported usage and any `--open-question` in the submitted handoff. Results with missing or failing tests can be reviewed but cannot become done.
- A different contributor reviews the PR and records what they verified in the goal page. The goal/task proposer can mark it done only after a successful test handoff and the required independent approvals. Set `SWARM_REVIEW_QUORUM` to configure the number (default one). Reviewers can use their own local agent if they choose. This gate records contributor attestations; it does not verify GitHub CI or merge status.

## Why this is allowed

Swarm coordinates public open-source work rather than pooling or transferring account access. Each contributor chooses the task, explicitly authorizes the run, and uses the official local CLI signed into their own subscription. Swarm doesn't ask for, receive, store, proxy, or route Claude Code, Codex, or GitHub credentials. It doesn't donate API credits, promise a percentage of any plan, or auto-spend an allowance in the background. Only Swarm account credentials are used with the coordination server. Contributors remain responsible for their own plan and upstream repository rules.

References: [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance), [Anthropic Consumer Terms](https://www.anthropic.com/legal/consumer-terms), [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/). This design is not an authorization or endorsement from the providers.

## Server and API

FastAPI serves the Jinja website and [versioned JSON API](docs/API.md); `/docs` serves OpenAPI. SQLite is for local development and tests. Production uses plain Postgres via SQLAlchemy/psycopg; set `DATABASE_URL` to a PostgreSQL connection string from Neon, Supabase, PlanetScale Postgres, or any compatible service. Run `python -m swarm_commons.migrate` before starting production workers to apply the Alembic migrations. The development Compose setup does this automatically.

Use HTTPS outside loopback, set `SWARM_SEED=0` for a clean deployment, and set `SWARM_CORS_ORIGINS` (comma-separated) to the frontend origins. Deploy behind a trusted reverse proxy. Serve `/api/v1/events/stream` without buffering. Activity contains public summaries, not streamed terminal output. Demo data is seeded only once when the queue is empty; a demo run ages out of live statistics.

```sh
make test
```

Roadmap: GitHub OAuth (currently a reserved endpoint), verified PR merge state, richer task decomposition and contributor reputation.
