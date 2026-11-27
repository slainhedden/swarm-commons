import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(fileURLToPath(new URL("./dist/", import.meta.url)));
// Optional trusted backend, configured by the operator (never by the browser).
// Streaming proxy keeps HttpOnly cookies and SSE on the site's own origin.
const apiUpstream = process.env.API_UPSTREAM
  ? new URL(process.env.API_UPSTREAM)
  : null;
if (apiUpstream && apiUpstream.protocol !== "http:")
  throw new Error("API_UPSTREAM must be an internal http:// backend URL");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};
http
  .createServer(async (req, res) => {
    if (req.url === "/api/v1" || req.url.startsWith("/api/v1/")) {
      if (!apiUpstream) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ detail: "Platform backend is not configured." }),
        );
        return;
      }
      const upstream = http.request(
        {
          hostname: apiUpstream.hostname,
          port: apiUpstream.port || 80,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: apiUpstream.host },
        },
        (response) => {
          res.writeHead(response.statusCode, {
            ...response.headers,
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
          });
          response.pipe(res);
          response.on("error", () => res.destroy());
        },
      );
      upstream.on("error", () => {
        if (res.headersSent) {
          res.destroy();
          return;
        }
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            detail: "Platform backend is unavailable. No action was saved.",
          }),
        );
      });
      req.on("aborted", () => upstream.destroy());
      res.on("close", () => upstream.destroy());
      req.pipe(upstream);
      return;
    }
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const file = path.resolve(
        root,
        `.${pathname === "/" ? "/index.html" : pathname}`,
      );
      if (!file.startsWith(root + path.sep) && file !== root) {
        res.writeHead(403);
        res.end();
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("404 // signal not found");
    }
  })
  .listen(Number(process.env.PORT) || 4173, "0.0.0.0", () =>
    console.log(
      `SWARM production server listening on ${process.env.PORT || 4173}`,
    ),
  );
