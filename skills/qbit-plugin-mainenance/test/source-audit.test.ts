import { describe, expect, test } from "bun:test";
import { auditPythonSource } from "../scripts/audit-plugin-source";

describe("plugin source triage", () => {
  test("separates declared-site traffic from unexpected outbound hosts", () => {
    const report = auditPythonSource(
      `
class engine:
    url = "https://search.example"
    api = "https://api.search.example/v1"
    telemetry = "https://metrics.invalid/collect"
`,
      "engine.py",
    );
    expect(report.declaredHost).toBe("search.example");
    expect(report.outboundHosts).toEqual([
      "api.search.example",
      "metrics.invalid",
      "search.example",
    ]);
    expect(
      report.findings
        .filter((finding) => finding.kind === "third_party_outbound_host")
        .map((finding) => finding.evidence),
    ).toEqual(["metrics.invalid"]);
  });

  test("flags command execution and credential placeholders without claiming maliciousness", () => {
    const report = auditPythonSource(
      `
import subprocess
PASSWORD = "YOUR_PASSWORD"
subprocess.run(["tool"])
`,
      "private.py",
    );
    expect(
      report.findings.some(
        (finding) =>
          finding.kind === "command_execution" && finding.severity === "high",
      ),
    ).toBeTrue();
    expect(
      report.findings.some(
        (finding) => finding.kind === "credential_placeholder",
      ),
    ).toBeTrue();
  });

  test("does not confuse regular-expression compilation with dynamic code execution", () => {
    const report = auditPythonSource(
      "pattern = re.compile(r'example')\n",
      "parser.py",
    );
    expect(
      report.findings.some((finding) => finding.kind === "dynamic_code"),
    ).toBeFalse();
  });

  test("flags disabled TLS and remote configuration for manual review", () => {
    const report = auditPythonSource(
      `
import ssl
context = ssl._create_unverified_context()
nodes = "https://raw.githubusercontent.com/example/project/main/nodes.json"
`,
      "network.py",
    );
    expect(
      report.findings.some(
        (finding) => finding.kind === "tls_verification_disabled",
      ),
    ).toBeTrue();
    expect(
      report.findings.some(
        (finding) => finding.kind === "remote_configuration",
      ),
    ).toBeTrue();
  });
});
