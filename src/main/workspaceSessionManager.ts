import { session, type Session } from "electron";

export function workspacePartitionForId(workspaceId: string) {
  return `persist:research-graph-${workspaceId}`;
}

export class WorkspaceSessionManager {
  private readonly sessions = new Map<string, Session>();

  getSession(workspaceId: string) {
    const cachedSession = this.sessions.get(workspaceId);

    if (cachedSession) {
      return cachedSession;
    }

    const workspaceSession = session.fromPartition(workspacePartitionForId(workspaceId));

    workspaceSession.setPermissionCheckHandler(() => false);
    workspaceSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    this.sessions.set(workspaceId, workspaceSession);

    return workspaceSession;
  }
}
