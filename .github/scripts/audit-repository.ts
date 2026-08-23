#!/usr/bin/env bun

import { networkInterfaces, userInfo } from "node:os";

type Finding = {
  category: string;
  path: string;
  line: string;
};

type PatternDefinition = {
  category: string;
  pattern: RegExp;
};

const decoder = new TextDecoder();
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });
const findings: Finding[] = [];
const blobPaths = new Map<string, Set<string>>();

function runCommand(
  args: string[],
  cwd: string,
  allowFailure = false,
): Uint8Array {
  const result = Bun.spawnSync({
    cmd: args,
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0 && !allowFailure) {
    const stderr = decoder.decode(result.stderr).trim();
    throw new Error(`Command failed (${args.join(" ")}): ${stderr}`);
  }

  return result.stdout;
}

function runText(args: string[], cwd: string, allowFailure = false): string {
  return decoder.decode(runCommand(args, cwd, allowFailure));
}

function addFinding(category: string, path: string, line: string): void {
  findings.push({ category, path, line });
}

function getShannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.length > 0);
}

function addBlobPath(blobId: string, path: string): void {
  let paths = blobPaths.get(blobId);
  if (!paths) {
    paths = new Set<string>();
    blobPaths.set(blobId, paths);
  }
  paths.add(path);
}

function auditPath(path: string): void {
  if (
    ![".gitignore", "AGENTS.md", "CLAUDE.md"].includes(path) &&
    !/^(\.github|\.zed|bash_setup|claude|skills|windows_terminal)\//.test(path)
  ) {
    addFinding("Top-level scope violation", path, "-");
  }

  if (!/^[A-Za-z0-9._/-]+$/.test(path)) {
    addFinding("Unsafe or ambiguous filename", path, "-");
  }
}

function auditStagedChanges(repoRoot: string): void {
  const changedPaths = splitLines(
    runText(
      [
        "git",
        "-c",
        "core.quotepath=false",
        "diff",
        "--cached",
        "--name-only",
        "--diff-filter=ACMRD",
      ],
      repoRoot,
    ),
  );
  const stagedPaths = splitLines(
    runText(
      [
        "git",
        "-c",
        "core.quotepath=false",
        "diff",
        "--cached",
        "--name-only",
        "--diff-filter=ACMR",
      ],
      repoRoot,
    ),
  );

  if (changedPaths.length === 0) {
    throw new Error("No staged changes were found.");
  }

  console.log(`Auditing ${stagedPaths.length} exact staged blobs...`);

  for (const path of changedPaths) {
    auditPath(path);
  }

  for (const path of stagedPaths) {
    const entry = runText(
      ["git", "ls-files", "--stage", "--", path],
      repoRoot,
    ).trimEnd();
    const match = /^(\d+) ([0-9a-f]{40}) \d+\t(.+)$/.exec(entry);
    if (!match) {
      addFinding("Malformed staged Git entry", path, "-");
      continue;
    }

    const [, mode, blobId] = match;
    if (mode !== "100644") {
      addFinding(`Disallowed Git mode ${mode}`, path, "-");
    }
    addBlobPath(blobId, path);
  }
}

function auditHistory(repoRoot: string): void {
  const commitIds = splitLines(
    runText(["git", "rev-list", "--all"], repoRoot),
  ).sort();
  if (commitIds.length === 0) {
    throw new Error("No reachable commits were found.");
  }

  console.log(`Auditing ${commitIds.length} reachable commits...`);

  const allowedEmailPatterns = [
    /^[0-9]+\+[^@]+@users\.noreply\.github\.com$/,
    /^[^@]+@users\.noreply\.github\.com$/,
    /^noreply@github\.com$/,
  ];
  const syntheticMergeCommitId =
    /^refs\/pull\/\d+\/merge$/.test(process.env.GITHUB_REF ?? "") &&
    process.env.GITHUB_SHA?.trim()
      ? process.env.GITHUB_SHA.trim()
      : null;

  if (syntheticMergeCommitId) {
    console.log(
      "Skipping metadata checks for the synthetic pull-request merge commit while auditing its tree.",
    );
  }

  for (const commitId of commitIds) {
    const rawCommit = runText(
      ["git", "cat-file", "commit", commitId],
      repoRoot,
    );

    if (commitId !== syntheticMergeCommitId) {
      if (/^gpgsig /m.test(rawCommit)) {
        addFinding("Embedded commit signature", commitId.slice(0, 12), "-");
      }

      for (const headerName of ["author", "committer"]) {
        const header = new RegExp(
          `^${headerName} .+ <([^>]+)> \\d+ ([+-]\\d{4})\\r?$`,
          "m",
        ).exec(rawCommit);

        if (!header) {
          addFinding(
            `Malformed ${headerName} metadata`,
            commitId.slice(0, 12),
            "-",
          );
          continue;
        }

        const [, email, timezone] = header;
        if (!allowedEmailPatterns.some((pattern) => pattern.test(email))) {
          addFinding(
            `Non-noreply ${headerName} email`,
            commitId.slice(0, 12),
            "-",
          );
        }
        if (timezone !== "+0000") {
          addFinding(
            `Non-UTC ${headerName} timezone`,
            commitId.slice(0, 12),
            "-",
          );
        }
      }
    }

    for (const entry of splitLines(
      runText(["git", "ls-tree", "-r", commitId], repoRoot),
    )) {
      const match = /^(\d+) blob ([0-9a-f]{40})\t(.+)$/.exec(entry);
      if (!match) {
        addFinding("Non-regular Git tree entry", commitId.slice(0, 12), "-");
        continue;
      }

      const [, mode, blobId, path] = match;
      if (mode !== "100644") {
        addFinding(`Disallowed Git mode ${mode}`, path, "-");
      }
      auditPath(path);
      addBlobPath(blobId, path);
    }
  }
}

