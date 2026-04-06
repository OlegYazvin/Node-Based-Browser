import path from "node:path";

import { describe, expect, it } from "vitest";

import { patchAppliesToTarget } from "../../gecko/scripts/apply-patches.mjs";

describe("apply-patches", () => {
  it("applies the Linux ARM64 automation patch only on Linux ARM64", () => {
    const patchPath = path.join("/tmp", "0001-linux-aarch64-automation-page-size.patch");

    expect(patchAppliesToTarget(patchPath, { platform: "linux", arch: "arm64" })).toBe(true);
    expect(patchAppliesToTarget(patchPath, { platform: "linux", arch: "x64" })).toBe(false);
    expect(patchAppliesToTarget(patchPath, { platform: "darwin", arch: "arm64" })).toBe(false);
    expect(patchAppliesToTarget(patchPath, { platform: "win32", arch: "x64" })).toBe(false);
  });

  it("keeps generic patches available on every target", () => {
    const patchPath = path.join("/tmp", "9999-generic.patch");

    expect(patchAppliesToTarget(patchPath, { platform: "linux", arch: "x64" })).toBe(true);
    expect(patchAppliesToTarget(patchPath, { platform: "darwin", arch: "arm64" })).toBe(true);
  });
});
