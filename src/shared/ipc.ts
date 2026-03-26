export const IPC_CHANNELS = {
  listWorkspaces: "workspace:list",
  loadWorkspace: "workspace:load",
  createRoot: "workspace:create-root",
  selectNode: "workspace:select-node",
  submitOmnibox: "workspace:submit-omnibox",
  updateNodePosition: "workspace:update-node-position",
  autoOrganize: "workspace:auto-organize",
  setViewMode: "workspace:set-view-mode",
  setSearchProvider: "workspace:set-search-provider",
  setViewport: "workspace:set-viewport",
  setReaderBounds: "page:set-bounds",
  pageCommand: "page:command",
  workspaceChanged: "workspace:changed",
  nodeMetaChanged: "node:meta-changed"
} as const;
