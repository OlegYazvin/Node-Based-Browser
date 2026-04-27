# Latest Release Notes

Generated automatically at 2026-04-27T03:28:14Z.

- Ref: `main`
- Range: `1e972ce -> 26aad03`
- Workflow run: https://github.com/OlegYazvin/Node-Based-Browser/actions/runs/24974651263
- Nodely version: `0.1`
- Gecko base version: `140.10.0esr`
- Compare: https://github.com/OlegYazvin/Node-Based-Browser/compare/1e972ce...26aad03340a54e130d810454c2c2dd6d107d6131

## Highlights

- Commits included: 5
- Files changed: 9
- GitHub Actions: 3
- Gecko overlay/runtime: 3
- Tests: 3

## Commits

- `333b6ec` Fix artifact overlay sync before Windows packaging (Codex)
- `1ae6753` Repair Windows installer browser omni payload (Codex)
- `27b0984` Raise Windows installer omni repair buffer (Codex)
- `a2cda93` Replace Windows installer browser omni during repair (Codex)
- `26aad03` Accept Windows separators in browser omni inspection (Codex)

## Changed Files

- `.github/workflows/gecko-verify.yml`
- `.github/workflows/installers.yml`
- `.github/workflows/windows-x64-installer.yml`
- `gecko/scripts/repair-windows-installer.mjs`
- `gecko/scripts/stage-release-artifacts.mjs`
- `gecko/scripts/sync-overlay.mjs`
- `tests/gecko/repairWindowsInstaller.test.ts`
- `tests/gecko/stageReleaseArtifacts.test.ts`
- `tests/gecko/windowsArtifactWorkflows.test.ts`
