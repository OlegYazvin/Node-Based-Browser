# Next Steps

Current installer CI status as of April 5, 2026:

- `Build Installers #13` failed: `https://github.com/OlegYazvin/Node-Based-Browser/actions/runs/24007465177`
- Linux `x64` succeeded.
- Windows `x64` failed during `Bootstrap Gecko ESR checkout`.
- macOS Intel and macOS Apple Silicon failed during `Build Gecko overlay target`.

## Immediate Fixes

1. Update Gecko patch application so `gecko/patches/0001-linux-aarch64-automation-page-size.patch` only applies on Linux ARM64.
2. Fix the macOS artifact-build path assumption so `mach build faster` can still resolve the expected `dist/bin/firefox` target during the overlay build.
3. Re-run `.github/workflows/installers.yml` after those fixes land.
4. Confirm whether the workflow auto-promotes a new installer commit into `Installer/`.
5. Sync the local checkout to the new remote commit after promotion succeeds.

## Notes

- Do not claim Windows or macOS installers until the workflow produces and commits them.
- Keep `Installer/manifest.json` and `Installer/README.MD` aligned with only the installers that actually exist.
- Keep `gecko/release-artifacts/manifest.json` truthful to real packaged Gecko artifacts only.
