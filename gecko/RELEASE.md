# Gecko Release Flow

This document describes the Gecko-side release path for `Nodely Browser`.

## Goals

- keep Gecko source changes reproducible through a patch queue
- keep overlay sync repeatable
- keep runtime verification separate from packaging
- stage one user-facing release artifact per platform/arch/channel

## Release Inputs

The Gecko release flow has three layers:

1. Gecko source checkout
2. Nodely overlay
3. Gecko patch queue

The patch queue lives in:

- `gecko/patches/`

The overlay sync lives in:

- `gecko/scripts/sync-overlay.mjs`

The patch queue is applied with:

- `gecko/scripts/apply-patches.mjs`

## Recommended Local Flow

From the repo root:

```bash
npm run gecko:bootstrap -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run gecko:mozconfig -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run gecko:refresh-branding -- --checkout-dir ../Nodely-Gecko/firefox-esr
```

From the checkout:

```bash
export MOZCONFIG=$PWD/mozconfig.nodely
python3.12 mach build faster
python3.12 mach package
```

Back in the repo root:

```bash
npm run gecko:smoke -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run gecko:stage-release -- --checkout-dir ../Nodely-Gecko/firefox-esr --platform linux --arch arm64 --channel local
npm run installers -- --platform linux --arch arm64 --channel local
```

## Runtime Verification

The preferred runtime verification path is the Nodely smoke runner:

- `gecko/scripts/run-nodely-smoke.mjs`

It:

- creates a temporary Nodely profile
- seeds a Nodely workspace
- turns on Nodely test diagnostics
- launches the Gecko build headless
- waits for a JSON smoke snapshot from the running browser

This is intentionally independent of the local browser-chrome harness so runtime verification still works when the host’s stock Gecko test harness is unstable.

## Patch Queue

Patch files should stay small and platform-specific where possible.

Current patch queue:

- `0001-linux-aarch64-automation-page-size.patch`

Use it for engine-source changes that do not belong in the overlay, such as:

- build fixes
- host-specific Gecko runtime fixes
- packaging tweaks inside the engine source tree

## Artifact Staging

User-facing staged artifacts live under:

- `gecko/release-artifacts/`

The staging script copies only the single packaged file a human should download for a given platform/arch/channel.

Examples:

- Linux: packaged `.tar.xz` / `.tar.bz2`
- macOS: `.dmg`
- Windows: `.exe`

The staging manifest lives at:

- `gecko/release-artifacts/manifest.json`

## Installer Assembly

After a packaged Gecko artifact is staged, build the user-facing installer from it:

```bash
npm run installers -- --platform <platform> --arch <arch> --channel <channel>
```

That writes the platform installer into:

- `out/make/<platform>/<arch>/`

And syncs the human-downloadable file into:

- `Installer/`

The installer manifest lives at:

- `Installer/manifest.json`

Use:

```bash
npm run installers:sync -- --platform <platform> --arch <arch>
```

when the native installer was built on another machine or CI runner and has already been copied into `out/make/<platform>/<arch>/`.

Use:

```bash
npm run installers:prune -- --target <platform:arch>
```

before a CI promotion refresh when a workflow-managed installer slice should be cleared and rebuilt from fresh native outputs.

## CI Expectations

The Gecko CI workflow should:

1. bootstrap a Gecko source checkout
2. sync overlay
3. apply patch queue
4. write `mozconfig.nodely`
5. build
6. run the Nodely smoke runner
7. package
8. stage release artifacts

The workflow added in:

- `.github/workflows/gecko-verify.yml`

is the current starting point for that path.

Cross-platform installer builds should use:

- `.github/workflows/installers.yml`

That workflow now auto-promotes successful installer refreshes back into `Installer/` on the branch it runs on.