function addOptionalCommandValues(
  repoRoot: string,
  command: string[],
  values: string[],
): void {
  const output = runText(command, repoRoot, true);
  if (output) {
    values.push(output);
  }
}

function getExactValues(repoRoot: string): string[] {
  const values = [
    process.env.GITHUB_REPOSITORY_OWNER,
    process.env.GITHUB_ACTOR,
    process.env.GITHUB_TRIGGERING_ACTOR,
    process.env.GITHUB_REPOSITORY,
  ];

  if (process.env.GITHUB_ACTIONS !== "true") {
    values.push(
      process.env.USERNAME,
      process.env.USER,
      process.env.COMPUTERNAME,
      process.env.HOSTNAME,
      process.env.USERDOMAIN,
      process.env.USERDNSDOMAIN,
      process.env.USERPROFILE,
      process.env.HOME,
      process.env.LOCALAPPDATA,
      process.env.APPDATA,
      process.env.OneDrive,
    );

    try {
      values.push(userInfo().username);
    } catch {
      // The current user probe is unavailable on this platform.
    }

    for (const interfaces of Object.values(networkInterfaces())) {
      for (const network of interfaces ?? []) {
        if (
          network.mac &&
          network.mac.replace(/[:-]/g, "") !== "0".repeat(12)
        ) {
          values.push(network.mac);
        }
        if (
          network.family === "IPv4" &&
          !network.internal &&
          !network.address.startsWith("169.254.")
        ) {
          values.push(network.address);
        }
      }
    }

    if (process.platform === "win32") {
      addOptionalCommandValues(
        repoRoot,
        ["whoami.exe", "/user", "/fo", "csv", "/nh"],
        values,
      );
      addOptionalCommandValues(
        repoRoot,
        [
          "reg.exe",
          "query",
          "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
          "/v",
          "MachineGuid",
        ],
        values,
      );
      addOptionalCommandValues(
        repoRoot,
        ["getmac.exe", "/fo", "csv", "/nh"],
        values,
      );
      addOptionalCommandValues(repoRoot, ["ipconfig.exe", "/all"], values);
    } else {
      addOptionalCommandValues(repoRoot, ["hostname"], values);
      addOptionalCommandValues(repoRoot, ["hostname", "-I"], values);
    }

    addOptionalCommandValues(
      repoRoot,
      ["git", "config", "--global", "--get", "user.name"],
      values,
    );
    addOptionalCommandValues(
      repoRoot,
      ["git", "config", "--global", "--get", "user.email"],
      values,
    );
  }

  const ignoredValues = new Set([
    "default string",
    "none",
    "system serial number",
    "to be filled by o.e.m.",
    "unknown",
    "workgroup",
  ]);

  return [
    ...new Set(
      values.filter((value): value is string =>
        Boolean(value && value.trim().length >= 4),
      ),
    ),
  ]
    .filter((value) => !ignoredValues.has(value.toLowerCase()))
    .sort();
}

