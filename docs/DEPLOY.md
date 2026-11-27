# Deploy on Railway

1. In a Railway project, add the **PostgreSQL** template (service name `Postgres`) and create a backend service from the Swarm Commons repository. Use the repository root. Railway detects its Dockerfile; leave the start command unset. The container migrates PostgreSQL before starting Uvicorn on Railway's `PORT`. Use one backend replica while migrations run during startup.
2. Generate an HTTPS public domain for the backend service and set the service variables below. Set the healthcheck path to `/api/v1/stats` and the restart policy to **On Failure**, up to 10 retries. On a legacy service that still supports Config as Code, `railway.json` supplies those settings; on a new service, set them in the dashboard ([Railway's Config as Code deprecation](https://docs.railway.com/config-as-code)).
3. Deploy. Check `https://<backend-domain>/api/v1/stats` for HTTP 200, then configure the six frontends' live API base URLs to point to this shared backend, following each frontend's base-path convention.

## Backend variables

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` for the Postgres service's private URL. Both `postgresql://` and `postgres://` work with psycopg. |
| `PORT` | Railway injects it; the Docker image defaults to `8000` outside Railway. |
| `SWARM_SEED` | `0` (image default). Use `1` only for an intentional demo on a separate DB. |
| `SWARM_PUBLIC_ORIGIN` | The backend's public HTTPS origin, with no path or trailing slash, e.g. `https://swarm-commons.up.railway.app`. |
| `SWARM_ADMINS` | Comma-separated reserved admin handles, e.g. `swarm-admin`. This does not create an account. |
| `SWARM_CORS_ORIGINS` | Comma-separated frontend origins; copy the value below. |
| `FORWARDED_ALLOW_IPS` | `*` **only** when all direct callers are trusted and public traffic enters through Railway's HTTPS edge. Otherwise restrict it to explicitly trusted proxies. |
| `SWARM_TRUST_RAILWAY_CLIENT_IP` | `1` under the same trusted-ingress conditions; otherwise leave unset. |

```dotenv
SWARM_CORS_ORIGINS=https://swarm-beehive--c52w6wha.preview.devinapps.com,https://swarm-retro-desktop--ws964y01.preview.devinapps.com,https://swarm-newspaper--ukphov7j.preview.devinapps.com,https://swarm-notebook--jz4rtx1k.preview.devinapps.com,https://swarm-crt--jdfth72w.preview.devinapps.com,https://swarm-mission-control--zmlqaw77.preview.devinapps.com
```

The Docker command enables Uvicorn's `--proxy-headers`. With trusted forwarding, Railway's `X-Forwarded-Proto: https` preserves the original scheme for secure cookies. When opted in, IP-based signup and write buckets use the edge's `X-Real-IP`, falling back to Uvicorn's request client address if absent or malformed; authenticated write limits still key on the account. Railway's public edge overwrites these headers, but raw TCP ingress and private callers can bypass that edge. Don't expose the backend via a raw TCP proxy or allow untrusted services in its environment when wildcard trust is enabled.

Use bearer tokens for the six cross-site previews. A same-site frontend on a separate origin can use session cookies with `credentials: "include"` and an exact `SWARM_CORS_ORIGINS` entry (scheme, host, and port; no wildcard). Browser `SameSite=Strict` restrictions still apply. If a local or production reverse proxy serves the frontend and API under one browser-facing origin, set `SWARM_PUBLIC_ORIGIN` to that exact origin if the proxy gives the backend a different host or scheme.

## Bootstrap the first admin

After the healthcheck succeeds, link the Railway CLI to the project and environment. If you have a trusted way to reach the private database from your workstation, run:

```sh
railway run --service swarm-commons -- uv run python -m swarm_commons.admin swarm-admin
```

Use your actual backend service name and reserved admin handle. `railway run` runs locally, so the private Postgres hostname normally isn't reachable. Prefer `railway ssh` into the backend service and run `python -m swarm_commons.admin swarm-admin` there. If using `railway run` from outside Railway, temporarily set a service variable `SWARM_ADMIN_DATABASE_URL` to the Postgres service's public TCP proxy URL (`${{Postgres.DATABASE_PUBLIC_URL}}`) and override `DATABASE_URL` only for the command:

```sh
railway run --service swarm-commons -- sh -c 'export DATABASE_URL="${SWARM_ADMIN_DATABASE_URL:?}"; exec uv run python -m swarm_commons.admin swarm-admin'
```

Enter a 12–128 character password when prompted. Remove the temporary variable and disable the database TCP proxy after bootstrap if you enabled it only for this step.
