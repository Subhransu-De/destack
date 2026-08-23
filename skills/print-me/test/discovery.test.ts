import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("skill discovery", () => {
  test("exposes the requested invocable metadata", async () => {
    const skill = await readFile(join(root, "SKILL.md"), "utf8");
    expect(skill).toMatch(/^name:\s*print-me\s*$/m);
    expect(skill).toContain(
      "Use this when user wants to make a copy for print or better reading asthetics",
    );
    expect(skill).toMatch(/PDF by default/i);
    expect(skill).toMatch(/^user-invocable:\s*true\s*$/m);
  });

  test("contains positive and negative trigger cases", async () => {
    const lines = (await readFile(join(root, "evals", "cases.jsonl"), "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    expect(
      lines.filter((entry) => entry.should_trigger).length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      lines.filter((entry) => !entry.should_trigger).length,
    ).toBeGreaterThanOrEqual(3);
    expect(lines.some((entry) => /EPUB/i.test(entry.input))).toBeTrue();
    expect(
      lines.some((entry) => /PDF/i.test(entry.input) && entry.should_trigger),
    ).toBeTrue();
    expect(
      lines.some((entry) => /OCR/i.test(entry.input) && !entry.should_trigger),
    ).toBeTrue();
  });
});
