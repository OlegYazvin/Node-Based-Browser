import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function readWorkflow(path: string) {
  return readFile(path, "utf8");
}

function readStep(workflow: string, name: string) {
  const stepStart = workflow.indexOf(`- name: ${name}`);

  if (stepStart === -1) {
    throw new Error(`Unable to find workflow step: ${name}`);
  }

  const nextStepStart = workflow.indexOf("\n      - name:", stepStart + 1);
  return workflow.slice(stepStart, nextStepStart === -1 ? undefined : nextStepStart);
}

describe("Gecko and installer workflows", () => {
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

  it("carries macOS public release readiness through the all-platform installer artifact boundary", async () => {
    const workflow = await readWorkflow(".github/workflows/installers.yml");
    const readinessStep = readStep(workflow, "Assess macOS public release readiness");
    const syncStep = readStep(workflow, "Sync finished installers into Installer");
    const metadataStep = readStep(workflow, "Derive release metadata");

    expect(readinessStep).toContain('marker="$output_dir/.public-release-ready"');
    expect(readinessStep).toContain('artifact_marker="$output_dir/public-release-ready.txt"');
    expect(readinessStep).toContain('rm -f "$marker" "$artifact_marker"');
    expect(readinessStep).toContain('touch "$marker"');
    expect(readinessStep).toContain('> "$artifact_marker"');
    expect(readinessStep).toContain("Unsigned macOS archive published");

    expect(syncStep).toContain('out/make/$platform/$arch/public-release-ready.txt');
    expect(syncStep).toContain('out/make/$platform/$arch/.public-release-ready');
    expect(metadataStep).toContain('path.join(archDirectory, "public-release-ready.txt")');
    expect(metadataStep).toContain('path.join(archDirectory, ".public-release-ready")');
  });

  it("keeps the dedicated macOS installer artifact self-describing with a visible release marker", async () => {
    const workflow = await readWorkflow(".github/workflows/macos-installers.yml");
    const readinessStep = readStep(workflow, "Assess macOS public release readiness");

    expect(readinessStep).toContain('marker="$output_dir/.public-release-ready"');
    expect(readinessStep).toContain('artifact_marker="$output_dir/public-release-ready.txt"');
    expect(readinessStep).toContain('rm -f "$marker" "$artifact_marker"');
    expect(readinessStep).toContain('touch "$marker"');
    expect(readinessStep).toContain('> "$artifact_marker"');
  });

  it("only deletes stale macOS release assets for architectures refreshed in the same installer promotion", async () => {
    const workflow = await readWorkflow(".github/workflows/installers.yml");
    const publishStep = readStep(workflow, "Publish GitHub Release assets");

    expect(publishStep).toContain("expected_macos_assets=()");
    expect(publishStep).toContain("expected_macos_arches=()");
    expect(publishStep).toContain('asset_arch="${asset#out/make/darwin/}"');
    expect(publishStep).toContain('expected_macos_arches+=("${asset_arch%%/*}")');
    expect(publishStep).toContain('if [[ "$asset_name" =~ -macos-(x64|arm64)\\.(dmg|pkg|zip)$ ]]; then');
    expect(publishStep).toContain('if [[ "$refresh_arch" -eq 0 ]]; then');

    const refreshGuardIndex = publishStep.indexOf('if [[ "$refresh_arch" -eq 0 ]]; then');
    const deleteIndex = publishStep.indexOf('gh release delete-asset "$RELEASE_TAG" "$asset_name" --yes');
    expect(deleteIndex).toBeGreaterThan(refreshGuardIndex);
  });
});
