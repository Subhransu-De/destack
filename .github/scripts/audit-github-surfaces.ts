#!/usr/bin/env bun

import {
  findSensitiveText,
  getLocalExactValues,
  type Finding,
  type TextAuditOptions,
} from "./audit-repository";

const decoder = new TextDecoder();
const findings: Finding[] = [];

function runCommand(
  args: string[],
  cwd: string,
  allowFailure = false,
): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: args,
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = decoder.decode(result.stdout);
  const stderr = decoder.decode(result.stderr);

  if (result.exitCode !== 0 && !allowFailure) {
    throw new Error(`Command failed (${args.join(" ")}): ${stderr.trim()}`);
  }

  return { exitCode: result.exitCode, stdout, stderr };
}

async function runCommandAsync(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const process = Bun.spawn({
    cmd: args,
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`GitHub returned invalid JSON for ${label}.`);
  }
}

function ghApi<T>(
  endpoint: string,
  cwd: string,
  options: {
    allowForbidden?: boolean;
    allowNotFound?: boolean;
    paginate?: boolean;
  } = {},
): T | null {
  const args = ["gh", "api"];
  if (options.paginate) {
    args.push("--paginate", "--slurp");
  }
  args.push(endpoint);

  const result = runCommand(
    args,
    cwd,
    options.allowNotFound === true || options.allowForbidden === true,
  );
  if (result.exitCode !== 0) {
    if (options.allowNotFound && /HTTP 404|Not Found/i.test(result.stderr)) {
      return null;
    }
    if (options.allowForbidden && /HTTP 403|Forbidden/i.test(result.stderr)) {
      return null;
    }
    throw new Error(
      `GitHub API request failed for ${endpoint}: ${result.stderr.trim()}`,
    );
  }

  return parseJson<T>(result.stdout, endpoint);
}

function flattenPages<T>(pages: T[][] | null): T[] {
  return pages?.flat() ?? [];
}

function addFinding(category: string, path: string, line = "-"): void {
  findings.push({ category, path, line });
}

function scanValue(
  label: string,
  value: unknown,
  exactValues: string[],
  options: TextAuditOptions = {},
): void {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }
  findings.push(...findSensitiveText(value, label, exactValues, options));
}

function scanIssueLikeContent(
  label: string,
  value: Record<string, unknown>,
  exactValues: string[],
  options: TextAuditOptions,
): void {
  scanValue(`${label} title`, value.title, exactValues, options);
  scanValue(`${label} body`, value.body, exactValues, options);
}

function auditPullRefs(repoRoot: string): void {
  const remoteRefs = runCommand(
    ["git", "ls-remote", "origin", "refs/pull/*/head"],
    repoRoot,
  ).stdout.trim();
  if (!remoteRefs) {
    console.log("No remote pull-request refs were found.");
    return;
  }

  runCommand(
    ["git", "fetch", "--force", "origin", "+refs/pull/*/head:refs/pull/*/head"],
    repoRoot,
  );
  console.log(`Fetched ${remoteRefs.split(/\r?\n/).length} pull-request refs.`);

  const repositoryAudit = runCommand(
    ["bun", "./.github/scripts/audit-repository.ts"],
    repoRoot,
    true,
  );
  process.stdout.write(repositoryAudit.stdout);
  process.stderr.write(repositoryAudit.stderr);
  if (repositoryAudit.exitCode !== 0) {
    addFinding("Pull-request ref history audit failed", "refs/pull");
  }
}

