import { afterEach, describe, expect, test } from "bun:test";
import {
  QbtClient,
  runSearchPlan,
  validateSearchPlan,
} from "../scripts/qbt-core";
import { parseArgs } from "../scripts/qbt-search-plugins";

const servers: Bun.Server<unknown>[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});

function fakeQbt(options: { neverStop?: boolean; rejectLogin?: boolean } = {}) {
  let nextId = 100;
  const statusCalls = new Map<number, number>();
  const deleted: number[] = [];
  const stopped: number[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/api/v2/auth/login") {
        if (options.rejectLogin) return new Response("Fails.", { status: 200 });
        const form = new URLSearchParams(await request.text());
        if (
          form.get("username") !== "tester" ||
          form.get("password") !== "secret"
        )
          return new Response("Fails.");
        return new Response("Ok.", {
          headers: { "Set-Cookie": "SID=test-session; HttpOnly" },
        });
      }
      if (request.headers.get("cookie") !== "SID=test-session")
        return new Response("Forbidden", { status: 403 });
      if (url.pathname === "/api/v2/app/version") return new Response("5.test");
      if (url.pathname === "/api/v2/app/webapiVersion")
        return new Response("2.test");
      if (url.pathname === "/api/v2/search/plugins")
        return Response.json([
          {
            name: "demo",
            fullName: "Demo",
            url: "https://example.invalid",
            enabled: true,
          },
        ]);
      if (url.pathname === "/api/v2/search/start") {
        const id = nextId++;
        statusCalls.set(id, 0);
        return Response.json({ id });
      }
      if (url.pathname === "/api/v2/search/status") {
        const id = Number(url.searchParams.get("id"));
        const calls = statusCalls.get(id) ?? 0;
        statusCalls.set(id, calls + 1);
        return Response.json([
          {
            id,
            status: options.neverStop || calls === 0 ? "Running" : "Stopped",
            total: 2,
          },
        ]);
      }
      if (url.pathname === "/api/v2/search/results") {
        return Response.json({
          status: "Stopped",
          total: 2,
          results: [{ fileName: "one" }, { fileName: "two" }],
        });
      }
      if (url.pathname === "/api/v2/search/stop") {
        const form = new URLSearchParams(await request.text());
        stopped.push(Number(form.get("id")));
        return new Response();
      }
      if (url.pathname === "/api/v2/search/delete") {
        const form = new URLSearchParams(await request.text());
        deleted.push(Number(form.get("id")));
        return new Response();
      }
      return new Response("Not found", { status: 404 });
    },
  });
  servers.push(server);
  return { baseUrl: `http://127.0.0.1:${server.port}`, deleted, stopped };
}

describe("qBittorrent WebAPI boundary", () => {
  test("authenticates, preserves the session cookie, and inventories plugins", async () => {
    const fake = fakeQbt();
    const client = new QbtClient(fake.baseUrl);
    await client.login("tester", "secret");
    expect(await client.version()).toEqual({
      qBittorrent: "5.test",
      webApi: "2.test",
    });
    expect((await client.plugins())[0]?.name).toBe("demo");
  });

  test("rejects failed authentication", async () => {
    const fake = fakeQbt({ rejectLogin: true });
    const client = new QbtClient(fake.baseUrl);
    await expect(client.login("tester", "secret")).rejects.toThrow(
      "authentication failed",
    );
  });

  test("runs only planned jobs and deletes only the ids it created", async () => {
    const fake = fakeQbt();
    const client = new QbtClient(fake.baseUrl);
    await client.login("tester", "secret");
    const plan = validateSearchPlan([
      { plugin: "first", query: "alpha" },
      { plugin: "second", query: "beta", category: "all" },
    ]);
    const results = await runSearchPlan(client, plan, {
      concurrency: 2,
      pollMs: 5,
      timeoutMs: 500,
      sampleLimit: 1,
    });
    expect(results.map((result) => result.status)).toEqual([
      "stopped",
      "stopped",
    ]);
    expect(results.map((result) => result.total)).toEqual([2, 2]);
    expect(fake.deleted.sort()).toEqual([100, 101]);
  });

  test("stops and cleans up a job when the harness deadline expires", async () => {
    const fake = fakeQbt({ neverStop: true });
    const client = new QbtClient(fake.baseUrl);
    await client.login("tester", "secret");
    const [result] = await runSearchPlan(
      client,
      [{ plugin: "slow", query: "query" }],
      { concurrency: 1, pollMs: 5, timeoutMs: 15 },
    );
    expect(result?.status).toBe("timed_out");
    expect(fake.stopped).toEqual([100]);
    expect(fake.deleted).toEqual([100]);
  });
});

describe("CLI input validation", () => {
  test("collects repeated and flag arguments without accepting positional surprises", () => {
    const parsed = parseArgs([
      "install",
      "--base",
      "http://host.invalid:45119",
      "--source",
      "one.py",
      "--source",
      "two.py",
      "--apply",
    ]);
    expect(parsed.command).toBe("install");
    expect(parsed.options.get("--source")).toEqual(["one.py", "two.py"]);
    expect(parsed.flags.has("--apply")).toBeTrue();
    expect(() => parseArgs(["inventory", "unexpected"])).toThrow(
      "Unexpected argument",
    );
  });
});
