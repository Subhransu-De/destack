import { fileURLToPath } from "node:url";

const child = Bun.spawn(
  [Bun.which("bun") ?? "bun", "test", "test/integration.test.ts"],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, PRINT_ME_INTEGRATION: "1" },
    stdout: "inherit",
    stderr: "inherit",
  },
);

process.exitCode = await child.exited;