async function main(): Promise<void> {
  const repoRoot = runCommand(
    ["git", "rev-parse", "--show-toplevel"],
    process.cwd(),
  ).stdout.trim();
  const repository = parseJson<{ nameWithOwner: string }>(
    runCommand(["gh", "repo", "view", "--json", "nameWithOwner"], repoRoot)
      .stdout,
    "repository identity",
  ).nameWithOwner;
  const [owner] = repository.split("/");
  const publicLoginResult = runCommand(
    ["gh", "api", "user", "--jq", ".login"],
    repoRoot,
    true,
  );
  const publicLogin =
    publicLoginResult.exitCode === 0 ? publicLoginResult.stdout.trim() : "";

  const allowedPublicIdentityValues = new Set(
    [publicLogin, owner, repository].map((value) => value.toLowerCase()),
  );
  const exactValues = getLocalExactValues(repoRoot).filter(
    (value) => !allowedPublicIdentityValues.has(value.toLowerCase()),
  );
  const publicationTextOptions: TextAuditOptions = {
    allowGitHubObjectIds: true,
  };

  console.log(`Auditing GitHub surfaces for ${repository}...`);
  auditPullRefs(repoRoot);

  const repo = ghApi<Record<string, unknown>>(`repos/${repository}`, repoRoot)!;
  scanValue("repository description", repo.description, exactValues);
  scanValue("repository homepage", repo.homepage, exactValues);
  if (Array.isArray(repo.topics)) {
    for (const topic of repo.topics) {
      scanValue("repository topic", topic, exactValues);
    }
  }

  const issues = flattenPages(
    ghApi<Record<string, unknown>[][]>(
      `repos/${repository}/issues?state=all&per_page=100`,
      repoRoot,
      { paginate: true },
    ),
  );
  for (const issue of issues) {
    const number = Number(issue.number);
    const isPullRequest = Boolean(issue.pull_request);
    const label = `${isPullRequest ? "pull request" : "issue"} #${number}`;
    scanIssueLikeContent(label, issue, exactValues, publicationTextOptions);

    const issueComments = flattenPages(
      ghApi<Record<string, unknown>[][]>(
        `repos/${repository}/issues/${number}/comments?per_page=100`,
        repoRoot,
        { paginate: true },
      ),
    );
    for (const comment of issueComments) {
      scanValue(
        `${label} comment`,
        comment.body,
        exactValues,
        publicationTextOptions,
      );
    }

    if (!isPullRequest) {
      continue;
    }

    const reviewComments = flattenPages(
      ghApi<Record<string, unknown>[][]>(
        `repos/${repository}/pulls/${number}/comments?per_page=100`,
        repoRoot,
        { paginate: true },
      ),
    );
    for (const comment of reviewComments) {
      scanValue(
        `${label} review comment`,
        comment.body,
        exactValues,
        publicationTextOptions,
      );
    }

    const reviews = flattenPages(
      ghApi<Record<string, unknown>[][]>(
        `repos/${repository}/pulls/${number}/reviews?per_page=100`,
        repoRoot,
        { paginate: true },
      ),
    );
    for (const review of reviews) {
      scanValue(
        `${label} review`,
        review.body,
        exactValues,
        publicationTextOptions,
      );
    }
  }

  const releases = flattenPages(
    ghApi<Record<string, unknown>[][]>(
      `repos/${repository}/releases?per_page=100`,
      repoRoot,
      { paginate: true },
    ),
  );
  for (const release of releases) {
    const label = `release ${String(release.tag_name ?? release.id)}`;
    scanValue(
      `${label} name`,
      release.name,
      exactValues,
      publicationTextOptions,
    );
    scanValue(
      `${label} body`,
      release.body,
      exactValues,
      publicationTextOptions,
    );
    const assets = Array.isArray(release.assets) ? release.assets : [];
    if (assets.length > 0) {
      addFinding("Release assets require explicit binary audit", label);
    }
  }

  const artifacts = ghApi<{ total_count: number }>(
    `repos/${repository}/actions/artifacts?per_page=1`,
    repoRoot,
  )!;
  if (artifacts.total_count > 0) {
    addFinding(
      "Actions artifacts require explicit binary audit",
      "Actions artifacts",
    );
  }

  const variables = ghApi<{
    variables?: Array<{ name: string; value: string }>;
  }>(`repos/${repository}/actions/variables?per_page=100`, repoRoot, {
    allowForbidden: true,
    allowNotFound: true,
  });
  for (const variable of variables?.variables ?? []) {
    scanValue(`Actions variable ${variable.name}`, variable.value, exactValues);
  }

  const hooks = ghApi<unknown[]>(
    `repos/${repository}/hooks?per_page=100`,
    repoRoot,
    {
      allowForbidden: true,
      allowNotFound: true,
    },
  );
  if ((hooks?.length ?? 0) > 0) {
    addFinding(
      "Repository webhooks require explicit endpoint audit",
      "webhooks",
    );
  }

  const deployKeys = ghApi<unknown[]>(
    `repos/${repository}/keys?per_page=100`,
    repoRoot,
    { allowForbidden: true, allowNotFound: true },
  );
  if ((deployKeys?.length ?? 0) > 0) {
    addFinding("Deploy keys require explicit identity audit", "deploy keys");
  }
  if (variables === null || hooks === null || deployKeys === null) {
    console.log(
      "The workflow token cannot inspect one or more administrative surfaces; run this audit locally with an administrator token before publication changes.",
    );
  }

  const pages = ghApi<Record<string, unknown>>(
    `repos/${repository}/pages`,
    repoRoot,
    { allowNotFound: true },
  );
  if (pages) {
    addFinding(
      "GitHub Pages content requires a separate publication audit",
      "Pages",
    );
  }

  const workflowRuns = ghApi<{
    workflow_runs?: Array<Record<string, unknown>>;
  }>(`repos/${repository}/actions/runs?per_page=100`, repoRoot);
  const logIgnoredCategories = new Set([
    "Windows absolute path",
    "Unix user path",
    "User-profile UNC or WSL path",
    "File URL",
    "Windows registry path",
    "IPv4 address",
    "IPv6 address",
    "MAC address",
    "Windows SID",
    "UUID or GUID",
    "Cloud or hardware identifier",
    "High-entropy value",
  ]);
  const completedRuns = (workflowRuns?.workflow_runs ?? []).filter(
    (run) => run.status === "completed",
  );
  let unavailableLogCount = 0;
  const logBatchSize = 8;
  for (let offset = 0; offset < completedRuns.length; offset += logBatchSize) {
    const batch = completedRuns.slice(offset, offset + logBatchSize);
    const logs = await Promise.all(
      batch.map(async (run) => {
        const runId = String(run.id);
        const log = await runCommandAsync(
          ["gh", "run", "view", runId, "--log", "--repo", repository],
          repoRoot,
        );
        return { runId, log };
      }),
    );

    for (const { runId, log } of logs) {
      if (log.exitCode !== 0) {
        if (/log not found/i.test(log.stderr)) {
          unavailableLogCount += 1;
        } else {
          addFinding(
            "Unable to audit completed Actions log",
            `workflow run ${runId}`,
          );
        }
        continue;
      }
      scanValue(`workflow run ${runId} log`, log.stdout, exactValues, {
        allowEmail: true,
        ignoredCategories: logIgnoredCategories,
      });
    }
  }
  if (unavailableLogCount > 0) {
    console.log(
      `Skipped ${unavailableLogCount} completed workflow runs with no published log.`,
    );
  }

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
    console.error("GitHub publication-surface audit failed.");
    console.error("Category\tSurface\tLine");
    for (const finding of uniqueFindings) {
      console.error(`${finding.category}\t${finding.path}\t${finding.line}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("GitHub publication-surface audit passed.");
  console.log("No secret or identifier values were printed.");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
