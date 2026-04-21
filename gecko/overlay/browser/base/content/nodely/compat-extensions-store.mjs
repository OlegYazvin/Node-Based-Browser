import {
  createEmptyCompatExtensionsState,
  normalizeCompatExtensionsState
} from "./chrome-extension-compat.mjs";

let inMemoryCompatExtensionsState = createEmptyCompatExtensionsState();

function canUseProfileStorage() {
  return (
    typeof IOUtils !== "undefined" &&
    typeof PathUtils !== "undefined" &&
    typeof PathUtils.profileDir === "string"
  );
}

export class CompatExtensionsStore {
  constructor({ filename = "nodely-compat-extensions.json" } = {}) {
    this.filename = filename;
  }

  get filePath() {
    return canUseProfileStorage() ? PathUtils.join(PathUtils.profileDir, this.filename) : null;
  }

  async loadState() {
    if (!this.filePath) {
      return normalizeCompatExtensionsState(inMemoryCompatExtensionsState);
    }

    try {
      return normalizeCompatExtensionsState(JSON.parse(await IOUtils.readUTF8(this.filePath)));
    } catch {
      return createEmptyCompatExtensionsState();
    }
  }

  async saveState(state) {
    const normalizedState = normalizeCompatExtensionsState(state);

    if (!this.filePath) {
      inMemoryCompatExtensionsState = normalizedState;
      return normalizedState;
    }

    await IOUtils.writeUTF8(this.filePath, JSON.stringify(normalizedState, null, 2));
    return normalizedState;
  }
}
