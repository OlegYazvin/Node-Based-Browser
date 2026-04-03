# Nodely Browser on Gecko

This directory is the Gecko-side rebuild foundation for `Nodely Browser`.

It is intentionally an overlay workspace, not a vendored engine tree. The expected flow is:

1. Clone a Gecko source checkout into a sibling workspace.
2. Sync this overlay into that checkout.
3. Build and run Nodely from the patched checkout.

## What Lives Here

- `overlay/`
  - Files copied into a Gecko source checkout.
  - Custom Nodely chrome, state services, and graph surface.
- `scripts/bootstrap-gecko.mjs`
  - Clones or updates a Gecko source checkout, syncs the overlay, and applies the Gecko patch queue.
- `scripts/apply-patches.mjs`
  - Applies the tracked Gecko patch queue into the source checkout.
- `scripts/sync-overlay.mjs`
  - Copies overlay files into the source checkout and patches `browser.xhtml` to load Nodely chrome.
- `scripts/run-nodely-smoke.mjs`
  - Launches the Gecko build with a temporary profile and waits for a Nodely runtime snapshot.
- `scripts/refresh-artifact-branding.mjs`
  - Refreshes artifact-build launch aliases and `application.ini` branding so Nodely does not inherit Firefox-facing metadata.
- `scripts/stage-release-artifacts.mjs`
  - Copies the single user-facing packaged artifact into `gecko/release-artifacts/`.

## Default Target

The bootstrap script defaults to a sibling checkout:

- `../Nodely-Gecko/firefox-esr`

You can override that with `--checkout-dir`.

## Commands

From the repo root:

```bash
npm run gecko:bootstrap
npm run gecko:apply-patches -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run gecko:sync -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run gecko:doctor -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run gecko:mozconfig -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run gecko:refresh-branding -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run gecko:smoke -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run gecko:stage-release -- --checkout-dir ../Nodely-Gecko/firefox-esr --platform linux --arch arm64 --channel local
npm run installers -- --platform linux --arch arm64 --channel local
```

Useful bootstrap flags:

```bash
npm run gecko:bootstrap -- --ref mozilla-esr140
npm run gecko:bootstrap -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run gecko:bootstrap -- --remote https://github.com/mozilla-firefox/firefox.git
```

## Current Foundation

This overlay includes:

- a custom Nodely shell injected into Gecko browser chrome
- a compact split/focus layout
- a custom graph surface with canvas edges, minimap, pan, zoom, and drag
- workspace and favorites stores
- a Gecko tab-backed `NodeRuntimeManager`
- page/tree favorites, trees management, page-local toolbar, and tree tabs
- bootstrap/sync tooling for keeping the fork aligned with ESR

## Local Build Notes

This repo now has a real sibling Gecko source checkout at:

- `../Nodely-Gecko/firefox-esr`

The overlay is synced into that checkout and the following engine files are already patched there:

- `browser/base/content/browser.xhtml`
- `browser/base/jar.mn`

Tracked engine-source patches live in:

- `gecko/patches/`

The current queue includes the Linux arm64 automation page-size fix needed on this Asahi setup.

Before attempting a local Gecko build, run:

```bash
npm run gecko:doctor -- --checkout-dir ../Nodely-Gecko/firefox-esr
npm run gecko:mozconfig -- --checkout-dir ../Nodely-Gecko/firefox-esr
```

On this machine specifically, the current blockers are:

- no `gcc` or default `cc` toolchain on `PATH`
- no `libffi` development headers detected through `pkg-config`
- this branch of `mach` is unhappy with the available `Python 3.14`; use Python 3.12 or 3.11 for local Gecko work here

The generated mozconfig defaults to an artifact-style configuration for faster local iteration:

```bash
cd ../Nodely-Gecko/firefox-esr
export MOZCONFIG=$PWD/mozconfig.nodely
python3.12 mach build
cd /home/olegy/Documents/Projects/Node-Based\ Browser
npm run gecko:refresh-branding -- --checkout-dir ../Nodely-Gecko/firefox-esr
cd ../Nodely-Gecko/firefox-esr
python3.12 mach run
```

For runtime verification without relying on the local browser-chrome harness:

```bash
cd /home/olegy/Documents/Projects/Node-Based\ Browser
npm run gecko:smoke -- --checkout-dir ../Nodely-Gecko/firefox-esr
```

For user-facing installers after a packaged build is staged:

```bash
npm run installers -- --platform linux --arch arm64 --channel local
```

Cross-platform installer refreshes should use:

- `../.github/workflows/installers.yml`

## Important Note

This repository is Gecko-only now. The overlay in this folder is the maintained product surface, and the sibling engine checkout is the workspace it syncs into.
