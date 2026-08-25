import { describe, expect, test } from "bun:test";

import { findSensitiveText } from "./audit-repository";

function categories(value: string, allowEmail = false): string[] {
  return findSensitiveText(value, "generated test value", [], {
    allowEmail,
  }).map((finding) => finding.category);
}

describe("sensitive-information patterns", () => {
  test("detects personal and system paths", () => {
    const windowsPath = ["C:", "Users", "Example", "private.txt"].join("\\");
    const unixPath = ["", "home", "example", "private.txt"].join("/");
    const uncPath = ["", "", "MACHINE", "Users", "Example", "file.txt"].join(
      "\\",
    );

    expect(categories(windowsPath)).toContain("Windows absolute path");
    expect(categories(unixPath)).toContain("Unix user path");
    expect(categories(uncPath)).toContain("User-profile UNC or WSL path");
  });

  test("detects network, registry, and cloud identifiers", () => {
    const registryRoot = ["HK", "CU"].join("");
    const registryPath = [registryRoot, "Software", "Private"].join("\\");
    const accountArn = [
      "arn",
      "aws",
      "iam",
      "",
      "123456789012",
      "role/private",
    ].join(":");

    const ipv6Address = [
      "2001",
      "0db8",
      "85a3",
      "0000",
      "0000",
      "8a2e",
      "0370",
      "7334",
    ].join(":");
    expect(categories(ipv6Address)).toContain("IPv6 address");
    expect(categories(registryPath)).toContain("Windows registry path");
    expect(categories(accountArn)).toContain("AWS ARN with account ID");
  });

  test("detects credentials and high-entropy values", () => {
    const bearer = [
      "Authorization: Bearer ",
      "example",
      "_private_",
      "value_123456",
    ].join("");
    const entropy = [
      "J7vQ9mK2xP5rT8wY",
      "4nB6cD1fG3hL0sZ",
      "aE2uI5oR8pV1",
    ].join("");

    expect(categories(bearer)).toContain("Authorization bearer value");
    expect(categories(entropy)).toContain("High-entropy value");
  });

  test("allows commit identity email while retaining content email detection", () => {
    const email = ["author", "example.invalid"].join("@");
    expect(categories(email)).toContain("Email address");
    expect(categories(email, true)).not.toContain("Email address");
  });

  test("allows documented loopback addresses", () => {
    expect(categories("127.0.0.1")).not.toContain("IPv4 address");
  });

  test("allows contextual GitHub object IDs without allowing arbitrary hex", () => {
    const objectId = "0123456789abcdef".repeat(2) + "01234567";
    expect(
      findSensitiveText(
        `https://github.com/example/project/commit/${objectId}`,
        "surface",
        [],
        { allowGitHubObjectIds: true },
      ),
    ).toEqual([]);
    expect(
      findSensitiveText(
        `https://example.invalid/example/project/commit/${objectId}`,
        "surface",
        [],
        { allowGitHubObjectIds: true },
      ).map((finding) => finding.category),
    ).toContain("High-entropy value");
  });

  test("detects exact locally supplied identifiers without printing them", () => {
    const privateValue = ["private", "machine", "identifier"].join("-");
    const findings = findSensitiveText(
      `prefix ${privateValue} suffix`,
      "generated test value",
      [privateValue],
    );
    expect(findings.map((finding) => finding.category)).toContain(
      "Local or repository identifier",
    );
  });
});
