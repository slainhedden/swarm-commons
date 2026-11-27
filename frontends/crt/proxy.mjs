import { isIP } from "node:net";

export function upstreamHeaders(req, host, trustRailwayClientIp = false) {
  const edgeIp = req.headers["x-real-ip"];
  const clientIp = trustRailwayClientIp && typeof edgeIp === "string" && isIP(edgeIp)
    ? edgeIp
    : req.socket.remoteAddress;
  return {
    ...req.headers,
    host,
    // Replace browser-supplied IP headers unless a trusted edge overwrites them.
    // Uvicorn and the backend's opt-in rate limiter then see the same client.
    "x-real-ip": clientIp,
    "x-forwarded-for": clientIp,
  };
}