const patterns: PatternDefinition[] = [
  {
    category: "Email address",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  { category: "Windows absolute path", pattern: /\b[A-Z]:[\\/][^\s"'`]+/gi },
  {
    category: "Unix user path",
    pattern: /(?:^|[\s"'])\/(?:home|Users)\/[^\/\s"']+/gi,
  },
  {
    category: "IPv4 address",
    pattern:
      /(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])/g,
  },
  {
    category: "MAC address",
    pattern: /\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b/gi,
  },
  { category: "Windows SID", pattern: /\bS-1-(?:\d+-){1,14}\d+\b/g },
  {
    category: "UUID or GUID",
    pattern:
      /\{?\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b\}?/gi,
  },
  { category: "Private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  {
    category: "SSH public key",
    pattern:
      /\b(?:ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp\d+)\s+[A-Za-z0-9+/=]{40,}/g,
  },
  {
    category: "GitHub token",
    pattern:
      /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  { category: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  {
    category: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    category: "Credential in URL",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s/@]+@/gi,
  },
];

const allowedGuids = new Set([
  "2ece5bfe-50ed-5f3a-ab87-5cd4baafed2b",
  "574e775e-4f2a-5b96-ac1e-a2962a402336",
]);

function isAllowedGenericValue(
  category: string,
  value: string,
  line: string,
): boolean {
  if (category === "IPv4 address") {
    return (
      value === "0.0.0.0" ||
      value === "127.0.0.1" ||
      line.includes(`Chrome/${value}`)
    );
  }

  if (category === "Windows absolute path") {
    return [
      /^C:[\\/]{1,2}config[\\/]{1,2}qBittorrent\.ini$/i,
      /^C:[\\/]{1,2}Downloads(?:[\\/]{1,2}Movies)?[\\/]{0,2}$/i,
      /^C:[\\/]{1,2}\.\.\.[\\/]{1,2}qbt_search_123\.json$/i,
    ].some((pattern) => pattern.test(value));
  }

  return false;
}

function auditBlobs(repoRoot: string): void {
  console.log(`Auditing ${blobPaths.size} unique historical blobs...`);
  const exactValues = getExactValues(repoRoot);

  for (const [blobId, pathSet] of blobPaths) {
    const bytes = runCommand(["git", "cat-file", "blob", blobId], repoRoot);
    const paths = [...pathSet].sort();
    const displayPath = paths.join(",");
    const allPathsAreDependabotConfig =
      paths.length > 0 &&
      paths.every((path) => path === ".github/dependabot.yml");
    const allPathsAreBunLockfiles =
      paths.length > 0 && paths.every((path) => path.endsWith("/bun.lock"));

    if (bytes.includes(0)) {
      addFinding("Binary historical blob", displayPath, "-");
      continue;
    }

    let content: string;
    try {
      content = strictUtf8.decode(bytes);
    } catch {
      addFinding("Non-UTF-8 historical blob", displayPath, "-");
      continue;
    }

    for (const value of exactValues) {
      const pathContainsValue = displayPath
        .toLowerCase()
        .includes(value.toLowerCase());
      const contentContainsValue =
        !allPathsAreDependabotConfig &&
        content.toLowerCase().includes(value.toLowerCase());
      if (pathContainsValue || contentContainsValue) {
        addFinding("Repository account identifier", displayPath, "-");
      }
    }

    const contentLines = content.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < contentLines.length; lineIndex += 1) {
      const line = contentLines[lineIndex];

      for (const definition of patterns) {
        for (const match of line.matchAll(definition.pattern)) {
          if (isAllowedGenericValue(definition.category, match[0], line)) {
            continue;
          }

          if (definition.category === "UUID or GUID") {
            const normalizedGuid = match[0].replace(/[{}]/g, "").toLowerCase();
            if (allowedGuids.has(normalizedGuid)) {
              continue;
            }
          }

          addFinding(definition.category, displayPath, String(lineIndex + 1));
        }
      }

      for (const match of line.matchAll(
        /(?<![A-Za-z0-9+/_=-])[A-Za-z0-9+/_=-]{40,}(?![A-Za-z0-9+/_=-])/g,
      )) {
        const candidate = match[0];
        if (
          allPathsAreBunLockfiles ||
          candidate.endsWith("_8wekyb3d8bbwe") ||
          allowedGuids.has(candidate.replace(/[{}]/g, "").toLowerCase())
        ) {
          continue;
        }

        if (getShannonEntropy(candidate) >= 4.3) {
          addFinding("High-entropy value", displayPath, String(lineIndex + 1));
        }
      }
    }
  }
}

function main(): void {
  const repoRoot = runText(
    ["git", "rev-parse", "--show-toplevel"],
    process.cwd(),
  ).trim();
  if (!repoRoot) {
    throw new Error("Repository audit must run inside a Git repository.");
  }

  if (process.argv.includes("--staged")) {
    auditStagedChanges(repoRoot);
  } else {
    auditHistory(repoRoot);
  }
  auditBlobs(repoRoot);

  const uniqueFindings = [
    ...new Map(
      findings.map((finding) => [
        `${finding.category}\0${finding.path}\0${finding.line}`,
        finding,
      ]),
    ).values(),
  ].sort((left, right) =>
    `${left.category}\0${left.path}\0${left.line}`.localeCompare(
      `${right.category}\0${right.path}\0${right.line}`,
    ),
  );

  if (uniqueFindings.length > 0) {
    console.error("Repository sensitive-information audit failed.");
    console.error("Category\tPath\tLine");
    for (const finding of uniqueFindings) {
      console.error(`${finding.category}\t${finding.path}\t${finding.line}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Repository sensitive-information audit passed.");
  console.log("No external scanning service was called.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
