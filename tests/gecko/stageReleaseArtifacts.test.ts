import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { selectPackagedArtifact } from "../../gecko/scripts/stage-release-artifacts.mjs";

const tempDirectories = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createTarball(rootDirectory, fileName, entries) {
  const sourceDirectory = path.join(rootDirectory, fileName.replace(/\.tar\.(?:xz|bz2|gz)$/u, ""));
  await mkdir(sourceDirectory, { recursive: true });

  for (const entry of entries) {
    const entryPath = path.join(sourceDirectory, entry.path);
    await mkdir(path.dirname(entryPath), { recursive: true });
    await writeFile(entryPath, entry.contents ?? "", "utf8");
  }

  const tarballPath = path.join(rootDirectory, fileName);
  execFileSync("tar", ["-cJf", tarballPath, "-C", rootDirectory, path.basename(sourceDirectory)]);
  return tarballPath;
}

describe("stage-release-artifacts", () => {
  it("prefers a Linux tarball that contains the runnable app bundle", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-stage-release-"));
    tempDirectories.push(tempDirectory);

    const partialArtifact = await createTarball(tempDirectory, "nodely-browser-140.10.0.en-US.linux-x86_64.tar.xz", [
      { path: "nodely/application.ini" },
      { path: "nodely/nodely-bin" },
      { path: "nodely/omni.ja" }
    ]);
    const runnableArtifact = await createTarball(tempDirectory, "nodely-140.10.0.en-US.linux-x86_64.tar.xz", [
      { path: "nodely/application.ini" },
      { path: "nodely/nodely-bin" },
      { path: "nodely/libxul.so" }
    ]);

    expect(selectPackagedArtifact([partialArtifact, runnableArtifact], "linux")).toBe(runnableArtifact);
  });

  it("rejects Linux tarballs that do not contain a runnable app bundle", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "nodely-stage-release-"));
    tempDirectories.push(tempDirectory);

    const partialArtifact = await createTarball(tempDirectory, "nodely-browser-140.10.0.en-US.linux-x86_64.tar.xz", [
      { path: "nodely/application.ini" },
      { path: "nodely/nodely-bin" },
      { path: "nodely/omni.ja" }
    ]);

    expect(selectPackagedArtifact([partialArtifact], "linux")).toBeNull();
  });
});
