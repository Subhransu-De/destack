import { discoverCandidates } from "./qbt-core";

function optionValues(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < Bun.argv.length; index += 1) {
    if (Bun.argv[index] === name && Bun.argv[index + 1])
      values.push(Bun.argv[index + 1] as string);
  }
  return values;
}

export async function main(): Promise<void> {
  const configPaths = optionValues("--config");
  const candidates = await discoverCandidates({
    configPaths: configPaths.length ? configPaths : undefined,
  });
  console.log(
    JSON.stringify(
      {
        candidates,
        requiresEndpointInput: candidates.length !== 1,
        requiresUserConfirmation: true,
        next:
          candidates.length === 1
            ? "Ask the user to confirm this port and provide the qBittorrent username and password before live access."
            : "Ask the user for the qBittorrent base URL or port, username, and password before live access.",
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
