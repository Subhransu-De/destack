import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

export interface AuditResult {
  root: string;
  checks: Record<string, boolean>;
  errors: string[];
}

export async function auditSkill(rootInput: string): Promise<AuditResult> {
  const root = resolve(rootInput);
  const required = [
    "SKILL.md",
    "scripts/print-me.ts",
    "scripts/audit-layout.ts",
    "scripts/audit-skill.ts",
    "scripts/run-integration.ts",
    "test/print-me.test.ts",
    "test/layout-audit.test.ts",
    "test/discovery.test.ts",
    "test/integration.test.ts",
    "evals/cases.jsonl",
    "package.json",
    "tsconfig.json",
  ];
  const errors: string[] = [];
  for (const path of required)
    if (!existsSync(join(root, path))) errors.push(`Missing ${path}`);
  const skill = existsSync(join(root, "SKILL.md"))
    ? await readFile(join(root, "SKILL.md"), "utf8")
    : "";
  const checks: Record<string, boolean> = {
    name: /^name:\s*print-me\s*$/m.test(skill),
    description:
      skill.includes(
        "Use this when user wants to make a copy for print or better reading asthetics",
      ) && /PDF by default/i.test(skill),
    user_invocable: /^user-invocable:\s*true\s*$/m.test(skill),
    contract: /^## Contract\s*$/m.test(skill),
    workflow: /^## Workflow\s*$/m.test(skill),
    output: /^## Output format\s*$/m.test(skill),
    font_links: ["Source+Serif+4", "Source+Sans+3", "Source+Code+Pro"].every(
      (value) => skill.includes(value),
    ),
    parity_audit:
      /odd.*even.*turn/i.test(skill) && skill.includes("audit-layout.ts"),
    alternate_formats: /EPUB/i.test(skill) && /--to FORMAT/.test(skill),
  };
  if (existsSync(join(root, "scripts"))) {
    const scripts = await readdir(join(root, "scripts"), {
      withFileTypes: true,
    });
    const invalid = scripts.filter(
      (entry) => entry.isFile() && extname(entry.name) !== ".ts",
    );
    if (invalid.length)
      errors.push(
        `Disallowed script files: ${invalid.map((entry) => entry.name).join(", ")}`,
      );
  }
  for (const [name, passed] of Object.entries(checks))
    if (!passed) errors.push(`Failed check: ${name}`);
  return { root, checks, errors };
}

if (import.meta.main) {
  const root = Bun.argv[2]
    ? resolve(Bun.argv[2])
    : resolve(dirname(import.meta.dir));
  const result = await auditSkill(root);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}
