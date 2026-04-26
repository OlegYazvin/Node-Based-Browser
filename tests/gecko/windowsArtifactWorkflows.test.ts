import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function readWorkflow(path: string) {
  return readFile(path, "utf8");
}

describe("Windows Gecko artifact workflows", () => {
  it("installs Gecko artifacts before the dedicated Windows faster build", async () => {
    const workflow = await readWorkflow(".github/workflows/windows-x64-installer.yml");

    expect(workflow).toContain("python ./mach configure");
    expect(workflow).toContain("python ./mach artifact install");
    expect(workflow).toContain("python ./mach build faster");
  });

  it("installs Gecko artifacts before the matrix Windows faster build", async () => {
    const workflow = await readWorkflow(".github/workflows/installers.yml");

    expect(workflow).toContain('elif [[ "${{ matrix.platform }}" == "win32" ]]; then');
    expect(workflow).toContain("python ./mach configure");
    expect(workflow).toContain("python ./mach artifact install");
    expect(workflow).toContain("python ./mach build faster");
  });

  it("installs Gecko artifacts before the Linux Gecko verify faster build", async () => {
    const workflow = await readWorkflow(".github/workflows/gecko-verify.yml");

    expect(workflow).toContain("python3.12 ./mach configure");
    expect(workflow).toContain("python3.12 ./mach artifact install");
    expect(workflow).toContain("python3.12 ./mach build faster");
  });
});
