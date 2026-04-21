import { describe, expect, it } from "vitest";

import {
  createFavoriteFolder,
  moveFavoriteToFolder,
  removeFavorite
} from "../../gecko/overlay/browser/base/content/nodely/domain.mjs";

describe("favorite folders", () => {
  it("sorts folders first and unfiles their children when a folder is removed", () => {
    let entries = [
      {
        id: "page:workspace:node-1",
        kind: "page",
        title: "OpenAI Pricing",
        url: "https://openai.com/pricing",
        updatedAt: 10
      }
    ];

    entries = createFavoriteFolder(entries, "AI Research");
    const folder = entries.find((entry) => entry.kind === "folder");

    expect(entries[0]?.kind).toBe("folder");
    expect(folder).toBeTruthy();

    entries = moveFavoriteToFolder(entries, "page:workspace:node-1", folder.id);
    expect(
      entries.find((entry) => entry.id === "page:workspace:node-1")?.folderId
    ).toBe(folder.id);

    entries = removeFavorite(entries, folder.id);

    expect(entries.some((entry) => entry.id === folder.id)).toBe(false);
    expect(
      entries.find((entry) => entry.id === "page:workspace:node-1")?.folderId ?? null
    ).toBeNull();
  });
});
