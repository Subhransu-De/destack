import { readFile } from "node:fs/promises";
import { QbtClient, runSearchPlan, validateSearchPlan } from "./qbt-core";

interface ParsedArgs {
  command: string;
  options: Map<string, string[]>;
  flags: Set<string>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? "";
  const options = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--"))
      throw new Error(`Unexpected argument: ${token ?? ""}`);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(token);
      continue;
    }
    options.set(token, [...(options.get(token) ?? []), next]);
    index += 1;
  }
  return { command, options, flags };
}

function one(
  args: ParsedArgs,
  name: string,
  required = false,
): string | undefined {
  const values = args.options.get(name) ?? [];
  if (values.length > 1) throw new Error(`${name} may be provided only once.`);
  if (required && !values[0]) throw new Error(`${name} is required.`);
  return values[0];
}

function many(args: ParsedArgs, name: string): string[] {
  return (args.options.get(name) ?? [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

async function hiddenPassword(): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error(
      "No password was provided. Use a secret-safe QBT_PASSWORD environment variable or an interactive terminal.",
    );
  }
  process.stderr.write(
    "qBittorrent password (input hidden; Enter allows blank): ",
  );
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = (): void => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stderr.write("\n");
    };
    const onData = (chunk: string): void => {
      for (const character of chunk) {
        if (character === "\r" || character === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (character === "\u0003") {
          finish();
          reject(new Error("Password input cancelled."));
          return;
        }
        if (character === "\u007f" || character === "\b")
          value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function authenticatedClient(args: ParsedArgs): Promise<QbtClient> {
  const base = one(args, "--base", true) as string;
  const username = one(args, "--username", true) as string;
  const requestTimeoutMs = Number(one(args, "--request-timeout-ms") ?? "15000");
  const password = args.flags.has("--blank-password")
    ? ""
    : process.env.QBT_PASSWORD !== undefined
      ? process.env.QBT_PASSWORD
      : await hiddenPassword();
  const client = new QbtClient(base, requestTimeoutMs);
  await client.login(username, password);
  return client;
}

function requireApply(
  args: ParsedArgs,
  action: string,
  targets: unknown,
): boolean {
  if (args.flags.has("--apply")) return true;
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        action,
        targets,
        next: "Rerun with --apply only after explicit authorization.",
      },
      null,
      2,
    ),
  );
  return false;
}

export async function main(argv = Bun.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (!args.command)
    throw new Error(
      "A command is required: probe, inventory, test, update, install, uninstall, or enable.",
    );
  const client = await authenticatedClient(args);

  if (args.command === "probe") {
    console.log(
      JSON.stringify(
        { baseUrl: client.baseUrl, ...(await client.version()) },
        null,
        2,
      ),
    );
    return;
  }
  if (args.command === "inventory") {
    const [versions, plugins] = await Promise.all([
      client.version(),
      client.plugins(),
    ]);
    console.log(
      JSON.stringify(
        {
          baseUrl: client.baseUrl,
          ...versions,
          count: plugins.length,
          enabled: plugins.filter((plugin) => plugin.enabled).length,
          plugins,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (args.command === "test") {
    const planPath = one(args, "--plan", true) as string;
    const plan = validateSearchPlan(
      JSON.parse(await readFile(planPath, "utf8")),
    );
    const results = await runSearchPlan(client, plan, {
      concurrency: Number(one(args, "--concurrency") ?? "5"),
      timeoutMs: Number(one(args, "--timeout-ms") ?? "180000"),
      pollMs: Number(one(args, "--poll-ms") ?? "1000"),
      sampleLimit: Number(one(args, "--sample-limit") ?? "3"),
      keepJobs: args.flags.has("--keep-jobs"),
    });
    console.log(
      JSON.stringify(
        {
          results,
          summary: {
            stopped: results.filter((result) => result.status === "stopped")
              .length,
            timedOut: results.filter((result) => result.status === "timed_out")
              .length,
            errors: results.filter(
              (result) => result.status === "error" || result.error,
            ).length,
            withResults: results.filter((result) => result.total > 0).length,
          },
        },
        null,
        2,
      ),
    );
    return;
  }
  if (args.command === "update") {
    if (!requireApply(args, "updatePlugins", [])) return;
    await client.updatePlugins();
    console.log(JSON.stringify({ applied: true, action: "updatePlugins" }));
    return;
  }
  if (args.command === "install") {
    const sources = many(args, "--source");
    if (!sources.length) throw new Error("At least one --source is required.");
    if (!requireApply(args, "installPlugin", sources)) return;
    await client.installPlugins(sources);
    console.log(
      JSON.stringify({ applied: true, action: "installPlugin", sources }),
    );
    return;
  }
  if (args.command === "uninstall") {
    const names = many(args, "--names");
    if (!names.length)
      throw new Error("--names must contain at least one plugin name.");
    if (!requireApply(args, "uninstallPlugin", names)) return;
    await client.uninstallPlugins(names);
    console.log(
      JSON.stringify({ applied: true, action: "uninstallPlugin", names }),
    );
    return;
  }
  if (args.command === "enable") {
    const names = many(args, "--names");
    if (!names.length)
      throw new Error("--names must contain at least one plugin name.");
    const enable = one(args, "--value", true);
    if (enable !== "true" && enable !== "false")
      throw new Error("--value must be true or false.");
    if (!requireApply(args, "enablePlugin", { names, enable })) return;
    await client.enablePlugins(names, enable === "true");
    console.log(
      JSON.stringify({
        applied: true,
        action: "enablePlugin",
        names,
        enable: enable === "true",
      }),
    );
    return;
  }
  throw new Error(`Unknown command: ${args.command}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
