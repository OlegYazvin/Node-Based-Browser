function describeFile(file) {
  return {
    fileName: file?.name ?? null,
    filePath: file?.mozFullPath ?? null,
    mimeType: file?.type ?? null,
    totalBytes: Number.isFinite(file?.size) ? file.size : null,
    webkitRelativePath: file?.webkitRelativePath ?? null
  };
}

export class NodelyUploadChild extends JSWindowActorChild {
  handleEvent(event) {
    const input = event.target;
    const inputCtor = this.contentWindow?.HTMLInputElement;

    if (!inputCtor?.isInstance?.(input) || input.type !== "file") {
      return;
    }

    const files = Array.from(input.files ?? []).map(describeFile).filter((file) => file.fileName || file.filePath);

    if (!files.length) {
      return;
    }

    const label =
      input.labels?.[0]?.textContent?.trim() ||
      input.getAttribute("aria-label") ||
      input.name ||
      input.id ||
      "File input";

    this.sendAsyncMessage("NodelyUpload:Observed", {
      pageUrl: this.document?.documentURI ?? null,
      inputLabel: label,
      multiple: Boolean(input.multiple),
      files
    });
  }
}
