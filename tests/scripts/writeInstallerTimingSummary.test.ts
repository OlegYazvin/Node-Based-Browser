import { describe, expect, it } from "vitest";

import { formatDuration, renderInstallerTimingSummary } from "../../scripts/write-installer-timing-summary.mjs";

describe("write-installer-timing-summary", () => {
  it("formats short and long durations compactly", () => {
    expect(formatDuration(9)).toBe("9s");
    expect(formatDuration(61)).toBe("1m 1s");
    expect(formatDuration(3665)).toBe("1h 1m 5s");
  });

  it("renders total and focused timing rows", () => {
    const summary = renderInstallerTimingSummary({
      jobLabel: "Build Windows x64 installer",
      jobStart: 100,
      jobEnd: 220,
      focusLabel: "Installer generation pipeline",
      focusStart: 130,
      focusEnd: 205
    });

    expect(summary).toContain("## Installer Timing");
    expect(summary).toContain("**Job:** Build Windows x64 installer");
    expect(summary).toContain("| Total job elapsed | 2m 0s |");
    expect(summary).toContain("| Installer generation pipeline | 1m 15s |");
  });

  it("marks an unfinished focused phase as spanning through job end", () => {
    const summary = renderInstallerTimingSummary({
      jobLabel: "Assemble Installer Directory",
      jobStart: 10,
      jobEnd: 70,
      focusLabel: "Installer assembly and publication",
      focusStart: 25
    });

    expect(summary).toContain("| Installer assembly and publication (through job end) | 45s |");
  });
});
