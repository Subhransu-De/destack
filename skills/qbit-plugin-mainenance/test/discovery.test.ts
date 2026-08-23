import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  candidateFromConfig,
  discoverCandidates,
  normalizeBaseUrl,
  parseIni,
} from "../scripts/qbt-core";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("qBittorrent connection discovery", () => {
  test("parses qBittorrent escaped WebUI keys", () => {
    const values = parseIni(
      "[Preferences]\nWebUI\\Address=*\nWebUI\\Port=43127\nWebUI\\HTTPS\\Enabled=true\n",
    );
    expect(values.get("Preferences/WebUI\\Port")).toBe("43127");
    expect(values.get("Preferences/WebUI\\HTTPS\\Enabled")).toBe("true");
  });

  test("builds an explicit HTTPS candidate and maps wildcard listen addresses to loopback", () => {
    const candidate = candidateFromConfig(
      "[Preferences]\nWebUI\\Address=*\nWebUI\\Port=43127\nWebUI\\HTTPS\\Enabled=true\n",
      "C:/config/qBittorrent.ini",
    );
    expect(candidate).toMatchObject({
      baseUrl: "https://127.0.0.1:43127",
      port: 43127,
      protocol: "https:",
    });
  });

  test("does not invent a default when the configured port is absent or invalid", () => {
    expect(
      candidateFromConfig(
        "[Preferences]\nWebUI\\Address=127.0.0.1\n",
        "config.ini",
      ),
    ).toBeNull();
    expect(
      candidateFromConfig("[Preferences]\nWebUI\\Port=99999\n", "config.ini"),
    ).toBeNull();
  });

  test("discovers a caller-provided config path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "qbt-discovery-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "qBittorrent.conf");
    await writeFile(
      configPath,
      "[Preferences]\nWebUI\\Address=127.0.0.1\nWebUI\\Port=41731\n",
      "utf8",
    );
    const candidates = await discoverCandidates({
      platform: "linux",
      env: {},
      home: directory,
      configPaths: [configPath],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.baseUrl).toBe("http://127.0.0.1:41731");
  });

  test("accepts an explicit environment URL but still requires an explicit port", async () => {
    const candidates = await discoverCandidates({
      platform: "linux",
      env: { QBT_BASE_URL: "http://qbt.example:45119" },
      home: "/unused",
      configPaths: [],
    });
    expect(candidates[0]?.source).toBe("QBT_BASE_URL");
    expect(() => normalizeBaseUrl("http://qbt.example")).toThrow(
      "explicit port",
    );
  });
});
