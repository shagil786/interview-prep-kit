import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFetcher } from "./fetch.js";

let server: Server;
let base = "";
const html200 = `<!doctype html><html><head><title>Acme</title></head><body>
<a href="/careers">Careers</a><a href="/about">About us</a></body></html>`;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/ok") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html200);
    } else if (url === "/big") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("x".repeat(3000)); // exceeds the tiny test cap
    } else if (url === "/binary") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end("not html");
    } else {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("nope");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr && typeof addr === "object") base = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("createFetcher().fetchHtml", () => {
  it("returns html + status for a 200 text/html page", async () => {
    const { fetchHtml } = createFetcher();
    const page = await fetchHtml(`${base}/ok`);
    expect(page.status).toBe(200);
    expect(page.html).toContain('<a href="/careers">Careers</a>');
    expect(page.error).toBeUndefined();
    expect(page.contentType).toContain("text/html");
  });

  it("returns an error-bearing result (not a throw) for HTTP 404", async () => {
    const { fetchHtml } = createFetcher();
    const page = await fetchHtml(`${base}/missing`);
    expect(page.status).toBe(404);
    expect(page.error).toContain("404");
  });

  it("records an error when the body exceeds maxBytes", async () => {
    const { fetchHtml } = createFetcher({ maxBytes: 1024 });
    const page = await fetchHtml(`${base}/big`);
    expect(page.error).toMatch(/too large|limit/i);
  });

  it("records an error for a disallowed content type", async () => {
    const { fetchHtml } = createFetcher();
    const page = await fetchHtml(`${base}/binary`);
    expect(page.error).toMatch(/content-type|unsupported/i);
  });

  it("rejects a non-http(s) URL without fetching", async () => {
    const { fetchHtml } = createFetcher();
    const page = await fetchHtml("file:///etc/passwd");
    expect(page.error).toMatch(/url/i);
  });

  it("times out slow responses", async () => {
    const { fetchHtml } = createFetcher({ timeoutMs: 50 });
    const page = await fetchHtml("http://10.255.255.1:81/slow"); // unroutable -> hangs -> abort
    expect(page.error).toMatch(/tim(e|ed) out|abort/i);
  }, 5000);
});
