import test from "node:test";
import assert from "node:assert/strict";
import { upstreamHeaders } from "../proxy.mjs";

test("distinct proxy clients retain separate backend SSE rate-limit identities", () => {
  for (const trustedEdge of [false, true]) {
    const addresses = new Set();
    for (let index = 1; index <= 6; index++) {
      const clientIp = `192.0.2.${index}`;
      const headers = upstreamHeaders({
        headers: trustedEdge ? { "x-real-ip": clientIp } : {},
        socket: { remoteAddress: trustedEdge ? "10.0.0.1" : clientIp },
      }, "backend:8000", trustedEdge);
      addresses.add(headers["x-real-ip"]);
      assert.equal(headers["x-forwarded-for"], clientIp);
    }
    assert.equal(addresses.size, 6);
  }
});

test("untrusted IP headers cannot bypass per-client backend limits", () => {
  const headers = upstreamHeaders({
    headers: {
      "x-real-ip": "198.51.100.1",
      "x-forwarded-for": "198.51.100.2, 198.51.100.3",
      cookie: "session=test",
      origin: "https://commons.example",
      "last-event-id": "123",
    },
    socket: { remoteAddress: "::ffff:192.0.2.1" },
  }, "backend:8000");
  assert.equal(headers["x-real-ip"], "::ffff:192.0.2.1");
  assert.equal(headers["x-forwarded-for"], "::ffff:192.0.2.1");
  assert.equal(headers.host, "backend:8000");
  assert.equal(headers.cookie, "session=test");
  assert.equal(headers.origin, "https://commons.example");
  assert.equal(headers["last-event-id"], "123");
});

test("trusted ingress still rejects malformed client IPs", () => {
  for (const value of [undefined, "not-an-ip", "192.0.2.1, 192.0.2.2", ["192.0.2.1"]]) {
    const headers = upstreamHeaders({
      headers: { "x-real-ip": value },
      socket: { remoteAddress: "10.0.0.1" },
    }, "backend:8000", true);
    assert.equal(headers["x-real-ip"], "10.0.0.1");
    assert.equal(headers["x-forwarded-for"], "10.0.0.1");
  }
});
