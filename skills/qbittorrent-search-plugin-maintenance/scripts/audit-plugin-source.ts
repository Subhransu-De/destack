import { stat } from "node:fs/promises";
import { resolve } from "node:path";

export type FindingSeverity = "high" | "review" | "info";

export interface SourceFinding {
  file: string;
  line: number;
  severity: FindingSeverity;
  kind: string;
  evidence: string;
}

export interface FileAudit {
  file: string;
  lines: number;
  declaredHost?: string;
  outboundHosts: string[];
  findings: SourceFinding[];
}

const RULES: Array<{
  kind: string;
  severity: FindingSeverity;
  expression: RegExp;
}> = [
  {
    kind: "command_execution",
    severity: "high",
    expression: /\b(?:subprocess\.|os\.system\s*\(|os\.popen\s*\(|Popen\s*\()/,
  },
  {
    kind: "dynamic_code",
    severity: "high",
    expression: /(?<![\w.])(?:eval|exec|compile)\s*\(/,
  },
  {
    kind: "dynamic_import",
    severity: "review",
    expression: /\b(?:__import__|importlib\.(?:import_module|machinery))\b/,
  },
  {
    kind: "native_library",
    severity: "review",
    expression: /\b(?:ctypes\.|cffi\.|LoadLibrary\b)/,
  },
  {
    kind: "tls_verification_disabled",
    severity: "review",
    expression:
      /(?:_create_unverified_context|CERT_NONE|check_hostname\s*=\s*False|verify\s*=\s*False)/i,
  },
  {
    kind: "file_write_or_delete",
    severity: "review",
    expression:
      /(?:open\s*\([^\n]+["'][wax+][bt+]*["']|\.(?:unlink|rmdir)\s*\(|\b(?:remove|unlink|rmtree)\s*\()/,
  },
  {
    kind: "remote_configuration",
    severity: "review",
    expression: /raw\.githubusercontent\.com|gist\.githubusercontent\.com/i,
  },
  {
    kind: "credential_placeholder",
    severity: "review",
    expression:
      /(?:YOUR_(?:PASSWORD|USERNAME|TOKEN|API_KEY)|REPLACE_ME|API[_-]?KEY\s*=|PASSWORD\s*=|USERNAME\s*=)/i,
  },
  {
    kind: "credential_logging",
    severity: "review",
    expression:
      /(?:print|log(?:ger)?\.(?:debug|info|warning|error))\s*\([^\n]*(?:password|token|cookie|api[_-]?key)/i,
  },
  {
    kind: "encoded_payload",
    severity: "review",
    expression: /(?:base64\.b64decode|marshal\.loads|zlib\.decompress)/,
  },
  { kind: "plain_http", severity: "info", expression: /http:\/\//i },
];

function hostRelated(left: string, right: string): boolean {
  return (
    left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`)
  );
}

function safeEvidence(line: string): string {
  const trimmed = line.trim().replace(/\s+/g, " ");
  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
}

function declaredHost(text: string): string | undefined {
  const match = text.match(/^\s*url\s*=\s*["'](https?:\/\/[^"']+)["']/m);
  if (!match?.[1]) return undefined;
  try {
    return new URL(match[1]).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

export function auditPythonSource(text: string, file = "plugin.py"): FileAudit {
  const findings: SourceFinding[] = [];
  const lines = text.split(/\r?\n/);
  const primaryHost = declaredHost(text);
  for (const [index, line] of lines.entries()) {
    for (const rule of RULES) {
      rule.expression.lastIndex = 0;
      if (rule.expression.test(line))
        findings.push({
          file,
          line: index + 1,
          severity: rule.severity,
          kind: rule.kind,
          evidence: safeEvidence(line),
        });
    }
  }

  const outboundHosts = new Set<string>();
  const urlPattern = /https?:\/\/[^\s"'<>)}\]]+/gi;
  for (const match of text.matchAll(urlPattern)) {
    const raw = match[0].replace(/[.,;:]$/, "");
    try {
      const host = new URL(raw).hostname.toLowerCase();
      outboundHosts.add(host);
      if (primaryHost && !hostRelated(primaryHost, host)) {
        findings.push({
          file,
          line: lineNumberAt(text, match.index ?? 0),
          severity: "review",
          kind: "third_party_outbound_host",
          evidence: host,
        });
      }
    } catch {
      // A partial URL in a regex or template is not a concrete outbound endpoint.
    }
  }

  const uniqueFindings = [
    ...new Map(
      findings.map((finding) => [
        `${finding.line}:${finding.kind}:${finding.evidence}`,
        finding,
      ]),
    ).values(),
  ];
  return {
    file,
    lines: lines.length,
    declaredHost: primaryHost,
    outboundHosts: [...outboundHosts].sort(),
    findings: uniqueFindings,
  };
}

export async function auditPath(
  path: string,
): Promise<{ root: string; files: FileAudit[] }> {
  const root = resolve(path);
  const metadata = await stat(root);
  const paths: string[] = [];
  if (metadata.isFile()) {
    if (!root.toLowerCase().endsWith(".py"))
      throw new Error("The source file must end in .py.");
    paths.push(root);
  } else if (metadata.isDirectory()) {
    const glob = new Bun.Glob("**/*.py");
    for await (const relative of glob.scan({ cwd: root, onlyFiles: true }))
      paths.push(resolve(root, relative));
  } else {
    throw new Error("The source path must be a Python file or directory.");
  }
  paths.sort();
  const files: FileAudit[] = [];
  for (const file of paths)
    files.push(auditPythonSource(await Bun.file(file).text(), file));
  return { root, files };
}

export async function main(argv = Bun.argv.slice(2)): Promise<void> {
  const target = argv[0];
  if (!target)
    throw new Error(
      "Usage: bun run scripts/audit-plugin-source.ts <plugin-file-or-directory>",
    );
  const report = await auditPath(target);
  const findings = report.files.flatMap((file) => file.findings);
  console.log(
    JSON.stringify(
      {
        ...report,
        summary: {
          files: report.files.length,
          lines: report.files.reduce((sum, file) => sum + file.lines, 0),
          high: findings.filter((finding) => finding.severity === "high")
            .length,
          review: findings.filter((finding) => finding.severity === "review")
            .length,
          info: findings.filter((finding) => finding.severity === "info")
            .length,
          note: "Static triage cannot prove that a plugin is safe or malicious; review the full source and data flow.",
        },
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
