import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crawlDelayFor, isAllowed, type TextFetcher } from "./robots.js";

let server: Server;
let origin = "";
const fetcher: TextFetcher = {
  async fetchText(url) {
    const res = await fetch(url);
    return { status: res.status, text: await res.text() };
  },
};

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("User-agent: *\nDisallow: /private\nCrawl-delay: 1\n");
    } else {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr && typeof addr === "object") origin = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("isAllowed", () => {
  it("allows a public path", async () => {
    await expect(isAllowed(new URL(`${origin}/about`), fetcher)).resolves.toBe(true);
  });

  it("blocks a disallowed path", async () => {
    await expect(isAllowed(new URL(`${origin}/private`), fetcher)).resolves.toBe(false);
    await expect(isAllowed(new URL(`${origin}/private/deep`), fetcher)).resolves.toBe(false);
  });

  it("allows everything when there is no robots.txt", async () => {
    const noRobots = await isAllowed(new URL(`http://127.0.0.1:1/x`), {
      async fetchText() {
        return { status: 404, text: "" };
      },
    });
    expect(noRobots).toBe(true);
  });
});

describe("crawlDelayFor", () => {
  it("returns the declared crawl delay in milliseconds", async () => {
    await expect(crawlDelayFor(new URL(origin), fetcher)).resolves.toBe(1000);
  });

  it("returns 0 when robots.txt is missing", async () => {
    const delay = await crawlDelayFor(new URL("http://127.0.0.1:1"), {
      async fetchText() {
        return { status: 404, text: "" };
      },
    });
    expect(delay).toBe(0);
  });
});
