#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { networkInterfaces, userInfo } from "node:os";

export type Finding = {
  category: string;
  path: string;
  line: string;
};

type PatternDefinition = {
  category: string;
  pattern: RegExp;
};

export type TextAuditOptions = {
  allowEmail?: boolean;
  allowedExactValues?: Set<string>;
  allowBunLockfileEntropy?: boolean;
  allowGitHubObjectIds?: boolean;
  ignoredCategories?: Set<string>;
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

function isAllowedGitHubObjectReference(
  candidate: string,
  line: string,
): boolean {
  const normalizedCandidate = candidate.toLowerCase();
  const referencedObjectIds = [
    ...line.matchAll(
      /(?:github\.com\/[^\s/]+\/[^\s/]+\/(?:commit|commits|blob|tree)\/|@)([0-9a-f]{40})(?![0-9a-f])/gi,
    ),
  ].map((match) => match[1].toLowerCase());
  return referencedObjectIds.some((objectId) =>
    normalizedCandidate.includes(objectId),
  );
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

function isAllowedMode(mode: string, path: string): boolean {
  return (
    mode === "100644" ||
    (mode === "100755" && path === ".github/hooks/pre-push")
  );
}

function auditPath(path: string): void {
  if (
    ![".gitignore", "AGENTS.md", "CLAUDE.md", "INSTALLATION.md"].includes(
      path,
    ) &&
    !/^(\.github|\.zed|bash_setup|claude|codex|fastfetch|git|mpv|skills|windows_terminal|zed)\//.test(
      path,
    )
  ) {
    addFinding("Top-level scope violation", path, "-");
  }

  if (!/^[A-Za-z0-9._/-]+$/.test(path)) {
    addFinding("Unsafe or ambiguous filename", path, "-");
  }

  if (
    /(^|\/)(?:node_modules|\.venv|venv|__pycache__|\.cache|\.pytest_cache|\.mypy_cache|\.tox|\.nox|coverage|dist|build|tmp|temp|sessions?|histories|logs?|backups?|appdata)(?:\/|$)/i.test(
      path,
    )
  ) {
    addFinding("Generated or private state path", path, "-");
  }

  if (
    /(^|\/)(?:\.env(?:\..*)?|auth\.json|\.credentials\.json|credentials(?:\.[^/]*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|known_hosts|.*\.(?:pem|p12|pfx|key|keystore|jks|kdbx|bak|backup))$/i.test(
      path,
    )
  ) {
    addFinding("Credential or backup filename", path, "-");
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
    if (!isAllowedMode(mode, path)) {
      addFinding(`Disallowed Git mode ${mode}`, path, "-");
    }
    addBlobPath(blobId, path);
  }
}

function getPublishableRefs(repoRoot: string): string[] {
  const refs = splitLines(
    runText(
      [
        "git",
        "for-each-ref",
        "--format=%(refname)",
        "refs/heads",
        "refs/remotes",
        "refs/tags",
        "refs/pull",
      ],
      repoRoot,
    ),
  ).filter(
    (ref) =>
      !ref.endsWith("/HEAD") &&
      !ref.startsWith("refs/t3/") &&
      !ref.startsWith("refs/audit/"),
  );

  if (
    runText(["git", "rev-parse", "--verify", "HEAD^{commit}"], repoRoot, true)
  ) {
    refs.push("HEAD");
  }

  return [...new Set(refs)].sort();
}

function getIdentityHeader(
  rawObject: string,
  headerName: "author" | "committer" | "tagger",
): { name: string; email: string; timezone: string } | null {
  const header = new RegExp(
    `^${headerName} (.+) <([^>]+)> \\d+ ([+-]\\d{4})\\r?$`,
    "m",
  ).exec(rawObject);
  if (!header) {
    return null;
  }

  return { name: header[1], email: header[2], timezone: header[3] };
}

function getObjectMessage(rawObject: string): string {
  const separatorIndex = rawObject.indexOf("\n\n");
  return separatorIndex === -1 ? "" : rawObject.slice(separatorIndex + 2);
}

function auditHistory(repoRoot: string): void {
  const publishableRefs = getPublishableRefs(repoRoot);
  if (publishableRefs.length === 0) {
    throw new Error("No publishable refs were found.");
  }

  const commitIds = splitLines(
    runText(["git", "rev-list", ...publishableRefs], repoRoot),
  ).sort();
  if (commitIds.length === 0) {
    throw new Error("No reachable commits were found.");
  }

  console.log(
    `Auditing ${commitIds.length} commits reachable from ${publishableRefs.length} publishable refs...`,
  );

  const exactValues = getExactValues(repoRoot);
  for (const ref of publishableRefs.filter((value) => value !== "HEAD")) {
    auditTextContent(ref, ref, exactValues);
  }

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

      const allowedExactValues = new Set<string>();
      for (const headerName of ["author", "committer"] as const) {
        const header = getIdentityHeader(rawCommit, headerName);
        if (!header) {
          addFinding(
            `Malformed ${headerName} metadata`,
            commitId.slice(0, 12),
            "-",
          );
          continue;
        }

        allowedExactValues.add(header.name.toLowerCase());
        allowedExactValues.add(header.email.toLowerCase());
        if (header.timezone !== "+0000") {
          addFinding(
            `Non-UTC ${headerName} timezone`,
            commitId.slice(0, 12),
            "-",
          );
        }
      }

      auditTextContent(
        getObjectMessage(rawCommit),
        `${commitId.slice(0, 12)} commit message`,
        exactValues,
        { allowEmail: true, allowedExactValues },
      );
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
      if (!isAllowedMode(mode, path)) {
        addFinding(`Disallowed Git mode ${mode}`, path, "-");
      }
      auditPath(path);
      addBlobPath(blobId, path);
    }
  }

  for (const entry of splitLines(
    runText(
      [
        "git",
        "for-each-ref",
        "--format=%(objecttype)%09%(objectname)%09%(refname)",
        "refs/tags",
      ],
      repoRoot,
    ),
  )) {
    const [objectType, objectId, refName] = entry.split("\t");
    if (objectType !== "tag") {
      continue;
    }

    const rawTag = runText(["git", "cat-file", "tag", objectId], repoRoot);
    if (
      /^gpgsig /m.test(rawTag) ||
      /-----BEGIN PGP SIGNATURE-----/.test(rawTag)
    ) {
      addFinding("Embedded tag signature", refName, "-");
    }

    const tagger = getIdentityHeader(rawTag, "tagger");
    const allowedExactValues = new Set<string>();
    if (!tagger) {
      addFinding("Malformed tagger metadata", refName, "-");
    } else {
      allowedExactValues.add(tagger.name.toLowerCase());
      allowedExactValues.add(tagger.email.toLowerCase());
      if (tagger.timezone !== "+0000") {
        addFinding("Non-UTC tagger timezone", refName, "-");
      }
    }

    auditTextContent(
      getObjectMessage(rawTag),
      `${refName} tag message`,
      exactValues,
      {
        allowEmail: true,
        allowedExactValues,
      },
    );
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
    category: "User-profile UNC or WSL path",
    pattern:
      /\\\\(?:wsl(?:\.localhost)?\\[^\s"'`]+|[A-Z0-9._-]+\\Users\\[^\\\s"'`]+(?:\\[^\s"'`]*)?)/gi,
  },
  {
    category: "File URL",
    pattern: /\bfile:\/{2,3}[^\s"'`]+/gi,
  },
  {
    category: "Windows registry path",
    pattern:
      /\b(?:HKEY_(?:CLASSES_ROOT|CURRENT_USER|LOCAL_MACHINE|USERS|CURRENT_CONFIG)|HK(?:CR|CU|LM|U|CC))\\[^\s"'`]+/gi,
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
  {
    category: "IPv6 address",
    pattern:
      /(?<![0-9A-F:])(?=[0-9A-F:]*\d)(?:[0-9A-F]{0,4}:){3,7}[0-9A-F]{0,4}(?![0-9A-F:])/gi,
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
  {
    category: "Authorization bearer value",
    pattern: /\bauthorization\s*[:=]\s*bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  },
  {
    category: "Cookie value",
    pattern: /\b(?:cookie|set-cookie)\s*[:=]\s*[^\s;,=]+=[^\s;,]{12,}/gi,
  },
  {
    category: "AWS ARN with account ID",
    pattern: /\barn:(?:aws|aws-us-gov|aws-cn):[^\s:]*:[^\s:]*:\d{12}:[^\s]+/gi,
  },
  {
    category: "Cloud or hardware identifier",
    pattern:
      /\b(?:account|project|subscription|tenant|machine|device|hardware|serial)[_-]?(?:id|guid|number)\s*[:=]\s*["']?[A-Za-z0-9][A-Za-z0-9._:-]{5,}/gi,
  },
];

const allowedGuids = new Set([
  "2ece5bfe-50ed-5f3a-ab87-5cd4baafed2b",
  "574e775e-4f2a-5b96-ac1e-a2962a402336",
  "5d0ce597-fed8-5ebd-83f9-f7f99a099f10",
]);

const allowedHighEntropyValues = new Set([
  "com/questions/3809401/what-is-a-good-regular-expression-to-match-a-url",
]);

const allowedBinaryFiles = new Map([
  [
    "fastfetch/tools/refs/durga-face.png",
    "c65481e80655a6525095dce3d1ec7662ba520037ffd9c470426f11e475734119",
  ],
  [
    "fastfetch/tools/refs/feluda.png",
    "23d7159adaf67ddb93dbeaadb54fb17124f46a09eb573b5437488eb63873c0e5",
  ],
  [
    "fastfetch/tools/refs/ferris-crab.png",
    "f4a4a5f50c7851ad9bf65e0e94baabc306db0d4fb3ee4aa647e3493f056326b6",
  ],
  [
    "fastfetch/tools/refs/professor-shonku.png",
    "33b70c7eb90418182e941e9047a045e07b01830496a71bd5389516d4455b20b3",
  ],
  [
    "fastfetch/tools/refs/tagore-lineart.png",
    "27164d96011460aa9e193d2c7c9d3411e62ade623a0d57897ee70d55aa1a09cc",
  ],
  [
    "fastfetch/tools/refs/tagore.png",
    "d51e0334fb374571e2cf78a5eeedeae823a15f212ad77de25e50ec137bb7a8e0",
  ],
]);

const maximumBlobBytes = 5 * 1024 * 1024;
const allowedPngChunkTypes = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "cHRM",
  "gAMA",
  "sRGB",
  "bKGD",
  "pHYs",
  "sBIT",
  "hIST",
]);

function isAllowedGenericValue(
  category: string,
  value: string,
  line: string,
  displayPath = "",
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
      /^C:[\\/]{1,2}Windows[\\/]{1,2}Fonts[\\/]{0,2}$/i,
      /^C:[\\/]{1,2}\.\.\.[\\/]{1,2}qbt_search_123\.json$/i,
    ].some((pattern) => pattern.test(value));
  }

  if (
    category === "Windows registry path" &&
    displayPath
      .split(",")
      .every((path) => path === ".github/scripts/audit-repository.ts")
  ) {
    return true;
  }

  return false;
}

function auditTextContent(
  content: string,
  displayPath: string,
  exactValues: string[],
  options: TextAuditOptions = {},
): void {
  const normalizedAllowedExactValues = options.allowedExactValues ?? new Set();
  const lowerContent = content.toLowerCase();

  for (const value of exactValues) {
    const normalizedValue = value.toLowerCase();
    if (
      !normalizedAllowedExactValues.has(normalizedValue) &&
      lowerContent.includes(normalizedValue)
    ) {
      addFinding("Local or repository identifier", displayPath, "-");
    }
  }

  const contentLines = content.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < contentLines.length; lineIndex += 1) {
    const line = contentLines[lineIndex];

    for (const definition of patterns) {
      if (
        (options.allowEmail && definition.category === "Email address") ||
        options.ignoredCategories?.has(definition.category)
      ) {
        continue;
      }

      for (const match of line.matchAll(definition.pattern)) {
        if (
          isAllowedGenericValue(
            definition.category,
            match[0],
            line,
            displayPath,
          )
        ) {
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

    if (options.ignoredCategories?.has("High-entropy value")) {
      continue;
    }

    for (const match of line.matchAll(
      /(?<![A-Za-z0-9+/_=-])[A-Za-z0-9+/_=-]{40,}(?![A-Za-z0-9+/_=-])/g,
    )) {
      const candidate = match[0];
      if (
        options.allowBunLockfileEntropy ||
        (options.allowGitHubObjectIds &&
          isAllowedGitHubObjectReference(candidate, line)) ||
        allowedHighEntropyValues.has(candidate) ||
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

function isMetadataFreePng(bytes: Uint8Array): boolean {
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!pngSignature.every((value, index) => bytes[index] === value)) {
    return false;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = pngSignature.length;
  let sawHeader = false;
  let sawEnd = false;

  while (offset + 12 <= bytes.length) {
    const chunkLength = view.getUint32(offset, false);
    const chunkEnd = offset + 12 + chunkLength;
    if (chunkEnd > bytes.length) {
      return false;
    }

    const chunkType = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    if (!allowedPngChunkTypes.has(chunkType)) {
      return false;
    }
    if (!sawHeader && chunkType !== "IHDR") {
      return false;
    }
    if (chunkType === "IHDR") {
      if (sawHeader || chunkLength !== 13) {
        return false;
      }
      sawHeader = true;
    }
    if (chunkType === "IEND") {
      sawEnd = true;
      return chunkLength === 0 && chunkEnd === bytes.length;
    }

    offset = chunkEnd;
  }

  return sawHeader && sawEnd;
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

    if (bytes.length > maximumBlobBytes) {
      addFinding("Oversized historical blob", displayPath, "-");
      continue;
    }

    if (bytes.includes(0)) {
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      const expectedHashes = paths.map((path) => allowedBinaryFiles.get(path));
      if (expectedHashes.some((hash) => !hash)) {
        addFinding("Binary historical blob", displayPath, "-");
      } else if (expectedHashes.some((hash) => hash !== actualHash)) {
        addFinding("Unapproved binary hash", displayPath, "-");
      } else if (!isMetadataFreePng(bytes)) {
        addFinding(
          "Binary metadata or invalid PNG structure",
          displayPath,
          "-",
        );
      }
      continue;
    }

    let content: string;
    try {
      content = strictUtf8.decode(bytes);
    } catch {
      addFinding("Non-UTF-8 historical blob", displayPath, "-");
      continue;
    }

    const filteredExactValues: string[] = [];
    for (const value of exactValues) {
      const pathContainsValue = displayPath
        .toLowerCase()
        .includes(value.toLowerCase());
      const contentContainsValue =
        !allPathsAreDependabotConfig &&
        content.toLowerCase().includes(value.toLowerCase());
      if (pathContainsValue || contentContainsValue) {
        addFinding("Repository account identifier", displayPath, "-");
      } else {
        filteredExactValues.push(value);
      }
    }

    auditTextContent(
      content,
      displayPath,
      allPathsAreDependabotConfig ? [] : filteredExactValues,
      {
        allowBunLockfileEntropy: allPathsAreBunLockfiles,
      },
    );
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

export function getLocalExactValues(repoRoot: string): string[] {
  return getExactValues(repoRoot);
}

export function findSensitiveText(
  content: string,
  displayPath: string,
  exactValues: string[],
  options: TextAuditOptions = {},
): Finding[] {
  const startingLength = findings.length;
  auditTextContent(content, displayPath, exactValues, options);
  return findings.splice(startingLength);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
