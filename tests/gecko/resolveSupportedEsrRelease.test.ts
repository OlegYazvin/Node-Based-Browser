import { describe, expect, it } from "vitest";

import {
  archiveUrlForVersion,
  compareReleaseCandidates,
  parseRemoteTagLine,
  pickPublishedRelease,
  resolveBestTaggedCandidates
} from "../../gecko/scripts/resolve-supported-esr-release.mjs";

describe("resolve-supported-esr-release", () => {
  it("parses Firefox ESR release and build tags", () => {
    expect(
      parseRemoteTagLine("7df8dfe86ba8af4d83252597303123f0507bcee5\trefs/tags/FIREFOX_140_10_0esr_BUILD1")
    ).toMatchObject({
      ref: "FIREFOX_140_10_0esr_BUILD1",
      version: "140.10.0esr",
      major: 140,
      minor: 10,
      patch: 0,
      priority: 1
    });

    expect(
      parseRemoteTagLine("7f9ec29cc0837414e39a0a842b8f77e1ac03a6ab\trefs/tags/FIREFOX_140_9_1esr_RELEASE")
    ).toMatchObject({
      ref: "FIREFOX_140_9_1esr_RELEASE",
      version: "140.9.1esr",
      priority: Number.MAX_SAFE_INTEGER
    });
  });

  it("orders newer ESR versions ahead of older ones and prefers RELEASE over BUILD tags", () => {
    const candidates = [
      parseRemoteTagLine("aaaa\trefs/tags/FIREFOX_140_9_1esr_BUILD1"),
      parseRemoteTagLine("bbbb\trefs/tags/FIREFOX_140_9_1esr_RELEASE"),
      parseRemoteTagLine("cccc\trefs/tags/FIREFOX_140_10_0esr_BUILD1")
    ].filter(Boolean);

    candidates.sort(compareReleaseCandidates);

    expect(candidates.map((candidate) => candidate?.ref)).toEqual([
      "FIREFOX_140_10_0esr_BUILD1",
      "FIREFOX_140_9_1esr_RELEASE",
      "FIREFOX_140_9_1esr_BUILD1"
    ]);
  });

  it("filters tags to the requested ESR series", () => {
    const candidates = resolveBestTaggedCandidates(
      [
        "aaaa\trefs/tags/FIREFOX_140_10_0esr_BUILD1",
        "bbbb\trefs/tags/FIREFOX_141_0_0esr_BUILD1"
      ],
      140
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].version).toBe("140.10.0esr");
  });

  it("picks the newest candidate with a published archive payload", async () => {
    const candidates = resolveBestTaggedCandidates(
      [
        "aaaa\trefs/tags/FIREFOX_140_11_0esr_BUILD1",
        "bbbb\trefs/tags/FIREFOX_140_10_0esr_BUILD1",
        "cccc\trefs/tags/FIREFOX_140_9_1esr_RELEASE"
      ],
      140
    );

    const release = await pickPublishedRelease(candidates, async (version) => version !== "140.11.0esr");

    expect(release.ref).toBe("FIREFOX_140_10_0esr_BUILD1");
    expect(archiveUrlForVersion(release.version)).toBe(
      "https://archive.mozilla.org/pub/firefox/releases/140.10.0esr/linux-x86_64/en-US/firefox-140.10.0esr.tar.xz"
    );
  });
});
