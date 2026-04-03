import { createEmptyWorkspace, normalizeWorkspace, summarizeWorkspace } from "./domain.mjs";

const inMemoryWorkspaces = new Map();

function canUseProfileStorage() {
  return typeof IOUtils !== "undefined" && typeof PathUtils !== "undefined" && typeof PathUtils.profileDir === "string";
}

async function ensureDirectory(directoryPath) {
  if (canUseProfileStorage()) {
    await IOUtils.makeDirectory(directoryPath, { ignoreExisting: true, createAncestors: true });
  }
}

async function readJsonFile(filePath) {
  const contents = await IOUtils.readUTF8(filePath);
  return JSON.parse(contents);
}

export class WorkspaceStore {
  constructor({ namespace = "nodely-workspaces" } = {}) {
    this.namespace = namespace;
  }

  get profileDirectory() {
    if (!canUseProfileStorage()) {
      return null;
    }

    return PathUtils.join(PathUtils.profileDir, this.namespace);
  }

  workspaceFilePath(workspaceId) {
    return this.profileDirectory ? PathUtils.join(this.profileDirectory, `${workspaceId}.json`) : null;
  }

  async listWorkspaces() {
    if (!this.profileDirectory) {
      return [...inMemoryWorkspaces.values()].map(summarizeWorkspace).sort((left, right) => right.updatedAt - left.updatedAt);
    }

    await ensureDirectory(this.profileDirectory);
    const entries = await IOUtils.getChildren(this.profileDirectory);
    const summaries = [];

    for (const entry of entries) {
      if (!entry.endsWith(".json")) {
        continue;
      }

      try {
        const workspace = normalizeWorkspace(await readJsonFile(entry));
        summaries.push(summarizeWorkspace(workspace));
      } catch {
        // Ignore corrupted workspaces for now and let the rest load cleanly.
      }
    }

    return summaries.sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async loadWorkspace(workspaceId = "default") {
    if (!this.profileDirectory) {
      if (!inMemoryWorkspaces.has(workspaceId)) {
        inMemoryWorkspaces.set(workspaceId, createEmptyWorkspace(workspaceId));
      }

      return normalizeWorkspace(inMemoryWorkspaces.get(workspaceId));
    }

    await ensureDirectory(this.profileDirectory);
    const workspacePath = this.workspaceFilePath(workspaceId);

    try {
      return normalizeWorkspace(await readJsonFile(workspacePath));
    } catch {
      const workspace = createEmptyWorkspace(workspaceId);
      await this.saveWorkspace(workspace);
      return workspace;
    }
  }

  async saveWorkspace(workspace) {
    const normalizedWorkspace = normalizeWorkspace(workspace);

    if (!this.profileDirectory) {
      inMemoryWorkspaces.set(normalizedWorkspace.id, normalizedWorkspace);
      return normalizedWorkspace;
    }

    await ensureDirectory(this.profileDirectory);
    await IOUtils.writeUTF8(this.workspaceFilePath(normalizedWorkspace.id), JSON.stringify(normalizedWorkspace, null, 2));
    return normalizedWorkspace;
  }
}
