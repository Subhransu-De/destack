import { describe, expect, test } from "bun:test";
import {
  auditLayoutPages,
  parseBBoxLayout,
  spreadTransition,
} from "../scripts/audit-layout";

function page(
  number: number,
  lines: Array<{ y: number; text: string }>,
): string {
  const content = lines
    .map(
      ({ y, text }) =>
        `<line xMin="40" yMin="${y}" xMax="500" yMax="${y + 12}"><word>${text.replaceAll("&", "&amp;")}</word></line>`,
    )
    .join("");
  return `<page width="595" height="842" data-number="${number}">${content}</page>`;
}

describe("physical spread parity", () => {
  test("treats odd to even as a sheet turn and even to odd as one spread", () => {
    expect(spreadTransition(1)).toBe("turn");
    expect(spreadTransition(2)).toBe("same_spread");
    expect(spreadTransition(17)).toBe("turn");
    expect(spreadTransition(18)).toBe("same_spread");
  });

  test("flags an odd-page heading with no context but permits the same case on an even page", () => {
    const pages = parseBBoxLayout(
      `<doc>${page(1, [{ y: 760, text: "3.1 A STRANDED HEADING" }])}${page(2, [{ y: 760, text: "3.2 A FACING-PAGE HEADING" }])}</doc>`,
    );
    const result = auditLayoutPages(pages);
    expect(result.zeroContextTurnViolations).toHaveLength(1);
    expect(result.zeroContextTurnViolations[0].heading).toBe(
      "3.1 A STRANDED HEADING",
    );
    expect(result.sameSpreadHeadingWarnings).toHaveLength(1);
    expect(result.passed).toBeFalse();
  });

  test("accepts a heading that retains explanatory content", () => {
    const pages = parseBBoxLayout(
      `<doc>${page(1, [
        { y: 700, text: "3.1 A KEPT HEADING" },
        { y: 730, text: "This line explains the section." },
      ])}</doc>`,
    );
    const result = auditLayoutPages(pages);
    expect(result.zeroContextTurnViolations).toHaveLength(0);
    expect(result.passed).toBeTrue();
  });

  test("ignores table-of-contents entries", () => {
    const pages = parseBBoxLayout(
      `<doc>${page(1, [
        { y: 50, text: "Table of Contents" },
        { y: 760, text: "3.1 A TOC ENTRY" },
      ])}</doc>`,
    );
    expect(auditLayoutPages(pages).zeroContextTurnViolations).toHaveLength(0);
  });
});
