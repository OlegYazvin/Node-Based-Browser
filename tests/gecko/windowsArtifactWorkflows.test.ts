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
    expect(workflow).toContain("Sync Nodely overlay into Windows artifact runtime");

    const buildIndex = workflow.indexOf("python ./mach build faster");
    const syncIndex = workflow.indexOf('npm run gecko:sync -- --checkout-dir "$GECKO_CHECKOUT_DIR"', buildIndex);
    const packageIndex = workflow.indexOf("python ./mach package", syncIndex);
    expect(syncIndex).toBeGreaterThan(buildIndex);
    expect(packageIndex).toBeGreaterThan(syncIndex);
  });

  it("installs Gecko artifacts before the matrix Windows faster build", async () => {
    const workflow = await readWorkflow(".github/workflows/installers.yml");

    expect(workflow).toContain('elif [[ "${{ matrix.platform }}" == "win32" ]]; then');
    expect(workflow).toContain("python ./mach configure");
    expect(workflow).toContain("python ./mach artifact install");
    expect(workflow).toContain("python ./mach build faster");
    expect(workflow).toContain("Sync Nodely overlay into Windows artifact runtime");

    const windowsBranchIndex = workflow.indexOf('elif [[ "${{ matrix.platform }}" == "win32" ]]; then');
    const syncIndex = workflow.indexOf("Sync Nodely overlay into Windows artifact runtime", windowsBranchIndex);
    const refreshIndex = workflow.indexOf("Refresh artifact-build Nodely branding", syncIndex);
    expect(syncIndex).toBeGreaterThan(windowsBranchIndex);
    expect(refreshIndex).toBeGreaterThan(syncIndex);
  });

  it("installs Gecko artifacts before the Linux Gecko verify faster build", async () => {
    const workflow = await readWorkflow(".github/workflows/gecko-verify.yml");

    expect(workflow).toContain("node gecko/scripts/resolve-supported-esr-release.mjs");
    expect(workflow).toContain('--ref "$FIREFOX_ESR_REF"');
    expect(workflow).toContain("python3.12 ./mach configure");
    expect(workflow).toContain("python3.12 ./mach artifact install");
    expect(workflow).toContain("python3.12 ./mach build faster");
    expect(workflow).toContain("Sync Nodely overlay into artifact runtime");

    const buildIndex = workflow.indexOf("python3.12 ./mach build faster");
    const syncIndex = workflow.indexOf('npm run gecko:sync -- --checkout-dir "$RUNNER_TEMP/firefox-esr"', buildIndex);
    const packageIndex = workflow.indexOf("python3.12 ./mach package", syncIndex);
    expect(syncIndex).toBeGreaterThan(buildIndex);
    expect(packageIndex).toBeGreaterThan(syncIndex);
  });
});
