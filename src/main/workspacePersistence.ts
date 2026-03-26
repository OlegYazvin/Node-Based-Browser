import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { Workspace, WorkspaceSummary } from "../shared/types";
import { createEmptyWorkspace, summarizeWorkspace } from "../shared/workspace";

function isWorkspace(candidate: unknown): candidate is Workspace {
  return typeof candidate === "object" && candidate !== null && "id" in candidate && "nodes" in candidate;
}

export class WorkspacePersistence {
  private async ensureWorkspaceDirectory() {
    const workspaceDirectory = this.getWorkspaceDirectory();
    await mkdir(workspaceDirectory, { recursive: true });
    return workspaceDirectory;
  }

  getWorkspaceDirectory() {
    return path.join(app.getPath("userData"), "workspaces");
  }

  getWorkspacePath(workspaceId: string) {
    return path.join(this.getWorkspaceDirectory(), `${workspaceId}.json`);
  }

  async loadWorkspace(workspaceId = "default") {
    await this.ensureWorkspaceDirectory();

    try {
      const workspaceContents = await readFile(this.getWorkspacePath(workspaceId), "utf8");
      const parsedWorkspace = JSON.parse(workspaceContents) as unknown;

      if (!isWorkspace(parsedWorkspace)) {
        throw new Error(`Workspace ${workspaceId} is not a valid workspace file.`);
      }

      return parsedWorkspace;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return createEmptyWorkspace(workspaceId);
      }

      throw error;
    }
  }

  async saveWorkspace(workspace: Workspace) {
    await this.ensureWorkspaceDirectory();
    await writeFile(this.getWorkspacePath(workspace.id), JSON.stringify(workspace, null, 2), "utf8");
  }

  async listWorkspaces(): Promise<WorkspaceSummary[]> {
    await this.ensureWorkspaceDirectory();
    const workspaceFiles = await readdir(this.getWorkspaceDirectory());
    const summaries: WorkspaceSummary[] = [];

    for (const workspaceFile of workspaceFiles) {
      if (!workspaceFile.endsWith(".json")) {
        continue;
      }

      const workspaceId = workspaceFile.replace(/\.json$/u, "");
      const workspace = await this.loadWorkspace(workspaceId);
      summaries.push(summarizeWorkspace(workspace));
    }

    return summaries.sort((left, right) => right.updatedAt - left.updatedAt);
  }
}
