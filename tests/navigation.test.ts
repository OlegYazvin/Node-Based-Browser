import { describe, expect, it } from "vitest";
import { buildSearchUrl, resolveOmniboxInput } from "../src/shared/navigation";

describe("resolveOmniboxInput", () => {
  it("normalizes bare hostnames into https URLs", () => {
    const resolution = resolveOmniboxInput("example.com/docs", "google");

    expect(resolution.kind).toBe("url");
    expect(resolution.url).toBe("https://example.com/docs");
    expect(resolution.origin).toBe("omnibox-url");
  });

  it("treats natural language input as a Google search by default", () => {
    const resolution = resolveOmniboxInput("interesting archive sources", "google");

    expect(resolution.kind).toBe("search");
    expect(resolution.query).toBe("interesting archive sources");
    expect(resolution.url).toContain("google.com/search");
  });

  it("can build Wikipedia searches", () => {
    expect(buildSearchUrl("early unix history", "wikipedia")).toBe(
      "https://en.wikipedia.org/w/index.php?search=early%20unix%20history"
    );
  });
});
