import {
  createFavoriteFolder,
  moveFavoriteToFolder,
  removeFavorite,
  removeNodeFavorites,
  renameFavoriteFolder,
  removeTreeFavorites,
  sortFavorites,
  toggleFavorite
} from "./domain.mjs";

let inMemoryFavorites = [];

function canUseProfileStorage() {
  return typeof IOUtils !== "undefined" && typeof PathUtils !== "undefined" && typeof PathUtils.profileDir === "string";
}

export class FavoritesStore {
  constructor({ filename = "nodely-favorites.json" } = {}) {
    this.filename = filename;
  }

  get filePath() {
    return canUseProfileStorage() ? PathUtils.join(PathUtils.profileDir, this.filename) : null;
  }

  async listFavorites() {
    if (!this.filePath) {
      return sortFavorites(inMemoryFavorites);
    }

    try {
      return sortFavorites(JSON.parse(await IOUtils.readUTF8(this.filePath)));
    } catch {
      return [];
    }
  }

  async saveFavorites(favorites) {
    const normalizedFavorites = sortFavorites(favorites);

    if (!this.filePath) {
      inMemoryFavorites = normalizedFavorites;
      return normalizedFavorites;
    }

    await IOUtils.writeUTF8(this.filePath, JSON.stringify(normalizedFavorites, null, 2));
    return normalizedFavorites;
  }

  async toggleFavorite(favorite) {
    return this.saveFavorites(toggleFavorite(await this.listFavorites(), favorite));
  }

  async removeFavorite(favoriteId) {
    return this.saveFavorites(removeFavorite(await this.listFavorites(), favoriteId));
  }

  async createFolder(title) {
    return this.saveFavorites(createFavoriteFolder(await this.listFavorites(), title));
  }

  async renameFolder(folderId, title) {
    return this.saveFavorites(renameFavoriteFolder(await this.listFavorites(), folderId, title));
  }

  async moveFavoriteToFolder(favoriteId, folderId = null) {
    return this.saveFavorites(moveFavoriteToFolder(await this.listFavorites(), favoriteId, folderId));
  }

  async removeTreeFavorites(workspaceId, rootId, nodeIds) {
    return this.saveFavorites(removeTreeFavorites(await this.listFavorites(), workspaceId, rootId, nodeIds));
  }

  async removeNodeFavorites(workspaceId, nodeIds) {
    return this.saveFavorites(removeNodeFavorites(await this.listFavorites(), workspaceId, nodeIds));
  }
}
